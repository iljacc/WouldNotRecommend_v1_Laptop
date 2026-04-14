"use client";

import { postActivity } from "@/lib/bot-activity";
import {
  getBotSettings,
  reloadBotSettingsFromStorage,
  subscribeBotSettings,
} from "@/lib/bot-settings";
import { DEFAULT_START, SUBTITLE_TIMING } from "@/lib/config";
import {
  BotState,
  stateToMode,
  type BotContext,
  type BotEvent,
  type LatLng,
  type ReviewLogEntry,
  type TtsSubtitlePayload,
} from "@/lib/types";
import {
  canTriggerNextReview,
  createInitialContext,
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
  private onSubtitleChange: ((p: TtsSubtitlePayload | null) => void) | null =
    null;
  private subtitleHideTimer: Timer | null = null;
  /** Avoid duplicate STATE lines; WANDER is not logged here (use SEARCHING per step). */
  private lastActivityBroadcastState: BotState | null = null;
  private unsubscribeSettings: (() => void) | null = null;
  /** Session city from spawn geocode only; kept across teleports within the run. */
  private sessionCityResolved = false;

  async start(
    container: HTMLElement,
    onStateChange: BotStateCallback,
    options?: { onSubtitleChange?: (p: TtsSubtitlePayload | null) => void },
  ): Promise<void> {
    this.onStateChange = onStateChange;
    this.onSubtitleChange = options?.onSubtitleChange ?? null;

    await waitForVoices();
    await this.audio.init();
    await this.audio.resume();

    const spawn = this.teleportManager.getRandomSpawnCoords();
    this.context = createInitialContext(spawn);

    await this.streetView.init(container, spawn, undefined, {
      onSuccessfulStep: () => this.onWanderStep(),
      onImageryFault: () => this.onImageryFault(),
    });
    this.teleportManager.resetStuckDetection(spawn);

    await this.logAction("createSession", { sessionId: this.sessionId });

    postActivity("SESSION", [
      `sessionId=${this.sessionId}`,
      `spawn lat=${spawn.lat.toFixed(6)} lng=${spawn.lng.toFixed(6)}`,
    ]);

    this.running = true;
    reloadBotSettingsFromStorage();
    this.audio.startAmbient();
    this.streetView.startWalking(getBotSettings().timing.wanderStepInterval);
    this.startPeriodicChecks();
    this.unsubscribeSettings = subscribeBotSettings(
      () => this.applySettingsHotReload(),
      () => this.applySoftReset(),
    );
    /** City label from reverse-geocode at **spawn** (Street View start), not the host machine. */
    void this.resolveSessionCityWithRetries(spawn);
    this.notifyStateChange();
  }

  getContext(): BotContext {
    return { ...this.context };
  }

  destroy(): void {
    this.running = false;
    this.unsubscribeSettings?.();
    this.unsubscribeSettings = null;
    if (this.subtitleHideTimer) {
      clearTimeout(this.subtitleHideTimer);
      this.subtitleHideTimer = null;
    }
    this.onSubtitleChange?.(null);
    this.onSubtitleChange = null;
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

    const prevState = this.context.state;
    const result = transition(this.context, event);
    if (!result) return;

    let wanderSnapshot: number | undefined;
    if (event.type === "BUSINESS_DETECTED" && this.context.state === BotState.WANDER) {
      wanderSnapshot = this.streetView.getHeading();
    }

    const nextContext: BotContext = {
      ...this.context,
      state: result.newState,
      mode: stateToMode(result.newState),
    };

    if (wanderSnapshot !== undefined) {
      nextContext.wanderHeadingBeforeReview = wanderSnapshot;
    }

    if (result.newState === BotState.WANDER) {
      nextContext.targetBusiness = null;
      nextContext.reviewToRead = null;
      nextContext.wanderHeadingBeforeReview = null;
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
      this.executeEffect(effect, event, prevState);
    }

    this.notifyStateChange();
  }

  private stopWalkingReason(event: BotEvent, prevState: BotState): string {
    switch (event.type) {
      case "BUSINESS_DETECTED":
        return "stop walking — business detected, aligning for review";
      case "STUCK_DETECTED":
        return "stop walking — stuck, teleporting";
      case "TELEPORT_TRIGGERED":
        if (prevState === BotState.WANDER) {
          return "stop walking — imagery fault or blocked path, teleporting";
        }
        return `stop walking — teleport during ${prevState}`;
      default:
        return `stop walking (${event.type})`;
    }
  }

  private startWalkingReason(event: BotEvent): string {
    switch (event.type) {
      case "RETURN_COMPLETE":
        return "start walking — returned to wander heading";
      case "TELEPORT_COMPLETE":
        return "start walking — after teleport";
      default:
        return `start walking (${event.type})`;
    }
  }

  private teleportCause(event: BotEvent, prevState: BotState): string {
    switch (event.type) {
      case "STUCK_DETECTED":
        return "stuck_threshold";
      case "TELEPORT_TRIGGERED":
        if (prevState === BotState.WANDER) return "imagery_fault";
        if (prevState === BotState.DETECT) return "interrupt_during_detect";
        if (prevState === BotState.DELIVER) return "interrupt_during_deliver";
        if (prevState === BotState.RETURN) return "interrupt_during_return";
        return `interrupt_from_${prevState}`;
      default:
        return event.type;
    }
  }

  private executeEffect(
    effect: Effect,
    event: BotEvent,
    prevState: BotState,
  ): void {
    switch (effect.type) {
      case "START_WALKING":
        this.streetView.startWalking(getBotSettings().timing.wanderStepInterval);
        postActivity("WALK", [
          `${this.startWalkingReason(event)} | ${this.activityLocationFragment()}`,
        ]);
        break;

      case "STOP_WALKING":
        this.streetView.stopWalking();
        postActivity("STOP", [
          `${this.stopWalkingReason(event, prevState)} | ${this.activityLocationFragment()}`,
        ]);
        break;

      case "PAN_TO_BUSINESS":
        void this.streetView.panToHeading(
          effect.bearingDeg,
          getBotSettings().timing.alignPanMs,
        );
        break;

      case "PAN_TO_WANDER_HEADING": {
        const back = this.context.wanderHeadingBeforeReview;
        if (back !== null) {
          void this.streetView.panToHeading(
            back,
            getBotSettings().timing.returnPanDuration,
          );
        }
        break;
      }

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

      case "START_TELEPORT_FADE": {
        const fromCoords = { ...this.context.currentCoords };
        const cause = this.teleportCause(event, prevState);
        postActivity("TELEPORT", [
          `fade-out | cause=${cause} | from_lat=${fromCoords.lat.toFixed(6)} from_lng=${fromCoords.lng.toFixed(6)}`,
        ]);
        void this.handleTeleport(fromCoords, cause);
        break;
      }

      case "TAKE_SCREENSHOT":
        void this.takeScreenshot();
        break;

      case "LOG_REVIEW":
        void this.logCurrentReview();
        break;

      case "INCREMENT_COUNTER":
        this.context = {
          ...this.context,
          sessionReviewCount: this.context.sessionReviewCount + 1,
          lastReviewTime: Date.now(),
          stepsSinceLastReview: 0,
        };
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
    }, getBotSettings().timing.stuckCheckInterval);

    this.statsInterval = setInterval(() => {
      void this.updateStats();
    }, getBotSettings().timing.statsUpdateInterval);
  }

  private restartStuckAndStatsIntervals(): void {
    if (this.stuckCheckInterval) clearInterval(this.stuckCheckInterval);
    if (this.statsInterval) clearInterval(this.statsInterval);
    const timing = getBotSettings().timing;
    this.stuckCheckInterval = setInterval(() => {
      if (!this.running || this.context.state !== BotState.WANDER) return;
      const coords = this.streetView.getCoords();
      if (this.teleportManager.shouldTeleport(coords)) {
        this.dispatch({ type: "STUCK_DETECTED" });
        return;
      }
      this.teleportManager.updateStuckCheck(coords);
    }, timing.stuckCheckInterval);
    this.statsInterval = setInterval(() => {
      void this.updateStats();
    }, timing.statsUpdateInterval);
  }

  private applySettingsHotReload(): void {
    if (!this.running) return;
    this.restartStuckAndStatsIntervals();
    if (this.context.state === BotState.WANDER) {
      this.streetView.stopWalking();
      this.streetView.startWalking(getBotSettings().timing.wanderStepInterval);
    }
  }

  private applySoftReset(): void {
    this.context.readReviewHashes.clear();
    this.reviewManager.clearSessionCaches();
    postActivity("SESSION", ["soft-reset — cleared review hash cache"]);
  }

  private onWanderStep(): void {
    if (!this.running || this.context.state !== BotState.WANDER) return;
    this.context = {
      ...this.context,
      stepsSinceLastReview: this.context.stepsSinceLastReview + 1,
    };
    const coords = this.streetView.getCoords();
    postActivity("SEARCHING", [
      `step ${this.activityLocationFragmentFrom(coords)}`,
    ]);
  }

  private onImageryFault(): void {
    if (!this.running || this.teleporting) return;
    this.dispatch({ type: "TELEPORT_TRIGGERED" });
  }

  private async checkForBusiness(): Promise<void> {
    if (!this.running) return;
    if (this.context.state !== BotState.WANDER) return;
    if (!canTriggerNextReview(this.context)) return;

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

    postActivity("REVIEW", [
      `placeId=${targetBusiness.placeId} | business=${targetBusiness.name} | author=${review.authorName} | relativeTime=${review.relativeTimeDescription} | rating=${review.rating}`,
      review.text,
    ]);

    this.dispatch({ type: "BUSINESS_DETECTED", business: targetBusiness });
  }

  private async handleTts(text: string): Promise<void> {
    if (this.subtitleHideTimer) {
      clearTimeout(this.subtitleHideTimer);
      this.subtitleHideTimer = null;
    }
    this.ttsStartedAt = Date.now();
    this.onSubtitleChange?.({ fullText: text, revealed: 0 });
    try {
      await this.tts.speak(text, {
        onReveal: (n) => {
          this.onSubtitleChange?.({ fullText: text, revealed: n });
        },
      });
    } catch (error) {
      console.error("TTS error:", error);
    }
    this.onSubtitleChange?.({ fullText: text, revealed: text.length });
    this.subtitleHideTimer = setTimeout(() => {
      this.onSubtitleChange?.(null);
      this.subtitleHideTimer = null;
    }, SUBTITLE_TIMING.LINGER_AFTER_COMPLETE_MS + SUBTITLE_TIMING.FADE_OUT_MS);
    if (this.running && this.context.state === BotState.DELIVER) {
      this.dispatch({ type: "DELIVER_COMPLETE" });
    }
  }

  private async handleTeleport(fromCoords: LatLng, cause: string): Promise<void> {
    if (this.teleporting) return;
    this.teleporting = true;

    const timing = getBotSettings().timing;
    const imageryRecovery = cause === "imagery_fault";
    const fadeOut = imageryRecovery ? 80 : timing.teleportFadeOut;
    const fadeIn = imageryRecovery ? 120 : timing.teleportFadeIn;

    this.context = { ...this.context, teleportPhase: "fade-out" };
    this.audio.fadeToSilence(fadeOut);
    this.notifyStateChange();
    await this.sleep(fadeOut);

    this.context = { ...this.context, teleportPhase: "warp" };
    postActivity("TELEPORT", ["warp"]);
    this.notifyStateChange();
    if (timing.teleportHoldDim > 0) {
      await this.sleep(timing.teleportHoldDim);
    }

    const destination = this.teleportManager.selectDestination(
      this.context.currentCoords,
    );
    postActivity("TELEPORT", [
      `jump | cause=${cause} | from_lat=${fromCoords.lat.toFixed(6)} from_lng=${fromCoords.lng.toFixed(6)} → to_lat=${destination.lat.toFixed(6)} to_lng=${destination.lng.toFixed(6)}`,
    ]);
    this.streetView.teleportTo(destination);
    this.teleports += 1;
    this.lastStatsCoords = destination;
    this.context = {
      ...this.context,
      currentCoords: destination,
      targetBusiness: null,
      reviewToRead: null,
    };
    this.teleportManager.resetStuckDetection(destination);
    void this.updateStats();

    this.context = { ...this.context, teleportPhase: "fade-in" };
    postActivity("TELEPORT", ["fade-in"]);
    this.audio.fadeFromSilence(fadeIn);
    this.notifyStateChange();
    await this.sleep(fadeIn);

    this.context = { ...this.context, teleportPhase: "none" };
    postActivity("TELEPORT", ["complete — resuming wander"]);
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

  /**
   * Reverse-geocode the **session spawn** coordinates until we get a non-Unknown place
   * or exhaust attempts. Coordinates are always the bot’s start position in the world,
   * never derived from the server host.
   */
  private async resolveSessionCityWithRetries(coords: LatLng): Promise<void> {
    if (this.sessionCityResolved) return;

    const maxAttempts = 12;
    const baseDelayMs = 450;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (!this.running) return;

      try {
        const params = new URLSearchParams({
          lat: String(coords.lat),
          lng: String(coords.lng),
        });
        const response = await fetch(`/api/geocode?${params.toString()}`);
        const data = (await response.json()) as {
          city?: string;
          country?: string | null;
          lookupStatus?: string;
          detail?: string;
        };

        if (!response.ok) {
          console.warn(
            "Geocode HTTP error:",
            response.status,
            attempt + 1,
            "/",
            maxAttempts,
          );
        } else {
          const raw = (data.city ?? "").trim();
          const looksUnknown =
            raw.length === 0 ||
            /^unknown$/i.test(raw) ||
            /^unknown\s*,/i.test(raw);

          if (!looksUnknown) {
            this.sessionCityResolved = true;
            this.context = {
              ...this.context,
              currentCity: raw,
            };

            if (data.country) {
              await this.logAction("addCountry", { country: data.country });
            }

            this.notifyStateChange();
            return;
          }

          if (data.lookupStatus && data.lookupStatus !== "OK") {
            console.warn(
              "Geocode:",
              data.lookupStatus,
              "attempt",
              attempt + 1,
              "/",
              maxAttempts,
              data.detail ? `— ${data.detail}` : "",
            );
          }
        }
      } catch (error) {
        console.error("Geocode fetch failed:", error, "attempt", attempt + 1);
      }

      if (!this.running) return;

      const delayMs = Math.min(8_000, baseDelayMs * 1.55 ** attempt);
      await this.sleep(delayMs);
    }

    this.sessionCityResolved = true;
    this.notifyStateChange();
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
    if (this.lastActivityBroadcastState !== this.context.state) {
      this.lastActivityBroadcastState = this.context.state;
      if (this.context.state !== BotState.WANDER) {
        postActivity("STATE", [
          `${this.activityStateLine(this.context.state)} | ${this.activityLocationFragment()}`,
        ]);
      }
    }
    this.onStateChange?.({ ...this.context });
  }

  private activityStateLine(state: BotState): string {
    switch (state) {
      case BotState.DETECT:
        return "DETECT";
      case BotState.DELIVER:
        return "DELIVER";
      case BotState.RETURN:
        return "RETURN";
      case BotState.TELEPORT:
        return "TELEPORT";
      default:
        return state;
    }
  }

  /** Same lat/lng/city shape as SEARCHING step lines; uses current context coords. */
  private activityLocationFragment(): string {
    return this.activityLocationFragmentFrom(this.context.currentCoords);
  }

  private activityLocationFragmentFrom(coords: LatLng): string {
    return `lat=${coords.lat.toFixed(6)} lng=${coords.lng.toFixed(6)} city=${this.context.currentCity}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}
