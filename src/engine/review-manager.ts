import {
  getBotSettings,
  isLatLngInWanderRegion,
  type ReviewSelectionMode,
} from "@/lib/bot-settings";
import type { DetectedBusiness, LatLng, Review } from "@/lib/types";

type ApiPlace = {
  placeId: string;
  name: string;
  location: LatLng;
  types: string[];
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

export function filterReviews(reviews: Review[], readHashes: Set<string>): Review[] {
  const { reviews: revCfg } = getBotSettings();
  return reviews.filter((review) => {
    if (review.rating !== revCfg.targetRating) return false;
    if (review.text.length < revCfg.minLength) return false;
    if (review.text.length > revCfg.maxLength) return false;
    if (readHashes.has(review.hash)) return false;

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

export class ReviewManager {
  private cachedBusinesses: DetectedBusiness[] = [];
  private exhaustedPlaceIds = new Set<string>();
  private lastQueryCoords: LatLng | null = null;
  private lastQueryTime = 0;

  constructor(private readonly readHashes: Set<string>) {}

  /** Clear place/query caches (e.g. after soft-reset). Does not clear read hashes. */
  clearSessionCaches(): void {
    this.exhaustedPlaceIds.clear();
    this.cachedBusinesses = [];
    this.lastQueryCoords = null;
    this.lastQueryTime = 0;
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

  async fetchNearbyBusinesses(currentCoords: LatLng): Promise<DetectedBusiness[]> {
    const { wanderRegion, places } = getBotSettings();
    this.lastQueryCoords = { ...currentCoords };
    this.lastQueryTime = Date.now();

    try {
      const params = new URLSearchParams({
        lat: String(currentCoords.lat),
        lng: String(currentCoords.lng),
        radius: String(places.searchRadius),
      });
      const response = await fetch(`/api/places?${params.toString()}`);
      const data = (await response.json()) as { places?: ApiPlace[] };

      this.cachedBusinesses = (data.places || [])
        .map((place) => ({
          placeId: place.placeId,
          name: place.name,
          location: place.location,
          types: place.types,
          bearing: bearing(currentCoords, place.location),
          distance: haversineDistance(currentCoords, place.location),
        }))
        .filter((b) => isLatLngInWanderRegion(b.location, wanderRegion));

      return this.cachedBusinesses;
    } catch (error) {
      console.error("Failed to fetch nearby businesses:", error);
      return this.cachedBusinesses;
    }
  }

  findNearestBusiness(currentCoords: LatLng): DetectedBusiness | null {
    const { wanderRegion, places } = getBotSettings();
    if (!isLatLngInWanderRegion(currentCoords, wanderRegion)) {
      return null;
    }
    const updated = this.cachedBusinesses
      .filter((business) => !this.exhaustedPlaceIds.has(business.placeId))
      .map((business) => ({
        ...business,
        bearing: bearing(currentCoords, business.location),
        distance: haversineDistance(currentCoords, business.location),
      }))
      .filter((business) => business.distance <= places.detectionRadius)
      .sort((a, b) => a.distance - b.distance);

    return updated[0] || null;
  }

  async fetchAndSelectReview(
    placeId: string,
  ): Promise<{ review: Review | null; businessTypes: string[] }> {
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
      const filtered = filterReviews(reviews, this.readHashes);
      const mode = getBotSettings().reviewSelectionMode;
      const selected = selectReview(filtered, mode);

      if (selected) {
        this.readHashes.add(selected.hash);
      } else {
        this.exhaustedPlaceIds.add(placeId);
      }

      return { review: selected, businessTypes: data.types || [] };
    } catch (error) {
      console.error("Failed to fetch reviews:", error);
      this.exhaustedPlaceIds.add(placeId);
      return { review: null, businessTypes: [] };
    }
  }
}
