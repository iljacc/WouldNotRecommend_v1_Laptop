"use client";

import { Loader } from "@googlemaps/js-api-loader";
import { getBotSettings } from "@/lib/bot-settings";
import type { LatLng, StreetViewLink } from "@/lib/types";
import { randomLatLngOffsetMeters } from "@/lib/wander-geo";

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

export class StreetViewController {
  private panorama: google.maps.StreetViewPanorama | null = null;
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
  ): Promise<void> {
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

    this.panorama = new google.maps.StreetViewPanorama(container, {
      ...(streetViewStart
        ? { pano: streetViewStart.pano }
        : { position: startCoords }),
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

  stepForward(): boolean {
    if (!this.panorama || !this.isImageryRenderable()) return false;
    const links = this.getLinks();
    if (links.length === 0) {
      this.nudgeAwayFromDeadEndPanorama();
      return false;
    }

    const sv = getBotSettings().streetView;
    const linkMode = getBotSettings().linkSelectionMode;
    let bestLink = links[0];

    if (linkMode === "random_link") {
      bestLink = links[Math.floor(Math.random() * links.length)];
    } else {
      const wobble =
        linkMode === "straight" ? 0 : sv.wanderHeadingWobble;
      let bestDelta = Number.POSITIVE_INFINITY;
      for (const link of links) {
        let delta = Math.abs(link.heading - this.currentHeading);
        if (delta > 180) delta = 360 - delta;
        delta += (Math.random() - 0.5) * wobble;
        if (delta < bestDelta) {
          bestDelta = delta;
          bestLink = link;
        }
      }
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
  }

  /**
   * User-contributed photospheres often have no outgoing links — jump a short distance so
   * Street View can snap to coverage with walkable links (avoids waiting for stuck-teleport).
   */
  private nudgeAwayFromDeadEndPanorama(): void {
    if (!this.panorama) return;
    const pos = this.panorama.getPosition();
    if (!pos) return;
    const center = { lat: pos.lat(), lng: pos.lng() };
    const next = randomLatLngOffsetMeters(center, 28, 260);
    this.cancelHeadingMotion();
    this.hasSeenOkStatus = false;
    this.imageryFaultEmitted = false;
    this.panoChangedAt = Date.now();
    this.panorama.setPosition(next);
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

    return this.runHeadingMotion(fromHeading, targetHeading, durationMs, easeInOutQuint);
  }

  teleportTo(coords: LatLng): void {
    if (!this.panorama) return;
    this.cancelHeadingMotion();
    this.hasSeenOkStatus = false;
    this.imageryFaultEmitted = false;
    this.panoChangedAt = Date.now();
    this.panorama.setPosition(coords);
    this.currentHeading = Math.random() * 360;
    this.applyNavPovOnly();
  }

  startWalking(intervalMs: number): void {
    if (this.isMoving) return;
    this.isMoving = true;
    this.moveInterval = window.setInterval(() => {
      this.stepForward();
    }, intervalMs);
  }

  /** Updates the wander clock without stopping float / moving state. No-op if not walking. */
  setWalkingInterval(intervalMs: number): void {
    if (!this.isMoving) return;
    if (this.moveInterval !== null) {
      window.clearInterval(this.moveInterval);
    }
    this.moveInterval = window.setInterval(() => {
      this.stepForward();
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
