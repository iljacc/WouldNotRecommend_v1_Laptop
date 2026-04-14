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
  private stuckCheckCoords: LatLng | null = null;
  private stuckCheckTimestamp = 0;

  /** Random commercial spawn in Den Haag (Street View resolves nearest pano). */
  getRandomSpawnCoords(): LatLng {
    const pick =
      this.destinationsList[Math.floor(Math.random() * this.destinationsList.length)];
    return { lat: pick.lat, lng: pick.lng };
  }

  /** Pick a random destination (uniform), avoiding immediate repeats when possible. */
  selectDestination(currentCoords: LatLng): LatLng {
    let pool = [...this.destinationsList];
    if (pool.length > 1) {
      pool = pool.filter(
        (d) => haversineDistance(currentCoords, d) > 25,
      );
      if (pool.length === 0) {
        pool = [...this.destinationsList];
      }
    }
    const pick = pool[Math.floor(Math.random() * pool.length)];
    return { lat: pick.lat, lng: pick.lng };
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

    return false;
  }

  resetStuckDetection(coords: LatLng): void {
    this.stuckCheckCoords = coords;
    this.stuckCheckTimestamp = Date.now();
  }
}
