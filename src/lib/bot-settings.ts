import {
  HAGUE_REGION,
  PLACES,
  REVIEWS,
  STREET_VIEW,
  TIMING,
} from "@/lib/config";
import { computeBBoxFromPath, isLatLngInPolygon } from "@/lib/wander-geo";
import type { LatLng } from "@/lib/types";

export type ReviewSelectionMode = "random" | "shortest" | "longest";
export type LinkSelectionMode = "forward_wobble" | "straight" | "random_link";

export interface WanderRegion {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  /**
   * When present with at least three vertices, containment tests use the polygon;
   * otherwise the axis-aligned bounding box is used.
   */
  polygonPath?: LatLng[];
}

/** User-defined spawn coordinates (session start / teleports when used as pool). */
export interface CustomSpawnPoint {
  id: string;
  lat: number;
  lng: number;
  label?: string;
}

/** Tunable subset of `TIMING` from config (all ms unless noted). */
export interface BotTimingSettings {
  alignPanMs: number;
  alignHoldMs: number;
  reviewAlignDuration: number;
  returnPanDuration: number;
  returnStateTimerMs: number;
  wanderStepInterval: number;
  teleportFadeOut: number;
  teleportHoldDim: number;
  teleportFadeIn: number;
  audioCrossfade: number;
  stuckCheckInterval: number;
  stuckDistanceThreshold: number;
  statsUpdateInterval: number;
}

export interface BotPlacesSettings {
  queryDistanceThreshold: number;
  queryMinInterval: number;
  searchRadius: number;
  detectionRadius: number;
  minStepsBetweenReviews: number;
}

export interface BotReviewsSettings {
  minLength: number;
  maxLength: number;
  targetRating: number;
}

export interface BotStreetViewSettings {
  wanderHeadingWobble: number;
  fov: number;
  pitch: number;
  stepHeadingBlendMs: number;
  wanderLookFloatEnabled: boolean;
  wanderLookSwayDeg: number;
  wanderLookPitchSwayDeg: number;
  wanderLookDrift: number;
}

export interface BotSettings {
  timing: BotTimingSettings;
  places: BotPlacesSettings;
  reviews: BotReviewsSettings;
  streetView: BotStreetViewSettings;
  wanderRegion: WanderRegion;
  /** When non-empty, random spawns prefer these points (still filtered by wander region when possible). */
  customSpawnPoints: CustomSpawnPoint[];
  reviewSelectionMode: ReviewSelectionMode;
  linkSelectionMode: LinkSelectionMode;
}

export const BOT_SETTINGS_STORAGE_KEY = "gsv-bot-settings";
export const BOT_SETTINGS_CHANNEL = "gsv-bot-settings";

type BotSettingsChannelMessage =
  | { type: "settings-changed" }
  | { type: "soft-reset" };

function defaultTiming(): BotTimingSettings {
  return {
    alignPanMs: TIMING.ALIGN_PAN_MS,
    alignHoldMs: TIMING.ALIGN_HOLD_MS,
    reviewAlignDuration: TIMING.REVIEW_ALIGN_DURATION,
    returnPanDuration: TIMING.RETURN_PAN_DURATION,
    returnStateTimerMs: TIMING.RETURN_STATE_TIMER_MS,
    wanderStepInterval: TIMING.WANDER_STEP_INTERVAL,
    teleportFadeOut: TIMING.TELEPORT_FADE_OUT,
    teleportHoldDim: TIMING.TELEPORT_HOLD_DIM,
    teleportFadeIn: TIMING.TELEPORT_FADE_IN,
    audioCrossfade: TIMING.AUDIO_CROSSFADE,
    stuckCheckInterval: TIMING.STUCK_CHECK_INTERVAL,
    stuckDistanceThreshold: TIMING.STUCK_DISTANCE_THRESHOLD,
    statsUpdateInterval: TIMING.STATS_UPDATE_INTERVAL,
  };
}

