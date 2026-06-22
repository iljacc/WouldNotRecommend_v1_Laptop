"use client";

import { useEffect, useState } from "react";
import { CctvOverlayLayer } from "@/components/CctvOverlayLayer";
import { HUD } from "@/components/HUD";
import { StreetViewCanvas } from "@/components/StreetViewCanvas";
import {
  getStreetViewEffectStyle,
  VisualEffects,
} from "@/components/VisualEffects";
import { useBot } from "@/hooks/useBot";
import { useRuntimeEnvironmentMonitor } from "@/hooks/useRuntimeEnvironmentMonitor";
import { useScreenWakeLock } from "@/hooks/useScreenWakeLock";
import {
  createDefaultBotSettings,
  type BotStreetViewSettings,
} from "@/lib/bot-settings";

const KIOSK_MODE = process.env.NEXT_PUBLIC_KIOSK_MODE === "true";

/** Shown behind Street View whenever the pano is not painting (loading, gaps, etc.). */
const SV_FALLBACK_BG = "/connection-lost-bg.png";

export default function BotPage() {
  const [streetViewSettings] =
    useState<BotStreetViewSettings>(() => createDefaultBotSettings().streetView);
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
  useRuntimeEnvironmentMonitor(isStarted);
  useScreenWakeLock(isStarted);

  useEffect(() => {
    if (!KIOSK_MODE || isStarted) return;

    const timer = window.setTimeout(() => {
      void startBot();
    }, 1_000);

    return () => window.clearTimeout(timer);
  }, [isStarted, startBot]);

  return (
    <main className="relative h-screen w-screen overflow-hidden font-mono">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 bg-[#dcdcdc] bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${SV_FALLBACK_BG})` }}
      />
      <div
        className="street-view-breathing absolute inset-0 z-[1] h-full w-full"
        style={getStreetViewEffectStyle(
          uiState.state,
          uiState.teleportPhase,
          streetViewSettings,
        )}
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
        cityTourSegmentEndTime={uiState.cityTourSegmentEndTime}
        nextCityLabel={uiState.nextCityLabel}
        cityTourActive={uiState.cityTourActive}
        scheduledCityTeleportUi={uiState.scheduledCityTeleportUi}
      />

      <VisualEffects teleportPhase={uiState.teleportPhase} />

      {!isStarted && !KIOSK_MODE && (
        <button
          type="button"
          onClick={() => {
            void startBot();
          }}
          className="absolute inset-0 z-50 flex h-full w-full cursor-pointer items-center justify-center bg-transparent text-sm text-neutral-700/90 shadow-[0_1px_12px_rgba(255,255,255,0.85)] transition-colors hover:text-neutral-900"
        >
          {error || "Click to start"}
        </button>
      )}
    </main>
  );
}
