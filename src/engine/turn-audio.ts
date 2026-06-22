import { randomBetween } from "./audio-shuffle";

export type TurnPlaybackPlan = {
  offsetSec: number;
  durationSec: number;
  startRate: number;
  peakRate: number;
  endRate: number;
};

export type TurnPlaybackHandle = {
  stop: () => void;
};

export function createIdempotentTurnPlaybackHandle(
  stopPlayback: () => void,
): TurnPlaybackHandle {
  let stopped = false;
  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      stopPlayback();
    },
  };
}

export async function runWithTurnPlayback(
  playback: TurnPlaybackHandle | null,
  run: () => Promise<void>,
): Promise<void> {
  try {
    await run();
  } finally {
    playback?.stop();
  }
}

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
    startRate: baseRate,
    peakRate: baseRate * 1.045,
    endRate: baseRate * 0.95,
  };
}
