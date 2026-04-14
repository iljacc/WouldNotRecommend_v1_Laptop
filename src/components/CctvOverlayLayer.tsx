"use client";

import { useEffect, useRef } from "react";
import { mountCctvOverlay } from "@/lib/cctv-overlay-mount";
import { BOT_PAGE } from "@/lib/config";

/**
 * Experimental Three.js layer between GSV and HUD. Disabled unless
 * `NEXT_PUBLIC_BOT_CCTV_OVERLAY=true` (see `BOT_PAGE.CCTV_OVERLAY_ENABLED`).
 */
export function CctvOverlayLayer() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!BOT_PAGE.CCTV_OVERLAY_ENABLED) return;
    const el = containerRef.current;
    if (!el) return;
    return mountCctvOverlay(el);
  }, []);

  if (!BOT_PAGE.CCTV_OVERLAY_ENABLED) return null;

  return (
    <div
      ref={containerRef}
      className="pointer-events-none absolute inset-0 z-20 overflow-hidden"
      style={{ opacity: BOT_PAGE.CCTV_OVERLAY_LAYER_OPACITY }}
      aria-hidden
    />
  );
}
