"use client";

import { DEFAULT_START, DEFAULT_STREET_VIEW_START, TIMING } from "@/lib/config";
import {
  BotState,
  stateToMode,
  type BotContext,
  type BotEvent,
  type LatLng,
  type ReviewLogEntry,
} from "@/lib/types";
import {
  createInitialContext,
  isInCooldown,
  transition,
  type Effect,
} from "./state-machine";
import { AudioEngine } from "./audio-engine";
import { haversineDistance, ReviewManager } from "./review-manager";
import { StreetViewController } from "./street-view-controller";
import { TeleportManager } from "./teleport-manager";
import { WebSpeechTTS, waitForVoices } from "./tts-engine";

export type BotStateCallback = (context: BotContext) => void;

type Timer = ReturnType<typeof setTimeout>;
type Interval = ReturnType<typeof setInterval>;

export class Bot {
  private readonly streetView = new StreetViewController();
  private readonly audio = new AudioEngine();
  private readonly tts = new WebSpeechTTS();
  private readonly teleportManager = new TeleportManager();
  private readonly sessionId = `ses_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;

  private context = createInitialContext(DEFAULT_START);
  private reviewManager = new ReviewManager(this.context.readReviewHashes);
  private timers = new Map<string, Timer>();
  private running = false;
  private teleporting = false;
  private onStateChange: BotStateCallback | null = null;
  private queryCheckInterval: Interval | null = null;
  private stuckCheckInterval: Interval | null = null;
  private coordinateInterval: Interval | null = null;
  private statsInterval: Interval | null = null;
  private lastStatsCoords: LatLng = DEFAULT_START;
  private distanceKm = 0;
  private locationsScanned = 0;
  private screenshotsTaken = 0;
  private teleports = 0;
  private lastScreenshotFilename = "";
  private ttsStartedAt = 0;

  async start(
    container: HTMLElement,
    onStateChange: BotStateCallback,
  ): Promise<void> {
    this.onStateChange = onStateChange;

    await waitForVoices();
    await this.audio.init();
    await this.audio.resume();
    await this.streetView.init(container, DEFAULT_START, DEFAULT_STREET_VIEW_START);
    this.teleportManager.resetStuckDetection(DEFAULT_START);

    await this.logAction("createSession", { sessionId: this.sessionId });

    this.running = true;
    this.audio.startAmbient();
    this.streetView.startWalking(TIMING.WANDER_STEP_INTERVAL);
    this.startPeriodicChecks();
    this.updateCity();
    this.notifyStateChange();
  }

  getContext(): BotContext {
    return { ...this.context };
  }

  destroy(): void {
    this.running = false;
    this.tts.stop();
    this.audio.destroy();
    this.streetView.destroy();

    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();

    if (this.queryCheckInterval) clearInterval(this.queryCheckInterval);
    if (this.stuckCheckInterval) clearInterval(this.stuckCheckInterval);
    if (this.coordinateInterval) clearInterval(this.coordinateInterval);
    if (this.statsInterval) clearInterval(this.statsInterval);
  }

  private dispatch(event: BotEvent): void {
    if (!this.running && event.type !== "TELEPORT_COMPLETE") return;

    const result = transition(this.context, event);
    if (!result) return;

    const nextContext: BotContext = {
      ...this.context,
      state: result.newState,
      mode: stateToMode(result.newState),
    };

    if (result.newState === BotState.WANDER) {
      nextContext.targetBusiness = null;
      nextContext.reviewToRead = null;
    }

    this.context = nextContext;

    if (result.scheduleTimer) {
      const key = result.scheduleTimer.event.type;
      const existing = this.timers.get(key);
      if (existing) clearTimeout(existing);

      const timer = setTimeout(() => {
        this.timers.delete(key);
        this.dispatch(result.scheduleTimer!.event);
      }, result.scheduleTimer.delayMs);
      this.timers.set(key, timer);
    }

    for (const effect of result.effects) {
      this.executeEffect(effect);
    }

    this.notifyStateChange();
  }

  private executeEffect(effect: Effect): void {
    switch (effect.type) {
      case "START_WALKING":
        this.streetView.startWalking(TIMING.WANDER_STEP_INTERVAL);
        break;

      case "STOP_WALKING":
        this.streetView.stopWalking();
        break;

      case "PAN_TO_BUSINESS":
        void this.streetView.panToHeading(
          effect.bearingDeg,
          TIMING.INSPECT_PAN_DURATION,
        );
        break;

      case "START_TTS":
        void this.handleTts(effect.text);
        break;

      case "PLAY_BLEEP":
        this.audio.playBleep();
        break;

      case "PLAY_BLOOP":
        this.audio.playBloop();
        break;

      case "CROSSFADE_TO_A":
        this.audio.crossfadeTo("A");
        break;

      case "CROSSFADE_TO_B":
        this.audio.crossfadeTo("B");
        break;

      case "DUCK_AMBIENT":
        this.audio.duckAmbient();
        break;

      case "UNDUCK_AMBIENT":
        this.audio.unduckAmbient();
        break;

      case "START_TELEPORT_FADE":
        void this.handleTeleport();
        break;

      case "TAKE_SCREENSHOT":
        window.setTimeout(() => {
          void this.takeScreenshot();
        }, TIMING.INSPECT_PAN_DURATION);
        break;

      case "LOG_REVIEW":
        void this.logCurrentReview();
        break;

      case "INCREMENT_COUNTER":
        this.context = {
          ...this.context,
          sessionReviewCount: this.context.sessionReviewCount + 1,
          lastReviewTime: Date.now(),
        };
        this.teleportManager.recordReview();
        break;

      case "START_LINGER_ZOOM":
      case "RESET_ZOOM":
        break;
    }
  }

  private startPeriodicChecks(): void {
    this.coordinateInterval = setInterval(() => {
      if (!this.running) return;
      this.context = {
        ...this.context,
        currentCoords: this.streetView.getCoords(),
      };
      this.notifyStateChange();
    }, 1_000);

    this.queryCheckInterval = setInterval(() => {
      void this.checkForBusiness();
    }, 3_000);

    this.stuckCheckInterval = setInterval(() => {
      if (!this.running || this.context.state !== BotState.WANDER) return;
      const coords = this.streetView.getCoords();
      if (this.teleportManager.shouldTeleport(coords)) {
        this.dispatch({ type: "STUCK_DETECTED" });
        return;
      }
      this.teleportManager.updateStuckCheck(coords);
    }, TIMING.STUCK_CHECK_INTERVAL);

    this.statsInterval = setInterval(() => {
      void this.updateStats();
    }, TIMING.STATS_UPDATE_INTERVAL);
  }

  private async checkForBusiness(): Promise<void> {
    if (!this.running) return;
    if (this.context.state !== BotState.WANDER) return;
    if (isInCooldown(this.context)) return;

    const coords = this.streetView.getCoords();
    this.context = { ...this.context, currentCoords: coords };

    if (this.reviewManager.shouldQuery(coords)) {
      const businesses = await this.reviewManager.fetchNearbyBusinesses(coords);
      this.locationsScanned += businesses.length;
    }

    const business = this.reviewManager.findNearestBusiness(coords);
    if (!business) return;

    const { review, businessTypes } = await this.reviewManager.fetchAndSelectReview(
      business.placeId,
    );
    if (!review) return;

    const targetBusiness = {
      ...business,
      types: businessTypes.length > 0 ? businessTypes : business.types,
    };

    this.lastScreenshotFilename = "";
    this.context = {
      ...this.context,
      targetBusiness,
      reviewToRead: review,
    };

    this.dispatch({ type: "BUSINESS_DETECTED", business: targetBusiness });
  }

  private async handleTts(text: string): Promise<void> {
    this.ttsStartedAt = Date.now();
    try {
      await this.tts.speak(text);
    } catch (error) {
      console.error("TTS error:", error);
    }
    if (this.running && this.context.state === BotState.DELIVER) {
      this.dispatch({ type: "DELIVER_COMPLETE" });
    }
  }

  private async handleTeleport(): Promise<void> {
    if (this.teleporting) return;
    this.teleporting = true;

    this.context = { ...this.context, teleportPhase: "fade-out" };
    this.audio.fadeToSilence(TIMING.TELEPORT_FADE_OUT);
    this.notifyStateChange();
    await this.sleep(TIMING.TELEPORT_FADE_OUT);

    this.context = { ...this.context, teleportPhase: "black" };
    this.notifyStateChange();
    await this.sleep(TIMING.TELEPORT_HOLD_BLACK);

    const destination = this.teleportManager.selectDestination(
      this.context.currentCoords,
    );
    this.streetView.teleportTo(destination);
    this.teleports += 1;
    this.lastStatsCoords = destination;
    this.context = {
      ...this.context,
      currentCoords: destination,
      currentCity: "Unknown",
      targetBusiness: null,
      reviewToRead: null,
    };
    this.teleportManager.resetStuckDetection(destination);
    void this.updateStats();
    void this.updateCity();

    this.context = { ...this.context, teleportPhase: "fade-in" };
    this.audio.fadeFromSilence(TIMING.TELEPORT_FADE_IN);
    this.notifyStateChange();
    await this.sleep(TIMING.TELEPORT_FADE_IN);

    this.context = { ...this.context, teleportPhase: "none" };
    this.teleporting = false;
    this.dispatch({ type: "TELEPORT_COMPLETE" });
  }

  private async takeScreenshot(): Promise<void> {
    try {
      const container = this.streetView.getContainer();
      const canvas = container?.querySelector("canvas");
      if (!canvas) return;

      const counter = this.context.sessionReviewCount + 1;
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `${this.sessionId}_${timestamp}_${counter
        .toString()
        .padStart(4, "0")}.jpg`;
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);

      const response = await fetch("/api/screenshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename, dataUrl }),
      });

      if (response.ok) {
        this.lastScreenshotFilename = filename;
        this.screenshotsTaken += 1;
      }
    } catch (error) {
      console.warn("Screenshot capture failed:", error);
    }
  }

  private async logCurrentReview(): Promise<void> {
    const business = this.context.targetBusiness;
    const review = this.context.reviewToRead;
    if (!business || !review) return;

    const entry: ReviewLogEntry = {
      sessionId: this.sessionId,
      entryNumber: this.context.sessionReviewCount + 1,
      timestamp: new Date().toISOString(),
      lat: this.context.currentCoords.lat,
      lng: this.context.currentCoords.lng,
      city: this.context.currentCity,
      businessName: business.name,
      businessType: business.types[0] || "",
      reviewText: review.text,
      reviewRating: review.rating,
      ttsDurationSeconds:
        this.ttsStartedAt > 0 ? (Date.now() - this.ttsStartedAt) / 1000 : 0,
      screenshotFilename: this.lastScreenshotFilename,
    };

    await this.logAction("logReview", { entry });
  }

  private async updateCity(): Promise<void> {
    try {
      const params = new URLSearchParams({
        lat: String(this.context.currentCoords.lat),
        lng: String(this.context.currentCoords.lng),
      });
      const response = await fetch(`/api/geocode?${params.toString()}`);
      const data = (await response.json()) as {
        city?: string;
        country?: string | null;
      };

      this.context = {
        ...this.context,
        currentCity: data.city || "Unknown",
      };

      if (data.country) {
        await this.logAction("addCountry", { country: data.country });
      }

      this.notifyStateChange();
    } catch (error) {
      console.error("Geocode failed:", error);
    }
  }

  private async updateStats(): Promise<void> {
    if (!this.running) return;

    const currentCoords = this.streetView.getCoords();
    if (this.context.state !== BotState.TELEPORT) {
      const segmentKm = haversineDistance(this.lastStatsCoords, currentCoords) / 1000;
      if (segmentKm < 2) {
        this.distanceKm += segmentKm;
      }
    }
    this.lastStatsCoords = currentCoords;

    await this.logAction("updateSession", {
      sessionId: this.sessionId,
      updates: {
        runtimeSeconds: (Date.now() - this.context.sessionStartTime) / 1000,
        distanceKm: this.distanceKm,
        locationsScanned: this.locationsScanned,
        reviewsRead: this.context.sessionReviewCount,
        screenshotsTaken: this.screenshotsTaken,
        teleports: this.teleports,
      },
    });
  }

  private async logAction(action: string, data: Record<string, unknown>): Promise<void> {
    try {
      await fetch("/api/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...data }),
      });
    } catch (error) {
      console.error("Log action failed:", error);
    }
  }

  private notifyStateChange(): void {
    this.onStateChange?.({ ...this.context });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}
