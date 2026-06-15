"use client";

import type { TtsSpeakOptions, TTSEngine } from "@/lib/types";

import type { AudioEngine } from "./audio-engine";

export class PiperTTS implements TTSEngine {
  private speaking = false;
  private revealRaf: number | null = null;
  private stopped = false;
  private prepared:
    | {
        key: string;
        promise: Promise<AudioBuffer>;
      }
    | null = null;

  constructor(private readonly audio: AudioEngine) {}

  speak(text: string, options?: TtsSpeakOptions): Promise<void> {
    return this.speakInner(text.trim(), options);
  }

  prepare(
    text: string,
    options?: Pick<TtsSpeakOptions, "piperVoiceIndex" | "piperLengthScale" | "ttsContext">,
  ): void {
    const normalized = text.trim();
    if (!normalized.length) return;
    const key = this.cacheKey(normalized, options);
    if (this.prepared?.key === key) return;
    const promise = this.fetchAndDecode(normalized, options);
    void promise.catch(() => {
      if (this.prepared?.key === key) {
        this.prepared = null;
      }
    });
    this.prepared = {
      key,
      promise,
    };
  }

  private async speakInner(text: string, options?: TtsSpeakOptions): Promise<void> {
    this.stop();
    this.stopped = false;

    if (!text.length) {
      return;
    }

    this.speaking = true;

    const key = this.cacheKey(text, options);
    const prepared = this.prepared?.key === key ? this.prepared.promise : null;
    let buffer: AudioBuffer;
    try {
      buffer = await (prepared ?? this.fetchAndDecode(text, options));
    } catch (error) {
      if (!prepared) {
        this.speaking = false;
        throw error;
      }

      if (this.prepared?.key === key) {
        this.prepared = null;
      }

      try {
        buffer = await this.fetchAndDecode(text, options);
      } catch (retryError) {
        this.speaking = false;
        throw retryError;
      }
    }
    if (this.prepared?.key === key) {
      this.prepared = null;
    }
    const duration = buffer.duration;
    const ctx = this.audio.getAudioContext();

    const runRevealLoop = (startAudioT: number) => {
      const tick = () => {
        if (this.stopped) return;
        if (!ctx) return;
        const elapsed = ctx.currentTime - startAudioT;
        const p = Math.min(1, duration > 0 ? elapsed / duration : 1);
        const n = Math.min(text.length, Math.floor(p * text.length));
        options?.onReveal?.(n);
        if (p < 1 && !this.stopped) {
          this.revealRaf = requestAnimationFrame(tick);
        } else {
          options?.onReveal?.(text.length);
        }
      };
      options?.onReveal?.(0);
      this.revealRaf = requestAnimationFrame(tick);
    };

    try {
      await this.audio.playTtsBuffer(buffer, (startT) => {
        runRevealLoop(startT);
      });
    } finally {
      if (this.revealRaf !== null) {
        cancelAnimationFrame(this.revealRaf);
        this.revealRaf = null;
      }
      options?.onReveal?.(text.length);
      this.speaking = false;
    }
  }

  private cacheKey(
    text: string,
    options?: Pick<TtsSpeakOptions, "piperVoiceIndex" | "piperLengthScale">,
  ): string {
    return JSON.stringify({
      text,
      engine: "piper",
      piperVoiceIndex: options?.piperVoiceIndex ?? null,
      piperLengthScale: options?.piperLengthScale ?? null,
    });
  }

  private async fetchAndDecode(
    text: string,
    options?: Pick<TtsSpeakOptions, "piperVoiceIndex" | "piperLengthScale" | "ttsContext">,
  ): Promise<AudioBuffer> {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        engine: "piper",
        piperVoiceIndex: options?.piperVoiceIndex,
        piperLengthScale: options?.piperLengthScale ?? 1,
        ttsContext: options?.ttsContext,
      }),
    });

    if (!res.ok) {
      this.speaking = false;
      const err = await readTtsError(res);
      throw new Error(`TTS failed (${res.status}): ${err.slice(0, 800)}`);
    }

    const ab = await res.arrayBuffer();
    return this.audio.decodeAudioData(ab);
  }

  stop(): void {
    this.stopped = true;
    if (this.revealRaf !== null) {
      cancelAnimationFrame(this.revealRaf);
      this.revealRaf = null;
    }
    this.audio.stopTtsPlayback();
    this.speaking = false;
  }

  isSpeaking(): boolean {
    return this.speaking;
  }
}

async function readTtsError(response: Response): Promise<string> {
  const raw = await response.text();

  try {
    const parsed = JSON.parse(raw) as { error?: unknown; detail?: unknown };
    return [parsed.error, parsed.detail]
      .filter((value): value is string => typeof value === "string" && value.length > 0)
      .join(": ");
  } catch {
    return raw;
  }
}