function defaultPlaces(): BotPlacesSettings {
  return {
    queryDistanceThreshold: PLACES.QUERY_DISTANCE_THRESHOLD,
    queryMinInterval: PLACES.QUERY_MIN_INTERVAL,
    searchRadius: PLACES.SEARCH_RADIUS,
    detectionRadius: PLACES.DETECTION_RADIUS,
    minStepsBetweenReviews: PLACES.MIN_STEPS_BETWEEN_REVIEWS,
  };
}

function defaultReviews(): BotReviewsSettings {
  return {
    minLength: REVIEWS.MIN_LENGTH,
    maxLength: REVIEWS.MAX_LENGTH,
    targetRating: REVIEWS.TARGET_RATING,
  };
}

function defaultStreetView(): BotStreetViewSettings {
  return {
    wanderHeadingWobble: STREET_VIEW.WANDER_HEADING_WOBBLE,
    fov: STREET_VIEW.FOV,
    pitch: STREET_VIEW.PITCH,
    stepHeadingBlendMs: STREET_VIEW.STEP_HEADING_BLEND_MS,
    wanderLookFloatEnabled: STREET_VIEW.WANDER_LOOK_FLOAT_ENABLED,
    wanderLookSwayDeg: STREET_VIEW.WANDER_LOOK_SWAY_DEG,
    wanderLookPitchSwayDeg: STREET_VIEW.WANDER_LOOK_PITCH_SWAY_DEG,
    wanderLookDrift: STREET_VIEW.WANDER_LOOK_DRIFT,
  };
}

function defaultWanderRegion(): WanderRegion {
  return {
    minLat: HAGUE_REGION.minLat,
    maxLat: HAGUE_REGION.maxLat,
    minLng: HAGUE_REGION.minLng,
    maxLng: HAGUE_REGION.maxLng,
  };
}

export function createDefaultBotSettings(): BotSettings {
  return {
    timing: defaultTiming(),
    places: defaultPlaces(),
    reviews: defaultReviews(),
    streetView: defaultStreetView(),
    wanderRegion: defaultWanderRegion(),
    customSpawnPoints: [],
    reviewSelectionMode: "random",
    linkSelectionMode: "forward_wobble",
  };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function mergeDeep<T extends Record<string, unknown>>(base: T, patch: unknown): T {
  if (!isPlainObject(patch)) return base;
  const out = { ...base } as T;
  for (const key of Object.keys(patch)) {
    const p = patch[key];
    const b = base[key as keyof T];
    if (isPlainObject(p) && isPlainObject(b as unknown)) {
      (out as Record<string, unknown>)[key] = mergeDeep(
        b as Record<string, unknown>,
        p,
      );
    } else if (p !== undefined) {
      (out as Record<string, unknown>)[key] = p;
    }
  }
  return out;
}

let cache: BotSettings | null = null;
const listeners = new Set<() => void>();
const softResetListeners = new Set<() => void>();
let channel: BroadcastChannel | null = null;
let storageHandler: ((e: StorageEvent) => void) | null = null;

function readStorageMerged(): BotSettings {
  if (typeof window === "undefined") return createDefaultBotSettings();
  try {
    const raw = localStorage.getItem(BOT_SETTINGS_STORAGE_KEY);
    if (!raw) return createDefaultBotSettings();
    const parsed = JSON.parse(raw) as unknown;
    return mergeDeep(
      createDefaultBotSettings() as unknown as Record<string, unknown>,
      parsed,
    ) as unknown as BotSettings;
  } catch {
    return createDefaultBotSettings();
  }
}

function ensureCache(): BotSettings {
  if (typeof window === "undefined") {
    return createDefaultBotSettings();
  }
  if (!cache) {
    cache = readStorageMerged();
  }
  return cache;
}

/** Current merged settings (defaults + localStorage on the client). */
export function getBotSettings(): BotSettings {
  return ensureCache();
}

export function reloadBotSettingsFromStorage(): void {
  cache = readStorageMerged();
  for (const fn of listeners) fn();
}

export function saveBotSettings(partial: Partial<BotSettings>): void {
  const next = mergeDeep(
    ensureCache() as unknown as Record<string, unknown>,
    partial,
  ) as unknown as BotSettings;
  cache = next;
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(BOT_SETTINGS_STORAGE_KEY, JSON.stringify(cache));
    } catch {
      /* ignore quota */
    }
    getSettingsChannel()?.postMessage({
      type: "settings-changed",
    } satisfies BotSettingsChannelMessage);
  }
}

