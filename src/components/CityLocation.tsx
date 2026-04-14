"use client";

import { HudChip } from "./HudChip";

interface Props {
  city: string;
}

export function CityLocation({ city }: Props) {
  return (
    <HudChip className="min-w-0 max-w-[min(46vw,100%)]">
      <span className="truncate text-xs text-white/60">{city}</span>
    </HudChip>
  );
}
