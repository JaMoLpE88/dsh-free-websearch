import assert from 'node:assert/strict';
import test from 'node:test';

import { createSearcher, parseDuckDuckGo, parseRss, toSources } from '../lib/lanes.js';
import { createFetchProvider, isPrivateAddress, mayDisclose } from '../lib/fetch.js';
import { currentProvider, restoreOps, takeoverOps } from '../lib/index.js';

/** A fetch that answers by URL substring and records what was called. */
function responder(routes) {
  const calls = [];
  const impl = async (url, init = {}) => {
    calls.push(String(url));
    const key = Object.keys(routes).find((needle) => String(url).includes(needle));
    if (!key) throw new Error(`unexpected request: ${url}`);
    return routes[key](url, init);
  };
  impl.calls = calls;
  return impl;
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const text = (body, status = 200) => new Response(body, { status });

test('keenable lane maps a keyless JSON response to citeable sources', async () => {
  const fetchImpl = responder({
    keenable: () =>
      json({
        results: [
          { title: 'Announcing TypeScript 6', url: 'https://devblogs.example/ts6', description: 'Release notes', published_at: '2026-10-01' },
          { title: 'Duplicate', url: 'https://devblogs.example/ts6' },
          { title: 'Not a URL', url: 'javascript:void(0)' },
        ],
      }),
  });
  const searcher = createSearcher({ fetchImpl });
  const result = await searcher.search({ query: 'typescript 6', maxResults: 5 });

  assert.equal(result.sources.length, 1, 'dedupe by url and drop non-http');
  assert.deepEqual(result.sources[0], {
    url: 'https://devblogs.example/ts6',
    title: 'Announcing TypeScript 6',
    snippet: 'Release notes',
    publishedAt: '2026-10-01',
  });
  assert.match(fetchImpl.calls[0], /api\.keenable\.ai\/v1\/search\/public/);
});

test('the chain fails over to the next lane and stays off the cooled one', async () => {
  const fetchImpl = responder({
    keenable: () => text('hourly pool used up', 429),
    firecrawl: () => json({ success: true, data: { web: [{ title: 'From Firecrawl', url: 'https://a.example/1' }] } }),
  });
  const searcher = createSearcher({ fetchImpl });

  const first = await searcher.search({ query: 'first query' });
  assert.equal(first.sources[0].title, 'From Firecrawl');
  assert.equal(fetchImpl.calls.filter((url) => url.includes('keenable')).length, 1);

  // A different query cannot hit the cache, so it proves the cooldown skipped
  // the walled lane instead of retrying it.
  const second = await searcher.search({ query: 'second query' });
  assert.equal(second.sources[0].url, 'https://a.example/1');
  assert.equal(fetchImpl.calls.filter((url) => url.includes('keenable')).length, 1, 'cooldown must skip keenable');
});

test('an identical query is served from cache without a second request', async () => {
  const fetchImpl = responder({
    keenable: () => json({ results: [{ title: 'Cached', url: 'https://c.example/1' }] }),
  });
  const searcher = createSearcher({ fetchImpl });
  await searcher.search({ query: 'same query' });
  await searcher.search({ query: 'same query' });
  assert.equal(fetchImpl.calls.length, 1);
});

test('when every lane fails the error names them and says nothing was paid', async () => {
  const fetchImpl = responder({
    keenable: () => text('nope', 500),
    firecrawl: () => text('nope', 500),
    bing: () => text('<rss></rss>'),
    ddg: () => text('anomaly-modal'),
    you: () => text('nope', 500),
  });
  const searcher = createSearcher({ fetchImpl });

  await assert.rejects(
    () => searcher.search({ query: 'anything' }),
    (error) => {
      for (const lane of ['keenable', 'firecrawl', 'bing', 'ddg', 'you']) {
        assert.match(error.message, new RegExp(lane), `error must name ${lane}`);
      }
      assert.match(error.message, /Nothing was sent to a paid API/);
      return true;
    },
  );
});

test('the Bing RSS parser reads direct links, titles and descriptions', () => {
  const rss = `<rss><channel>
    <item>
      <title>Announcing &lt;TypeScript&gt; 6</title>
      <link>https://devblogs.example/ts6</link>
      <description><![CDATA[Release <b>date</b> announced]]></description>
      <pubDate>Mon, 01 Jan 2026 00:00:00 GMT</pubDate>
    </item>
    <item><title>Second</title><link>https://b.example/2</link></item>
  </channel></rss>`;

  const items = parseRss(rss);
  assert.equal(items.length, 2);
  assert.equal(items[0].url, 'https://devblogs.example/ts6');
  assert.equal(items[0].title, 'Announcing <TypeScript> 6');
  assert.equal(items[0].snippet, 'Release date announced');
  assert.equal(items[0].publishedAt, 'Mon, 01 Jan 2026 00:00:00 GMT');
});

test('the DuckDuckGo parser unwraps its redirect and strips highlight tags', () => {
  const html = `
    <div class="result results_links results_links_deep web-result">
      <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fpage&amp;rut=abc">Example <b>Page</b></a>
      <a class="result__snippet" href="//duckduckgo.com/l/?uddg=x">A <b>snippet</b> here.</a>
    </div>
    <div class="result results_links">
      <a class="result__a" href="https://direct.example/2">Direct link</a>
    </div>`;

  const items = parseDuckDuckGo(html);
  assert.equal(items.length, 2);
  assert.equal(items[0].url, 'https://example.com/page');
  assert.equal(items[0].title, 'Example Page');
  assert.equal(items[0].snippet, 'A snippet here.');
  assert.equal(items[1].url, 'https://direct.example/2');
});

test('sources are capped and snippets are bounded', () => {
  const items = Array.from({ length: 12 }, (_, index) => ({
    title: `t${index}`,
    url: `https://example.com/${index}`,
    snippet: 'x'.repeat(900),
  }));
  const sources = toSources(items, 8);
  assert.equal(sources.length, 8);
  assert.ok(sources[0].snippet.length <= 600);
});

// ── fetch provider ───────────────────────────────────────────────────────────

const nativeOk = {
  fetch: async (request) => ({
    url: request.url,
    statusCode: 200,
    body: { kind: 'html', content: `<html><body>${'real content '.repeat(60)}</body></html>` },
    truncated: false,
  }),
};

test('fetch returns the native result and never discloses a public page that worked', async () => {
  const fetchImpl = responder({});
  const provider = createFetchProvider({ getNative: () => nativeOk, fetchImpl, lookup: async () => [{ address: '93.184.216.34' }] });
  const result = await provider.fetch({ url: 'https://example.com/doc' });
  assert.equal(result.statusCode, 200);
  assert.equal(fetchImpl.calls.length, 0, 'a usable local fetch must not reach the cloud');
});

test('fetch escalates a walled page to the keyless scrape', async () => {
  const nativeWalled = {
    fetch: async (request) => ({ url: request.url, statusCode: 403, body: { kind: 'text', content: 'blocked' }, truncated: false }),
  };
  const fetchImpl = responder({
    firecrawl: () => json({ success: true, data: { markdown: '# Title\n\nBody from the cloud browser.' } }),
  });
  const provider = createFetchProvider({ getNative: () => nativeWalled, fetchImpl, lookup: async () => [{ address: '93.184.216.34' }] });
  const result = await provider.fetch({ url: 'https://example.com/js-app' });

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.kind, 'text');
  assert.match(result.body.content, /Body from the cloud browser/);
  assert.equal(fetchImpl.calls.length, 1);
});

