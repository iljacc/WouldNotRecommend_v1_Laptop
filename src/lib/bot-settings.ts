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

export interface CustomSpawnPoint {
  id: string;
  lat: number;
  lng: number;
  label?: string;
}

export interface BotTimingSettings {
  alignPanMs: number;
  alignHoldMs: number;
  detectMaxWaitMs: number;
  reviewAlignDuration: number;
  postTtsHoldMs: number;
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
  reviewRepeatCooldownMinutes: number;
  sessionReviewRepeatCooldownMinutes: number;
  placeRetryCooldownMinutes: number;
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
  customSpawnPoints: CustomSpawnPoint[];
  reviewSelectionMode: ReviewSelectionMode;
  linkSelectionMode: LinkSelectionMode;
}

function defaultTiming(): BotTimingSettings {
  return {
    alignPanMs: TIMING.ALIGN_PAN_MS,
    alignHoldMs: TIMING.ALIGN_HOLD_MS,
    detectMaxWaitMs: TIMING.DETECT_MAX_WAIT_MS,
    reviewAlignDuration: TIMING.REVIEW_ALIGN_DURATION,
    postTtsHoldMs: TIMING.POST_TTS_HOLD_MS,
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
    reviewRepeatCooldownMinutes: REVIEWS.REVIEW_REPEAT_COOLDOWN_MINUTES,
    sessionReviewRepeatCooldownMinutes:
      REVIEWS.SESSION_REVIEW_REPEAT_COOLDOWN_MINUTES,
    placeRetryCooldownMinutes: REVIEWS.PLACE_RETRY_COOLDOWN_MINUTES,
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

export function getBotSettings(): BotSettings {
  return createDefaultBotSettings();
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

export function wanderRegionFromBBox(
  minLat: number,
  maxLat: number,
  minLng: number,
  maxLng: number,
): WanderRegion {
  return { minLat, maxLat, minLng, maxLng };
}
