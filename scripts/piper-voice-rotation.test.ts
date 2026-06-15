import { describe, expect, test } from "vitest";

import {
  advancePiperVoiceIndex,
  nextPiperVoiceIndex,
} from "../src/engine/piper-voice-rotation";

describe("Piper voice rotation", () => {
  test("normalizes voice indices into the available model range", () => {
    expect(nextPiperVoiceIndex(0, 7)).toBe(0);
    expect(nextPiperVoiceIndex(7, 7)).toBe(0);
    expect(nextPiperVoiceIndex(-1, 7)).toBe(6);
  });

  test("advances voice indices with wraparound", () => {
    expect(advancePiperVoiceIndex(0, 7)).toBe(1);
    expect(advancePiperVoiceIndex(6, 7)).toBe(0);
  });
});
