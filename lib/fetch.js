/**
 * The free fetch provider.
 *
 * Level 1 is the harness's own `http` provider (local, unlimited, SSRF-safe);
 * this module never reimplements it, it delegates. Level 2 is Firecrawl's
 * keyless scrape, used only when level 1 could not produce readable content
 * (bot wall, non-2xx, or a JavaScript shell) — and never for a target that is
 * private or that does not resolve to public addresses, so the disclosure
 * ("this URL went to a third party") stays limited to genuinely public pages.
 */
import { lookup as dnsLookup } from 'node:dns/promises';
import { USER_AGENT, classify } from './net.js';

const DEFAULTS = {
  scrapeTimeoutMs: 20_000,
  maxChars: 50_000,
  /** Below this, a 2xx page is treated as unreadable and escalates. */
  minUsefulChars: 300,
};

const FIRECRAWL_SCRAPE = 'https://api.firecrawl.dev/v2/scrape';

export function createFetchProvider(options = {}) {
  const opt = { ...DEFAULTS, ...options };
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const resolve = options.lookup ?? ((host) => dnsLookup(host, { all: true }));
  const id = options.id ?? 'freeweb-fetch';
  const getNative = options.getNative ?? (() => undefined);

  return {
    id,
    // Cheap and offline on purpose: the honest verdict belongs to execution.
    available: () => true,
    async fetch(request, signal) {
      const url = String(request?.url ?? '');
      let native;
      if (getNative()) {
        // A native failure is information (it may still be the answer to
        // return), not a reason to lose the escalation.
        try {
          native = await getNative().fetch(request, signal);
        } catch {
          native = undefined;
        }
      }

      if (native && !needsUpgrade(native, opt.minUsefulChars)) return native;

      if (await mayDisclose(url, resolve)) {
        try {
          const markdown = await scrape(fetchImpl, url, signal, opt);
          if (markdown) {
            const truncated = markdown.length >= opt.maxChars;
            return {
              url,
              statusCode: 200,
              body: { kind: 'text', content: truncated ? markdown.slice(0, opt.maxChars) : markdown },
              truncated,
            };
          }
        } catch {
          // Fall through: the local answer, even a non-2xx one, is the result.
        }
      }

      if (native) return native;
      throw new Error(`freeweb: could not read ${url} locally and no public target to escalate`);
    },
  };
}

/** A native result is upgraded when it is a wall, a 2xx shell, or empty. A 404
 * is a real answer about the resource and is never escalated. */
function needsUpgrade(result, minUsefulChars) {
  if (!result) return true;
  if (result.statusCode === 404) return false;
  if (result.statusCode < 200 || result.statusCode >= 300) return true;
  const text = String(result.body?.content ?? '').trim();
  if (text.length < minUsefulChars) return true;
  return /enable javascript|javascript is (?:required|disabled)|please turn on javascript/i.test(text) && text.length < 2_000;
}

async function scrape(fetchImpl, url, signal, opt) {
  const response = await fetchImpl(FIRECRAWL_SCRAPE, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': USER_AGENT },
    body: JSON.stringify({ url, formats: ['markdown'], onlyMainContent: true }),
    signal: withScrapeTimeout(signal, opt.scrapeTimeoutMs),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`firecrawl scrape HTTP ${response.status}`, { cause: classify(response.status, text) });
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('firecrawl scrape returned unparsable JSON');
  }
  const markdown = parsed?.data?.markdown ?? parsed?.data?.content;
  return typeof markdown === 'string' && markdown.trim() ? markdown.trim() : undefined;
}

function withScrapeTimeout(signal, ms) {
  const timeout = AbortSignal.timeout(Math.max(1, Math.floor(ms)));
  if (!signal) return timeout;
  return typeof AbortSignal.any === 'function' ? AbortSignal.any([signal, timeout]) : timeout;
}

/** True only when every resolved address is public: the disclosure is ours to
 * make, and a private page must never leave the machine. */
export async function mayDisclose(url, resolve = (host) => dnsLookup(host, { all: true })) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host || isPrivateHostname(host)) return false;
  let addresses;
  try {
    addresses = await resolve(host);
  } catch {
    return false;
  }
  if (!Array.isArray(addresses) || addresses.length === 0) return false;
  return addresses.every((entry) => !isPrivateAddress(String(entry?.address ?? '')));
}

function isPrivateHostname(host) {
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.home.arpa') ||
    isPrivateAddress(host)
  );
}

export function isPrivateAddress(address) {
  const value = address.trim().toLowerCase();
  if (!value) return false;
  if (value.includes(':')) {
    if (value === '::1' || value === '::') return true;
    if (/^fe[89ab][0-9a-f]:/.test(value)) return true;
    if (/^f[cd][0-9a-f]{2}:/.test(value)) return true;
    const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return mapped ? isPrivateAddress(mapped[1]) : false;
  }
  const parts = value.split('.');
  if (parts.length !== 4) return false;
  const [a, b] = parts.map((part) => Number(part));
  if (![a, b].every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) return false;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return a >= 224; // multicast and reserved
}
