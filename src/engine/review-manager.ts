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
  source?: "local";
  rating?: number;
  totalRatings?: number;
};

type ApiReview = {
  reviewId?: string;
  text: string;
  rating: number;
  authorName: string;
  relativeTimeDescription: string;
  usedRecentFallback?: boolean;
};

async function readApiJson<T>(response: Response, label: string): Promise<T> {
  const text = await response.text();
  let data: unknown = {};

  if (text) {
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      const snippet = text.replace(/\s+/g, " ").slice(0, 160);
      throw new Error(
        `${label} returned non-JSON (${response.status}): ${snippet}`,
      );
    }
  }

  if (!response.ok) {
    const error =
      data &&
      typeof data === "object" &&
      "error" in data &&
      typeof data.error === "string"
        ? data.error
        : response.statusText || "Request failed";
    throw new Error(`${label} failed (${response.status}): ${error}`);
  }

  return data as T;
}

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
  options?: {
    ignoreReadCooldown?: boolean;
  },
): Review[] {
  const { reviews: revCfg } = getBotSettings();
  const cooldownMs = revCfg.reviewRepeatCooldownMinutes * 60 * 1000;
  const now = Date.now();
  if (!options?.ignoreReadCooldown) {
    pruneStaleReviewReads(readAt, cooldownMs, now);
  }

  return reviews.filter((review) => {
    if (review.rating !== revCfg.targetRating) return false;
    if (review.text.length < revCfg.minLength) return false;
    if (review.text.length > revCfg.maxLength) return false;

    const lastRead = readAt.get(review.hash);
    if (
      !options?.ignoreReadCooldown &&
      lastRead !== undefined &&
      now - lastRead < cooldownMs
    ) {
      return false;
    }

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

/** Sort POIs for 1-star hunt: closest first, then lower imported rating, then more total ratings. */
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
  private readonly sessionReadReviewAtByHash = new Map<string, number>();
  /** placeId → epoch ms when marked exhausted (no passing review). */
  private exhaustedPlaceAt = new Map<string, number>();
  private lastQueryCoords: LatLng | null = null;
  private lastQueryTime = 0;

  constructor(private readonly readAtByHash: Map<string, number>) {}

  /** Clear place/query caches (e.g. after soft-reset). Does not clear review read timestamps. */
  clearSessionCaches(): void {
    this.exhaustedPlaceAt.clear();
    this.cachedBusinesses = [];
    this.placeIdsSeen.clear();
    this.lastQueryCoords = null;
    this.lastQueryTime = 0;
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

  private isReviewInSessionCooldown(
    hash: string,
    now: number,
    cooldownMs: number,
  ): boolean {
    const selectedAt = this.sessionReadReviewAtByHash.get(hash);
    return selectedAt !== undefined && now - selectedAt < cooldownMs;
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
   * Nearest local corpus places at this anchor. Resets the local candidate list.
   */
  async fetchNearbyBusinesses(
    currentCoords: LatLng,
    options?: { bearingFromCoords?: LatLng },
  ): Promise<DetectedBusiness[]> {
    const { wanderRegion, places } = getBotSettings();
    const bearingFromCoords = options?.bearingFromCoords ?? currentCoords;
    this.lastQueryCoords = { ...currentCoords };
    this.lastQueryTime = Date.now();

    this.cachedBusinesses = [];
    this.placeIdsSeen.clear();

    try {
      const params = new URLSearchParams({
        lat: String(currentCoords.lat),
        lng: String(currentCoords.lng),
        radius: String(places.searchRadius),
        targetRating: String(getBotSettings().reviews.targetRating),
      });
      const response = await fetch(`/api/places?${params.toString()}`);
      const data = await readApiJson<{
        places?: ApiPlace[];
        nextPageToken?: string | null;
      }>(response, "Nearby places");

      const raw = data.places || [];
      this.mergePlacesFromNearbyResponse(raw, bearingFromCoords, wanderRegion);

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
        source: place.source,
        bearing: bearing(currentCoords, place.location),
        distance: haversineDistance(currentCoords, place.location),
        rating: place.rating,
        totalRatings: place.totalRatings,
      });
    }
  }

  /**
   * Non-exhausted POIs in detection radius, sorted for 1★ discovery.
   */
  findSortedCandidateBusinesses(
    currentCoords: LatLng,
    options?: {
      allowOutOfRegionFallback?: boolean;
      bearingFromCoords?: LatLng;
    },
  ): DetectedBusiness[] {
    const { wanderRegion, places } = getBotSettings();
    const now = Date.now();
    this.pruneStaleExhausted(now);

    if (
      !options?.allowOutOfRegionFallback &&
      !isLatLngInWanderRegion(currentCoords, wanderRegion)
    ) {
      return [];
    }
    const bearingFromCoords = options?.bearingFromCoords ?? currentCoords;

    return this.cachedBusinesses
      .filter((business) => !this.isPlaceExhausted(business.placeId, now))
      .map((business) => ({
        ...business,
        bearing: bearing(bearingFromCoords, business.location),
        distance: haversineDistance(bearingFromCoords, business.location),
      }))
      .filter(
        (business) =>
          business.source === "local" ||
          business.distance <= places.detectionRadius,
      )
      .sort(compareCandidates);
  }

  findNearestBusiness(
    currentCoords: LatLng,
    options?: {
      allowOutOfRegionFallback?: boolean;
      bearingFromCoords?: LatLng;
    },
  ): DetectedBusiness | null {
    const sorted = this.findSortedCandidateBusinesses(currentCoords, options);
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
        body: JSON.stringify({
          placeId,
          targetRating: getBotSettings().reviews.targetRating,
          minLength: getBotSettings().reviews.minLength,
          maxLength: getBotSettings().reviews.maxLength,
          cooldownMinutes: getBotSettings().reviews.reviewRepeatCooldownMinutes,
        }),
      });
      const data = await readApiJson<{
        reviews?: ApiReview[];
        types?: string[];
        source?: string;
      }>(response, "Place reviews");

      const reviews = (data.reviews || []).map((review) => ({
        ...review,
        hash: hashReview(review.text),
      }));
      const allowHistoricalFallback = reviews.some(
        (review) => review.usedRecentFallback,
      );
      const sessionCooldownMs =
        getBotSettings().reviews.sessionReviewRepeatCooldownMinutes * 60 * 1000;
      pruneStaleReviewReads(
        this.sessionReadReviewAtByHash,
        sessionCooldownMs,
        now,
      );
      const sessionFreshReviews = reviews.filter(
        (review) =>
          !this.isReviewInSessionCooldown(
            review.hash,
            now,
            sessionCooldownMs,
          ),
      );
      const filtered = filterReviews(sessionFreshReviews, this.readAtByHash, {
        ignoreReadCooldown: allowHistoricalFallback,
      });
      const mode = getBotSettings().reviewSelectionMode;
      const selected = selectReview(filtered, mode);

      if (selected) {
        this.sessionReadReviewAtByHash.set(selected.hash, now);
        this.readAtByHash.set(selected.hash, now);
        if (data.source === "local") {
          const sourceReview = reviews.find((review) => review.hash === selected.hash);
          void fetch("/api/places", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "markRead",
              placeId,
              reviewId: sourceReview?.reviewId,
              reviewText: selected.text,
            }),
          });
        }
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
