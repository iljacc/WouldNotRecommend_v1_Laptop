import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ShuffleBag,
  decibelsToGain,
  randomBetween,
} from "../src/engine/audio-shuffle";
import { createTurnPlaybackPlan } from "../src/engine/turn-audio";

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
