"use client";

import { AMBIENT_AUDIO_URLS, FOOTSTEP_AUDIO_URLS } from "@/lib/audio-assets";
import { getBotSettings } from "@/lib/bot-settings";
import { AUDIO } from "@/lib/config";
import type { AmbientLayer } from "@/lib/types";
import { ShuffleBag, decibelsToGain, randomBetween } from "./audio-shuffle";

type ToneDirection = "ascending" | "descending";
type Timer = ReturnType<typeof setTimeout>;

type AmbientDeck = {
  element: HTMLAudioElement;
  gain: GainNode;
  source: MediaElementAudioSourceNode;
  url: string | null;
};

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private ttsGain: GainNode | null = null;
  private ambientBusGain: GainNode | null = null;
  private footstepsGain: GainNode | null = null;
  private ambientDecks: AmbientDeck[] = [];
  private ambientBag = new ShuffleBag<string>(AMBIENT_AUDIO_URLS);
  private failedAmbientUrls = new Set<string>();
  private activeDeckIndex = 0;
  private ambientTransitionTimer: Timer | null = null;
  private ambientTransitionGeneration = 0;
  private ambientTransitioning = false;
  private teleportAmbientTransition = false;
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

    this.ambientDecks = [this.createAmbientDeck(0), this.createAmbientDeck(1)];
    this.bleepBuffer = this.generateTone(660, 0.3, "ascending");
    this.bloopBuffer = this.generateTone(440, 0.3, "descending");
    await this.loadFootsteps();

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
    if (!this.ctx || this.ambientDecks.length !== 2) return;
    const url = this.nextAmbientUrl();
    if (!url) {
      console.warn("No city ambience assets are available.");
      return;
    }
    void this.startInitialAmbient(url);
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
      getBotSettings().timing.audioCrossfade / 1000,
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
    this.activeBufferSources.add(source);
    source.onended = () => {
      this.activeBufferSources.delete(source);
      source.disconnect();
      variationGain.disconnect();
    };
    source.start();
  }

  beginTeleportAmbient(fadeOutMs: number): void {
    if (!this.ctx || this.ambientDecks.length !== 2) return;
    this.teleportAmbientTransition = true;
    this.cancelAmbientTransition();
    const deck = this.ambientDecks[this.activeDeckIndex];
    this.rampGain(
      deck.gain,
      0,
      this.ctx.currentTime,
      this.ambientFadeSeconds(fadeOutMs),
    );
  }

  completeTeleportAmbient(changed: boolean, fadeInMs: number): void {
    void this.finishTeleportAmbient(changed, fadeInMs);
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
    this.cancelAmbientTransition();
    this.ambientTransitionGeneration += 1;
    for (const deck of this.ambientDecks) {
      deck.element.onended = null;
      deck.element.ontimeupdate = null;
      deck.element.onerror = null;
      this.stopDeck(deck);
      deck.source.disconnect();
      deck.gain.disconnect();
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
    this.ambientDecks = [];
    this.ctx = null;
    this.initialized = false;
  }

  private createAmbientDeck(index: number): AmbientDeck {
    if (!this.ctx || !this.ambientBusGain) {
      throw new Error("AudioContext not initialized");
    }
    const element = new Audio();
    element.preload = "auto";
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    const source = this.ctx.createMediaElementSource(element);
    source.connect(gain);
    gain.connect(this.ambientBusGain);
    element.ontimeupdate = () => this.onAmbientTimeUpdate(index);
    element.onended = () => this.onAmbientEnded(index);
    return { element, gain, source, url: null };
  }

  private async loadFootsteps(): Promise<void> {
    if (!this.ctx) return;
    const results = await Promise.all(
      FOOTSTEP_AUDIO_URLS.map(async (url) => {
        try {
          const response = await fetch(url);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return await this.decodeAudioData(await response.arrayBuffer());
        } catch (error) {
          console.warn(`Footstep audio failed to load: ${url}`, error);
          return null;
        }
      }),
    );
    this.footstepBuffers = results.filter(
      (buffer): buffer is AudioBuffer => buffer !== null,
    );
    this.footstepBag = new ShuffleBag(this.footstepBuffers);
  }

  private async startInitialAmbient(url: string): Promise<void> {
    const deck = this.ambientDecks[this.activeDeckIndex];
    if (!(await this.loadAndPlayDeck(deck, url))) {
      const fallback = this.nextAmbientUrl();
      if (fallback) await this.startInitialAmbient(fallback);
      return;
    }
    if (!this.ctx) return;
    this.rampGain(
      deck.gain,
      1,
      this.ctx.currentTime,
      AUDIO.AMBIENT_CROSSFADE_MS / 1000,
    );
  }

  private onAmbientTimeUpdate(index: number): void {
    if (
      index !== this.activeDeckIndex ||
      this.ambientTransitioning ||
      this.teleportAmbientTransition
    ) {
      return;
    }
    const element = this.ambientDecks[index]?.element;
    if (!element || !Number.isFinite(element.duration)) return;
    const remaining = element.duration - element.currentTime;
    if (remaining <= AUDIO.AMBIENT_CROSSFADE_MS / 1000) {
      void this.startNaturalCrossfade(AUDIO.AMBIENT_CROSSFADE_MS);
    }
  }

  private onAmbientEnded(index: number): void {
    if (
      index === this.activeDeckIndex &&
      !this.ambientTransitioning &&
      !this.teleportAmbientTransition
    ) {
      void this.startNaturalCrossfade(1_000);
    }
  }

  private async startNaturalCrossfade(durationMs: number): Promise<void> {
    if (!this.ctx || this.ambientTransitioning || this.teleportAmbientTransition) {
      return;
    }
    const url = this.nextAmbientUrl();
    if (!url) return;

    this.ambientTransitioning = true;
    const generation = ++this.ambientTransitionGeneration;
    const outgoingIndex = this.activeDeckIndex;
    const incomingIndex = 1 - outgoingIndex;
    const outgoing = this.ambientDecks[outgoingIndex];
    const incoming = this.ambientDecks[incomingIndex];
    this.stopDeck(incoming);

    if (!(await this.loadAndPlayDeck(incoming, url))) {
      this.ambientTransitioning = false;
      if (generation === this.ambientTransitionGeneration) {
        void this.startNaturalCrossfade(durationMs);
      }
      return;
    }
    if (!this.ctx || generation !== this.ambientTransitionGeneration) {
      this.stopDeck(incoming);
      return;
    }

    const now = this.ctx.currentTime;
    const duration = durationMs / 1000;
    this.rampGain(outgoing.gain, 0, now, duration);
    this.rampGain(incoming.gain, 1, now, duration);
    this.ambientTransitionTimer = setTimeout(() => {
      if (generation !== this.ambientTransitionGeneration) return;
      this.stopDeck(outgoing);
      this.activeDeckIndex = incomingIndex;
      this.ambientTransitioning = false;
      this.ambientTransitionTimer = null;
    }, durationMs);
  }

  private async finishTeleportAmbient(
    changed: boolean,
    fadeInMs: number,
  ): Promise<void> {
    if (!this.ctx || this.ambientDecks.length !== 2) return;
    const duration = this.ambientFadeSeconds(fadeInMs);
    let deck = this.ambientDecks[this.activeDeckIndex];

    if (changed) {
      const url = this.nextAmbientUrl();
      if (url) {
        const nextIndex = 1 - this.activeDeckIndex;
        const nextDeck = this.ambientDecks[nextIndex];
        this.stopDeck(nextDeck);
        if (await this.loadAndPlayDeck(nextDeck, url)) {
          this.stopDeck(deck);
          this.activeDeckIndex = nextIndex;
          deck = nextDeck;
        }
      }
    } else if (deck.element.paused) {
      try {
        await deck.element.play();
      } catch (error) {
        console.warn("City ambience could not resume after a failed teleport.", error);
      }
    }

    if (!this.ctx) return;
    this.rampGain(deck.gain, 1, this.ctx.currentTime, duration);
    this.teleportAmbientTransition = false;
  }

  private nextAmbientUrl(): string | undefined {
    for (let attempts = 0; attempts < AMBIENT_AUDIO_URLS.length; attempts += 1) {
      const url = this.ambientBag.next();
      if (url && !this.failedAmbientUrls.has(url)) return url;
    }
    return undefined;
  }

  private async loadAndPlayDeck(
    deck: AmbientDeck,
    url: string,
  ): Promise<boolean> {
    deck.url = url;
    deck.gain.gain.value = 0;
    deck.element.src = url;
    deck.element.currentTime = 0;
    try {
      await deck.element.play();
      return true;
    } catch (error) {
      this.failedAmbientUrls.add(url);
      console.warn(`City ambience failed to play: ${url}`, error);
      this.stopDeck(deck);
      return false;
    }
  }

  private cancelAmbientTransition(): void {
    this.ambientTransitionGeneration += 1;
    if (this.ambientTransitionTimer) {
      clearTimeout(this.ambientTransitionTimer);
      this.ambientTransitionTimer = null;
    }
    this.ambientTransitioning = false;
    if (this.ambientDecks.length === 2) {
      this.stopDeck(this.ambientDecks[1 - this.activeDeckIndex]);
    }
  }

  private stopDeck(deck: AmbientDeck): void {
    deck.element.pause();
    deck.element.removeAttribute("src");
    deck.element.load();
    deck.url = null;
    deck.gain.gain.value = 0;
  }

  private ambientFadeSeconds(requestedMs: number): number {
    return Math.max(requestedMs, AUDIO.AMBIENT_RECOVERY_FADE_MIN_MS) / 1000;
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
