import destinations from "../../data/teleport-destinations.json";
import { getBotSettings, isLatLngInWanderRegion } from "@/lib/bot-settings";
import {
  randomLatLngInWanderRegion,
  randomLatLngOffsetMeters,
} from "@/lib/wander-geo";
import type { LatLng } from "@/lib/types";
import { haversineDistance } from "./review-manager";

interface TeleportDestination {
  lat: number;
  lng: number;
  label: string;
}

/** When the curated city tour is active, keep recovery spawns near this anchor (not Den Haag JSON). */
export type TeleportHint = {
  cityAnchor?: LatLng;
};

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
    return filtered;
  }

  /** Random commercial spawn in wander region (Street View resolves nearest pano). */
  getRandomSpawnCoords(hint?: TeleportHint): LatLng {
    const settings = getBotSettings();
    const custom = settings.customSpawnPoints ?? [];
    if (custom.length > 0) {
      const region = settings.wanderRegion;
      const inRegion = custom.filter((p) =>
        isLatLngInWanderRegion({ lat: p.lat, lng: p.lng }, region),
      );
      const pool = inRegion.length > 0 ? inRegion : custom;
      const pick = pool[Math.floor(Math.random() * pool.length)];
      return { lat: pick.lat, lng: pick.lng };
    }
    if (hint?.cityAnchor) {
      return randomLatLngOffsetMeters(hint.cityAnchor, 45, 380);
    }
    const jsonPool = this.destinationPool();
    if (jsonPool.length > 0) {
      const pick = jsonPool[Math.floor(Math.random() * jsonPool.length)];
      return { lat: pick.lat, lng: pick.lng };
    }
    return randomLatLngInWanderRegion(settings.wanderRegion);
  }

  /** Pick a random destination, avoiding immediate repeats when possible. */
  selectDestination(currentCoords: LatLng, hint?: TeleportHint): LatLng {
    if (hint?.cityAnchor) {
      for (let attempt = 0; attempt < 14; attempt++) {
        const p = randomLatLngOffsetMeters(hint.cityAnchor, 35, 450);
        if (haversineDistance(currentCoords, p) > 22) return p;
      }
      return randomLatLngOffsetMeters(hint.cityAnchor, 90, 520);
    }

    let pool = [...this.destinationPool()];
    if (pool.length > 1) {
      pool = pool.filter(
        (d) => haversineDistance(currentCoords, d) > 25,
      );
      if (pool.length === 0) {
        pool = [...this.destinationPool()];
      }
    }
    if (pool.length > 0) {
      const pick = pool[Math.floor(Math.random() * pool.length)];
      return { lat: pick.lat, lng: pick.lng };
    }

    const region = getBotSettings().wanderRegion;
    for (let attempt = 0; attempt < 12; attempt++) {
      const p = randomLatLngInWanderRegion(region);
      if (haversineDistance(currentCoords, p) > 18) return p;
    }
    return randomLatLngOffsetMeters(currentCoords, 120, 650);
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
