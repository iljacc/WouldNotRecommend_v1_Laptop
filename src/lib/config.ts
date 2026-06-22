import type { LatLng } from "./types";

export const TIMING = {
  /** Rotation when facing the business from the road. */
  ALIGN_PAN_MS: 2_500,
  /** Hold (ms) after align pan finishes, still facing shop, before next state. */
  ALIGN_HOLD_MS: 950,
  /** Hard cap for DETECT before review delivery starts, even if browser rendering pauses. */
  DETECT_MAX_WAIT_MS: 6_000,
  /** Legacy DETECT timer setting; the bot now advances after align pan + hold completes. */
  REVIEW_ALIGN_DURATION: 1_800,
  /** Stay still in DELIVER for two seconds after speech ends before the return pan. */
  POST_TTS_HOLD_MS: 2_000,
  /** Smooth rotation back toward the wander / road heading after a review. */
  RETURN_PAN_DURATION: 1_200,
  /** RETURN state timer — must run slightly longer than the pan animation so we never snap early. */
  RETURN_STATE_TIMER_MS: 1_400,
  /** Ms between wander steps (new pano). Three seconds keeps review discovery close to the "every 3 steps" artwork cadence. */
  WANDER_STEP_INTERVAL: 3_000,
  /** Full teleport sequence ≈ sum of three (ms); imagery_fault uses shorter fades in bot. */
  TELEPORT_FADE_OUT: 2_000,
  TELEPORT_HOLD_DIM: 1_000,
  TELEPORT_FADE_IN: 2_000,
  AUDIO_CROSSFADE: 4_000,
  STUCK_CHECK_INTERVAL: 12_000,
  STUCK_DISTANCE_THRESHOLD: 10,
  STATS_UPDATE_INTERVAL: 30_000,
} as const;

/**
 * Maps JS tile / Street View CDN: when many 429/502/503/504 responses are observed
 * (via Performance Resource Timing), the bot temporarily enforces a longer
 * wander step interval — see `MAPS_CDN.STRESS_MIN_WANDER_INTERVAL_MS`.
 */
export const MAPS_CDN = {
  /** Rolling window (ms) for counting Maps tile imagery throttling/error responses. */
  ERROR_BURST_WINDOW_MS: 10_000,
  /** Min 429/5xx responses in the window to trigger wander backoff. */
  ERROR_BURST_THRESHOLD: 5,
  /** After a burst, ignore further burst callbacks for this long (ms). */
  BURST_COOLDOWN_MS: 4_000,
  /** Minimum ms between non-burst MAPS terminal lines for individual imagery errors. */
  ERROR_ACTIVITY_MIN_INTERVAL_MS: 15_000,
  /**
   * While backoff is active, enforce at least this many ms between wander steps
   * (unless `TIMING.WANDER_STEP_INTERVAL` is already higher).
   */
  STRESS_MIN_WANDER_INTERVAL_MS: 9_000,
  /** After this long with no new burst, restore the configured wander interval. */
  STRESS_RECOVERY_QUIET_MS: 90_000,
  /** How often to sample the Street View canvas for near-black frames. */
  BLACK_FRAME_SAMPLE_INTERVAL_MS: 2_500,
  /** 0-255 average brightness below which the sampled canvas is treated as near-black. */
  BLACK_FRAME_BRIGHTNESS_THRESHOLD: 8,
  /** Minimum ms between repeated black-frame activity lines. */
  BLACK_FRAME_ACTIVITY_MIN_INTERVAL_MS: 10_000,
} as const;

/** After typewriter completes: linger, then CSS fade in `TtsSubtitles`; bot clears after both (keep in sync). */
export const SUBTITLE_TIMING = {
  LINGER_AFTER_COMPLETE_MS: 3_500,
  FADE_OUT_MS: 1_200,
} as const;

