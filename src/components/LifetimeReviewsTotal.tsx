"use client";

import { HudChip } from "./HudChip";

interface Props {
  total: number | null;
}

export function LifetimeReviewsTotal({ total }: Props) {
  return (
    <HudChip className="justify-end">
      <span className="text-3xl font-medium tabular-nums leading-none">
        <span className="text-white/55">Processed: </span>
        <span className="text-white/85">
          {total === null ? "—" : total.toLocaleString()}
        </span>
      </span>
    </HudChip>
  );
}
