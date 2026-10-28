/** Shared HTTP vocabulary for every lane: one browser identity, one timeout
 * policy, three tiny parsers. No dependency, no state. */

export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/** A lane failure. `quota` means the pool is spent for a long time (a monthly
 * credit pool), `botwall` means the endpoint decided we are a robot. */
export class LaneError extends Error {
  constructor(message, kind = {}) {
    super(message);
    this.name = 'LaneError';
    this.quota = kind.quota === true;
    this.botwall = kind.botwall === true;
  }
}

/** Race a request against its own budget and the caller's cancellation. */
export function withTimeout(signal, ms) {
  const timeout = AbortSignal.timeout(Math.max(1, Math.floor(ms)));
  if (!signal) return timeout;
  return typeof AbortSignal.any === 'function' ? AbortSignal.any([signal, timeout]) : timeout;
}

/** Classify an HTTP failure: a spent monthly pool is not the same as a
 * temporary wall, and the cooldown differs by an order of magnitude. */
export function classify(status, body) {
  const text = String(body ?? '').slice(0, 400);
  if (status === 402) return { quota: true };
  if (/out of credits|credits? (?:exhausted|used up)|monthly (?:limit|quota)|quota (?:exceeded|exhausted)|insufficient/i.test(text)) {
    return { quota: true };
  }
  return { botwall: status === 429 || status === 403 || status === 401 || status === 202 };
}

const ENTITIES = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
};

/** Decode the entity subset these SERPs actually use. */
export function decodeEntities(text) {
  return String(text)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeChar(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => safeChar(parseInt(dec, 10)))
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (match) => ENTITIES[match] ?? match);
}

function safeChar(code) {
  try {
    return String.fromCodePoint(code);
  } catch {
    return '';
  }
}

/** Strip markup and collapse whitespace: SERP snippets arrive as fragments. */
export function stripTags(html) {
  return decodeEntities(String(html).replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

/** Read a response body, mapping a non-2xx status to a LaneError. */
export async function readJson(response) {
  const text = await response.text();
  if (!response.ok) {
    throw new LaneError(`HTTP ${response.status}`, classify(response.status, text));
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new LaneError(`unparsable JSON (HTTP ${response.status})`);
  }
}
