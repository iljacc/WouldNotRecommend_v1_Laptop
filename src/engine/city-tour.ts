import cityTourStops from "../../data/city-tour.json";
import { CITY_TOUR } from "@/lib/config";
import { BotState, type LatLng } from "@/lib/types";

export interface CityTourSpawnPoint {
  lat: number;
  lng: number;
  label?: string;
}

export interface CityTourStop {
  label: string;
  spawnPoints: CityTourSpawnPoint[];
}

function centroid(spawns: CityTourSpawnPoint[]): LatLng {
  if (spawns.length === 0) return { lat: 0, lng: 0 };
  let lat = 0;
  let lng = 0;
  for (const p of spawns) {
    lat += p.lat;
    lng += p.lng;
  }
  const n = spawns.length;
  return { lat: lat / n, lng: lng / n };
}

function readEnvEnabled(): boolean {
  if (typeof process === "undefined" || !process.env) return false;
  return process.env.NEXT_PUBLIC_CITY_TOUR === "true";
}

/**
 * Curated multi-city rotation: fixed segment length per stop, sequential teleport to next stop.
 * When the segment expires while not wandering, the hop is deferred until `BotState.WANDER`.
 */
export class CityTourController {
  private readonly stops: CityTourStop[];
  private readonly enabled: boolean;
  private index = 0;
  private segmentStartMs = 0;
  private deferredHop = false;

  constructor() {
    this.stops = cityTourStops as CityTourStop[];
    this.enabled =
      readEnvEnabled() &&
      this.stops.length > 0 &&
      this.stops.every((s) => (s.spawnPoints?.length ?? 0) > 0);
  }

  isActive(): boolean {
    return this.enabled;
  }

  getSegmentDurationMs(): number {
    return CITY_TOUR.SEGMENT_MS;
  }

  /**
   * Centroid of the current city’s spawn pool — recovery teleports stay near this city
   * (used as `cityAnchor`, not as an exact pano position).
   */
  getCurrentStop(): LatLng {
    if (this.stops.length === 0) return { lat: 0, lng: 0 };
    const s = this.stops[this.index % this.stops.length];
    return centroid(s.spawnPoints);
  }

  /** Uniform random spawn from the current segment’s point list (session start / explicit use). */
  pickRandomSpawnForCurrentStop(): LatLng {
    const s = this.stops[this.index % this.stops.length];
    const pool = s.spawnPoints;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    return { lat: pick.lat, lng: pick.lng };
  }

  getCurrentLabel(): string {
    if (!this.enabled || this.stops.length === 0) return "";
    return this.stops[this.index % this.stops.length].label;
  }

  getNextLabel(): string {
    if (!this.stops.length) return "";
    const n = this.stops.length;
    return this.stops[(this.index + 1) % n].label;
  }

  getSegmentEndTimeMs(): number {
    return this.segmentStartMs + CITY_TOUR.SEGMENT_MS;
  }

  /** Call once when the bot session starts at the initial spawn. */
  beginSession(): void {
    if (!this.enabled) return;
    this.segmentStartMs = Date.now();
    this.deferredHop = false;
  }

  /**
   * Returns true when a scheduled city hop should fire now (caller dispatches teleport).
   * Defers while not in WANDER by setting `deferredHop`.
   */
  shouldTriggerScheduledHop(
    now: number,
    state: BotState,
    teleporting: boolean,
  ): boolean {
    if (!this.enabled || this.stops.length < 1 || teleporting) return false;

    const overdue = now >= this.segmentStartMs + CITY_TOUR.SEGMENT_MS;

    if (state !== BotState.WANDER) {
      if (overdue) this.deferredHop = true;
      return false;
    }

    if (this.deferredHop || overdue) {
      this.deferredHop = false;
      return true;
    }
    return false;
  }

  /** Destination for the upcoming scheduled hop — random spawn in the next city’s pool. */
  getScheduledHopDestination(): LatLng {
    const n = this.stops.length;
    const next = this.stops[(this.index + 1) % n];
    const pool = next.spawnPoints;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    return { lat: pick.lat, lng: pick.lng };
  }

  /** After a scheduled teleport completes — advance tour index and reset segment clock. */
  completeScheduledHop(): void {
    if (!this.enabled || this.stops.length === 0) return;
    const n = this.stops.length;
    this.index = (this.index + 1) % n;
    this.segmentStartMs = Date.now();
    this.deferredHop = false;
  }
}