test('fetch never discloses a private target, and still returns the native answer', async () => {
  const nativePrivate = {
    fetch: async () => ({ url: 'http://192.168.1.10/', statusCode: 403, body: { kind: 'text', content: 'blocked' }, truncated: false }),
  };
  const fetchImpl = responder({ firecrawl: () => json({ data: { markdown: 'leaked' } }) });
  const provider = createFetchProvider({ getNative: () => nativePrivate, fetchImpl, lookup: async () => [{ address: '192.168.1.10' }] });

  const result = await provider.fetch({ url: 'http://192.168.1.10/' });
  assert.equal(result.statusCode, 403);
  assert.equal(fetchImpl.calls.length, 0, 'private targets must never leave the machine');
});

test('private address classification covers the reserved ranges', () => {
  for (const address of ['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.0.5', '169.254.1.1', '100.64.0.1', '::1', 'fd00::1', 'fe80::1']) {
    assert.equal(isPrivateAddress(address), true, `${address} must be private`);
  }
  for (const address of ['93.184.216.34', '8.8.8.8', '2606:2800::1']) {
    assert.equal(isPrivateAddress(address), false, `${address} must be public`);
  }
});

test('mayDisclose refuses unresolvable and non-http targets', async () => {
  assert.equal(await mayDisclose('not a url', async () => []), false);
  assert.equal(await mayDisclose('ftp://example.com/x', async () => []), false);
  assert.equal(await mayDisclose('http://localhost:3080/', async () => [{ address: '127.0.0.1' }]), false);
  assert.equal(await mayDisclose('https://example.com/', async () => { throw new Error('dns down'); }), false);
  assert.equal(await mayDisclose('https://example.com/', async () => [{ address: '93.184.216.34' }]), true);
});

