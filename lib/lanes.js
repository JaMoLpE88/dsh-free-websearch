/**
 * The free search lanes. Every lane is keyless, signup-free, and paid-free by
 * construction: no authorization header is ever read from anywhere, so this
 * module cannot spend an API credit even if the user has keys configured.
 *
 * Order is quality-first with the quota shape in mind:
 *   keenable  JSON, 1,000 requests/hour per IP          (fast, absorbs most traffic)
 *   firecrawl JSON, 1,000 credits/month                 (best snippets; scarce)
 *   bing      RSS, unlimited                            (the floor)
 *   ddg       HTML, unlimited                           (the other floor)
 *   you.com   JSON, 100 searches/day per IP             (last resort)
 */
import { LaneError, USER_AGENT, classify, readJson, stripTags, withTimeout } from './net.js';

export const LANE_IDS = ['keenable', 'firecrawl', 'bing', 'ddg', 'you'];

const DEFAULTS = {
  laneTimeoutMs: 7_000,
  budgetMs: 30_000,
  cacheTtlMs: 5 * 60_000,
  cacheMax: 50,
  maxResults: 8,
  /** Cool a lane this long after a hard wall (bot check, 429, 403). */
  wallCooldownMs: 5 * 60_000,
  /** Cool a lane this long after an ordinary error. */
  errorCooldownMs: 60_000,
};

/**
 * Build the searcher the plugin registers with `ctx.web`.
 * @param options.fetchImpl - injectable fetch (tests, proxies).
 * @param options.now - injectable clock (tests).
 */
export function createSearcher(options = {}) {
  const opt = { ...DEFAULTS, ...options };
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const now = options.now ?? Date.now;
  const lanes = buildLanes(fetchImpl);
  // ponytail: cooldowns are in-memory only; persisting them to disk buys a
  // better first search after a restart and nothing else. Add a state file
  // here if restarts start hammering a dead lane.
  const coolingUntil = new Map();
  const cache = new Map();

  const trimCache = () => {
    while (cache.size > opt.cacheMax) cache.delete(cache.keys().next().value);
  };

  return {
    /** @returns {Promise<{sources: object[], truncated: boolean}>} */
    async search(request, signal) {
      const query = String(request?.query ?? '').trim();
      if (!query) throw new Error('freeweb: a search needs a non-empty query');
      const maxResults = clampCount(request?.maxResults ?? opt.maxResults);
      const cacheKey = `${query.toLowerCase()}|${maxResults}`;

      const cached = cache.get(cacheKey);
      if (cached && now() - cached.at < opt.cacheTtlMs) {
        return { sources: cached.sources.map((source) => ({ ...source })), truncated: false };
      }

      const started = now();
      const attempts = [];
      for (const lane of lanes) {
        const until = coolingUntil.get(lane.id) ?? 0;
        if (until > now()) {
          attempts.push(`${lane.id}: cooling down`);
          continue;
        }
        const remaining = opt.budgetMs - (now() - started);
        if (remaining < 500) {
          attempts.push('budget spent');
          break;
        }
        try {
          const laneSignal = withTimeout(signal, Math.min(opt.laneTimeoutMs, remaining));
          const result = await lane.search(query, maxResults, laneSignal);
          if (!result.sources.length) throw new LaneError('no results');
          coolingUntil.delete(lane.id);
          cache.set(cacheKey, { sources: result.sources, at: now() });
          trimCache();
          return { sources: result.sources, truncated: false };
        } catch (error) {
          const laneError = asLaneError(error);
          coolingUntil.set(
            lane.id,
            laneError.quota ? Infinity : now() + (laneError.botwall ? opt.wallCooldownMs : opt.errorCooldownMs),
          );
          attempts.push(`${lane.id}: ${laneError.message}`);
        }
      }

      throw new Error(
        `freeweb: every free search lane failed (${attempts.join('; ')}). ` +
          'Nothing was sent to a paid API; retry, or check the network or VPN.',
      );
    },
  };
}

function asLaneError(error) {
  if (error instanceof LaneError) return error;
  const message = String(error?.message ?? error);
  return new LaneError(message.length > 160 ? `${message.slice(0, 157)}...` : message);
}

function clampCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return DEFAULTS.maxResults;
  return Math.min(Math.floor(n), 20);
}

function buildLanes(fetchImpl) {
  return [
    { id: 'keenable', search: (q, n, s) => searchKeenable(fetchImpl, q, n, s) },
    { id: 'firecrawl', search: (q, n, s) => searchFirecrawl(fetchImpl, q, n, s) },
    { id: 'bing', search: (q, n, s) => searchBing(fetchImpl, q, n, s) },
    { id: 'ddg', search: (q, n, s) => searchDuckDuckGo(fetchImpl, q, n, s) },
    { id: 'you', search: (q, n, s) => searchYou(fetchImpl, q, n, s) },
  ];
}

// ── lanes ────────────────────────────────────────────────────────────────────

/** Keenable's keyless twin. The title header is how it attributes anonymous
 * traffic; without it the call is refused. */
async function searchKeenable(fetchImpl, query, maxResults, signal) {
  const response = await fetchImpl('https://api.keenable.ai/v1/search/public', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-keenable-title': 'dsh-free-websearch',
    },
    body: JSON.stringify({ query, max_results: maxResults }),
    signal,
  });
  return toResult(await readJson(response), maxResults);
}

/** Firecrawl keyless: no Authorization header at all (that is the tier). */
async function searchFirecrawl(fetchImpl, query, maxResults, signal) {
  const response = await fetchImpl('https://api.firecrawl.dev/v2/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, limit: maxResults, sources: ['web'] }),
    signal,
  });
  const data = await readJson(response);
  const items = Array.isArray(data?.data) ? data.data : (data?.data?.web ?? []);
  return toResult({ results: items }, maxResults);
}