/** Den Haag crawl bounds: ~700 m around 52.078102, 4.314051. */
export const HAGUE_REGION = {
  minLat: 52.071814,
  maxLat: 52.08439,
  minLng: 4.303831,
  maxLng: 4.324271,
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
  QUERY_MIN_INTERVAL: 9_000,
  SEARCH_RADIUS: 700,
  DETECTION_RADIUS: 700,
  /** Must take this many successful wander steps after a review before another detect. */
  MIN_STEPS_BETWEEN_REVIEWS: 3,
  /** Start using an in-region review anchor after this many consecutive outside-region steps. */
  OUT_OF_REGION_STEPS_BEFORE_FALLBACK_REVIEW: 1,
  /** Trigger a normal recovery teleport after this many consecutive outside-region steps. */
  OUT_OF_REGION_STEPS_BEFORE_TELEPORT: 2,
  /** Local SQLite mode: nearest corpus places returned per position, without a hard radius cutoff. */
  LOCAL_CORPUS_NEAREST_PLACE_LIMIT: 80,
  /**
   * Per `checkForBusiness` tick: try up to this many local corpus candidates
   * before waiting for the next interval.
   */
  MAX_PLACE_DETAILS_ATTEMPTS_PER_CHECK: 12,
} as const;

export const REVIEWS = {
  MIN_LENGTH: 20,
  MAX_LENGTH: 500,
  TARGET_RATING: 1,
  /** Same review text may be read again after this many minutes. */
  REVIEW_REPEAT_COOLDOWN_MINUTES: 180,
  /** Same review text may repeat within the current bot tab after this many minutes. */
  SESSION_REVIEW_REPEAT_COOLDOWN_MINUTES: 30,
  /** Retry a place that had no currently passing review after this many minutes. */
  PLACE_RETRY_COOLDOWN_MINUTES: 5,
} as const;

export const STREET_VIEW = {
  WANDER_HEADING_WOBBLE: 15,
  FOV: 90,
  PITCH: 0,
  /** After each wander step, blend POV to the link heading (reduces snap). */
  STEP_HEADING_BLEND_MS: 520,
  /**
   * While walking, add a strong visual wobble to the Street View layer.
   * CSS-only: real per-frame `setPov` is avoided to reduce Google imagery/CDN churn.
   */
  WANDER_LOOK_FLOAT_ENABLED: true,
  /** Horizontal CSS transform intensity; converted to pixels and capped by VisualEffects. */
  WANDER_LOOK_SWAY_DEG: 12.1,
  /** Vertical CSS transform intensity; converted to pixels and capped by VisualEffects. */
  WANDER_LOOK_PITCH_SWAY_DEG: 1.8,
  /** CSS animation drift rate; 1.25 produces the tuned eight-second cycle. */
  WANDER_LOOK_DRIFT: 1.25,
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

/** Levels are +25% vs earlier defaults; TTS is routed through Web Audio into the same master as ambient/SFX. */
export const AUDIO = {
  MASTER_VOLUME: 0.875,
  AMBIENT_SEARCHING_VOLUME: 0.375,
  AMBIENT_PROCESSING_VOLUME: 0.3125,
  AMBIENT_DELIVER_VOLUME: 0.1,
  SFX_VOLUME: 0.5,
  /** Gain for Piper (and other buffered speech) before the master. */
  TTS_VOLUME: 0.2,
} as const;

export const PULSING_DOT = {
  /** Base box for search / text / dot glyphs (3× prior 10px). */
  SIZE: 30,
  SEARCHING_CYCLE: 2_000,
  PROCESSING_CYCLE: 1_000,
} as const;

/** Placeholder coords until `Bot.start()` sets the real spawn (not city-specific). */
export const DEFAULT_START: LatLng = {
  lat: 52.078102,
  lng: 4.314051,
};

/** Bot page-only toggles (build-time `NEXT_PUBLIC_*`). */
/** Curated city rotation (`data/city-tour.json`). Set `NEXT_PUBLIC_CITY_TOUR=true` to enable. */
export const CITY_TOUR = {
  SEGMENT_MS: 600_000,
} as const;

export const BOT_PAGE = {
  /**
   * Three.js CCTV-style overlay on Street View. Off by default — set
   * `NEXT_PUBLIC_BOT_CCTV_OVERLAY=true` in `.env.local` to try it.
   */
  CCTV_OVERLAY_ENABLED: process.env.NEXT_PUBLIC_BOT_CCTV_OVERLAY === "true",
  /** Final blend strength of the overlay layer (multiplies the WebGL composite). */
  CCTV_OVERLAY_LAYER_OPACITY: 0.1,
} as const;
