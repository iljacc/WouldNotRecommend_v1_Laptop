import {
  getNearbyCache,
  getLazyNearbyCache,
  nearbyCacheKey,
  nearbyLazyFirstPageKey,
  setLazyNearbyCache,
  setNearbyCache,
  type CachedNearbyPlace,
} from "@/lib/places-nearby-cache";

/** Google recommends ~2s delay before the next `pagetoken` request. */
export const NEARBY_PAGE_DELAY_MS = 2_000;

type NearbyPlaceRaw = {
  place_id: string;
  name: string;
  geometry: { location: { lat: number; lng: number } };
  types?: string[];
  rating?: number;
  user_ratings_total?: number;
};

function mapPlace(place: NearbyPlaceRaw): CachedNearbyPlace {
  return {
    placeId: place.place_id,
    name: place.name,
    location: {
      lat: place.geometry.location.lat,
      lng: place.geometry.location.lng,
    },
    types: place.types || [],
    rating: place.rating,
    totalRatings: place.user_ratings_total,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Single Nearby Search request: either first page (`location` + `radius`) or
 * continuation (`pageToken` only, per Google).
 */
export async function fetchNearbySinglePage(options: {
  apiKey: string;
  lat?: string;
  lng?: string;
  radius?: string;
  pageToken?: string;
}): Promise<{
  places: CachedNearbyPlace[];
  nextPageToken: string | null;
  error?: string;
}> {
  const { apiKey, lat, lng, radius, pageToken } = options;

  const nearbyUrl = new URL(
    "https://maps.googleapis.com/maps/api/place/nearbysearch/json",
  );
  if (pageToken) {
    nearbyUrl.searchParams.set("pagetoken", pageToken);
  } else {
    if (!lat || !lng || !radius) {
      return {
        places: [],
        nextPageToken: null,
        error: "lat, lng, and radius required without pageToken",
      };
    }
    nearbyUrl.searchParams.set("location", `${lat},${lng}`);
    nearbyUrl.searchParams.set("radius", radius);
    nearbyUrl.searchParams.set("type", "establishment");
  }
  nearbyUrl.searchParams.set("key", apiKey);

  let nearbyRes = await fetch(nearbyUrl.toString());
  let nearbyData = (await nearbyRes.json()) as {
    status: string;
    results?: NearbyPlaceRaw[];
    next_page_token?: string;
    error_message?: string;
  };

  if (
    pageToken &&
    nearbyData.status === "INVALID_REQUEST" &&
    pageToken
  ) {
    await sleep(NEARBY_PAGE_DELAY_MS);
    nearbyRes = await fetch(nearbyUrl.toString());
    nearbyData = (await nearbyRes.json()) as typeof nearbyData;
  }

  if (nearbyData.status !== "OK" && nearbyData.status !== "ZERO_RESULTS") {
    return {
      places: [],
      nextPageToken: null,
      error: nearbyData.error_message || nearbyData.status,
    };
  }

  const places = ((nearbyData.results || []) as NearbyPlaceRaw[]).map(mapPlace);
  const nextTok = nearbyData.next_page_token ?? null;

  return { places, nextPageToken: nextTok };
}

/**
 * Lazy first page: one Nearby request + optional TTL cache including `next_page_token`.
 */
export async function getNearbyLazyFirstPage(options: {
  lat: string;
  lng: string;
  radius: string;
  apiKey: string;
  cacheTtlMs: number;
}): Promise<{
  places: CachedNearbyPlace[];
  nextPageToken: string | null;
  error?: string;
}> {
  const { lat, lng, radius, apiKey, cacheTtlMs } = options;
  const latN = Number(lat);
  const lngN = Number(lng);
  const radiusN = Number(radius);
  const key = nearbyLazyFirstPageKey(latN, lngN, radiusN);
  const now = Date.now();

  if (cacheTtlMs > 0) {
    const hit = getLazyNearbyCache(key, now);
    if (hit) {
      return { places: hit.places, nextPageToken: hit.nextPageToken };
    }
  }

  const { places, nextPageToken, error } = await fetchNearbySinglePage({
    apiKey,
    lat,
    lng,
    radius,
  });

  if (error) {
    return { places: [], nextPageToken: null, error };
  }

  if (cacheTtlMs > 0 && places.length > 0) {
    setLazyNearbyCache(key, places, nextPageToken, cacheTtlMs, now);
  }

  return { places, nextPageToken };
}

/** Continuation page using `next_page_token` (call ~2s after first page; client batches work). */
export async function getNearbyLazyNextPage(options: {
  pageToken: string;
  apiKey: string;
}): Promise<{
  places: CachedNearbyPlace[];
  nextPageToken: string | null;
  error?: string;
}> {
  const { pageToken, apiKey } = options;
  await sleep(NEARBY_PAGE_DELAY_MS);
  return fetchNearbySinglePage({ apiKey, pageToken });
}

/**
 * Fetches up to `maxPages` Nearby Search pages (20 results each), deduped by `place_id`.
 */
export async function fetchNearbySearchMerged(
  lat: string,
  lng: string,
  radius: string,
  apiKey: string,
  maxPages: number,
): Promise<{ places: CachedNearbyPlace[]; error?: string }> {
  const byId = new Map<string, CachedNearbyPlace>();
  let nextToken: string | undefined;

  for (let page = 0; page < maxPages; page += 1) {
    if (page > 0) {
      if (!nextToken) break;
      await sleep(NEARBY_PAGE_DELAY_MS);
    }

    const nearbyUrl = new URL(
      "https://maps.googleapis.com/maps/api/place/nearbysearch/json",
    );
    if (page === 0) {
      nearbyUrl.searchParams.set("location", `${lat},${lng}`);
      nearbyUrl.searchParams.set("radius", radius);
      nearbyUrl.searchParams.set("type", "establishment");
    } else {
      if (!nextToken) break;
      nearbyUrl.searchParams.set("pagetoken", nextToken);
    }
    nearbyUrl.searchParams.set("key", apiKey);

    let nearbyRes = await fetch(nearbyUrl.toString());
    let nearbyData = (await nearbyRes.json()) as {
      status: string;
      results?: NearbyPlaceRaw[];
      next_page_token?: string;
      error_message?: string;
    };

    if (
      page > 0 &&
      nearbyData.status === "INVALID_REQUEST" &&
      nextToken
    ) {
      await sleep(NEARBY_PAGE_DELAY_MS);
      nearbyRes = await fetch(nearbyUrl.toString());
      nearbyData = (await nearbyRes.json()) as typeof nearbyData;
    }

    if (nearbyData.status !== "OK" && nearbyData.status !== "ZERO_RESULTS") {
      return {
        places: [...byId.values()],
        error: nearbyData.error_message || nearbyData.status,
      };
    }

    for (const place of (nearbyData.results || []) as NearbyPlaceRaw[]) {
      if (!byId.has(place.place_id)) {
        byId.set(place.place_id, mapPlace(place));
      }
    }

    nextToken = nearbyData.next_page_token;
    if (!nextToken) break;
  }

  return { places: [...byId.values()] };
}

export async function getNearbyPlacesWithCache(options: {
  lat: string;
  lng: string;
  radius: string;
  apiKey: string;
  maxPages: number;
  cacheTtlMs: number;
}): Promise<{ places: CachedNearbyPlace[]; error?: string }> {
  const { lat, lng, radius, apiKey, maxPages, cacheTtlMs } = options;
  const latN = Number(lat);
  const lngN = Number(lng);
  const radiusN = Number(radius);
  const pages = Math.min(3, Math.max(1, Math.floor(maxPages)));

  const key = nearbyCacheKey(latN, lngN, radiusN, pages);
  const now = Date.now();
  if (cacheTtlMs > 0) {
    const hit = getNearbyCache(key, now);
    if (hit) {
      return { places: hit };
    }
  }

  const { places, error } = await fetchNearbySearchMerged(
    lat,
    lng,
    radius,
    apiKey,
    pages,
  );

  if (cacheTtlMs > 0 && places.length > 0) {
    setNearbyCache(key, places, cacheTtlMs, now);
  }

  return { places, error };
}
