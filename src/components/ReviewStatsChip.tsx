"use client";

import { HudChip } from "./HudChip";

interface Props {
  reviewsToday: number | null;
  lifetimeTotal: number | null;
}

/** Today (local calendar day) + lifetime total, e.g. Reviews 12 (1,234). */
export function ReviewStatsChip({ reviewsToday, lifetimeTotal }: Props) {
  return (
    <HudChip>
      <span className="text-xs font-medium tabular-nums leading-none">
        <span className="text-white/55">Reviews </span>
        <span className="text-white/85">
          {reviewsToday === null ? "—" : reviewsToday}
        </span>
        <span className="text-white/55"> (</span>
        <span className="text-white/85">
          {lifetimeTotal === null ? "—" : lifetimeTotal.toLocaleString()}
        </span>
        <span className="text-white/55">)</span>
      </span>
    </HudChip>
  );
}
