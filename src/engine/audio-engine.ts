"use client";

import { getBotSettings } from "@/lib/bot-settings";
import { AUDIO } from "@/lib/config";
import type { AmbientLayer } from "@/lib/types";

type ToneDirection = "ascending" | "descending";

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private ttsGain: GainNode | null = null;
  private ambientAGain: GainNode | null = null;
  private ambientBGain: GainNode | null = null;
  private ambientASource: AudioBufferSourceNode | null = null;
  private ambientBSource: AudioBufferSourceNode | null = null;
  private ambientABuffer: AudioBuffer | null = null;
  private ambientBBuffer: AudioBuffer | null = null;
  private bleepBuffer: AudioBuffer | null = null;
  private bloopBuffer: AudioBuffer | null = null;
  private activeLayer: AmbientLayer = "A";
  private initialized = false;
  private ttsSource: AudioBufferSourceNode | null = null;
  private ttsPlayResolve: (() => void) | null = null;

  async init(): Promise<void> {
    if (this.initialized) return;

    const AudioContextCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;

    if (!AudioContextCtor) {
      throw new Error("Web Audio API is not available in this browser.");
    }

    this.ctx = new AudioContextCtor();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = AUDIO.MASTER_VOLUME;
    this.masterGain.connect(this.ctx.destination);

    this.ttsGain = this.ctx.createGain();
    this.ttsGain.gain.value = AUDIO.TTS_VOLUME;
    this.ttsGain.connect(this.masterGain);

    this.ambientAGain = this.ctx.createGain();
    this.ambientBGain = this.ctx.createGain();
    this.ambientAGain.gain.value = AUDIO.AMBIENT_SEARCHING_VOLUME;
    this.ambientBGain.gain.value = 0;
    this.ambientAGain.connect(this.masterGain);
    this.ambientBGain.connect(this.masterGain);

    this.ambientABuffer = this.generateAmbient(30, 120);
    this.ambientBBuffer = this.generateAmbient(30, 150);
    this.bleepBuffer = this.generateTone(660, 0.3, "ascending");
    this.bloopBuffer = this.generateTone(440, 0.3, "descending");

    this.initialized = true;
  }

  async resume(): Promise<void> {
    if (this.ctx?.state === "suspended") {
      await this.ctx.resume();
    }
  }

  getAudioContext(): AudioContext | null {
    return this.ctx;
  }

  async decodeAudioData(data: ArrayBuffer): Promise<AudioBuffer> {
    if (!this.ctx) throw new Error("AudioContext not initialized");
    const copy = data.slice(0);
    return await this.ctx.decodeAudioData(copy);
  }

  playTtsBuffer(
    buffer: AudioBuffer,
    onStarted?: (contextTime: number) => void,
  ): Promise<void> {
    this.stopTtsPlayback();
    if (!this.ctx || !this.ttsGain) return Promise.resolve();

    return new Promise((resolve) => {
      const source = this.ctx!.createBufferSource();
      source.buffer = buffer;
      source.connect(this.ttsGain!);
      this.ttsSource = source;
      this.ttsPlayResolve = resolve;
      source.onended = () => {
        if (this.ttsSource === source) {
          this.ttsSource = null;
        }
        if (this.ttsPlayResolve) {
          const r = this.ttsPlayResolve;
          this.ttsPlayResolve = null;
          r();
        }
      };
      const startT = this.ctx!.currentTime;
      source.start(0);
      onStarted?.(startT);
    });
  }

  stopTtsPlayback(): void {
    if (this.ttsSource) {
      try {
        this.ttsSource.stop();
      } catch {
        /* already stopped */
      }
      this.ttsSource = null;
    }
    if (this.ttsPlayResolve) {
      const r = this.ttsPlayResolve;
      this.ttsPlayResolve = null;
      r();
    }
  }

  startAmbient(): void {
    if (!this.ctx) return;
    if (!this.ambientASource) this.startAmbientLayer("A");
    if (!this.ambientBSource) this.startAmbientLayer("B");
  }

  crossfadeTo(layer: AmbientLayer): void {
    if (!this.ctx || !this.ambientAGain || !this.ambientBGain) return;
    if (this.activeLayer === layer) return;

    const now = this.ctx.currentTime;
    const duration = getBotSettings().timing.audioCrossfade / 1000;
    const searching = layer === "A" ? AUDIO.AMBIENT_SEARCHING_VOLUME : 0;
    const processing = layer === "B" ? AUDIO.AMBIENT_PROCESSING_VOLUME : 0;

    this.rampGain(this.ambientAGain, searching, now, duration);
    this.rampGain(this.ambientBGain, processing, now, duration);
    this.activeLayer = layer;
  }

  duckAmbient(): void {
    if (!this.ctx || !this.ambientBGain) return;
    this.rampGain(this.ambientBGain, AUDIO.AMBIENT_DELIVER_VOLUME, this.ctx.currentTime, 0.5);
  }

  unduckAmbient(): void {
    if (!this.ctx || !this.ambientBGain) return;
    this.rampGain(
      this.ambientBGain,
      AUDIO.AMBIENT_PROCESSING_VOLUME,
      this.ctx.currentTime,
      0.5,
    );
  }

  playBleep(): void {
    this.playSfx(this.bleepBuffer);
  }

  playBloop(): void {
    this.playSfx(this.bloopBuffer);
  }

  fadeToSilence(durationMs: number): void {
    if (!this.ctx || !this.masterGain) return;
    this.rampGain(this.masterGain, 0, this.ctx.currentTime, durationMs / 1000);
  }

  fadeFromSilence(durationMs: number): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(0, now);
    this.masterGain.gain.linearRampToValueAtTime(
      AUDIO.MASTER_VOLUME,
      now + durationMs / 1000,
    );
  }

  destroy(): void {
    this.stopTtsPlayback();
    this.ambientASource?.stop();
    this.ambientBSource?.stop();
    this.ctx?.close();
    this.ctx = null;
    this.initialized = false;
  }

  private startAmbientLayer(layer: AmbientLayer): void {
    if (!this.ctx) return;
    const buffer = layer === "A" ? this.ambientABuffer : this.ambientBBuffer;
    const gain = layer === "A" ? this.ambientAGain : this.ambientBGain;
    if (!buffer || !gain) return;

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(gain);
    source.start();

    if (layer === "A") this.ambientASource = source;
    if (layer === "B") this.ambientBSource = source;
  }

  private playSfx(buffer: AudioBuffer | null): void {
    if (!this.ctx || !this.masterGain || !buffer) return;

    const source = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    gain.gain.value = AUDIO.SFX_VOLUME;
    source.buffer = buffer;
    source.connect(gain);
    gain.connect(this.masterGain);
    source.start();
  }

  private rampGain(node: GainNode, target: number, now: number, duration: number): void {
    node.gain.cancelScheduledValues(now);
    node.gain.setValueAtTime(node.gain.value, now);
    node.gain.linearRampToValueAtTime(target, now + duration);
  }

  private generateTone(
    baseFreq: number,
    durationSec: number,
    direction: ToneDirection,
  ): AudioBuffer {
    if (!this.ctx) throw new Error("AudioContext not initialized");
    const sampleRate = this.ctx.sampleRate;
    const length = Math.floor(sampleRate * durationSec);
    const buffer = this.ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    const freqA = direction === "ascending" ? baseFreq : baseFreq * 1.25;
    const freqB = direction === "ascending" ? baseFreq * 1.25 : baseFreq;

    for (let index = 0; index < length; index += 1) {
      const progress = index / length;
      const t = index / sampleRate;
      const freq = freqA + (freqB - freqA) * progress;
      const envelope = Math.min(1, progress * 20) * Math.min(1, (1 - progress) * 10);
      data[index] = Math.sin(2 * Math.PI * freq * t) * envelope * 0.3;
    }

    return buffer;
  }

  private generateAmbient(durationSec: number, baseFreq: number): AudioBuffer {
    if (!this.ctx) throw new Error("AudioContext not initialized");
    const sampleRate = this.ctx.sampleRate;
    const length = Math.floor(sampleRate * durationSec);
    const buffer = this.ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    for (let index = 0; index < length; index += 1) {
      const t = index / sampleRate;
      const mod = 1 + 0.3 * Math.sin(2 * Math.PI * 0.1 * t);
      const drone =
        Math.sin(2 * Math.PI * baseFreq * t * mod) * 0.12 +
        Math.sin(2 * Math.PI * baseFreq * 1.5 * t) * 0.06 +
        Math.sin(2 * Math.PI * baseFreq * 0.5 * t) * 0.08;
      data[index] = drone + (Math.random() - 0.5) * 0.015;
    }

    return buffer;
  }
}
