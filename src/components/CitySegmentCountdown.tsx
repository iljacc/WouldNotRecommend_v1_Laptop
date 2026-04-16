"use client";

import { useEffect, useState } from "react";

interface Props {
  /** Epoch ms when the current city segment ends. */
  segmentEndTime: number;
}

function formatRemaining(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m.toString().padStart(2, "0")}:${r.toString().padStart(2, "0")}`;
}

export function CitySegmentCountdown({ segmentEndTime }: Props) {
  const [remainingMs, setRemainingMs] = useState(0);

  useEffect(() => {
    const tick = () =>
      setRemainingMs(Math.max(0, segmentEndTime - Date.now()));
    tick();
    const id = window.setInterval(tick, 1_000);
    return () => window.clearInterval(id);
  }, [segmentEndTime]);

  return (
    <span className="shrink-0 text-xs text-white/60 tabular-nums">
      {formatRemaining(remainingMs)}
    </span>
  );
}
