import type { LatLng } from "./types";

export const TIMING = {
  /** Rotation when facing the business from the road. */
  ALIGN_PAN_MS: 3_600,
  /** Hold (ms) after align pan finishes, still facing shop, before next state. */
  ALIGN_HOLD_MS: 350,
  /** DETECT phase length: align pan + hold (must be ≥ ALIGN_PAN_MS + ALIGN_HOLD_MS). */
  REVIEW_ALIGN_DURATION: 3_950,
  /** Smooth rotation back toward the wander / road heading after a review. */
  RETURN_PAN_DURATION: 3_800,
  /** RETURN state timer — must run slightly longer than the pan animation so we never snap early. */
  RETURN_STATE_TIMER_MS: 4_050,
  WANDER_STEP_INTERVAL: 3_000,
  TELEPORT_FADE_OUT: 600,
  TELEPORT_HOLD_DIM: 0,
  TELEPORT_FADE_IN: 600,
  AUDIO_CROSSFADE: 4_000,
  STUCK_CHECK_INTERVAL: 30_000,
  STUCK_DISTANCE_THRESHOLD: 10,
  STATS_UPDATE_INTERVAL: 30_000,
} as const;

/** After typewriter completes: linger, then CSS fade in `TtsSubtitles`; bot clears after both (keep in sync). */
export const SUBTITLE_TIMING = {
  LINGER_AFTER_COMPLETE_MS: 12_000,
  FADE_OUT_MS: 1_200,
} as const;

/** Den Haag retail / city-centre crawl bounds (commercial shopping areas). */
export const HAGUE_REGION = {
  minLat: 52.065,
  maxLat: 52.082,
  minLng: 4.295,
  maxLng: 4.33,
} as const;

export function isLatLngInHagueRegion(coords: LatLng): boolean {
  return (
    coords.lat >= HAGUE_REGION.minLat &&
    coords.lat <= HAGUE_REGION.maxLat &&
    coords.lng >= HAGUE_REGION.minLng &&
    coords.lng <= HAGUE_REGION.maxLng
  );
}

export const PLACES = {
  QUERY_DISTANCE_THRESHOLD: 75,
  QUERY_MIN_INTERVAL: 30_000,
  SEARCH_RADIUS: 200,
  DETECTION_RADIUS: 150,
  /** Must take this many successful wander steps after a review before another detect. */
  MIN_STEPS_BETWEEN_REVIEWS: 3,
} as const;

export const REVIEWS = {
  MIN_LENGTH: 20,
  MAX_LENGTH: 500,
  TARGET_RATING: 1,
} as const;

export const STREET_VIEW = {
  WANDER_HEADING_WOBBLE: 15,
  FOV: 90,
  PITCH: 0,
  /** After each wander step, blend POV to the link heading (reduces snap). */
  STEP_HEADING_BLEND_MS: 520,
  /**
   * While walking, add a gentle camera sway around the travel heading (POV only).
   * Set `false` to revert to a locked-forward view.
   */
  WANDER_LOOK_FLOAT_ENABLED: true,
  /** Max yaw sway (deg) — stays “mostly forward” along the path. */
  WANDER_LOOK_SWAY_DEG: 9,
  /** Subtle pitch sway (deg) for a bit of float. */
  WANDER_LOOK_PITCH_SWAY_DEG: 1.5,
  /** Base angular “speed” of the sway (scales `sin` time). */
  WANDER_LOOK_DRIFT: 0.38,
} as const;

export const VISUAL = {
  COLOR_GRADING: {
    WANDER: { brightness: 0.98, saturate: 0.95, hueRotate: -2 },
    DETECT: { brightness: 1, saturate: 1, hueRotate: 0 },
    DELIVER: { brightness: 0.97, saturate: 0.93, hueRotate: 0 },
    RETURN: { brightness: 0.98, saturate: 0.95, hueRotate: -1 },
    TELEPORT: { brightness: 1, saturate: 1, hueRotate: 0 },
  },
  COLOR_TRANSITION: 3_000,
} as const;

export const AUDIO = {
  MASTER_VOLUME: 0.7,
  AMBIENT_SEARCHING_VOLUME: 0.3,
  AMBIENT_PROCESSING_VOLUME: 0.25,
  AMBIENT_DELIVER_VOLUME: 0.08,
  SFX_VOLUME: 0.4,
} as const;

export const PULSING_DOT = {
  /** Base box for search / text / dot glyphs (3× prior 10px). */
  SIZE: 30,
  SEARCHING_CYCLE: 2_000,
  PROCESSING_CYCLE: 1_000,
} as const;

/** Centroid of Den Haag commercial spawns (see `data/teleport-destinations.json`). */
export const DEFAULT_START: LatLng = {
  lat: 52.075,
  lng: 4.312,
};

/** Bot page-only toggles (build-time `NEXT_PUBLIC_*`). */
export const BOT_PAGE = {
  /**
   * Three.js CCTV-style overlay on Street View. Off by default — set
   * `NEXT_PUBLIC_BOT_CCTV_OVERLAY=true` in `.env.local` to try it.
   */
  CCTV_OVERLAY_ENABLED: process.env.NEXT_PUBLIC_BOT_CCTV_OVERLAY === "true",
  /** Final blend strength of the overlay layer (multiplies the WebGL composite). */
  CCTV_OVERLAY_LAYER_OPACITY: 0.1,
} as const;
