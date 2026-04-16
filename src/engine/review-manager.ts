import {
  getBotSettings,
  isLatLngInWanderRegion,
  type ReviewSelectionMode,
  type WanderRegion,
} from "@/lib/bot-settings";
import type { DetectedBusiness, LatLng, Review } from "@/lib/types";

type ApiPlace = {
  placeId: string;
  name: string;
  location: LatLng;
  types: string[];
  rating?: number;
  totalRatings?: number;
};

type ApiReview = {
  text: string;
  rating: number;
  authorName: string;
  relativeTimeDescription: string;
};

export function haversineDistance(a: LatLng, b: LatLng): number {
  const radius = 6_371_000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const latA = (a.lat * Math.PI) / 180;
  const latB = (b.lat * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const value =
    sinDLat * sinDLat + Math.cos(latA) * Math.cos(latB) * sinDLng * sinDLng;
  return radius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function bearing(from: LatLng, to: LatLng): number {
  const dLng = ((to.lng - from.lng) * Math.PI) / 180;
  const fromLat = (from.lat * Math.PI) / 180;
  const toLat = (to.lat * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(toLat);
  const x =
    Math.cos(fromLat) * Math.sin(toLat) -
    Math.sin(fromLat) * Math.cos(toLat) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function hashReview(text: string): string {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(index);
    hash |= 0;
  }
  return `r_${Math.abs(hash).toString(36)}`;
}

function pruneStaleReviewReads(
  readAt: Map<string, number>,
  cooldownMs: number,
  now: number,
): void {
  for (const [hash, t] of readAt) {
    if (now - t >= cooldownMs) readAt.delete(hash);
  }
}

export function filterReviews(
  reviews: Review[],
  readAt: Map<string, number>,
): Review[] {
  const { reviews: revCfg } = getBotSettings();
  const cooldownMs = revCfg.reviewRepeatCooldownMinutes * 60 * 1000;
  const now = Date.now();
  pruneStaleReviewReads(readAt, cooldownMs, now);

  return reviews.filter((review) => {
    if (review.rating !== revCfg.targetRating) return false;
    if (review.text.length < revCfg.minLength) return false;
    if (review.text.length > revCfg.maxLength) return false;

    const lastRead = readAt.get(review.hash);
    if (lastRead !== undefined && now - lastRead < cooldownMs) return false;

    const latinChars = review.text.replace(/[^a-zA-Z]/g, "").length;
    const totalChars = review.text.replace(/\s/g, "").length;
    if (totalChars > 0 && latinChars / totalChars < 0.5) return false;

    return true;
  });
}

export function selectReview(
  reviews: Review[],
  mode: ReviewSelectionMode,
): Review | null {
  if (reviews.length === 0) return null;
  switch (mode) {
    case "shortest":
      return [...reviews].sort((a, b) => a.text.length - b.text.length)[0];
    case "longest":
      return [...reviews].sort((a, b) => b.text.length - a.text.length)[0];
    case "random":
    default:
      return reviews[Math.floor(Math.random() * reviews.length)];
  }
}

/** Sort POIs for 1★ hunt: closest first, then lower Google rating, then more total ratings. */
function compareCandidates(a: DetectedBusiness, b: DetectedBusiness): number {
  if (a.distance !== b.distance) return a.distance - b.distance;
  const ra = a.rating ?? 999;
  const rb = b.rating ?? 999;
  if (ra !== rb) return ra - rb;
  return (b.totalRatings ?? 0) - (a.totalRatings ?? 0);
}

export class ReviewManager {
  private cachedBusinesses: DetectedBusiness[] = [];
  private readonly placeIdsSeen = new Set<string>();
  /** placeId → epoch ms when marked exhausted (no passing review). */
  private exhaustedPlaceAt = new Map<string, number>();
  private lastQueryCoords: LatLng | null = null;
  private lastQueryTime = 0;

  /** Lazy Nearby pagination (same anchor until `shouldQuery` resets). */
  private nearbyNextPageToken: string | null = null;
  private nearbyPagesLoaded = 0;

  constructor(private readonly readAtByHash: Map<string, number>) {}

  /** Clear place/query caches (e.g. after soft-reset). Does not clear review read timestamps. */
  clearSessionCaches(): void {
    this.exhaustedPlaceAt.clear();
    this.cachedBusinesses = [];
    this.placeIdsSeen.clear();
    this.lastQueryCoords = null;
    this.lastQueryTime = 0;
    this.nearbyNextPageToken = null;
    this.nearbyPagesLoaded = 0;
  }

  getCachedPlaceCount(): number {
    return this.cachedBusinesses.length;
  }

  private pruneStaleExhausted(now: number): void {
    const ms = getBotSettings().reviews.placeRetryCooldownMinutes * 60 * 1000;
    for (const [id, t] of this.exhaustedPlaceAt) {
      if (now - t >= ms) this.exhaustedPlaceAt.delete(id);
    }
  }

  private isPlaceExhausted(placeId: string, now: number): boolean {
    const t = this.exhaustedPlaceAt.get(placeId);
    if (t === undefined) return false;
    const ms = getBotSettings().reviews.placeRetryCooldownMinutes * 60 * 1000;
    if (now - t >= ms) {
      this.exhaustedPlaceAt.delete(placeId);
      return false;
    }
    return true;
  }

  shouldQuery(currentCoords: LatLng): boolean {
    const places = getBotSettings().places;
    const now = Date.now();
    if (now - this.lastQueryTime < places.queryMinInterval) return false;
    if (!this.lastQueryCoords) return true;
    return (
      haversineDistance(this.lastQueryCoords, currentCoords) >=
      places.queryDistanceThreshold
    );
  }

  /**
   * First Nearby page at this anchor (lazy). Resets merged list + pagination state.
   */
  async fetchNearbyBusinessesFirstPage(
    currentCoords: LatLng,
  ): Promise<DetectedBusiness[]> {
    const { wanderRegion, places } = getBotSettings();
    this.lastQueryCoords = { ...currentCoords };
    this.lastQueryTime = Date.now();

    this.cachedBusinesses = [];
    this.placeIdsSeen.clear();
    this.nearbyNextPageToken = null;
    this.nearbyPagesLoaded = 0;

    try {
      const params = new URLSearchParams({
        lat: String(currentCoords.lat),
        lng: String(currentCoords.lng),
        radius: String(places.searchRadius),
        lazy: "1",
        cacheTtlMs: String(places.nearbyCacheTtlMs),
      });
      const response = await fetch(`/api/places?${params.toString()}`);
      const data = (await response.json()) as {
        places?: ApiPlace[];
        nextPageToken?: string | null;
      };

      const raw = data.places || [];
      this.nearbyPagesLoaded = 1;
      this.nearbyNextPageToken = data.nextPageToken ?? null;

      this.mergePlacesFromNearbyResponse(raw, currentCoords, wanderRegion);

      return this.cachedBusinesses;
    } catch (error) {
      console.error("Failed to fetch nearby businesses:", error);
      return this.cachedBusinesses;
    }
  }

  private mergePlacesFromNearbyResponse(
    raw: ApiPlace[],
    currentCoords: LatLng,
    wanderRegion: WanderRegion,
  ): void {
    for (const place of raw) {
      if (!place.location || !isLatLngInWanderRegion(place.location, wanderRegion)) {
        continue;
      }
      if (this.placeIdsSeen.has(place.placeId)) continue;
      this.placeIdsSeen.add(place.placeId);

      this.cachedBusinesses.push({
        placeId: place.placeId,
        name: place.name,
        location: place.location,
        types: place.types,
        bearing: bearing(currentCoords, place.location),
        distance: haversineDistance(currentCoords, place.location),
        rating: place.rating,
        totalRatings: place.totalRatings,
      });
    }
  }

  /** More Nearby results at the same anchor (uses `next_page_token`). Returns count of new POIs. */
  async fetchNearbyNextPage(currentCoords: LatLng): Promise<number> {
    const cap = Math.min(
      3,
      Math.max(1, getBotSettings().places.nearbySearchMaxPages),
    );
    const token = this.nearbyNextPageToken;
    if (!token || this.nearbyPagesLoaded >= cap) {
      return 0;
    }

    const { wanderRegion } = getBotSettings();

    try {
      const params = new URLSearchParams({
        pageToken: token,
      });
      const response = await fetch(`/api/places?${params.toString()}`);
      const data = (await response.json()) as {
        places?: ApiPlace[];
        nextPageToken?: string | null;
      };

      const raw = data.places || [];
      const before = this.cachedBusinesses.length;
      this.mergePlacesFromNearbyResponse(raw, currentCoords, wanderRegion);
      const added = this.cachedBusinesses.length - before;

      this.nearbyPagesLoaded += 1;
      this.nearbyNextPageToken = data.nextPageToken ?? null;

      return added;
    } catch (error) {
      console.error("Failed to fetch nearby next page:", error);
      return 0;
    }
  }

  canLoadMoreNearbyPages(): boolean {
    const cap = Math.min(
      3,
      Math.max(1, getBotSettings().places.nearbySearchMaxPages),
    );
    return (
      Boolean(this.nearbyNextPageToken) && this.nearbyPagesLoaded < cap
    );
  }

  /**
   * Non-exhausted POIs in detection radius, sorted for 1★ discovery.
   */
  findSortedCandidateBusinesses(currentCoords: LatLng): DetectedBusiness[] {
    const { wanderRegion, places } = getBotSettings();
    const now = Date.now();
    this.pruneStaleExhausted(now);

    if (!isLatLngInWanderRegion(currentCoords, wanderRegion)) {
      return [];
    }

    return this.cachedBusinesses
      .filter((business) => !this.isPlaceExhausted(business.placeId, now))
      .map((business) => ({
        ...business,
        bearing: bearing(currentCoords, business.location),
        distance: haversineDistance(currentCoords, business.location),
      }))
      .filter((business) => business.distance <= places.detectionRadius)
      .sort(compareCandidates);
  }

  findNearestBusiness(currentCoords: LatLng): DetectedBusiness | null {
    const sorted = this.findSortedCandidateBusinesses(currentCoords);
    return sorted[0] ?? null;
  }

  async fetchAndSelectReview(
    placeId: string,
  ): Promise<{ review: Review | null; businessTypes: string[] }> {
    const now = Date.now();
    try {
      const response = await fetch("/api/places", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeId }),
      });
      const data = (await response.json()) as {
        reviews?: ApiReview[];
        types?: string[];
      };

      const reviews = (data.reviews || []).map((review) => ({
        ...review,
        hash: hashReview(review.text),
      }));
      const filtered = filterReviews(reviews, this.readAtByHash);
      const mode = getBotSettings().reviewSelectionMode;
      const selected = selectReview(filtered, mode);

      if (selected) {
        this.readAtByHash.set(selected.hash, Date.now());
      } else {
        this.exhaustedPlaceAt.set(placeId, now);
      }

      return { review: selected, businessTypes: data.types || [] };
    } catch (error) {
      console.error("Failed to fetch reviews:", error);
      this.exhaustedPlaceAt.set(placeId, now);
      return { review: null, businessTypes: [] };
    }
  }
}
