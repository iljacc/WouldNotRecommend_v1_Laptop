import { randomBetween } from "./audio-shuffle";

export type TurnPlaybackPlan = {
  offsetSec: number;
  durationSec: number;
  startRate: number;
  peakRate: number;
  endRate: number;
};

export function createTurnPlaybackPlan(
  durationMs: number,
  bufferDurationSec: number,
  random: () => number = Math.random,
): TurnPlaybackPlan {
  const durationSec = Math.max(0, durationMs) / 1_000;
  const safeBufferDuration = Math.max(0, bufferDurationSec);
  const baseRate = randomBetween(0.96, 1.04, random);

  return {
    offsetSec: safeBufferDuration * random(),
    durationSec,
    startRate: baseRate * 0.97,
    peakRate: baseRate * 1.045,
    endRate: baseRate * 0.95,
  };
}
