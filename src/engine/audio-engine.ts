"use client";

import {
  BOT_RUNNING_AUDIO_URL,
  FOOTSTEP_AUDIO_URLS,
  TURNING_AUDIO_URL,
} from "@/lib/audio-assets";
import { getBotSettings } from "@/lib/bot-settings";
import { AUDIO } from "@/lib/config";
import type { AmbientLayer } from "@/lib/types";
import { ShuffleBag, decibelsToGain, randomBetween } from "./audio-shuffle";
import {
  createIdempotentTurnPlaybackHandle,
  createTurnPlaybackPlan,
  type TurnPlaybackHandle,
} from "./turn-audio";

type ToneDirection = "ascending" | "descending";

type RunningLoop = {
  element: HTMLAudioElement;
  gain: GainNode;
  source: MediaElementAudioSourceNode;
};

type ActiveTurnPlayback = {
  source: AudioBufferSourceNode;
  gain: GainNode;
  stopped: boolean;
};

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private ttsGain: GainNode | null = null;
  private ambientBusGain: GainNode | null = null;
  private footstepsGain: GainNode | null = null;
  private runningLoop: RunningLoop | null = null;
  private turningBuffer: AudioBuffer | null = null;
  private activeTurnPlayback: ActiveTurnPlayback | null = null;
  private bleepBuffer: AudioBuffer | null = null;
  private bloopBuffer: AudioBuffer | null = null;
  private footstepBuffers: AudioBuffer[] = [];
  private footstepBag = new ShuffleBag<AudioBuffer>([]);
  private activeBufferSources = new Set<AudioBufferSourceNode>();
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

    this.ambientBusGain = this.ctx.createGain();
    this.ambientBusGain.gain.value = AUDIO.AMBIENT_SEARCHING_VOLUME;
    this.ambientBusGain.connect(this.masterGain);

    this.footstepsGain = this.ctx.createGain();
    this.footstepsGain.gain.value = AUDIO.FOOTSTEP_VOLUME;
    this.footstepsGain.connect(this.masterGain);

    this.runningLoop = this.createRunningLoop();
    this.bleepBuffer = this.generateTone(660, 0.3, "ascending");
    this.bloopBuffer = this.generateTone(440, 0.3, "descending");
    await Promise.all([this.loadFootsteps(), this.loadTurningBuffer()]);

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
    return await this.ctx.decodeAudioData(data.slice(0));
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
        if (this.ttsSource === source) this.ttsSource = null;
        if (this.ttsPlayResolve) {
          const finish = this.ttsPlayResolve;
          this.ttsPlayResolve = null;
          finish();
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
      const finish = this.ttsPlayResolve;
      this.ttsPlayResolve = null;
      finish();
    }
  }

  startAmbient(): void {
    const loop = this.runningLoop;
    if (!this.ctx || !loop) return;
    loop.element.currentTime = 0;
    void loop.element.play().catch((error) => {
      console.warn("Bot-running loop could not start.", error);
    });
    this.rampGain(
      loop.gain,
      1,
      this.ctx.currentTime,
      AUDIO.AMBIENT_CROSSFADE_MS / 1_000,
    );
  }

  crossfadeTo(layer: AmbientLayer): void {
    if (!this.ctx || !this.ambientBusGain || this.activeLayer === layer) return;
    const target =
      layer === "A"
        ? AUDIO.AMBIENT_SEARCHING_VOLUME
        : AUDIO.AMBIENT_PROCESSING_VOLUME;
    this.rampGain(
      this.ambientBusGain,
      target,
      this.ctx.currentTime,
      getBotSettings().timing.audioCrossfade / 1_000,
    );
    this.activeLayer = layer;
  }

  duckAmbient(): void {
    if (!this.ctx || !this.ambientBusGain) return;
    this.rampGain(
      this.ambientBusGain,
      AUDIO.AMBIENT_DELIVER_VOLUME,
      this.ctx.currentTime,
      0.5,
    );
  }

  unduckAmbient(): void {
    if (!this.ctx || !this.ambientBusGain) return;
    this.rampGain(
      this.ambientBusGain,
      AUDIO.AMBIENT_PROCESSING_VOLUME,
      this.ctx.currentTime,
      0.5,
    );
  }

  playFootsteps(): void {
    if (!this.ctx || !this.footstepsGain) return;
    const buffer = this.footstepBag.next();
    if (!buffer) return;

    const source = this.ctx.createBufferSource();
    const variationGain = this.ctx.createGain();
    source.buffer = buffer;
    source.playbackRate.value = randomBetween(
      1 - AUDIO.FOOTSTEP_RATE_VARIATION,
      1 + AUDIO.FOOTSTEP_RATE_VARIATION,
    );
    variationGain.gain.value = decibelsToGain(
      randomBetween(
        -AUDIO.FOOTSTEP_GAIN_VARIATION_DB,
        AUDIO.FOOTSTEP_GAIN_VARIATION_DB,
      ),
    );
    source.connect(variationGain);
    variationGain.connect(this.footstepsGain);
    this.trackBufferSource(source, variationGain);
    source.start();
  }

  playTurn(durationMs: number): TurnPlaybackHandle | null {
    if (!this.ctx || !this.masterGain || !this.turningBuffer || durationMs <= 0) {
      return null;
    }

    this.stopActiveTurn();
    const plan = createTurnPlaybackPlan(durationMs, this.turningBuffer.duration);
    const source = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;
    const end = now + plan.durationSec;
    const attackEnd = now + Math.min(0.18, plan.durationSec * 0.2);
    const peakTime = now + Math.min(0.55, plan.durationSec * 0.4);
    const releaseStart = Math.max(attackEnd, end - Math.min(0.32, plan.durationSec * 0.25));

    source.buffer = this.turningBuffer;
    source.loop = true;
    source.loopStart = 0;
    source.loopEnd = this.turningBuffer.duration;
    source.playbackRate.setValueAtTime(plan.startRate, now);
    source.playbackRate.linearRampToValueAtTime(plan.peakRate, peakTime);
    source.playbackRate.linearRampToValueAtTime(plan.endRate, end);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(AUDIO.SFX_VOLUME, attackEnd);
    gain.gain.setValueAtTime(AUDIO.SFX_VOLUME, releaseStart);
    gain.gain.linearRampToValueAtTime(0, end);

    source.connect(gain);
    gain.connect(this.masterGain);
    const playback: ActiveTurnPlayback = { source, gain, stopped: false };
    this.activeTurnPlayback = playback;
    source.onended = () => {
      if (this.activeTurnPlayback === playback) {
        this.activeTurnPlayback = null;
      }
      source.disconnect();
      gain.disconnect();
    };
    source.start(now, plan.offsetSec);
    source.stop(end);
    return createIdempotentTurnPlaybackHandle(() =>
      this.stopTurnPlayback(playback),
    );
  }

  beginTeleportAmbient(fadeOutMs: number): void {
    this.stopActiveTurn();
    if (!this.ctx || !this.runningLoop) return;
    this.rampGain(
      this.runningLoop.gain,
      0,
      this.ctx.currentTime,
      this.ambientFadeSeconds(fadeOutMs),
    );
  }

  completeTeleportAmbient(_changed: boolean, fadeInMs: number): void {
    if (!this.ctx || !this.runningLoop) return;
    if (this.runningLoop.element.paused) {
      void this.runningLoop.element.play().catch((error) => {
        console.warn("Bot-running loop could not resume after teleport.", error);
      });
    }
    this.rampGain(
      this.runningLoop.gain,
      1,
      this.ctx.currentTime,
      this.ambientFadeSeconds(fadeInMs),
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
    this.rampGain(this.masterGain, 0, this.ctx.currentTime, durationMs / 1_000);
  }

  fadeFromSilence(durationMs: number): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(0, now);
    this.masterGain.gain.linearRampToValueAtTime(
      AUDIO.MASTER_VOLUME,
      now + durationMs / 1_000,
    );
  }

  destroy(): void {
    this.stopTtsPlayback();
    this.stopActiveTurn(0);
    if (this.runningLoop) {
      this.runningLoop.element.pause();
      this.runningLoop.element.removeAttribute("src");
      this.runningLoop.element.load();
      this.runningLoop.source.disconnect();
      this.runningLoop.gain.disconnect();
    }
    for (const source of this.activeBufferSources) {
      try {
        source.stop();
      } catch {
        /* already stopped */
      }
      source.disconnect();
    }
    this.activeBufferSources.clear();
    void this.ctx?.close();
    this.runningLoop = null;
    this.turningBuffer = null;
    this.ctx = null;
    this.initialized = false;
  }

  private createRunningLoop(): RunningLoop {
    if (!this.ctx || !this.ambientBusGain) {
      throw new Error("AudioContext not initialized");
    }
    const element = new Audio(BOT_RUNNING_AUDIO_URL);
    element.preload = "auto";
    element.loop = true;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    const source = this.ctx.createMediaElementSource(element);
    source.connect(gain);
    gain.connect(this.ambientBusGain);
    return { element, gain, source };
  }

  private async loadFootsteps(): Promise<void> {
    const results = await Promise.all(
      FOOTSTEP_AUDIO_URLS.map((url) => this.fetchAudioBuffer(url, "Footstep")),
    );
    this.footstepBuffers = results.filter(
      (buffer): buffer is AudioBuffer => buffer !== null,
    );
    this.footstepBag = new ShuffleBag(this.footstepBuffers);
  }

  private async loadTurningBuffer(): Promise<void> {
    this.turningBuffer = await this.fetchAudioBuffer(
      TURNING_AUDIO_URL,
      "Turning",
    );
  }

  private async fetchAudioBuffer(
    url: string,
    label: string,
  ): Promise<AudioBuffer | null> {
    if (!this.ctx) return null;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await this.decodeAudioData(await response.arrayBuffer());
    } catch (error) {
      console.warn(`${label} audio failed to load: ${url}`, error);
      return null;
    }
  }

  private trackBufferSource(
    source: AudioBufferSourceNode,
    gain: GainNode,
  ): void {
    this.activeBufferSources.add(source);
    source.onended = () => {
      this.activeBufferSources.delete(source);
      source.disconnect();
      gain.disconnect();
    };
  }

  private ambientFadeSeconds(requestedMs: number): number {
    return Math.max(requestedMs, AUDIO.AMBIENT_RECOVERY_FADE_MIN_MS) / 1_000;
  }

  private stopActiveTurn(fadeOutSeconds = 0.08): void {
    if (this.activeTurnPlayback) {
      this.stopTurnPlayback(this.activeTurnPlayback, fadeOutSeconds);
    }
  }

  private stopTurnPlayback(
    playback: ActiveTurnPlayback,
    fadeOutSeconds = 0.08,
  ): void {
    if (playback.stopped) return;
    playback.stopped = true;
    if (this.activeTurnPlayback === playback) {
      this.activeTurnPlayback = null;
    }

    const now = this.ctx?.currentTime ?? 0;
    const stopAt = now + Math.max(0, fadeOutSeconds);
    playback.gain.gain.cancelScheduledValues(now);
    playback.gain.gain.setValueAtTime(playback.gain.gain.value, now);
    playback.gain.gain.linearRampToValueAtTime(0, stopAt);
    try {
      playback.source.stop(stopAt);
    } catch {
      /* already stopped */
    }
  }

  private playSfx(buffer: AudioBuffer | null): void {
    if (!this.ctx || !this.masterGain || !buffer) return;
    const source = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    gain.gain.value = AUDIO.SFX_VOLUME;
    source.buffer = buffer;
    source.connect(gain);
    gain.connect(this.masterGain);
    this.trackBufferSource(source, gain);
    source.start();
  }

  private rampGain(
    node: GainNode,
    target: number,
    now: number,
    duration: number,
  ): void {
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
}
