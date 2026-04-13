import { TIMING } from "@/lib/config";
import {
  BotState,
  stateToMode,
  type BotContext,
  type BotEvent,
  type LatLng,
} from "@/lib/types";

export type Effect =
  | { type: "START_WALKING" }
  | { type: "STOP_WALKING" }
  | { type: "PAN_TO_BUSINESS"; bearingDeg: number }
  | { type: "START_TTS"; text: string }
  | { type: "START_LINGER_ZOOM" }
  | { type: "RESET_ZOOM" }
  | { type: "PLAY_BLEEP" }
  | { type: "PLAY_BLOOP" }
  | { type: "CROSSFADE_TO_A" }
  | { type: "CROSSFADE_TO_B" }
  | { type: "DUCK_AMBIENT" }
  | { type: "UNDUCK_AMBIENT" }
  | { type: "START_TELEPORT_FADE" }
  | { type: "TAKE_SCREENSHOT" }
  | { type: "LOG_REVIEW" }
  | { type: "INCREMENT_COUNTER" };

export interface StateTransition {
  newState: BotState;
  scheduleTimer?: { event: BotEvent; delayMs: number };
  effects: Effect[];
}

export function transition(
  context: BotContext,
  event: BotEvent,
): StateTransition | null {
  switch (context.state) {
    case BotState.WANDER:
      if (event.type === "BUSINESS_DETECTED") {
        return {
          newState: BotState.DETECT,
          scheduleTimer: {
            event: { type: "DETECT_COMPLETE" },
            delayMs: TIMING.DETECT_DURATION,
          },
          effects: [
            { type: "CROSSFADE_TO_B" },
            { type: "PAN_TO_BUSINESS", bearingDeg: event.business.bearing },
          ],
        };
      }
      if (event.type === "STUCK_DETECTED" || event.type === "TELEPORT_TRIGGERED") {
        return {
          newState: BotState.TELEPORT,
          effects: [{ type: "STOP_WALKING" }, { type: "START_TELEPORT_FADE" }],
        };
      }
      return null;

    case BotState.DETECT:
      if (event.type === "DETECT_COMPLETE") {
        return {
          newState: BotState.APPROACH,
          scheduleTimer: {
            event: { type: "APPROACH_COMPLETE" },
            delayMs: TIMING.APPROACH_DURATION,
          },
          effects: [
            { type: "PLAY_BLEEP" },
            {
              type: "PAN_TO_BUSINESS",
              bearingDeg: context.targetBusiness?.bearing ?? 0,
            },
          ],
        };
      }
      return null;

    case BotState.APPROACH:
      if (event.type === "APPROACH_COMPLETE") {
        return {
          newState: BotState.INSPECT,
          scheduleTimer: {
            event: { type: "INSPECT_COMPLETE" },
            delayMs: TIMING.INSPECT_PAN_DURATION + TIMING.INSPECT_HOLD_DURATION,
          },
          effects: [
            { type: "STOP_WALKING" },
            {
              type: "PAN_TO_BUSINESS",
              bearingDeg: context.targetBusiness?.bearing ?? 0,
            },
            { type: "TAKE_SCREENSHOT" },
          ],
        };
      }
      return null;

    case BotState.INSPECT:
      if (event.type === "INSPECT_COMPLETE") {
        const text = context.reviewToRead?.text;
        if (!text) {
          return {
            newState: BotState.DEPART,
            scheduleTimer: {
              event: { type: "DEPART_COMPLETE" },
              delayMs: TIMING.DEPART_DURATION,
            },
            effects: [
              { type: "PLAY_BLOOP" },
              { type: "CROSSFADE_TO_A" },
              { type: "RESET_ZOOM" },
              { type: "START_WALKING" },
            ],
          };
        }

        return {
          newState: BotState.DELIVER,
          effects: [{ type: "DUCK_AMBIENT" }, { type: "START_TTS", text }],
        };
      }
      return null;

    case BotState.DELIVER:
      if (event.type === "DELIVER_COMPLETE") {
        return {
          newState: BotState.LINGER,
          scheduleTimer: {
            event: { type: "LINGER_COMPLETE" },
            delayMs: TIMING.LINGER_DURATION,
          },
          effects: [
            { type: "UNDUCK_AMBIENT" },
            { type: "START_LINGER_ZOOM" },
            { type: "LOG_REVIEW" },
            { type: "INCREMENT_COUNTER" },
          ],
        };
      }
      return null;

    case BotState.LINGER:
      if (event.type === "LINGER_COMPLETE") {
        return {
          newState: BotState.DEPART,
          scheduleTimer: {
            event: { type: "DEPART_COMPLETE" },
            delayMs: TIMING.DEPART_DURATION,
          },
          effects: [
            { type: "PLAY_BLOOP" },
            { type: "CROSSFADE_TO_A" },
            { type: "RESET_ZOOM" },
            { type: "START_WALKING" },
          ],
        };
      }
      return null;

    case BotState.DEPART:
      if (event.type === "DEPART_COMPLETE") {
        return { newState: BotState.WANDER, effects: [] };
      }
      return null;

    case BotState.TELEPORT:
      if (event.type === "TELEPORT_COMPLETE") {
        return {
          newState: BotState.WANDER,
          effects: [{ type: "CROSSFADE_TO_A" }, { type: "START_WALKING" }],
        };
      }
      return null;

    default:
      return null;
  }
}

export function isInCooldown(context: BotContext): boolean {
  if (context.lastReviewTime === 0) return false;
  return Date.now() - context.lastReviewTime < TIMING.REVIEW_COOLDOWN;
}

export function createInitialContext(startCoords: LatLng): BotContext {
  return {
    state: BotState.WANDER,
    mode: stateToMode(BotState.WANDER),
    teleportPhase: "none",
    currentCoords: startCoords,
    currentCity: "Unknown",
    targetBusiness: null,
    reviewToRead: null,
    sessionReviewCount: 0,
    sessionStartTime: Date.now(),
    lastReviewTime: 0,
    lastQueryCoords: null,
    readReviewHashes: new Set<string>(),
    stuckCheckTimestamp: Date.now(),
    stuckCheckCoords: startCoords,
  };
}
