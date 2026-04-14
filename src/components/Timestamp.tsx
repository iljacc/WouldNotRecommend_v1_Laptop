"use client";

import { useEffect, useState } from "react";
import { HudChip } from "./HudChip";

interface Props {
  startTime: number;
  /** Omit the pill wrapper (e.g. city + time on one row). */
  bare?: boolean;
}

function formatElapsed(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

export function Timestamp({ startTime, bare }: Props) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const update = () => setElapsed(Date.now() - startTime);
    update();
    const interval = window.setInterval(update, 1_000);
    return () => window.clearInterval(interval);
  }, [startTime]);

  const inner = (
    <span className="shrink-0 text-xs text-white/60 tabular-nums">
      {formatElapsed(elapsed)}
    </span>
  );

  if (bare) return inner;

  return <HudChip>{inner}</HudChip>;
}
