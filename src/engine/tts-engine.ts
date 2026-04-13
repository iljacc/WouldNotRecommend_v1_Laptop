"use client";

import type { TTSEngine } from "@/lib/types";

export class WebSpeechTTS implements TTSEngine {
  private synth: SpeechSynthesis;
  private speaking = false;

  constructor() {
    this.synth = window.speechSynthesis;
  }

  speak(text: string): Promise<void> {
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

      utterance.onstart = () => {
        this.speaking = true;
      };
      utterance.onend = () => {
        this.speaking = false;
        resolve();
      };
      utterance.onerror = (event) => {
        this.speaking = false;
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
