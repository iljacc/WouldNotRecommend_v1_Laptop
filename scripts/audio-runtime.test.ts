import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ShuffleBag,
  decibelsToGain,
  randomBetween,
} from "../src/engine/audio-shuffle";
import {
  createIdempotentTurnPlaybackHandle,
  createTurnPlaybackPlan,
  runWithTurnPlayback,
} from "../src/engine/turn-audio";

describe("ShuffleBag", () => {
  it("emits each item once before refilling", () => {
    const bag = new ShuffleBag(["a", "b", "c"], () => 0.5);
    expect(new Set([bag.next(), bag.next(), bag.next()])).toEqual(
      new Set(["a", "b", "c"]),
    );
  });

  it("does not repeat at a bag boundary", () => {
    const bag = new ShuffleBag(["a", "b", "c"], () => 0);
    const values = Array.from({ length: 12 }, () => bag.next());
    for (let index = 1; index < values.length; index += 1) {
      expect(values[index]).not.toBe(values[index - 1]);
    }
  });

  it("returns undefined for an empty pool", () => {
    expect(new ShuffleBag([]).next()).toBeUndefined();
  });
});

describe("audio variation", () => {
  it("stays within the configured playback-rate range", () => {
    expect(randomBetween(0.975, 1.025, () => 0)).toBe(0.975);
    expect(randomBetween(0.975, 1.025, () => 0.999)).toBeLessThanOrEqual(1.025);
  });

  it("converts decibels into a linear gain", () => {
    expect(decibelsToGain(0)).toBe(1);
    expect(decibelsToGain(-6)).toBeCloseTo(0.501, 2);
  });
});

describe("turn playback variation", () => {
  it("keeps the randomized base rate within 0.96..1.04", () => {
    const minimumPlan = createTurnPlaybackPlan(3_125, 13.959, () => 0);
    const maximumPlan = createTurnPlaybackPlan(3_125, 13.959, () => 0.999);

    expect(minimumPlan.startRate).toBeGreaterThanOrEqual(0.96);
    expect(maximumPlan.startRate).toBeLessThanOrEqual(1.04);
  });

  it("keeps offset and playback rates within restrained bounds", () => {
    const values = [0.999, 0.999];
    const plan = createTurnPlaybackPlan(3_125, 13.959, () => values.shift() ?? 0);

    expect(plan.offsetSec).toBeGreaterThanOrEqual(0);
    expect(plan.offsetSec).toBeLessThan(13.959);
    expect(plan.startRate).toBeGreaterThanOrEqual(0.92);
    expect(plan.peakRate).toBeLessThanOrEqual(1.09);
    expect(plan.endRate).toBeGreaterThanOrEqual(0.9);
  });

  it("matches the requested camera-turn duration exactly", () => {
    expect(createTurnPlaybackPlan(1_500, 13.959, () => 0.5).durationSec).toBe(1.5);
    expect(createTurnPlaybackPlan(3_125, 13.959, () => 0.5).durationSec).toBe(3.125);
  });
});

describe("turn playback lifecycle", () => {
  it("stops playback as soon as an early pan resolves", async () => {
    let resolvePan!: () => void;
    let stopCount = 0;
    const pan = new Promise<void>((resolve) => {
      resolvePan = resolve;
    });
    const completion = runWithTurnPlayback(
      { stop: () => void (stopCount += 1) },
      () => pan,
    );

    expect(stopCount).toBe(0);
    resolvePan();
    await completion;
    expect(stopCount).toBe(1);
  });

  it("stops playback once when a pan rejects", async () => {
    let stopCount = 0;

    await expect(
      runWithTurnPlayback(
        { stop: () => void (stopCount += 1) },
        () => Promise.reject(new Error("pan interrupted")),
      ),
    ).rejects.toThrow("pan interrupted");
    expect(stopCount).toBe(1);
  });

  it("allows an absent playback handle for no-op audio", async () => {
    await expect(
      runWithTurnPlayback(null, () => Promise.resolve()),
    ).resolves.toBeUndefined();
  });

  it("does not stop an active source more than once", () => {
    let stopCount = 0;
    const playback = createIdempotentTurnPlaybackHandle(() => {
      stopCount += 1;
    });

    playback.stop();
    playback.stop();
    expect(stopCount).toBe(1);
  });

  it("tolerates interruption before the pan finally cleans up", async () => {
    let stopCount = 0;
    const playback = createIdempotentTurnPlaybackHandle(() => {
      stopCount += 1;
    });

    playback.stop();
    await runWithTurnPlayback(playback, () => Promise.resolve());
    expect(stopCount).toBe(1);
  });
});

describe("runtime wiring contracts", () => {
  const root = process.cwd();

  it("routes supplied assets through the audio engine", () => {
    const engine = readFileSync(join(root, "src/engine/audio-engine.ts"), "utf8");
    expect(engine).toContain("BOT_RUNNING_AUDIO_URL");
    expect(engine).toContain("TURNING_AUDIO_URL");
    expect(engine).toContain("FOOTSTEP_AUDIO_URLS");
    expect(engine).toContain("createMediaElementSource");
    expect(engine).toContain("playFootsteps");
    expect(engine).toContain("playTurn(durationMs: number)");
    expect(engine).toMatch(
      /beginTeleportAmbient\(fadeOutMs: number\): void \{\s*this\.stopActiveTurn\(\)/,
    );
    expect(engine).toMatch(
      /destroy\(\): void \{[\s\S]*?this\.stopActiveTurn\(0\)/,
    );
    expect(engine).toContain("beginTeleportAmbient");
    expect(engine).toContain("completeTeleportAmbient");
  });

  it("triggers footsteps and reports teleport outcomes from the bot", () => {
    const bot = readFileSync(join(root, "src/engine/bot.ts"), "utf8");
    expect(bot).toMatch(/onWanderStep\(\)[\s\S]*this\.audio\.playFootsteps\(\)/);
    expect(bot).toContain("this.audio.beginTeleportAmbient(fadeOut)");
    expect(bot).toContain(
      "this.audio.completeTeleportAmbient(resolvedDestination !== null, fadeIn)",
    );
  });
});
