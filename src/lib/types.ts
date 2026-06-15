export enum BotState {
  WANDER = "WANDER",
  DETECT = "DETECT",
  DELIVER = "DELIVER",
  RETURN = "RETURN",
  TELEPORT = "TELEPORT",
}

export type BotMode = "Searching" | "Processing";
/** Full-frame teleport: dim → near-black overlay + blur, then ease out on fade-in. */
export type TeleportPhase = "none" | "fade-out" | "warp" | "fade-in";

export function stateToMode(state: BotState): BotMode {
  switch (state) {
    case BotState.WANDER:
    case BotState.DETECT:
      return "Searching";
    default:
      return "Processing";
  }
}

export type BotEvent =
  | { type: "BUSINESS_DETECTED"; business: DetectedBusiness }
  | { type: "DETECT_COMPLETE" }
  | { type: "DELIVER_COMPLETE" }
  | { type: "RETURN_COMPLETE" }
  | { type: "TELEPORT_TRIGGERED" }
  | { type: "TELEPORT_COMPLETE" }
  | { type: "STUCK_DETECTED" };

export interface BotContext {
  state: BotState;
  mode: BotMode;
  teleportPhase: TeleportPhase;
  currentCoords: LatLng;
  currentCity: string;
  /** When city tour is active, countdown ends at this time (epoch ms). */
  cityTourSegmentEndTime: number;
  /** Next stop label from `city-tour.json` (empty if tour off or no data). */
  nextCityLabel: string;
  /** True when `NEXT_PUBLIC_CITY_TOUR` is not false and tour data exists. */
  cityTourActive: boolean;
  /**
   * True only during a **scheduled city-tour** teleport (fade-out → fade-in).
   * Recovery teleports (stuck / imagery) keep Searching/Processing in the HUD.
   */
  scheduledCityTeleportUi: boolean;
  targetBusiness: DetectedBusiness | null;
  reviewToRead: Review | null;
  sessionReviewCount: number;
  sessionStartTime: number;
  /** Legacy field kept for logging; cooldown is step-based (`stepsSinceLastReview`). */
  lastReviewTime: number;
  lastQueryCoords: LatLng | null;
  /** Review text hash → epoch ms when last read; same text may repeat after cooldown. */
  readReviewAtByHash: Map<string, number>;
  stuckCheckTimestamp: number;
  stuckCheckCoords: LatLng | null;
  /** Heading (deg) along the road before panning toward a business. */
  wanderHeadingBeforeReview: number | null;
  /** Successful Street View steps since last completed review; used for cooldown. */
  stepsSinceLastReview: number;
}

export interface LatLng {
  lat: number;
  lng: number;
}

export interface StreetViewLink {
  pano: string;
  heading: number;
  description?: string;
}

export interface DetectedBusiness {
  placeId: string;
  name: string;
  location: LatLng;
  types: string[];
  /** Local SQLite corpus candidates are nearest-neighbor; Google candidates remain radius-gated. */
  source?: "local";
  bearing: number;
  distance: number;
  /** Imported aggregate rating when available; used to prefer lower-rated POIs for 1-star hunt. */
  rating?: number;
  totalRatings?: number;
}

export interface Review {
  reviewId?: string;
  text: string;
  rating: number;
  authorName: string;
  relativeTimeDescription: string;
  hash: string;
  piperVoiceIndex?: number;
}

export interface ReviewLogEntry {
  sessionId: string;
  entryNumber: number;
  timestamp: string;
  lat: number;
  lng: number;
  city: string;
  businessName: string;
  businessType: string;
  reviewText: string;
  reviewRating: number;
  ttsDurationSeconds: number;
  screenshotFilename: string;
}

export interface SessionStats {
  totalSessions: number;
  totalRuntimeSeconds: number;
  totalDistanceKm: number;
  totalLocationsScanned: number;
  totalReviewsRead: number;
  /** Logged reviews with timestamp in [dayStart, dayEnd) when requesting /api/log with day bounds. */
  reviewsToday: number;
  totalScreenshots: number;
  countriesVisited: string[];
  totalTeleports: number;
}

export type BotMonitorEventInput = {
  sessionId?: string;
  timestamp?: string;
  tag: string;
  message: string;
  lat?: number;
  lng?: number;
  state?: string;
  statusCode?: number;
  metadata?: Record<string, unknown>;
};

export type BotMonitorEvent = Required<
  Pick<BotMonitorEventInput, "tag" | "message">
> & {
  id: number;
  sessionId: string;
  timestamp: string;
  lat: number | null;
  lng: number | null;
  state: string;
  statusCode: number | null;
  metadata: Record<string, unknown>;
};

export type BotMonitorWarning = {
  level: "info" | "warning" | "critical";
  code: string;
  message: string;
  since?: string;
};

export type BotMonitorReport = {
  sessionId: string;
  startedAt: string;
  lastEventAt: string;
  runtimeSeconds: number;
  totalEvents: number;
  countsByTag: Record<string, number>;
  statusCounts: Record<number, number>;
  reviewsRead: number;
  teleports: number;
  boundaryEvents: number;
  mapsErrors: number;
  runtimeEvents: number;
  runtimeHeartbeatGaps: number;
  runtimeHiddenEvents: number;
  runtimeBlurEvents: number;
  lastRuntime: BotMonitorEvent | null;
  lastReview: BotMonitorEvent | null;
  lastError: BotMonitorEvent | null;
  warnings: BotMonitorWarning[];
  recentEvents: BotMonitorEvent[];
};

export type AmbientLayer = "A" | "B";

export interface TtsSpeakOptions {
  /** Called with how many leading characters should be shown (typewriter / sync with speech). */
  onReveal?: (revealedCharCount: number) => void;
  /** Piper voice model index for this utterance. */
  piperVoiceIndex?: number;
  /** Piper length scale; lower is faster, higher is slower. */
  piperLengthScale?: number;
  /** Identifiers logged server-side when local synthesis fails. */
  ttsContext?: {
    placeId?: string;
    reviewId?: string;
    businessName?: string;
    source?: string;
  };
}

export interface TTSEngine {
  speak(text: string, options?: TtsSpeakOptions): Promise<void>;
  stop(): void;
  isSpeaking(): boolean;
}

/** Live subtitle line while TTS is running (or briefly after). */
export interface TtsSubtitlePayload {
  fullText: string;
  revealed: number;
}
