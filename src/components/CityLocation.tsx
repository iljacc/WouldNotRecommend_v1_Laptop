"use client";

import { HudChip } from "./HudChip";

interface Props {
  city: string;
  /** Omit the pill wrapper (e.g. city + time on one row). */
  bare?: boolean;
}

export function CityLocation({ city, bare }: Props) {
  if (bare) {
    return (
      <span className="min-w-0 flex-1 truncate text-xs text-white/60">{city}</span>
    );
  }

  return (
    <HudChip className="min-w-0 max-w-[min(46vw,100%)]">
      <span className="min-w-0 truncate text-xs text-white/60">{city}</span>
    </HudChip>
  );
}