/** Bing through its RSS rendering: same ten sources as the HTML SERP, but
 * direct URLs instead of `bing.com/ck/a` redirects that need decoding. */
async function searchBing(fetchImpl, query, maxResults, signal) {
  const url = `https://www.bing.com/search?format=rss&q=${encodeURIComponent(query)}&count=${maxResults}`;
  const response = await fetchImpl(url, {
    headers: { 'user-agent': USER_AGENT, 'accept-language': 'en-US,en;q=0.9', accept: 'application/rss+xml,text/xml' },
    signal,
  });
  const text = await response.text();
  if (!response.ok) throw new LaneError(`HTTP ${response.status}`, classify(response.status, text));
  return { sources: parseRss(text).slice(0, maxResults), truncated: false };
}

/** DuckDuckGo's HTML endpoint. A 202 with an anomaly page is its bot wall. */
async function searchDuckDuckGo(fetchImpl, query, maxResults, signal) {
  const response = await fetchImpl('https://html.duckduckgo.com/html/', {
    method: 'POST',
    headers: {
      'user-agent': USER_AGENT,
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'text/html,application/xhtml+xml',
    },
    body: new URLSearchParams({ q: query, kl: 'wt-wt' }).toString(),
    signal,
  });
  const html = await response.text();
  if (response.status === 202 || /anomaly-modal|unusual traffic/i.test(html)) {
    throw new LaneError('bot wall', { botwall: true });
  }
  if (!response.ok) throw new LaneError(`HTTP ${response.status}`, classify(response.status, html));
  return { sources: parseDuckDuckGo(html).slice(0, maxResults), truncated: false };
}

/** You.com's keyless agents endpoint: 100 searches a day per IP. */
async function searchYou(fetchImpl, query, maxResults, signal) {
  const url = `https://api.you.com/v1/agents/search?query=${encodeURIComponent(query)}&count=${maxResults}`;
  const response = await fetchImpl(url, { headers: { accept: 'application/json' }, signal });
  const data = await readJson(response);
  const items = data?.results?.web ?? [];
  return toResult({ results: items }, maxResults);
}

// ── parsers ──────────────────────────────────────────────────────────────────

function toResult(payload, maxResults) {
  const items = Array.isArray(payload?.results) ? payload.results : [];
  return { sources: toSources(items, maxResults), truncated: false };
}

/** Normalise one lane's items to the seam's citeable-source shape. */
export function toSources(items, maxResults) {
  const seen = new Set();
  const sources = [];
  for (const item of items ?? []) {
    const url = typeof item?.url === 'string' ? item.url : '';
    if (!/^https?:\/\//i.test(url) || seen.has(url)) continue;
    seen.add(url);
    const source = { url };
    const title = clean(item.title, 300);
    if (title) source.title = title;
    const snippet = clean(
      item.snippet ?? item.description ?? (Array.isArray(item.snippets) ? item.snippets.join(' ') : undefined),
      600,
    );
    if (snippet) source.snippet = snippet;
    const publishedAt = clean(item.publishedAt ?? item.published_at ?? item.page_age ?? item.pubDate, 80);
    if (publishedAt) source.publishedAt = publishedAt;
    sources.push(source);
    if (sources.length >= maxResults) break;
  }
  return sources;
}

export function parseRss(xml) {
  const items = [...String(xml).matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((match) => match[0]);
  return items
    .map((item) => ({
      title: xmlTag(item, 'title'),
      url: xmlTag(item, 'link'),
      snippet: xmlTag(item, 'description'),
      publishedAt: xmlTag(item, 'pubDate'),
    }))
    .filter((item) => typeof item.url === 'string' && item.url !== '');
}

function xmlTag(xml, name) {
  const match = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'));
  if (!match) return undefined;
  const inner = match[1].replace(/^\s*<!\[CDATA\[/, '').replace(/\]\]>\s*$/, '');
  return stripTags(inner);
}

export function parseDuckDuckGo(html) {
  const blocks = String(html).split(/<div class="result\b/).slice(1);
  const found = [];
  for (const block of blocks) {
    const anchor = anchorByClass(block, 'result__a');
    if (!anchor) continue;
    const url = unwrapDuckDuckGo(anchor.href);
    if (!url) continue;
    const snippetAnchor = anchorByClass(block, 'result__snippet');
    found.push({
      title: stripTags(anchor.inner),
      url,
      snippet: snippetAnchor ? stripTags(snippetAnchor.inner) : undefined,
    });
  }
  return found;
}

function anchorByClass(block, className) {
  for (const match of block.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const attributes = match[1];
    const classMatch = attributes.match(/class="([^"]*)"/i);
    if (!classMatch || !classMatch[1].split(/\s+/).includes(className)) continue;
    const hrefMatch = attributes.match(/href="([^"]*)"/i);
    return { href: hrefMatch ? decodeAttribute(hrefMatch[1]) : '', inner: match[2] };
  }
  return undefined;
}

function unwrapDuckDuckGo(href) {
  if (!href) return undefined;
  if (/^https?:\/\//i.test(href)) return href;
  try {
    const parsed = new URL(href, 'https://duckduckgo.com');
    const target = parsed.searchParams.get('uddg');
    if (target) return decodeURIComponent(target);
  } catch {
    return undefined;
  }
  return undefined;
}

function decodeAttribute(value) {
  return value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x2f;/gi, '/').replace(/&#47;/g, '/');
}

function clean(value, cap) {
  if (typeof value !== 'string') return undefined;
  const text = stripTags(value);
  if (!text) return undefined;
  return text.length > cap ? `${text.slice(0, cap - 1)}…` : text;
}
