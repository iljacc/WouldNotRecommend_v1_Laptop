import destinations from "../../data/teleport-destinations.json";
import { TIMING } from "@/lib/config";
import type { LatLng } from "@/lib/types";
import { haversineDistance } from "./review-manager";

interface TeleportDestination {
  lat: number;
  lng: number;
  label: string;
}

export class TeleportManager {
  private readonly destinationsList: TeleportDestination[] = destinations;
  private visitedDestinations = new Set<number>();
  private stuckCheckCoords: LatLng | null = null;
  private stuckCheckTimestamp = 0;
  private lastReviewTimestamp = 0;
  private readonly startedTimestamp = Date.now();

  selectDestination(currentCoords: LatLng): LatLng {
    let candidates = this.destinationsList
      .map((destination, index) => ({ destination, index }))
      .filter(({ index }) => !this.visitedDestinations.has(index));

    if (candidates.length === 0) {
      this.visitedDestinations.clear();
      candidates = this.destinationsList.map((destination, index) => ({
        destination,
        index,
      }));
    }

    const farthest = candidates
      .map(({ destination, index }) => ({
        destination,
        index,
        distance: haversineDistance(currentCoords, destination),
      }))
      .sort((a, b) => b.distance - a.distance)
      .slice(0, Math.min(5, candidates.length));

    const selected = farthest[Math.floor(Math.random() * farthest.length)];
    this.visitedDestinations.add(selected.index);

    return {
      lat: selected.destination.lat,
      lng: selected.destination.lng,
    };
  }

  updateStuckCheck(currentCoords: LatLng): void {
    const now = Date.now();
    if (!this.stuckCheckCoords) {
      this.resetStuckDetection(currentCoords);
      return;
    }

    if (now - this.stuckCheckTimestamp < TIMING.STUCK_CHECK_INTERVAL) return;

    const distance = haversineDistance(this.stuckCheckCoords, currentCoords);
    if (distance >= TIMING.STUCK_DISTANCE_THRESHOLD) {
      this.stuckCheckCoords = currentCoords;
      this.stuckCheckTimestamp = now;
    }
  }

  shouldTeleport(currentCoords: LatLng): boolean {
    const now = Date.now();

    if (this.stuckCheckCoords) {
      const distance = haversineDistance(this.stuckCheckCoords, currentCoords);
      const elapsed = now - this.stuckCheckTimestamp;
      if (
        elapsed >= TIMING.STUCK_CHECK_INTERVAL &&
        distance < TIMING.STUCK_DISTANCE_THRESHOLD
      ) {
        return true;
      }
    }

    if (
      this.lastReviewTimestamp > 0 &&
      now - this.lastReviewTimestamp > TIMING.NO_REVIEW_TELEPORT_THRESHOLD
    ) {
      return true;
    }

    if (
      this.lastReviewTimestamp === 0 &&
      now - this.startedTimestamp > TIMING.NO_REVIEW_TELEPORT_THRESHOLD
    ) {
      return true;
    }

    return false;
  }

  recordReview(): void {
    this.lastReviewTimestamp = Date.now();
  }

  resetStuckDetection(coords: LatLng): void {
    this.stuckCheckCoords = coords;
    this.stuckCheckTimestamp = Date.now();
  }
}
