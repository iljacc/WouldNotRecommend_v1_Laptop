"use client";

import type { BotMode, LatLng } from "@/lib/types";
import { CityLocation } from "./CityLocation";
import { Coordinates } from "./Coordinates";
import { HudChip } from "./HudChip";
import { LifetimeReviewsTotal } from "./LifetimeReviewsTotal";
import { ModeIndicator } from "./ModeIndicator";
import { PulsingDot } from "./PulsingDot";
import { SessionCounter } from "./SessionCounter";
import { Timestamp } from "./Timestamp";

interface Props {
  mode: BotMode;
  coords: LatLng;
  city: string;
  reviewCount: number;
  lifetimeReviewsTotal: number | null;
  sessionStartTime: number;
}

export function HUD({
  mode,
  coords,
  city,
  reviewCount,
  lifetimeReviewsTotal,
  sessionStartTime,
}: Props) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 font-mono">
      <div className="absolute top-6 left-6 sm:top-8 sm:left-8">
        <SessionCounter count={reviewCount} />
      </div>

      <div className="absolute top-6 right-6 sm:top-8 sm:right-8">
        <LifetimeReviewsTotal total={lifetimeReviewsTotal} />
      </div>

      <div className="absolute bottom-6 left-6 flex flex-col items-start gap-1.5 text-left sm:bottom-8 sm:left-8">
        <HudChip>
          <div className="flex items-center gap-2.5">
            <PulsingDot mode={mode} />
            <ModeIndicator mode={mode} />
          </div>
        </HudChip>
      </div>

      <div className="absolute bottom-6 right-6 flex max-w-[52vw] flex-col items-end gap-1.5 text-right sm:bottom-8 sm:right-8">
        <Coordinates coords={coords} />
        <CityLocation city={city} />
        <Timestamp startTime={sessionStartTime} />
      </div>
    </div>
  );
}
