"use client";

import { HudChip } from "./HudChip";

interface Props {
  reviewsToday: number | null;
  lifetimeTotal: number | null;
  celebrate: boolean;
}

/** Today (local calendar day) + lifetime total, e.g. Reviews 12 (1,234). */
export function ReviewStatsChip({ reviewsToday, lifetimeTotal, celebrate }: Props) {
  return (
    <HudChip className="relative overflow-visible">
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
      {celebrate && (
        <span className="review-counter-celebration" aria-hidden>
          {Array.from({ length: 6 }, (_, index) => (
            <span key={index} className="review-counter-sparkle" data-review-sparkle />
          ))}
          <span className="review-counter-shimmer-clip">
            <span className="review-counter-shimmer" />
          </span>
        </span>
      )}
    </HudChip>
  );
}