// ── takeover ─────────────────────────────────────────────────────────────────

test('the takeover writes only over the shipped defaults', () => {
  const shipped = { config: { searchProvider: { get: () => 'deepseek-official' }, fetchProvider: { get: () => 'http' } } };
  assert.deepEqual(
    takeoverOps(shipped).map((op) => op.path.join('.')),
    ['searchProvider', 'fetchProvider'],
  );

  const paidApi = { config: { searchProvider: { get: () => 'deepseek-search-api' }, fetchProvider: { get: () => 'deepseek-fetch-api' } } };
  assert.equal(takeoverOps(paidApi).length, 2, 'the paid API mode is still the shipped behaviour');

  const explicit = { config: { searchProvider: { get: () => 'modsearch' }, fetchProvider: { get: () => 'custom-fetch' } } };
  assert.deepEqual(takeoverOps(explicit), [], 'a deliberate choice is left alone');

  const ours = { config: { searchProvider: { get: () => 'freeweb' }, fetchProvider: { get: () => 'freeweb-fetch' } } };
  assert.deepEqual(takeoverOps(ours), [], 'nothing to write when the bundle patch already pinned it');
});

test('restore puts the shipped ids back when the plugin is unloaded', () => {
  const ours = { config: { searchProvider: { get: () => 'freeweb' }, fetchProvider: { get: () => 'freeweb-fetch' } } };
  const back = restoreOps(ours);
  assert.deepEqual(back, [
    { op: 'set', path: ['searchProvider'], value: 'deepseek-official' },
    { op: 'set', path: ['fetchProvider'], value: 'http' },
  ]);
  const alreadyShipped = { config: { searchProvider: { get: () => 'deepseek-official' }, fetchProvider: { get: () => 'http' } } };
  assert.deepEqual(restoreOps(alreadyShipped), []);
});

test('provider selection reads both the ref shape and the older property shape', () => {
  assert.equal(currentProvider({ config: { searchProvider: { get: () => 'x' } } }, 'searchProvider'), 'x');
  assert.equal(currentProvider({ searchProviderId: 'legacy-id' }, 'searchProvider'), 'legacy-id');
});

test('apply registers both providers and only then repoints the seam', async () => {
  const { apply } = await import('../lib/index.js');
  const registered = { search: undefined, fetch: undefined };
  const mutations = [];
  let dispose;

  // Stands in for the settings document: mutate applies the op, which is what
  // makes the seam read a different provider afterwards.
  const state = { searchProvider: 'deepseek-official', fetchProvider: 'http' };
  const web = {
    config: {
      searchProvider: { get: () => state.searchProvider },
      fetchProvider: { get: () => state.fetchProvider },
    },
    fetchProviders: new Map(),
    registerSearchProvider: (provider) => {
      registered.search = provider;
    },
    registerFetchProvider: (provider) => {
      registered.fetch = provider;
    },
  };

  const ctx = {
    web,
    logger: { info() {}, warn() {} },
    inject: (services, callback) => {
      assert.deepEqual(services, ['settings'], 'the selection needs the settings service');
      callback({
        settings: {
          mutate: (namespace, ops) => {
            mutations.push({ namespace, ops });
            for (const op of ops) if (op.op === 'set') state[op.path[0]] = op.value;
            return Promise.resolve();
          },
        },
        effect: (body) => {
          dispose = body();
        },
      });
    },
  };

  const fetchImpl = responder({
    keenable: () => json({ results: [{ title: 'T', url: 'https://t.example/1', description: 'S' }] }),
  });
  apply(ctx, { search: { fetchImpl }, fetch: { fetchImpl } });

  assert.equal(registered.search.id, 'freeweb');
  assert.equal(registered.fetch.id, 'freeweb-fetch');
  assert.equal(registered.search.available(), true);

  const result = await registered.search.search({ query: 'q' });
  assert.equal(result.sources[0].url, 'https://t.example/1');

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(mutations.length, 1, 'one batched write, not one per field');
  assert.equal(mutations[0].namespace, 'web');
  assert.deepEqual(
    mutations[0].ops.map((op) => [op.path.join('.'), op.value]),
    [
      ['searchProvider', 'freeweb'],
      ['fetchProvider', 'freeweb-fetch'],
    ],
  );

  dispose();
  await new Promise((resolve) => setImmediate(resolve));
  const restore = mutations.at(-1);
  assert.deepEqual(
    restore.ops.map((op) => [op.path.join('.'), op.value]),
    [
      ['searchProvider', 'deepseek-official'],
      ['fetchProvider', 'http'],
    ],
    'unloading must put the shipped providers back',
  );
});
