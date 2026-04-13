"use client";

import { Loader } from "@googlemaps/js-api-loader";
import { STREET_VIEW } from "@/lib/config";
import type { LatLng, StreetViewLink } from "@/lib/types";

export type StreetViewStartOptions = {
  pano: string;
  heading: number;
  pitch: number;
};

export class StreetViewController {
  private panorama: google.maps.StreetViewPanorama | null = null;
  private currentHeading = 0;
  private isMoving = false;
  private moveInterval: number | null = null;

  async init(
    container: HTMLElement,
    startCoords: LatLng,
    streetViewStart?: StreetViewStartOptions,
  ): Promise<void> {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
      throw new Error("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not configured.");
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

    const pov = streetViewStart
      ? {
          heading: streetViewStart.heading,
          pitch: streetViewStart.pitch,
        }
      : {
          heading: this.currentHeading,
          pitch: STREET_VIEW.PITCH,
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
  }

  getCoords(): LatLng {
    const position = this.panorama?.getPosition();
    if (!position) return { lat: 0, lng: 0 };
    return { lat: position.lat(), lng: position.lng() };
  }

  getHeading(): number {
    return this.currentHeading;
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
    if (!this.panorama) return false;
    const links = this.getLinks();
    if (links.length === 0) return false;

    let bestLink = links[0];
    let bestDelta = Number.POSITIVE_INFINITY;

    for (const link of links) {
      let delta = Math.abs(link.heading - this.currentHeading);
      if (delta > 180) delta = 360 - delta;
      delta += (Math.random() - 0.5) * STREET_VIEW.WANDER_HEADING_WOBBLE;
      if (delta < bestDelta) {
        bestDelta = delta;
        bestLink = link;
      }
    }

    this.panorama.setPano(bestLink.pano);
    this.currentHeading = bestLink.heading;
    this.panorama.setPov({
      heading: this.currentHeading,
      pitch: STREET_VIEW.PITCH,
    });

    return true;
  }

  panToHeading(targetHeading: number, durationMs: number): Promise<void> {
    return new Promise((resolve) => {
      if (!this.panorama) {
        resolve();
        return;
      }

      const startHeading = this.currentHeading;
      let delta = targetHeading - startHeading;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      const startTime = performance.now();

      const animate = () => {
        const elapsed = performance.now() - startTime;
        const progress = Math.min(1, elapsed / durationMs);
        const eased =
          progress < 0.5
            ? 2 * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 2) / 2;

        this.currentHeading = (startHeading + delta * eased + 360) % 360;
        this.panorama?.setPov({
          heading: this.currentHeading,
          pitch: STREET_VIEW.PITCH,
        });

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          this.currentHeading = (targetHeading + 360) % 360;
          resolve();
        }
      };

      requestAnimationFrame(animate);
    });
  }

  teleportTo(coords: LatLng): void {
    if (!this.panorama) return;
    this.panorama.setPosition(coords);
    this.currentHeading = Math.random() * 360;
    this.panorama.setPov({
      heading: this.currentHeading,
      pitch: STREET_VIEW.PITCH,
    });
  }

  startWalking(intervalMs: number): void {
    if (this.isMoving) return;
    this.isMoving = true;
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
  }

  getContainer(): HTMLElement | null {
    return (
      (this.panorama as unknown as { getDiv?: () => HTMLElement } | null)?.getDiv?.() ||
      null
    );
  }

  destroy(): void {
    this.stopWalking();
    this.panorama = null;
  }
}
