"use client";

import type { BotMode, BotState, LatLng, TtsSubtitlePayload } from "@/lib/types";
import { CityLocation } from "./CityLocation";
import { Coordinates } from "./Coordinates";
import { HudChip } from "./HudChip";
import { ModeIndicator } from "./ModeIndicator";
import { ModePulseGlyph } from "./ModePulseGlyph";
import { ReviewStatsChip } from "./ReviewStatsChip";
import { Timestamp } from "./Timestamp";
import { TtsSubtitles } from "./TtsSubtitles";

interface Props {
  mode: BotMode;
  botState: BotState;
  coords: LatLng;
  city: string;
  reviewsToday: number | null;
  lifetimeReviewsTotal: number | null;
  sessionStartTime: number;
  subtitle: TtsSubtitlePayload | null;
}

export function HUD({
  mode,
  botState,
  coords,
  city,
  reviewsToday,
  lifetimeReviewsTotal,
  sessionStartTime,
  subtitle,
}: Props) {
  return (
    <div className="pointer-events-none absolute inset-0 z-[38] font-mono">
      <div className="absolute top-6 left-6 sm:top-8 sm:left-8">
        <ReviewStatsChip
          reviewsToday={reviewsToday}
          lifetimeTotal={lifetimeReviewsTotal}
        />
      </div>

      <div className="absolute top-6 right-6 flex max-w-[min(52vw,calc(100%-3rem))] flex-col items-end gap-1.5 text-right sm:top-8 sm:right-8">
        <Coordinates coords={coords} />
        <HudChip className="inline-flex w-fit max-w-full min-w-0 justify-end">
          <div className="flex min-w-0 max-w-full items-center justify-end gap-1">
            <CityLocation city={city} bare />
            <span className="shrink-0 text-xs text-white/60">, </span>
            <Timestamp startTime={sessionStartTime} bare />
          </div>
        </HudChip>
      </div>

      <div className="absolute bottom-6 right-6 sm:bottom-8 sm:right-8">
        <HudChip>
          <div className="flex items-center gap-2.5">
            <ModePulseGlyph mode={mode} state={botState} />
            <ModeIndicator mode={mode} />
          </div>
        </HudChip>
      </div>

      <TtsSubtitles subtitle={subtitle} />
    </div>
  );
}
