"use client";

import type { TtsSpeakOptions, TTSEngine } from "@/lib/types";

export class WebSpeechTTS implements TTSEngine {
  private synth: SpeechSynthesis;
  private speaking = false;

  constructor() {
    this.synth = window.speechSynthesis;
  }

  speak(text: string, options?: TtsSpeakOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      this.stop();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      utterance.pitch = 0.8;
      utterance.volume = 1;

      const voices = this.synth.getVoices();
      const preferred = voices.find((voice) => {
        const name = voice.name.toLowerCase();
        return (
          voice.lang.startsWith("en") &&
          (name.includes("daniel") ||
            name.includes("alex") ||
            name.includes("google us english") ||
            name.includes("samantha"))
        );
      });
      const fallback = voices.find((voice) => voice.lang.startsWith("en"));
      utterance.voice = preferred || fallback || null;

      let fallbackInterval: ReturnType<typeof setInterval> | null = null;
      let boundarySeen = false;
      const clearFallback = () => {
        if (fallbackInterval !== null) {
          clearInterval(fallbackInterval);
          fallbackInterval = null;
        }
      };

      const reveal = (n: number) => {
        options?.onReveal?.(Math.min(Math.max(0, n), text.length));
      };

      const startFallbackTyping = () => {
        if (boundarySeen) return;
        const startT = Date.now();
        const charsPerSec = 13 * utterance.rate;
        fallbackInterval = setInterval(() => {
          if (boundarySeen) {
            clearFallback();
            return;
          }
          const n = Math.min(
            text.length,
            Math.floor(((Date.now() - startT) / 1000) * charsPerSec),
          );
          reveal(n);
          if (n >= text.length) clearFallback();
        }, 40);
      };

      utterance.onboundary = (event: SpeechSynthesisEvent) => {
        boundarySeen = true;
        clearFallback();
        const end = event.charIndex + (event.charLength || 0);
        reveal(end);
      };

      utterance.onstart = () => {
        this.speaking = true;
        reveal(0);
        window.setTimeout(() => {
          startFallbackTyping();
        }, 120);
      };

      utterance.onend = () => {
        clearFallback();
        this.speaking = false;
        reveal(text.length);
        resolve();
      };

      utterance.onerror = (event: SpeechSynthesisErrorEvent) => {
        clearFallback();
        this.speaking = false;
        reveal(text.length);
        if (event.error === "interrupted" || event.error === "canceled") {
          resolve();
          return;
        }
        reject(new Error(`TTS error: ${event.error}`));
      };

      this.synth.speak(utterance);
    });
  }

  stop(): void {
    if (this.synth.speaking || this.synth.pending) {
      this.synth.cancel();
    }
    this.speaking = false;
  }

  isSpeaking(): boolean {
    return this.speaking;
  }
}

export function waitForVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      resolve(voices);
      return;
    }

    window.speechSynthesis.onvoiceschanged = () => {
      resolve(window.speechSynthesis.getVoices());
    };

    window.setTimeout(() => {
      resolve(window.speechSynthesis.getVoices());
    }, 1_000);
  });
}
