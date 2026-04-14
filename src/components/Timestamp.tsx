"use client";

import { useEffect, useState } from "react";
import { HudChip } from "./HudChip";

interface Props {
  startTime: number;
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

export function Timestamp({ startTime }: Props) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const update = () => setElapsed(Date.now() - startTime);
    update();
    const interval = window.setInterval(update, 1_000);
    return () => window.clearInterval(interval);
  }, [startTime]);

  return (
    <HudChip>
      <span className="text-xs text-white/60 tabular-nums">
        {formatElapsed(elapsed)}
      </span>
    </HudChip>
  );
}
