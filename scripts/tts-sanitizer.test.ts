import { describe, expect, test } from "vitest";

import { sanitizePiperText } from "../src/lib/tts-sanitize";

describe("sanitizePiperText", () => {
  test("removes lone surrogate characters only from Piper-bound text", () => {
    const original = "quote \udc9d stays visible elsewhere";

    const sanitized = sanitizePiperText(original);

    expect(sanitized.text).toBe("quote stays visible elsewhere");
    expect(sanitized.removedSurrogateChars).toBe(1);
  });

  test("removes emoji from Piper-bound text without mutating the original string", () => {
    const original = "awful service \u{1F621} never again";

    const sanitized = sanitizePiperText(original);

    expect(original).toBe("awful service \u{1F621} never again");
    expect(sanitized.text).toBe("awful service never again");
    expect(sanitized.removedSurrogateChars).toBe(2);
  });

  test("converts smart punctuation to ascii punctuation for Piper", () => {
    const original =
      "\u201Cgoedemorgen\u201D, then \u2018helped\u2019 me. It\u2019s rusty \u2014 old\u2026";

    const sanitized = sanitizePiperText(original);

    expect(original).toContain("\u201Cgoedemorgen\u201D");
    expect(sanitized.text).toBe("\"goedemorgen\", then 'helped' me. It's rusty - old...");
    expect(sanitized.replacedPunctuationChars).toBe(6);
  });

  test("repairs common mojibake produced by mis-decoded smart punctuation", () => {
    const original =
      "He said \u00E2\u20AC\u0153goedemorgen\u00E2\u20AC\u009D and I\u00E2\u20AC\u2122m leaving";

    const sanitized = sanitizePiperText(original);

    expect(sanitized.text).toBe("He said \"goedemorgen\" and I'm leaving");
  });

  test("removes variation selectors and zero-width emoji joiners from Piper text", () => {
    const original = "four months. \u{1F926}\u{1F3FC}\u200D\u2642\uFE0F";

    const sanitized = sanitizePiperText(original);

    expect(sanitized.text).toBe("four months.");
    expect(sanitized.removedFormatChars).toBe(2);
  });

  test("folds accented latin letters and removes leftover non-ascii symbols", () => {
    const original = "caf\u00E9 cost \u20AC3,20 \u2605 awful\u3001really";

    const sanitized = sanitizePiperText(original);

    expect(sanitized.text).toBe("cafe cost euro 3,20 awful, really");
    expect(sanitized.removedNonAsciiChars).toBe(1);
  });

  test("produces ascii-only Piper text for log-like review snippets", () => {
    const examples = [
      "Really bad cocktail bar. When I said \u201Cexcuse me?\u201D, nobody answered.",
      "The girl that \u201Chelped\u201D me wasn\u2019t friendly at all.",
      "They charged me 3,2 euros because \u201Cthey are trying to make a living\u201D.",
      "Hard contact \u3001can't explain the violence to us.",
      "Never heard anything back after four months. \u{1F926}\u{1F3FC}\u200D\u2642\uFE0F",
    ];

    for (const example of examples) {
      const sanitized = sanitizePiperText(example);

      expect(sanitized.text).toMatch(/^[\x20-\x7E]*$/);
    }
  });
});
