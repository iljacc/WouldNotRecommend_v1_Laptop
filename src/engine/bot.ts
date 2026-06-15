"use client";

import { postActivity, setActivitySessionId } from "@/lib/bot-activity";
import { getBotSettings, isLatLngInWanderRegion } from "@/lib/bot-settings";
import {
  DEFAULT_START,
  MAPS_CDN,
  PLACES,
  SUBTITLE_TIMING,
  TIMING,
} from "@/lib/config";
import {
  startMapsImageryCdnDiagnosticsMonitor,
  type MapsImageryBurst,
  type MapsImageryResourceError,
  type MapsImageryStatusCounts,
} from "@/lib/maps-cdn-stress";
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
import { CityTourController } from "./city-tour";
import { TeleportManager } from "./teleport-manager";
import { PiperTTS } from "./tts-engine";
import { PIPER_VOICE_INDEX } from "@/lib/piper-config";
export type BotStateCallback = (context: BotContext) => void;

type Timer = ReturnType<typeof setTimeout>;
type Interval = ReturnType<typeof setInterval>;

export class Bot {
  private readonly streetView = new StreetViewController();
  private readonly audio = new AudioEngine();
  private readonly tts = new PiperTTS(this.audio);
  private readonly teleportManager = new TeleportManager();
  private readonly cityTour = new CityTourController();
  private readonly sessionId = `ses_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;

  private context = createInitialContext(DEFAULT_START);
  private reviewManager = new ReviewManager(this.context.readReviewAtByHash);
  private timers = new Map<string, Timer>();
  private running = false;
  private teleporting = false;
  private onStateChange: BotStateCallback | null = null;
  private queryCheckInterval: Interval | null = null;
  private stuckCheckInterval: Interval | null = null;
  private coordinateInterval: Interval | null = null;
  private statsInterval: Interval | null = null;
  private blackFrameInterval: Interval | null = null;
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
  /** Configured base `wanderStepInterval`; Maps CDN stress can temporarily raise it. */
  private baseWanderStepMs: number = TIMING.WANDER_STEP_INTERVAL;
  /** True while Maps tile CDN burst backoff is active. */
  private mapsCdnStressBackoff = false;
  /** Browser timeout handle (`use client` — DOM `number`, not Node `Timeout`). */
  private mapsStressRecoveryTimer: number | null = null;
  private stopMapsCdnMonitor: (() => void) | null = null;
  private lastMapsErrorActivityAt = 0;
  private lastMapsErrorCounts: MapsImageryStatusCounts = {};
  private lastMapsErrorWindowMs: number = MAPS_CDN.ERROR_BURST_WINDOW_MS;
  private lastMapsDominantStatus = 0;
  private blackFrameSamplingUnavailable = false;
  private lastBlackFrameActivityAt = 0;
  /** Session city from spawn geocode only; kept across teleports within the run. */
  private sessionCityResolved = false;
  /** Set immediately before `TELEPORT_TRIGGERED` when advancing the curated city tour. */
  private teleportExplicitDestination: LatLng | null = null;
  private teleportScheduledTourAdvance = false;
  private teleportTriggerCause: "imagery_fault" | "boundary_exit" | null = null;
  private consecutiveOutOfRegionSteps = 0;
  private reviewFallbackAnchor: LatLng | null = null;
  private boundaryTeleportPending = false;

  async start(
    container: HTMLElement,
    onStateChange: BotStateCallback,
    options?: { onSubtitleChange?: (p: TtsSubtitlePayload | null) => void },
  ): Promise<void> {
    this.onStateChange = onStateChange;
    this.onSubtitleChange = options?.onSubtitleChange ?? null;

    await this.audio.init();
    await this.audio.resume();

    const tourOn = this.cityTour.isActive();
    const spawn = tourOn
      ? this.cityTour.pickRandomSpawnForCurrentStop()
      : this.teleportManager.getRandomSpawnCoords();
    this.context = createInitialContext(spawn);
    this.consecutiveOutOfRegionSteps = 0;
    this.reviewFallbackAnchor = null;
    this.boundaryTeleportPending = false;
    this.teleportTriggerCause = null;
    if (tourOn) {
      this.sessionCityResolved = true;
      this.cityTour.beginSession();
      this.context = {
        ...this.context,
        currentCity: this.cityTour.getCurrentLabel(),
        cityTourActive: true,
        cityTourSegmentEndTime: this.cityTour.getSegmentEndTimeMs(),
        nextCityLabel: this.cityTour.getNextLabel(),
      };
    } else {
      this.context = {
        ...this.context,
        cityTourActive: false,
        cityTourSegmentEndTime: 0,
        nextCityLabel: "",
      };
    }

    const resolvedSpawn = await this.streetView.init(container, spawn, undefined, {
      onSuccessfulStep: () => this.onWanderStep(),
      onImageryFault: () => this.onImageryFault(),
    });
    this.context = {
      ...this.context,
      currentCoords: resolvedSpawn,
    };
    this.lastStatsCoords = resolvedSpawn;
    this.teleportManager.resetStuckDetection(resolvedSpawn);

    await this.logAction("createSession", { sessionId: this.sessionId });
    setActivitySessionId(this.sessionId);

    postActivity("SESSION", [
      `sessionId=${this.sessionId}`,
      `spawn lat=${resolvedSpawn.lat.toFixed(6)} lng=${resolvedSpawn.lng.toFixed(6)}`,
    ], {
      lat: resolvedSpawn.lat,
      lng: resolvedSpawn.lng,
      state: this.context.state,
      metadata: { event: "session_start" },
    });

    this.running = true;
    this.baseWanderStepMs = getBotSettings().timing.wanderStepInterval;
    this.audio.startAmbient();
    this.streetView.startWalking(this.getEffectiveWanderStepInterval());
    this.stopMapsCdnMonitor = startMapsImageryCdnDiagnosticsMonitor({
      onResourceError: (event) => this.onMapsCdnResourceError(event),
      onBurst: (burst) => this.onMapsCdnStressBurst(burst),
    });
    this.startPeriodicChecks();
    /** City label from reverse-geocode at **spawn** unless city tour supplies labels. */
    if (!tourOn) {
      void this.resolveSessionCityWithRetries(resolvedSpawn);
    }
    this.notifyStateChange();
  }

  getContext(): BotContext {
    return { ...this.context };
  }

  destroy(): void {
    this.running = false;
    this.stopMapsCdnMonitor?.();
    this.stopMapsCdnMonitor = null;
    this.clearMapsStressRecoveryTimer();
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
    if (this.blackFrameInterval) clearInterval(this.blackFrameInterval);
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
        if (this.teleportScheduledTourAdvance) return "scheduled_city_hop";
        if (this.teleportTriggerCause) return this.teleportTriggerCause;
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
        this.streetView.startWalking(this.getEffectiveWanderStepInterval());
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
        void this.handleBusinessPan(effect.bearingDeg);
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
        void this.handleTts(effect.text, effect.piperVoiceIndex);
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
        this.teleportTriggerCause = null;
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
      const now = Date.now();
      if (
        this.cityTour.isActive() &&
        this.cityTour.shouldTriggerScheduledHop(
          now,
          this.context.state,
          this.teleporting,
        )
      ) {
        this.teleportExplicitDestination = this.cityTour.getScheduledHopDestination();
        this.teleportScheduledTourAdvance = true;
        this.dispatch({ type: "TELEPORT_TRIGGERED" });
        return;
      }
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

    this.blackFrameInterval = setInterval(() => {
      this.checkStreetViewBlackFrame();
    }, MAPS_CDN.BLACK_FRAME_SAMPLE_INTERVAL_MS);
  }

  private getEffectiveWanderStepInterval(): number {
    const base = this.baseWanderStepMs;
    if (!this.mapsCdnStressBackoff) return base;
    return Math.max(base, MAPS_CDN.STRESS_MIN_WANDER_INTERVAL_MS);
  }

  private clearMapsStressRecoveryTimer(): void {
    if (this.mapsStressRecoveryTimer !== null) {
      clearTimeout(this.mapsStressRecoveryTimer);
      this.mapsStressRecoveryTimer = null;
    }
  }

  private formatMapsStatusCounts(counts: MapsImageryStatusCounts): string {
    const entries = Object.entries(counts)
      .map(([status, count]) => `${status}=${count}`)
      .join(" ");
    return entries || "none";
  }

  private mapsDiagnosticsContext(): string {
    return `state=${this.context.state} backoff=${this.mapsCdnStressBackoff ? "on" : "off"} stepMs=${this.getEffectiveWanderStepInterval()}`;
  }

  private onMapsCdnResourceError(event: MapsImageryResourceError): void {
    this.lastMapsErrorCounts = event.countsByStatus;
    this.lastMapsErrorWindowMs = event.windowMs;
    this.lastMapsDominantStatus = event.status;

    const now = Date.now();
    if (
      now - this.lastMapsErrorActivityAt <
      MAPS_CDN.ERROR_ACTIVITY_MIN_INTERVAL_MS
    ) {
      return;
    }

    this.lastMapsErrorActivityAt = now;
    postActivity("MAPS", [
      `imagery status=${event.status} host=${event.host} count=${event.countInWindow}/${event.windowMs}ms counts=${this.formatMapsStatusCounts(event.countsByStatus)} ${this.mapsDiagnosticsContext()}`,
    ], {
      lat: this.context.currentCoords.lat,
      lng: this.context.currentCoords.lng,
      state: this.context.state,
      statusCode: event.status,
      metadata: {
        host: event.host,
        countInWindow: event.countInWindow,
        windowMs: event.windowMs,
        countsByStatus: event.countsByStatus,
        url: event.url,
      },
    });
  }

  private onMapsCdnStressBurst(burst?: MapsImageryBurst): void {
    if (!this.running) return;
    if (burst) {
      this.lastMapsErrorCounts = burst.countsByStatus;
      this.lastMapsErrorWindowMs = burst.windowMs;
      this.lastMapsDominantStatus = burst.dominantStatus;
    }
    this.clearMapsStressRecoveryTimer();
    this.mapsCdnStressBackoff = true;
    const ms = this.getEffectiveWanderStepInterval();
    if (this.context.state === BotState.WANDER) {
      this.streetView.setWalkingInterval(ms);
    }
    const counts = burst
      ? this.formatMapsStatusCounts(burst.countsByStatus)
      : this.formatMapsStatusCounts(this.lastMapsErrorCounts);
    postActivity("MAPS", [
      `tile/CDN burst counts=${counts} window=${burst?.windowMs ?? MAPS_CDN.ERROR_BURST_WINDOW_MS}ms ${this.mapsDiagnosticsContext()} -> wander ${ms}ms`,
    ], {
      lat: this.context.currentCoords.lat,
      lng: this.context.currentCoords.lng,
      state: this.context.state,
      statusCode: burst?.dominantStatus,
      metadata: {
        event: "maps_cdn_burst",
        countsByStatus: burst?.countsByStatus ?? this.lastMapsErrorCounts,
        windowMs: burst?.windowMs ?? MAPS_CDN.ERROR_BURST_WINDOW_MS,
        countInWindow: burst?.countInWindow,
      },
    });
    this.mapsStressRecoveryTimer = window.setTimeout(() => {
      this.mapsStressRecoveryTimer = null;
      this.mapsCdnStressBackoff = false;
      if (this.running && this.context.state === BotState.WANDER) {
        this.streetView.setWalkingInterval(this.getEffectiveWanderStepInterval());
      }
      postActivity("MAPS", [
        `recovered quietMs=${MAPS_CDN.STRESS_RECOVERY_QUIET_MS} ${this.mapsDiagnosticsContext()}`,
      ], {
        lat: this.context.currentCoords.lat,
        lng: this.context.currentCoords.lng,
        state: this.context.state,
        metadata: { event: "maps_cdn_recovered" },
      });
    }, MAPS_CDN.STRESS_RECOVERY_QUIET_MS);
  }

  private checkStreetViewBlackFrame(): void {
    if (!this.running || this.blackFrameSamplingUnavailable) return;
    if (this.context.teleportPhase !== "none") return;

    const sample = this.streetView.sampleCanvasBrightness();
    if (!sample.available) {
      this.blackFrameSamplingUnavailable = true;
      postActivity("MAPS", [`canvas sampling unavailable reason=${sample.reason}`]);
      return;
    }

    if (sample.brightness > MAPS_CDN.BLACK_FRAME_BRIGHTNESS_THRESHOLD) return;

    const now = Date.now();
    if (
      now - this.lastBlackFrameActivityAt <
      MAPS_CDN.BLACK_FRAME_ACTIVITY_MIN_INTERVAL_MS
    ) {
      return;
    }

    this.lastBlackFrameActivityAt = now;
    const coords = this.streetView.getCoords();
    postActivity("MAPS", [
      `black-frame brightness=${sample.brightness.toFixed(1)} canvas=${sample.width}x${sample.height} lat=${coords.lat.toFixed(6)} lng=${coords.lng.toFixed(6)} counts=${this.formatMapsStatusCounts(this.lastMapsErrorCounts)} window=${this.lastMapsErrorWindowMs}ms dominant=${this.lastMapsDominantStatus || "none"} ${this.mapsDiagnosticsContext()}`,
    ], {
      lat: coords.lat,
      lng: coords.lng,
      state: this.context.state,
      statusCode: this.lastMapsDominantStatus || undefined,
      metadata: {
        event: "black_frame",
        brightness: sample.brightness,
        canvasWidth: sample.width,
        canvasHeight: sample.height,
        countsByStatus: this.lastMapsErrorCounts,
        windowMs: this.lastMapsErrorWindowMs,
        dominantStatus: this.lastMapsDominantStatus,
      },
    });
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
    this.handleReviewRegionBoundary(coords);
  }

  private onImageryFault(): void {
    if (!this.running || this.teleporting) return;
    this.teleportTriggerCause = "imagery_fault";
    this.dispatch({ type: "TELEPORT_TRIGGERED" });
  }

  private handleReviewRegionBoundary(coords: LatLng): void {
    const settings = getBotSettings();
    if (isLatLngInWanderRegion(coords, settings.wanderRegion)) {
      if (this.consecutiveOutOfRegionSteps > 0) {
        postActivity("BOUNDARY", [
          `back inside review region after ${this.consecutiveOutOfRegionSteps} outside step(s)`,
        ]);
      }
      this.consecutiveOutOfRegionSteps = 0;
      this.reviewFallbackAnchor = null;
      this.boundaryTeleportPending = false;
      return;
    }

    this.consecutiveOutOfRegionSteps += 1;
    if (!this.reviewFallbackAnchor) {
      this.reviewFallbackAnchor = this.teleportManager.getRandomSpawnCoords();
      postActivity("BOUNDARY", [
        `outside review region step=${this.consecutiveOutOfRegionSteps} | fallback_lat=${this.reviewFallbackAnchor.lat.toFixed(6)} fallback_lng=${this.reviewFallbackAnchor.lng.toFixed(6)}`,
      ]);
    }

    if (
      this.consecutiveOutOfRegionSteps >=
        PLACES.OUT_OF_REGION_STEPS_BEFORE_TELEPORT &&
      !this.boundaryTeleportPending &&
      !this.teleporting
    ) {
      this.boundaryTeleportPending = true;
      this.teleportTriggerCause = "boundary_exit";
      postActivity("BOUNDARY", [
        `outside review region for ${this.consecutiveOutOfRegionSteps} step(s) — returning to corpus`,
      ]);
      this.dispatch({ type: "TELEPORT_TRIGGERED" });
    }
  }

  private async handleBusinessPan(bearingDeg: number): Promise<void> {
    const timing = getBotSettings().timing;
    const completed = await this.withTimeout(
      (async () => {
        await this.streetView.panToHeading(bearingDeg, timing.alignPanMs);
        if (timing.alignHoldMs > 0) {
          await this.sleep(timing.alignHoldMs);
        }
      })(),
      timing.detectMaxWaitMs,
    );
    if (!completed) {
      postActivity("WARN", [
        `detect_timeout maxMs=${timing.detectMaxWaitMs} | ${this.activityLocationFragment()}`,
      ], {
        lat: this.context.currentCoords.lat,
        lng: this.context.currentCoords.lng,
        state: this.context.state,
        metadata: { event: "detect_timeout", maxMs: timing.detectMaxWaitMs },
      });
    }
    if (this.running && this.context.state === BotState.DETECT) {
      this.dispatch({ type: "DETECT_COMPLETE" });
    }
  }

  private async checkForBusiness(): Promise<void> {
    if (!this.running) return;
    if (this.context.state !== BotState.WANDER) return;
    if (!canTriggerNextReview(this.context)) return;

    const coords = this.streetView.getCoords();
    this.context = { ...this.context, currentCoords: coords };
    const inReviewRegion = isLatLngInWanderRegion(
      coords,
      getBotSettings().wanderRegion,
    );
    const useFallbackReview =
      !inReviewRegion &&
      this.consecutiveOutOfRegionSteps >=
        PLACES.OUT_OF_REGION_STEPS_BEFORE_FALLBACK_REVIEW;
    const queryCoords = useFallbackReview
      ? (this.reviewFallbackAnchor ?? this.teleportManager.getRandomSpawnCoords())
      : coords;
    if (useFallbackReview && !this.reviewFallbackAnchor) {
      this.reviewFallbackAnchor = queryCoords;
    }

    if (this.reviewManager.shouldQuery(queryCoords)) {
      if (useFallbackReview) {
        postActivity("BOUNDARY", [
          `fallback review lookup | bot_lat=${coords.lat.toFixed(6)} bot_lng=${coords.lng.toFixed(6)} | query_lat=${queryCoords.lat.toFixed(6)} query_lng=${queryCoords.lng.toFixed(6)}`,
        ]);
      }
      await this.reviewManager.fetchNearbyBusinesses(queryCoords, {
        bearingFromCoords: coords,
      });
      this.locationsScanned += this.reviewManager.getCachedPlaceCount();
    }

    const maxDetails = PLACES.MAX_PLACE_DETAILS_ATTEMPTS_PER_CHECK;
    let detailsUsed = 0;

    while (detailsUsed < maxDetails) {
      const business = this.reviewManager.findNearestBusiness(queryCoords, {
        allowOutOfRegionFallback: useFallbackReview,
        bearingFromCoords: coords,
      });
      if (business) {
        detailsUsed += 1;
        const { review, businessTypes } =
          await this.reviewManager.fetchAndSelectReview(business.placeId);
        if (review) {
          const piperVoiceIndex = PIPER_VOICE_INDEX;
          const reviewToRead = {
            ...review,
            piperVoiceIndex,
          };
          const targetBusiness = {
            ...business,
            types: businessTypes.length > 0 ? businessTypes : business.types,
          };

          this.lastScreenshotFilename = "";
          this.context = {
            ...this.context,
            targetBusiness,
            reviewToRead,
          };
          this.tts.prepare(reviewToRead.text, {
            piperVoiceIndex,
            piperLengthScale: 1,
            ttsContext: {
              placeId: targetBusiness.placeId,
              reviewId: reviewToRead.reviewId,
              businessName: targetBusiness.name,
              source: "bot-prepare",
            },
          });

          postActivity("REVIEW", [
            `placeId=${targetBusiness.placeId} | reviewHash=${reviewToRead.hash} | business=${targetBusiness.name} | author=${reviewToRead.authorName} | relativeTime=${reviewToRead.relativeTimeDescription} | rating=${reviewToRead.rating} | piperVoice=${piperVoiceIndex}`,
            reviewToRead.text,
          ]);

          this.dispatch({ type: "BUSINESS_DETECTED", business: targetBusiness });
          return;
        }
        continue;
      }
      break;
    }
  }

  private async handleTts(text: string, piperVoiceIndex?: number): Promise<void> {
    if (this.subtitleHideTimer) {
      clearTimeout(this.subtitleHideTimer);
      this.subtitleHideTimer = null;
    }
    this.ttsStartedAt = Date.now();
    this.onSubtitleChange?.({ fullText: text, revealed: 0 });
    try {
      await this.tts.speak(text, {
        piperVoiceIndex,
        piperLengthScale: 1,
        ttsContext: {
          placeId: this.context.targetBusiness?.placeId,
          reviewId: this.context.reviewToRead?.reviewId,
          businessName: this.context.targetBusiness?.name,
          source: "bot-speak",
        },
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

    const explicitDest = this.teleportExplicitDestination;
    const tourAdvance = this.teleportScheduledTourAdvance;
    this.teleportExplicitDestination = null;
    this.teleportScheduledTourAdvance = false;

    const timing = getBotSettings().timing;
    const imageryRecovery = cause === "imagery_fault";
    const fadeOut = imageryRecovery ? 80 : timing.teleportFadeOut;
    const fadeIn = imageryRecovery ? 120 : timing.teleportFadeIn;

    this.context = {
      ...this.context,
      teleportPhase: "fade-out",
      scheduledCityTeleportUi: tourAdvance,
    };
    if (tourAdvance && this.cityTour.isActive()) {
      postActivity("TELEPORT", [
        `city tour hop | ${this.cityTour.getCurrentLabel()} → ${this.cityTour.getNextLabel()}`,
      ]);
    }
    this.audio.fadeToSilence(fadeOut);
    this.notifyStateChange();
    await this.sleep(fadeOut);

    this.context = { ...this.context, teleportPhase: "warp" };
    postActivity("TELEPORT", ["warp"]);
    this.notifyStateChange();
    if (timing.teleportHoldDim > 0) {
      await this.sleep(timing.teleportHoldDim);
    }

    const requestedDestination =
      explicitDest ??
      this.teleportManager.selectDestination(
        this.context.currentCoords,
        this.cityTour.isActive() && cause !== "boundary_exit"
          ? { cityAnchor: this.cityTour.getCurrentStop() }
          : undefined,
      );
    let destination = requestedDestination;
    postActivity("TELEPORT", [
      `jump | cause=${cause} | from_lat=${fromCoords.lat.toFixed(6)} from_lng=${fromCoords.lng.toFixed(6)} → to_lat=${destination.lat.toFixed(6)} to_lng=${destination.lng.toFixed(6)}`,
    ]);
    const resolvedDestination = await this.resolveTeleportDestination(
      requestedDestination,
      cause,
    );
    if (!resolvedDestination) {
      postActivity("TELEPORT", [
        "no walkable outdoor panorama found for requested destination; staying at current pano",
      ]);
    }
    destination = resolvedDestination ?? this.streetView.getCoords();
    if (resolvedDestination) {
      this.teleports += 1;
    }
    this.lastStatsCoords = destination;
    this.context = {
      ...this.context,
      currentCoords: destination,
      targetBusiness: null,
      reviewToRead: null,
    };
    if (cause === "boundary_exit") {
      this.consecutiveOutOfRegionSteps = 0;
      this.reviewFallbackAnchor = null;
      this.boundaryTeleportPending = false;
    }
    this.teleportManager.resetStuckDetection(destination);
    void this.updateStats();

    if (resolvedDestination && tourAdvance && this.cityTour.isActive()) {
      this.cityTour.completeScheduledHop();
      this.context = {
        ...this.context,
        currentCity: this.cityTour.getCurrentLabel(),
        cityTourSegmentEndTime: this.cityTour.getSegmentEndTimeMs(),
        nextCityLabel: this.cityTour.getNextLabel(),
        cityTourActive: true,
      };
    }

    this.context = { ...this.context, teleportPhase: "fade-in" };
    postActivity("TELEPORT", ["fade-in"]);
    this.audio.fadeFromSilence(fadeIn);
    this.notifyStateChange();
    await this.sleep(fadeIn);

    this.context = {
      ...this.context,
      teleportPhase: "none",
      scheduledCityTeleportUi: false,
    };
    postActivity("TELEPORT", ["complete — resuming wander"]);
    this.teleporting = false;
    this.dispatch({ type: "TELEPORT_COMPLETE" });
  }

  private async resolveTeleportDestination(
    requestedDestination: LatLng,
    cause: string,
  ): Promise<LatLng | null> {
    let attemptDestination = requestedDestination;
    const hint =
      this.cityTour.isActive() && cause !== "boundary_exit"
        ? { cityAnchor: this.cityTour.getCurrentStop() }
        : undefined;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const resolved = await this.streetView.teleportTo(attemptDestination);
      if (resolved) return resolved;
      attemptDestination = this.teleportManager.selectDestination(
        this.context.currentCoords,
        hint,
      );
    }

    return null;
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

  private withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (completed: boolean) => {
        if (settled) return;
        settled = true;
        resolve(completed);
      };
      const timer = setTimeout(() => finish(false), timeoutMs);
      work
        .then(() => {
          clearTimeout(timer);
          finish(true);
        })
        .catch((error) => {
          clearTimeout(timer);
          console.warn("Timed operation failed:", error);
          finish(false);
        });
    });
  }
}
