/**
 * Live verification. Not part of the plugin: run it to see the free lanes as
 * they really behave from this machine.
 *
 *   node scripts/probe.mjs
 *
 * It reports each endpoint's raw reachability, one real end-to-end search per
 * query, and the fetch escalation (local wall → keyless scrape). It never
 * touches a paid API and never reads a credential.
 */
import { createSearcher } from '../lib/lanes.js';
import { createFetchProvider } from '../lib/fetch.js';

const QUERIES = [
  'TypeScript 6 release date',
  'DeepSeek Harness plugins',
  'what is the capital of Portugal',
  'Node.js 24 release notes',
];

const time = () => performance.now();
const ms = (start) => `${Math.round(time() - start)} ms`;

console.log('— endpoints (raw reachability) —');
const endpoints = [
  ['keenable', 'https://api.keenable.ai/v1/search/public', { method: 'POST', headers: { 'content-type': 'application/json', 'x-keenable-title': 'dsh-free-websearch' }, body: JSON.stringify({ query: 'test', max_results: 1 }) }],
  ['firecrawl', 'https://api.firecrawl.dev/v2/search', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: 'test', limit: 1 }) }],
  ['bing-rss', 'https://www.bing.com/search?format=rss&q=test&count=1', {}],
  ['ddg', 'https://html.duckduckgo.com/html/', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'q=test' }],
  ['you', 'https://api.you.com/v1/agents/search?query=test&count=1', {}],
];
for (const [label, url, init] of endpoints) {
  const start = time();
  try {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
    console.log(`  ${label.padEnd(10)} HTTP ${response.status}  ${ms(start)}`);
  } catch (error) {
    console.log(`  ${label.padEnd(10)} FAILED      ${ms(start)}  ${String(error).slice(0, 80)}`);
  }
}

console.log('\n— real searches through the chain —');
const searcher = createSearcher();
for (const query of QUERIES) {
  const start = time();
  try {
    const result = await searcher.search({ query, maxResults: 5 });
    console.log(`  "${query}" → ${result.sources.length} sources, ${ms(start)}`);
    for (const source of result.sources.slice(0, 2)) {
      console.log(`      • ${(source.title ?? '(no title)').slice(0, 60)} — ${source.url.slice(0, 70)}`);
    }
  } catch (error) {
    console.log(`  "${query}" → FAILED ${ms(start)}: ${error.message.slice(0, 200)}`);
  }
}

console.log('\n— fetch escalation (simulated local wall, real cloud scrape) —');
const walled = {
  fetch: async (request) => ({ url: request.url, statusCode: 403, body: { kind: 'text', content: 'blocked' }, truncated: false }),
};
const provider = createFetchProvider({ getNative: () => walled });
for (const url of ['https://www.typescriptlang.org/docs/', 'http://169.254.169.254/latest/meta-data/']) {
  const start = time();
  try {
    const result = await provider.fetch({ url });
    console.log(`  ${url} → HTTP ${result.statusCode}, ${result.body.content.length} chars, ${ms(start)}`);
  } catch (error) {
    console.log(`  ${url} → FAILED ${ms(start)}: ${error.message.slice(0, 120)}`);
  }
}