/** Replace entire settings object (e.g. admin form submit). */
export function saveFullBotSettings(settings: BotSettings): void {
  cache = mergeDeep(
    createDefaultBotSettings() as unknown as Record<string, unknown>,
    settings as unknown as Record<string, unknown>,
  ) as unknown as BotSettings;
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(BOT_SETTINGS_STORAGE_KEY, JSON.stringify(cache));
    } catch {
      /* ignore quota */
    }
    getSettingsChannel()?.postMessage({
      type: "settings-changed",
    } satisfies BotSettingsChannelMessage);
  }
}

export function resetBotSettingsToDefaults(): void {
  cache = createDefaultBotSettings();
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem(BOT_SETTINGS_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    getSettingsChannel()?.postMessage({
      type: "settings-changed",
    } satisfies BotSettingsChannelMessage);
  }
}

function getSettingsChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  if (!channel) {
    channel = new BroadcastChannel(BOT_SETTINGS_CHANNEL);
    channel.addEventListener("message", (event: MessageEvent) => {
      const data = event.data as BotSettingsChannelMessage | undefined;
      if (!data || typeof data.type !== "string") return;
      if (data.type === "settings-changed") {
        reloadBotSettingsFromStorage();
      } else if (data.type === "soft-reset") {
        for (const fn of softResetListeners) fn();
      }
    });
  }
  return channel;
}

/** Subscribe to settings changes and soft-reset signals (BroadcastChannel + cross-tab storage). */
export function subscribeBotSettings(
  onChange: () => void,
  onSoftReset?: () => void,
): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  getSettingsChannel();

  listeners.add(onChange);
  if (onSoftReset) {
    softResetListeners.add(onSoftReset);
  }

  if (!storageHandler) {
    storageHandler = (e: StorageEvent) => {
      if (e.key === BOT_SETTINGS_STORAGE_KEY) {
        reloadBotSettingsFromStorage();
      }
    };
    window.addEventListener("storage", storageHandler);
  }

  return () => {
    listeners.delete(onChange);
    if (onSoftReset) {
      softResetListeners.delete(onSoftReset);
    }
  };
}

export function postSoftResetSignal(): void {
  if (typeof window === "undefined") return;
  getSettingsChannel()?.postMessage({
    type: "soft-reset",
  } satisfies BotSettingsChannelMessage);
}

export function isLatLngInWanderRegion(
  coords: LatLng,
  region: WanderRegion,
): boolean {
  const path = region.polygonPath;
  if (path && path.length >= 3) {
    return isLatLngInPolygon(coords, path);
  }
  return (
    coords.lat >= region.minLat &&
    coords.lat <= region.maxLat &&
    coords.lng >= region.minLng &&
    coords.lng <= region.maxLng
  );
}

/** Build bbox from polygon path and attach as `polygonPath` (duplicate closing vertex is dropped). */
export function wanderRegionFromPolygonPath(path: LatLng[]): WanderRegion {
  const ring =
    path.length >= 2 &&
    path[0].lat === path[path.length - 1].lat &&
    path[0].lng === path[path.length - 1].lng
      ? path.slice(0, -1)
      : path;
  const box = computeBBoxFromPath(ring);
  return {
    ...box,
    polygonPath: ring.map((p) => ({ lat: p.lat, lng: p.lng })),
  };
}

/** Bbox-only region (clears polygon). */
export function wanderRegionFromBBox(
  minLat: number,
  maxLat: number,
  minLng: number,
  maxLng: number,
): WanderRegion {
  return { minLat, maxLat, minLng, maxLng };
}
