"use client";

import { useEffect } from "react";
import { CctvOverlayLayer } from "@/components/CctvOverlayLayer";
import { HUD } from "@/components/HUD";
import { StreetViewCanvas } from "@/components/StreetViewCanvas";
import {
  getStreetViewEffectStyle,
  VisualEffects,
} from "@/components/VisualEffects";
import { useBot } from "@/hooks/useBot";

const KIOSK_MODE = process.env.NEXT_PUBLIC_KIOSK_MODE === "true";

export default function BotPage() {
  const {
    containerRef,
    uiState,
    reviewsToday,
    lifetimeReviewsTotal,
    subtitle,
    isStarted,
    error,
    startBot,
  } = useBot();

  useEffect(() => {
    if (!KIOSK_MODE || isStarted) return;

    const timer = window.setTimeout(() => {
      void startBot();
    }, 1_000);

    return () => window.clearTimeout(timer);
  }, [isStarted, startBot]);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-black font-mono">
      <div
        className="absolute inset-0 h-full w-full"
        style={getStreetViewEffectStyle(uiState.state)}
      >
        <StreetViewCanvas ref={containerRef} />
      </div>

      <CctvOverlayLayer />

      <HUD
        mode={uiState.mode}
        botState={uiState.state}
        coords={uiState.coords}
        city={uiState.city}
        reviewsToday={reviewsToday}
        lifetimeReviewsTotal={lifetimeReviewsTotal}
        sessionStartTime={uiState.sessionStartTime}
        subtitle={subtitle}
      />

      <VisualEffects teleportPhase={uiState.teleportPhase} />

      {!isStarted && !KIOSK_MODE && (
        <button
          type="button"
          onClick={() => {
            void startBot();
          }}
          className="absolute inset-0 z-50 flex h-full w-full cursor-pointer items-center justify-center bg-black text-sm text-white/40 transition-colors hover:text-white/70"
        >
          {error || "Click to start"}
        </button>
      )}
    </main>
  );
}
