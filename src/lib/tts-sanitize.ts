export function sanitizePiperText(text: string): {
  text: string;
  removedControlChars: number;
  removedSurrogateChars: number;
  removedFormatChars: number;
  removedNonAsciiChars: number;
  replacedPunctuationChars: number;
} {
  let removedControlChars = 0;
  let removedSurrogateChars = 0;
  let removedFormatChars = 0;
  let removedNonAsciiChars = 0;
  let replacedPunctuationChars = 0;

  const replacePunctuation = (replacement: string) => {
    replacedPunctuationChars += 1;
    return replacement;
  };

  const repairedMojibake = text
    .replaceAll("\u00E2\u20AC\u0153", "\"")
    .replaceAll("\u00E2\u20AC\u009D", "\"")
    .replaceAll("\u00E2\u20AC\u009C", "\"")
    .replaceAll("\u00E2\u20AC\u02DC", "'")
    .replaceAll("\u00E2\u20AC\u2122", "'")
    .replaceAll("\u00E2\u20AC\u0098", "'")
    .replaceAll("\u00E2\u20AC\u201D", "-")
    .replaceAll("\u00E2\u20AC\u201C", "-")
    .replaceAll("\u00E2\u20AC\u00A6", "...");

  const normalized = repairedMojibake.normalize("NFKC");

  const withAsciiPunctuation = normalized
    .replace(/[\u201C\u201D\u201E\u201F]/g, () => replacePunctuation("\""))
    .replace(/[\u2018\u2019\u201A\u201B]/g, () => replacePunctuation("'"))
    .replace(/[\u2010-\u2015\u2212]/g, () => replacePunctuation("-"))
    .replace(/\u2026/g, () => replacePunctuation("..."))
    .replace(/\u3001/g, () => replacePunctuation(", "))
    .replace(/\u20AC/g, () => replacePunctuation(" euro "));

  const withoutSurrogates = withAsciiPunctuation.replace(/[\uD800-\uDFFF]/g, () => {
    removedSurrogateChars += 1;
    return " ";
  });

  const withoutFormatChars = withoutSurrogates.replace(/[\u200B-\u200F\u2060\uFE00-\uFE0F]/g, () => {
    removedFormatChars += 1;
    return " ";
  });

  const withoutUnsafeControls = withoutFormatChars.replace(
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g,
    () => {
      removedControlChars += 1;
      return " ";
    },
  );

  const asciiFolded = withoutUnsafeControls.normalize("NFKD").replace(/[\u0300-\u036F]/g, "");
  const asciiOnly = asciiFolded.replace(/[^\x20-\x7E]/g, () => {
    removedNonAsciiChars += 1;
    return " ";
  });

  return {
    text: asciiOnly.replace(/\s+/g, " ").trim(),
    removedControlChars,
    removedSurrogateChars,
    removedFormatChars,
    removedNonAsciiChars,
    replacedPunctuationChars,
  };
}
