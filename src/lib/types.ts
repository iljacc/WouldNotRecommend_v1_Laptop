export enum BotState {
  WANDER = "WANDER",
  DETECT = "DETECT",
  DELIVER = "DELIVER",
  RETURN = "RETURN",
  TELEPORT = "TELEPORT",
}

export type BotMode = "Searching" | "Processing";
/** No solid black frame — only brief dim during reposition. */
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
  targetBusiness: DetectedBusiness | null;
  reviewToRead: Review | null;
  sessionReviewCount: number;
  sessionStartTime: number;
  /** Legacy field kept for logging; cooldown is step-based (`stepsSinceLastReview`). */
  lastReviewTime: number;
  lastQueryCoords: LatLng | null;
  readReviewHashes: Set<string>;
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
  bearing: number;
  distance: number;
}

export interface Review {
  text: string;
  rating: number;
  authorName: string;
  relativeTimeDescription: string;
  hash: string;
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

export type AmbientLayer = "A" | "B";

export interface TtsSpeakOptions {
  /** Called with how many leading characters should be shown (typewriter / sync with speech). */
  onReveal?: (revealedCharCount: number) => void;
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
