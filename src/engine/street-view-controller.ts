"use client";

import { Loader } from "@googlemaps/js-api-loader";
import { getBotSettings } from "@/lib/bot-settings";
import type { LatLng, StreetViewLink } from "@/lib/types";
import { randomLatLngOffsetMeters } from "@/lib/wander-geo";
import {
  getWalkableOutdoorPanorama,
  getWalkablePanoramaById,
} from "./street-view-panorama-data";

/** Shortest signed delta from `from` to `to` in degrees (−180…180). */
function shortestAngleDelta(from: number, to: number): number {
  let d = to - from;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

/** Smooth 0…1 easing — soft accel/decel (smoother than plain ease-in-out quad). */
function easeInOutQuint(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5 ? 16 * x * x * x * x * x : 1 - Math.pow(-2 * x + 2, 5) / 2;
}

/** Smooth 0…1 easing for gentle scripted camera pans. */
function easeInOutSine(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return -(Math.cos(Math.PI * x) - 1) / 2;
}

export type StreetViewStartOptions = {
  pano: string;
  heading: number;
  pitch: number;
};

export type StreetViewControllerOptions = {
  onSuccessfulStep?: () => void;
  /** Called when panorama imagery fails (e.g. black / no coverage). */
  onImageryFault?: () => void;
};

export type StreetViewCanvasSample =
  | {
      available: true;
      brightness: number;
      width: number;
      height: number;
    }
  | {
      available: false;
      reason: string;
    };

export class StreetViewController {
  private panorama: google.maps.StreetViewPanorama | null = null;
  private streetViewService: google.maps.StreetViewService | null = null;
  /** Navigation / walk direction (deg). CSS may add a wander-only visual drift on top. */
  private currentHeading = 0;
  private isMoving = false;
  private moveInterval: number | null = null;
  private options: StreetViewControllerOptions = {};
  private faultDebounce: number | null = null;
  private hasSeenOkStatus = false;
  /** Prevents repeated `onImageryFault` until status is OK again or we teleport. */
  private imageryFaultEmitted = false;
  /** Clock for "never loaded OK" UNKNOWN_ERROR grace (new pano / spawn). */
  private panoChangedAt = 0;
  /** Bumps to cancel in-flight heading animations (pans + step blends). */
  private headingMotionGeneration = 0;
  /** True while `runHeadingMotion` drives POV (pans / step blends). */
  private headingMotionInProgress = false;
  private stepInProgress = false;
  /**
   * Wander look float is intentionally handled as a CSS transform on the
   * Street View layer. Calling `setPov` every frame can trigger extra imagery
   * tile churn in Google's viewer; this controller only drives real POV for
   * navigational steps and scripted pans.
   */

  async init(
    container: HTMLElement,
    startCoords: LatLng,
    streetViewStart: StreetViewStartOptions | undefined,
    options: StreetViewControllerOptions,
  ): Promise<LatLng> {
    this.options = options;
    const apiKey = process.env.NEXT_PUBLIC_MAPS_JAVASCRIPT_API_KEY;

    if (!apiKey) {
      throw new Error("NEXT_PUBLIC_MAPS_JAVASCRIPT_API_KEY is not configured.");
    }

    const loader = new Loader({
      apiKey,
      version: "weekly",
    });

    await loader.importLibrary("streetView");
    this.streetViewService = new google.maps.StreetViewService();

    if (streetViewStart) {
      this.currentHeading = streetViewStart.heading;
    } else {
      this.currentHeading = Math.random() * 360;
    }

    const pitch = streetViewStart
      ? streetViewStart.pitch
      : getBotSettings().streetView.pitch;
    const pov = streetViewStart
      ? {
          heading: streetViewStart.heading,
          pitch: streetViewStart.pitch,
        }
      : {
          heading: this.currentHeading,
          pitch,
        };

    const walkableStart = streetViewStart
      ? await this.findWalkablePanoById(streetViewStart.pano, startCoords)
      : await this.findNearbyWalkableOutdoorPano(startCoords);

    if (!walkableStart) {
      throw new Error("No walkable outdoor Street View panorama found near start coordinates.");
    }

    this.panorama = new google.maps.StreetViewPanorama(container, {
      pano: walkableStart.pano,
      pov,
      zoom: 0,
      addressControl: false,
      fullscreenControl: false,
      motionTracking: false,
      motionTrackingControl: false,
      panControl: false,
      zoomControl: false,
      linksControl: false,
      enableCloseButton: false,
      showRoadLabels: false,
      clickToGo: false,
      disableDefaultUI: true,
      scrollwheel: false,
      disableDoubleClickZoom: true,
    });

    this.panoChangedAt = Date.now();

    this.panorama.addListener("status_changed", () => {
      this.scheduleFaultCheck();
    });
    this.panorama.addListener("pano_changed", () => {
      this.panoChangedAt = Date.now();
      this.scheduleFaultCheck();
    });

    return walkableStart.coords;
  }

  /** Street View reports OK — safe to drive POV without spamming failed tile fetches. */
  private isImageryRenderable(): boolean {
    const status = this.panorama?.getStatus?.();
    return status === "OK";
  }

  private scheduleFaultCheck(): void {
    if (this.faultDebounce !== null) {
      window.clearTimeout(this.faultDebounce);
    }
    this.faultDebounce = window.setTimeout(() => {
      this.faultDebounce = null;
      const status = this.panorama?.getStatus?.();
      if (status === undefined) return;

      if (status === "OK") {
        this.hasSeenOkStatus = true;
        this.imageryFaultEmitted = false;
        return;
      }

      if (this.imageryFaultEmitted) return;

      const elapsedOnPano = Date.now() - this.panoChangedAt;

      if (status === "ZERO_RESULTS") {
        this.imageryFaultEmitted = true;
        this.options.onImageryFault?.();
        return;
      }

      if (this.hasSeenOkStatus) {
        this.imageryFaultEmitted = true;
        this.options.onImageryFault?.();
        return;
      }

      if (status === "UNKNOWN_ERROR" && elapsedOnPano >= 3_500) {
        this.imageryFaultEmitted = true;
        this.options.onImageryFault?.();
      }
    }, 200);
  }

  getCoords(): LatLng {
    const position = this.panorama?.getPosition();
    if (!position) return { lat: 0, lng: 0 };
    return { lat: position.lat(), lng: position.lng() };
  }

  getHeading(): number {
    return this.currentHeading;
  }

  /** POV without wander sway — used during scripted pans. */
  private applyNavPovOnly(): void {
    if (!this.panorama || !this.isImageryRenderable()) return;
    const pitch = getBotSettings().streetView.pitch;
    this.panorama.setPov({
      heading: (this.currentHeading + 360) % 360,
      pitch,
    });
  }

  getLinks(): StreetViewLink[] {
    const links = this.panorama?.getLinks() || [];
    return links
      .filter(
        (link): link is google.maps.StreetViewLink =>
          Boolean(link && link.pano),
      )
      .map((link) => ({
        pano: link.pano || "",
        heading: link.heading || 0,
        description: link.description || undefined,
      }));
  }

  async stepForward(): Promise<boolean> {
    if (this.stepInProgress) return false;
    if (!this.panorama || !this.isImageryRenderable()) return false;
    this.stepInProgress = true;
    try {
      const links = this.getLinks();
      if (links.length === 0) {
        await this.nudgeAwayFromDeadEndPanorama();
        return false;
      }

      const sv = getBotSettings().streetView;
      const linkMode = getBotSettings().linkSelectionMode;
      const candidates = this.rankLinks(links, linkMode, sv.wanderHeadingWobble);
      const bestLink = await this.firstWalkableLink(candidates);

      if (!bestLink) {
        await this.nudgeAwayFromDeadEndPanorama();
        return false;
      }

      this.cancelHeadingMotion();
      this.panorama.setPano(bestLink.pano);

      const pov = this.panorama.getPov();
      const fromHeading = pov.heading ?? this.currentHeading;
      const targetHeading = bestLink.heading;

      void this.runHeadingMotion(
        fromHeading,
        targetHeading,
        sv.stepHeadingBlendMs,
        easeInOutQuint,
        () => {
          this.options.onSuccessfulStep?.();
        },
      );
      return true;
    } finally {
      this.stepInProgress = false;
    }
  }

  private rankLinks(
    links: StreetViewLink[],
    linkMode: string,
    wanderHeadingWobble: number,
  ): StreetViewLink[] {
    if (linkMode === "random_link") {
      return [...links].sort(() => Math.random() - 0.5);
    }

    const wobble = linkMode === "straight" ? 0 : wanderHeadingWobble;
    return [...links].sort((a, b) => {
      const aDelta = this.linkHeadingScore(a, wobble);
      const bDelta = this.linkHeadingScore(b, wobble);
      return aDelta - bDelta;
    });
  }

  private linkHeadingScore(link: StreetViewLink, wobble: number): number {
    let delta = Math.abs(link.heading - this.currentHeading);
    if (delta > 180) delta = 360 - delta;
    return delta + (Math.random() - 0.5) * wobble;
  }

  private async firstWalkableLink(
    links: StreetViewLink[],
  ): Promise<StreetViewLink | null> {
    if (!this.streetViewService) return links[0] ?? null;
    for (const link of links) {
      const data = await getWalkablePanoramaById(this.streetViewService, link.pano);
      if (data) return link;
    }
    return null;
  }

  /**
   * User-contributed photospheres often have no outgoing links — jump a short distance so
   * Street View can snap to coverage with walkable links (avoids waiting for stuck-teleport).
   */
  private async nudgeAwayFromDeadEndPanorama(): Promise<void> {
    if (!this.panorama) return;
    const pos = this.panorama.getPosition();
    if (!pos) return;
    const center = { lat: pos.lat(), lng: pos.lng() };
    const next = randomLatLngOffsetMeters(center, 28, 260);
    const walkable = await this.findNearbyWalkableOutdoorPano(next);
    if (!walkable) {
      this.options.onImageryFault?.();
      return;
    }
    this.cancelHeadingMotion();
    this.hasSeenOkStatus = false;
    this.imageryFaultEmitted = false;
    this.panoChangedAt = Date.now();
    this.panorama.setPano(walkable.pano);
    this.currentHeading = Math.random() * 360;
    this.applyNavPovOnly();
  }

  private cancelHeadingMotion(): void {
    this.headingMotionGeneration += 1;
  }

  /**
   * Smoothly rotates POV from `fromHeading` to `targetHeading` (shortest arc).
   * Calls `onSettled` when the motion finishes (including instant zero-duration).
   */
  private runHeadingMotion(
    fromHeading: number,
    targetHeading: number,
    durationMs: number,
    ease: (t: number) => number,
    onSettled?: () => void,
  ): Promise<void> {
    return new Promise((resolve) => {
      if (!this.panorama) {
        onSettled?.();
        resolve();
        return;
      }

      this.headingMotionInProgress = true;
      const gen = this.headingMotionGeneration;
      const delta = shortestAngleDelta(fromHeading, targetHeading);

      if (durationMs <= 0 || Math.abs(delta) < 0.05) {
        this.currentHeading = (targetHeading + 360) % 360;
        this.applyNavPovOnly();
        this.headingMotionInProgress = false;
        onSettled?.();
        resolve();
        return;
      }

      const startTime = performance.now();

      const animate = () => {
        if (gen !== this.headingMotionGeneration) {
          this.headingMotionInProgress = false;
          resolve();
          return;
        }
        if (!this.panorama) {
          this.headingMotionInProgress = false;
          resolve();
          return;
        }
        if (!this.isImageryRenderable()) {
          this.headingMotionInProgress = false;
          onSettled?.();
          resolve();
          return;
        }

        const elapsed = performance.now() - startTime;
        const linearT = Math.min(1, elapsed / durationMs);
        const easedT = ease(linearT);
        this.currentHeading = (fromHeading + delta * easedT + 360) % 360;
        this.applyNavPovOnly();

        if (linearT < 1) {
          requestAnimationFrame(animate);
        } else {
          this.currentHeading = (targetHeading + 360) % 360;
          this.applyNavPovOnly();
          this.headingMotionInProgress = false;
          onSettled?.();
          resolve();
        }
      };

      requestAnimationFrame(animate);
    });
  }

  panToHeading(targetHeading: number, durationMs: number): Promise<void> {
    if (!this.panorama) {
      return Promise.resolve();
    }

    this.cancelHeadingMotion();
    const fromHeading = this.currentHeading;

    return this.runHeadingMotion(fromHeading, targetHeading, durationMs, easeInOutSine);
  }

  async teleportTo(coords: LatLng): Promise<LatLng | null> {
    if (!this.panorama) return null;
    const walkable = await this.findNearbyWalkableOutdoorPano(coords);
    if (!walkable) return null;
    this.cancelHeadingMotion();
    this.hasSeenOkStatus = false;
    this.imageryFaultEmitted = false;
    this.panoChangedAt = Date.now();
    this.panorama.setPano(walkable.pano);
    this.currentHeading = Math.random() * 360;
    this.applyNavPovOnly();
    return walkable.coords;
  }

  private async findNearbyWalkableOutdoorPano(
    coords: LatLng,
  ): Promise<{ pano: string; coords: LatLng } | null> {
    if (!this.streetViewService) return null;

    const attempts = [
      coords,
      ...Array.from({ length: 8 }, () =>
        randomLatLngOffsetMeters(coords, 20, 180),
      ),
    ];

    for (const attempt of attempts) {
      const data = await getWalkableOutdoorPanorama(
        this.streetViewService,
        attempt,
      );
      const pano = data?.location?.pano;
      const latLng = data?.location?.latLng;
      if (pano && latLng) {
        return {
          pano,
          coords: { lat: latLng.lat(), lng: latLng.lng() },
        };
      }
    }

    return null;
  }

  private async findWalkablePanoById(
    pano: string,
    fallbackCoords: LatLng,
  ): Promise<{ pano: string; coords: LatLng } | null> {
    if (!this.streetViewService) return null;
    const data = await getWalkablePanoramaById(this.streetViewService, pano);
    if (!data) return null;
    const latLng = data.location?.latLng;
    return {
      pano,
      coords: latLng
        ? { lat: latLng.lat(), lng: latLng.lng() }
        : fallbackCoords,
    };
  }

  startWalking(intervalMs: number): void {
    if (this.isMoving) return;
    this.isMoving = true;
    void this.stepForward();
    this.moveInterval = window.setInterval(() => {
      void this.stepForward();
    }, intervalMs);
  }

  /** Updates the wander clock without stopping float / moving state. No-op if not walking. */
  setWalkingInterval(intervalMs: number): void {
    if (!this.isMoving) return;
    if (this.moveInterval !== null) {
      window.clearInterval(this.moveInterval);
    }
    this.moveInterval = window.setInterval(() => {
      void this.stepForward();
    }, intervalMs);
  }

  stopWalking(): void {
    this.isMoving = false;
    if (this.moveInterval !== null) {
      window.clearInterval(this.moveInterval);
      this.moveInterval = null;
    }
    this.applyNavPovOnly();
  }

  getContainer(): HTMLElement | null {
    return (
      (this.panorama as unknown as { getDiv?: () => HTMLElement } | null)?.getDiv?.() ||
      null
    );
  }

  sampleCanvasBrightness(): StreetViewCanvasSample {
    try {
      const container = this.getContainer();
      const canvas = container?.querySelector("canvas");
      if (!canvas || canvas.width <= 0 || canvas.height <= 0) {
        return { available: false, reason: "no_canvas" };
      }

      const sampleSize = 8;
      const scratch = document.createElement("canvas");
      scratch.width = sampleSize;
      scratch.height = sampleSize;
      const ctx = scratch.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        return { available: false, reason: "no_2d_context" };
      }

      ctx.drawImage(canvas, 0, 0, sampleSize, sampleSize);
      const { data } = ctx.getImageData(0, 0, sampleSize, sampleSize);
      let total = 0;
      for (let i = 0; i < data.length; i += 4) {
        total += (data[i]! + data[i + 1]! + data[i + 2]!) / 3;
      }

      return {
        available: true,
        brightness: total / (data.length / 4),
        width: canvas.width,
        height: canvas.height,
      };
    } catch (error) {
      const reason =
        typeof DOMException !== "undefined" &&
        error instanceof DOMException &&
        error.name
          ? error.name
          : "sample_failed";
      return { available: false, reason };
    }
  }

  destroy(): void {
    this.cancelHeadingMotion();
    this.stopWalking();
    if (this.faultDebounce !== null) {
      window.clearTimeout(this.faultDebounce);
      this.faultDebounce = null;
    }
    this.panorama = null;
  }
}
