/**
 * Cover art helpers — ported verbatim (in spirit) from the prototype.
 *
 * Strategy: render a deterministic gradient + initials immediately, then
 * asynchronously look up the real artwork via the iTunes Search API (JSONP,
 * to dodge CORS) and crossfade it in. We never show a broken <img>.
 */

/** Stable string hash (same as prototype). */
export function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Deterministic two-stop gradient derived from a seed string. */
export function grad(seed: string): string {
  const h = hash(seed);
  const a = h % 360;
  const b = (a + 45 + (h % 70)) % 360;
  return `linear-gradient(140deg,hsl(${a} 52% 55%),hsl(${b} 48% 38%))`;
}

/** Up to two uppercase initials from a seed. */
export function initials(s: string): string {
  return s
    .split(/[\s\-–—]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

const coverCache = new Map<string, Promise<string | null>>();

/** JSONP fetch helper (browser only). */
function jsonp(url: string): Promise<any> {
  return new Promise((res) => {
    if (typeof document === 'undefined') {
      res(null);
      return;
    }
    const cb = '_cb' + Math.abs(hash(url)) + Math.floor(performance.now());
    const s = document.createElement('script');
    let settled = false;
    const finish = (d: unknown) => {
      if (settled) return;
      settled = true;
      delete (window as any)[cb];
      s.remove();
      res(d);
    };
    (window as any)[cb] = (d: unknown) => finish(d);
    s.onerror = () => finish(null);
    s.src = url + '&callback=' + cb;
    document.body.appendChild(s);
    setTimeout(() => finish(null), 6000);
  });
}

/**
 * Resolve a real cover URL from an album/artist term via iTunes Search.
 * Returns a 600x600 artwork URL, or null when nothing is found.
 * Results are cached per-term for the session.
 */
export function realCover(term: string): Promise<string | null> {
  const cached = coverCache.get(term);
  if (cached) return cached;
  const p = jsonp(
    'https://itunes.apple.com/search?limit=1&entity=album&term=' + encodeURIComponent(term)
  )
    .then((d: any) => {
      const u = d && d.results && d.results[0] && d.results[0].artworkUrl100;
      return u ? (u as string).replace('100x100bb', '600x600bb') : null;
    })
    .catch(() => null);
  coverCache.set(term, p);
  return p;
}
