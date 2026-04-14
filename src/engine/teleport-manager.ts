import destinations from "../../data/teleport-destinations.json";
import { getBotSettings, isLatLngInWanderRegion } from "@/lib/bot-settings";
import type { LatLng } from "@/lib/types";
import { haversineDistance } from "./review-manager";

interface TeleportDestination {
  lat: number;
  lng: number;
  label: string;
}

export class TeleportManager {
  private readonly destinationsList: TeleportDestination[] = destinations;
  private stuckCheckCoords: LatLng | null = null;
  private stuckCheckTimestamp = 0;

  private filteredDestinations(): TeleportDestination[] {
    const region = getBotSettings().wanderRegion;
    return this.destinationsList.filter((d) =>
      isLatLngInWanderRegion({ lat: d.lat, lng: d.lng }, region),
    );
  }

  private destinationPool(): TeleportDestination[] {
    const filtered = this.filteredDestinations();
    return filtered.length > 0 ? filtered : this.destinationsList;
  }

  /** Random commercial spawn in wander region (Street View resolves nearest pano). */
  getRandomSpawnCoords(): LatLng {
    const pool = this.destinationPool();
    const pick = pool[Math.floor(Math.random() * pool.length)];
    return { lat: pick.lat, lng: pick.lng };
  }

  /** Pick a random destination, avoiding immediate repeats when possible. */
  selectDestination(currentCoords: LatLng): LatLng {
    let pool = [...this.destinationPool()];
    if (pool.length > 1) {
      pool = pool.filter(
        (d) => haversineDistance(currentCoords, d) > 25,
      );
      if (pool.length === 0) {
        pool = [...this.destinationPool()];
      }
    }
    const pick = pool[Math.floor(Math.random() * pool.length)];
    return { lat: pick.lat, lng: pick.lng };
  }

  updateStuckCheck(currentCoords: LatLng): void {
    const timing = getBotSettings().timing;
    const now = Date.now();
    if (!this.stuckCheckCoords) {
      this.resetStuckDetection(currentCoords);
      return;
    }

    if (now - this.stuckCheckTimestamp < timing.stuckCheckInterval) return;

    const distance = haversineDistance(this.stuckCheckCoords, currentCoords);
    if (distance >= timing.stuckDistanceThreshold) {
      this.stuckCheckCoords = currentCoords;
      this.stuckCheckTimestamp = now;
    }
  }

  shouldTeleport(currentCoords: LatLng): boolean {
    const timing = getBotSettings().timing;
    const now = Date.now();

    if (this.stuckCheckCoords) {
      const distance = haversineDistance(this.stuckCheckCoords, currentCoords);
      const elapsed = now - this.stuckCheckTimestamp;
      if (
        elapsed >= timing.stuckCheckInterval &&
        distance < timing.stuckDistanceThreshold
      ) {
        return true;
      }
    }

    return false;
  }

  resetStuckDetection(coords: LatLng): void {
    this.stuckCheckCoords = coords;
    this.stuckCheckTimestamp = Date.now();
  }
}
