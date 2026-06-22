import { describe, expect, test } from "vitest";
import fs from "node:fs";

import { PIPER_VOICE_INDEX } from "../src/lib/piper-config";

const botSource = fs.readFileSync("src/engine/bot.ts", "utf8");
const configSource = fs.readFileSync("src/lib/config.ts", "utf8");

describe("live TTS settings", () => {
  test("uses the Amy Piper voice for the main bot", () => {
    expect(PIPER_VOICE_INDEX).toBe(1);
  });

  test("keeps live TTS timing and speed in shared main settings", () => {
    expect(configSource).toContain("PRE_READ_HOLD_MS: 900");
    expect(configSource).toContain("PIPER_LENGTH_SCALE: 1");
    expect(configSource).toContain("SUBTITLE_LEAD_LAG_MS: 0");
    expect(botSource).toContain("tts.preReadHoldMs");
    expect(botSource).toContain("tts.piperLengthScale");
  });
});
