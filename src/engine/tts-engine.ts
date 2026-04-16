"use client";

import type { TtsSpeakOptions, TTSEngine } from "@/lib/types";

import type { AudioEngine } from "./audio-engine";

export class PiperTTS implements TTSEngine {
  private speaking = false;
  private revealRaf: number | null = null;
  private stopped = false;

  constructor(private readonly audio: AudioEngine) {}

  speak(text: string, options?: TtsSpeakOptions): Promise<void> {
    return this.speakInner(text.trim(), options);
  }

  private async speakInner(text: string, options?: TtsSpeakOptions): Promise<void> {
    this.stop();
    this.stopped = false;

    if (!text.length) {
      return;
    }

    this.speaking = true;

    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    if (!res.ok) {
      this.speaking = false;
      const err = await res.text();
      throw new Error(`TTS failed (${res.status}): ${err.slice(0, 200)}`);
    }

    const ab = await res.arrayBuffer();
    const buffer = await this.audio.decodeAudioData(ab);
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
