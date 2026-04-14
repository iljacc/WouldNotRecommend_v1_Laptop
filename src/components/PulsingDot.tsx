"use client";

import { PULSING_DOT } from "@/lib/config";
import type { BotMode } from "@/lib/types";

interface Props {
  mode: BotMode;
}

export function PulsingDot({ mode }: Props) {
  const cycle =
    mode === "Searching"
      ? PULSING_DOT.SEARCHING_CYCLE
      : PULSING_DOT.PROCESSING_CYCLE;

  return (
    <div
      aria-hidden="true"
      className="shrink-0 rounded-full bg-white"
      style={{
        width: PULSING_DOT.SIZE,
        height: PULSING_DOT.SIZE,
        animation: `pulse ${cycle}ms ease-in-out infinite`,
      }}
    />
  );
}
