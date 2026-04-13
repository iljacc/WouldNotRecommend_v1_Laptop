import type { LatLng } from "./types";

export const TIMING = {
  REVIEW_COOLDOWN: 10_000,
  DETECT_DURATION: 3_000,
  APPROACH_DURATION: 5_000,
  INSPECT_PAN_DURATION: 3_000,
  INSPECT_HOLD_DURATION: 3_000,
  LINGER_DURATION: 3_500,
  DEPART_DURATION: 3_000,
  WANDER_STEP_INTERVAL: 2_000,
  TELEPORT_FADE_OUT: 800,
  TELEPORT_HOLD_BLACK: 500,
  TELEPORT_FADE_IN: 800,
  AUDIO_CROSSFADE: 4_000,
  STUCK_CHECK_INTERVAL: 30_000,
  STUCK_DISTANCE_THRESHOLD: 10,
  NO_REVIEW_TELEPORT_THRESHOLD: 180_000,
  STATS_UPDATE_INTERVAL: 30_000,
} as const;

export const PLACES = {
  QUERY_DISTANCE_THRESHOLD: 75,
  QUERY_MIN_INTERVAL: 30_000,
  SEARCH_RADIUS: 200,
  DETECTION_RADIUS: 150,
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
} as const;

export const VISUAL = {
  LINGER_ZOOM: 1.025,
  COLOR_GRADING: {
    WANDER: { brightness: 0.98, saturate: 0.95, hueRotate: -2 },
    DETECT: { brightness: 1, saturate: 1, hueRotate: 0 },
    APPROACH: { brightness: 1.01, saturate: 1.02, hueRotate: 1 },
    INSPECT: { brightness: 1.02, saturate: 1.03, hueRotate: 2 },
    DELIVER: { brightness: 0.97, saturate: 0.93, hueRotate: 0 },
    LINGER: { brightness: 0.97, saturate: 0.93, hueRotate: 0 },
    DEPART: { brightness: 0.98, saturate: 0.95, hueRotate: -1 },
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
  SIZE: 8,
  SEARCHING_CYCLE: 2_000,
  PROCESSING_CYCLE: 1_000,
} as const;

/** Approximate place coords (The Hague); actual view uses `DEFAULT_STREET_VIEW_START.pano`. */
export const DEFAULT_START: LatLng = {
  lat: 52.0704978,
  lng: 4.3006999,
};

/** Exact Street View pano + POV from the shared Maps link (The Hague). */
export const DEFAULT_STREET_VIEW_START = {
  pano: "Rmi1BKFZk4U-QNwQwDcFbw",
  heading: 147.6378896382737,
  pitch: 2.3475966866892577,
} as const;
