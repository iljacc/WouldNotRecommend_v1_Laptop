import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ShuffleBag,
  decibelsToGain,
  randomBetween,
} from "../src/engine/audio-shuffle";

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

describe("runtime wiring contracts", () => {
  const root = process.cwd();

  it("routes supplied assets through the audio engine", () => {
    const engine = readFileSync(join(root, "src/engine/audio-engine.ts"), "utf8");
    expect(engine).toContain("AMBIENT_AUDIO_URLS");
    expect(engine).toContain("FOOTSTEP_AUDIO_URLS");
    expect(engine).toContain("createMediaElementSource");
    expect(engine).toContain("playFootsteps");
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
