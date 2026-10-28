/**
 * dsh-free-websearch — the harness's `web_search` and `web_fetch` on free,
 * keyless backends.
 *
 * The plugin does not add tools. It registers a search provider and a fetch
 * provider into the existing `ctx.web` seam, so the model keeps the same tool
 * schemas, the UI keeps its source cards, and the only thing that changes is
 * where the bytes come from. The bundle patch pins the seam and disables the
 * two paid providers; this file covers the install that arrives without the
 * patch (a plain dependency) and restores the shipped selection when the
 * plugin is unloaded.
 */
import { createSearcher } from './lanes.js';
import { createFetchProvider } from './fetch.js';

export const name = 'freeweb';
export const inject = ['web'];

export const SEARCH_ID = 'freeweb';
export const FETCH_ID = 'freeweb-fetch';
/** For the boot log only; the chain itself lives in lanes.js. */
const LANES_LABEL = 'keenable → firecrawl → bing → ddg → you';

/** The ids the shipped base selects; anything else is a deliberate choice and
 * is left alone. */
const SHIPPED_SEARCH = 'deepseek-official';
const PAID_SEARCH = new Set([SHIPPED_SEARCH, 'deepseek-search-api']);
const SHIPPED_FETCH = 'http';
const PAID_FETCH = new Set(['deepseek-fetch-api']);

export function apply(ctx, config = {}) {
  const searcher = createSearcher(config.search);
  const fetchProvider = createFetchProvider({
    ...config.fetch,
    getNative: () => ctx.web?.fetchProviders?.get(SHIPPED_FETCH),
  });

  // `available()` stays cheap and offline; the honest verdict belongs to the
  // execution, whose error names every lane that was tried.
  ctx.web.registerSearchProvider({
    id: SEARCH_ID,
    available: () => true,
    search: (request, signal) => searcher.search(request, signal),
  });
  ctx.web.registerFetchProvider(fetchProvider);
  ctx.logger?.info?.(
    `freeweb: web_search runs the free lane chain (${LANES_LABEL}); web_fetch stays local first`,
  );

  if (config.takeover === false) return;

  // The selection is a volatile settings ref, so it is only writable once the
  // settings service is mounted — `apply` runs before that.
  ctx.inject(['settings'], (scoped) => {
    const ops = takeoverOps(ctx.web, SEARCH_ID, FETCH_ID);
    if (ops.length === 0) return;
    if (typeof scoped.settings?.mutate !== 'function') {
      ctx.logger?.warn?.('freeweb: cannot repoint the web seam; the settings service is unavailable');
      return;
    }

    let wrote = false;
    scoped.effect(() => {
      Promise.resolve(scoped.settings.mutate('web', ops)).then(
        () => {
          wrote = true;
          ctx.logger?.info?.(
            `freeweb: took over the web seam (${ops.map((op) => op.path.join('.')).join(', ')})`,
          );
        },
        (error) => ctx.logger?.warn?.(`freeweb: could not repoint the web seam (${error?.message ?? error})`),
      );
      // Unloading the plugin puts the shipped providers back, so disabling or
      // removing it restores the original harness behaviour with no leftovers.
      return () => {
        if (!wrote) return;
        try {
          const back = restoreOps(ctx.web, SEARCH_ID, FETCH_ID);
          if (back.length) Promise.resolve(scoped.settings.mutate('web', back)).catch(() => {});
        } catch {
          // Teardown is best effort; the bundle patch is the primary restore.
        }
      };
    }, 'freeweb: takeover');
  });
}

/** The selection write this install needs, if any. Pure, so it is testable. */
export function takeoverOps(web, searchId = SEARCH_ID, fetchId = FETCH_ID) {
  const ops = [];
  const search = currentProvider(web, 'searchProvider');
  if (search === undefined || search === null || PAID_SEARCH.has(search)) {
    ops.push({ op: 'set', path: ['searchProvider'], value: searchId });
  }
  const fetch = currentProvider(web, 'fetchProvider');
  if (fetch === undefined || fetch === null || fetch === SHIPPED_FETCH || PAID_FETCH.has(fetch)) {
    ops.push({ op: 'set', path: ['fetchProvider'], value: fetchId });
  }
  return ops;
}

/** The mirror write that undoes {@link takeoverOps} when the plugin unloads. */
export function restoreOps(web, searchId = SEARCH_ID, fetchId = FETCH_ID) {
  const ops = [];
  if (currentProvider(web, 'searchProvider') === searchId) {
    ops.push({ op: 'set', path: ['searchProvider'], value: SHIPPED_SEARCH });
  }
  if (currentProvider(web, 'fetchProvider') === fetchId) {
    ops.push({ op: 'set', path: ['fetchProvider'], value: SHIPPED_FETCH });
  }
  return ops;
}

/** Read the effective provider id under both shapes the seam has had: a
 * volatile config ref (0.2.1-rc.2+) and a plain property before it. */
export function currentProvider(web, key) {
  const ref = web?.config?.[key];
  if (ref && typeof ref.get === 'function') return ref.get();
  return web?.[key === 'searchProvider' ? 'searchProviderId' : 'fetchProviderId'];
}
