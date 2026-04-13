export enum BotState {
  WANDER = "WANDER",
  DETECT = "DETECT",
  APPROACH = "APPROACH",
  INSPECT = "INSPECT",
  DELIVER = "DELIVER",
  LINGER = "LINGER",
  DEPART = "DEPART",
  TELEPORT = "TELEPORT",
}

export type BotMode = "Searching" | "Processing";
export type TeleportPhase = "none" | "fade-out" | "black" | "fade-in";

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
  | { type: "APPROACH_COMPLETE" }
  | { type: "INSPECT_COMPLETE" }
  | { type: "DELIVER_COMPLETE" }
  | { type: "LINGER_COMPLETE" }
  | { type: "DEPART_COMPLETE" }
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
  lastReviewTime: number;
  lastQueryCoords: LatLng | null;
  readReviewHashes: Set<string>;
  stuckCheckTimestamp: number;
  stuckCheckCoords: LatLng | null;
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
  totalScreenshots: number;
  countriesVisited: string[];
  totalTeleports: number;
}

export type AmbientLayer = "A" | "B";

export interface TTSEngine {
  speak(text: string): Promise<void>;
  stop(): void;
  isSpeaking(): boolean;
}
