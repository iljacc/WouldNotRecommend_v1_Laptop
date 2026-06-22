import path from "path";

/**
 * Piper ONNX models under `vendor/piper-voices/`.
 * Set `PIPER_VOICE_INDEX` so `/api/tts` and the live bot use that file:
 *   0 lessac · 1 amy · 2 ryan · 3 joe · 4 hfc_female · 5 norman · 6 libritts_r
 */
export const PIPER_VOICE_MODEL_FILES = [
  "en_US-lessac-medium.onnx",
  "en_US-amy-medium.onnx",
  "en_US-ryan-medium.onnx",
  "en_US-joe-medium.onnx",
  "en_US-hfc_female-medium.onnx",
  "en_US-norman-medium.onnx",
  "en_US-libritts_r-medium.onnx",
] as const;

export const PIPER_VOICE_INDEX = 2;
/** Silence inserted between Piper sentence chunks; affects playback, not inference. */
export const PIPER_SENTENCE_SILENCE_MS = 300;

export function getPiperModelPath(index: number): string {
  const file = PIPER_VOICE_MODEL_FILES[index];
  if (!file) {
    throw new Error(`No Piper model at index ${index}`);
  }
  return path.join(process.cwd(), "vendor", "piper-voices", file);
}
