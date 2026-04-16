/**
 * In-memory TTL cache for merged Nearby Search results (one Node process, e.g. long-running `npm start`).
 * Keyed by rounded coordinates + radius + maxPages to avoid duplicate multi-page fetches.
 */

export type CachedNearbyPlace = {
  placeId: string;
  name: string;
  location: { lat: number; lng: number };
  types: string[];
  rating?: number;
  totalRatings?: number;
};

type Entry = { places: CachedNearbyPlace[]; expiresAt: number };

/** First-page lazy Nearby: stores `next_page_token` so clients can continue pagination. */
export type LazyNearbyCacheEntry = {
  places: CachedNearbyPlace[];
  nextPageToken: string | null;
  expiresAt: number;
};

const store = new Map<string, Entry>();
const lazyStore = new Map<string, LazyNearbyCacheEntry>();

/** ~11m precision — enough to bucket without merging distant queries. */
export function nearbyCacheKey(
  lat: number,
  lng: number,
  radius: number,
  maxPages: number,
): string {
  return `${lat.toFixed(5)}_${lng.toFixed(5)}_${radius}_${maxPages}`;
}

/** Cache key for lazy first page only (no merged multi-page blob). */
export function nearbyLazyFirstPageKey(
  lat: number,
  lng: number,
  radius: number,
): string {
  return `${lat.toFixed(5)}_${lng.toFixed(5)}_${radius}_lazy_p1`;
}

export function getLazyNearbyCache(
  key: string,
  now: number,
): LazyNearbyCacheEntry | null {
  const e = lazyStore.get(key);
  if (!e || e.expiresAt <= now) {
    if (e) lazyStore.delete(key);
    return null;
  }
  return e;
}

export function setLazyNearbyCache(
  key: string,
  places: CachedNearbyPlace[],
  nextPageToken: string | null,
  ttlMs: number,
  now: number,
): void {
  if (ttlMs <= 0) return;
  lazyStore.set(key, { places, nextPageToken, expiresAt: now + ttlMs });
}

export function getNearbyCache(key: string, now: number): CachedNearbyPlace[] | null {
  const e = store.get(key);
  if (!e || e.expiresAt <= now) {
    if (e) store.delete(key);
    return null;
  }
  return e.places;
}

export function setNearbyCache(
  key: string,
  places: CachedNearbyPlace[],
  ttlMs: number,
  now: number,
): void {
  if (ttlMs <= 0) return;
  store.set(key, { places, expiresAt: now + ttlMs });
}
