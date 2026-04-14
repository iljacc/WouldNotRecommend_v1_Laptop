"use client";

import { HudChip } from "./HudChip";

interface Props {
  count: number;
}

/** Session review count — styled like `LifetimeReviewsTotal` (“Processed”). */
export function SessionCounter({ count }: Props) {
  return (
    <HudChip>
      <span className="text-3xl font-medium tabular-nums leading-none">
        <span className="text-white/55">Reviews: </span>
        <span className="text-white/85">{count}</span>
      </span>
    </HudChip>
  );
}
