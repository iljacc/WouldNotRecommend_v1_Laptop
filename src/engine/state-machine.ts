import { getBotSettings } from "@/lib/bot-settings";
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
  | { type: "PAN_TO_WANDER_HEADING" }
  | { type: "START_TTS"; text: string }
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
  const timing = getBotSettings().timing;
  switch (context.state) {
    case BotState.WANDER:
      if (event.type === "BUSINESS_DETECTED") {
        return {
          newState: BotState.DETECT,
          scheduleTimer: {
            event: { type: "DETECT_COMPLETE" },
            delayMs: timing.reviewAlignDuration,
          },
          effects: [
            { type: "STOP_WALKING" },
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
      if (event.type === "TELEPORT_TRIGGERED") {
        return {
          newState: BotState.TELEPORT,
          effects: [{ type: "STOP_WALKING" }, { type: "START_TELEPORT_FADE" }],
        };
      }
      if (event.type === "DETECT_COMPLETE") {
        const text = context.reviewToRead?.text;
        if (text) {
          return {
            newState: BotState.DELIVER,
            effects: [
              { type: "DUCK_AMBIENT" },
              { type: "TAKE_SCREENSHOT" },
              { type: "START_TTS", text },
            ],
          };
        }

        return {
          newState: BotState.RETURN,
          scheduleTimer: {
            event: { type: "RETURN_COMPLETE" },
            delayMs: timing.returnStateTimerMs,
          },
          effects: [{ type: "PAN_TO_WANDER_HEADING" }],
        };
      }
      return null;

    case BotState.DELIVER:
      if (event.type === "TELEPORT_TRIGGERED") {
        return {
          newState: BotState.TELEPORT,
          effects: [{ type: "STOP_WALKING" }, { type: "START_TELEPORT_FADE" }],
        };
      }
      if (event.type === "DELIVER_COMPLETE") {
        return {
          newState: BotState.RETURN,
          scheduleTimer: {
            event: { type: "RETURN_COMPLETE" },
            delayMs: timing.returnStateTimerMs,
          },
          effects: [
            { type: "UNDUCK_AMBIENT" },
            { type: "LOG_REVIEW" },
            { type: "INCREMENT_COUNTER" },
            { type: "PAN_TO_WANDER_HEADING" },
          ],
        };
      }
      return null;

    case BotState.RETURN:
      if (event.type === "TELEPORT_TRIGGERED") {
        return {
          newState: BotState.TELEPORT,
          effects: [{ type: "STOP_WALKING" }, { type: "START_TELEPORT_FADE" }],
        };
      }
      if (event.type === "RETURN_COMPLETE") {
        return {
          newState: BotState.WANDER,
          effects: [
            { type: "PLAY_BLOOP" },
            { type: "CROSSFADE_TO_A" },
            { type: "START_WALKING" },
          ],
        };
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

export function canTriggerNextReview(context: BotContext): boolean {
  return (
    context.stepsSinceLastReview >=
    getBotSettings().places.minStepsBetweenReviews
  );
}

export function createInitialContext(startCoords: LatLng): BotContext {
  const minSteps = getBotSettings().places.minStepsBetweenReviews;
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
    wanderHeadingBeforeReview: null,
    stepsSinceLastReview: minSteps,
  };
}
