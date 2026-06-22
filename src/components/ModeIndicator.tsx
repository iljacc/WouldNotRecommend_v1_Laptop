"use client";

import type { BotMode } from "@/lib/types";

interface Props {
  mode: BotMode;
  /** Scheduled city-tour hop only — replaces Searching/Processing entirely. */
  showCityTourTeleport: boolean;
}

const MODES: BotMode[] = ["Searching", "Processing"];

export function ModeIndicator({ mode, showCityTourTeleport }: Props) {
  if (showCityTourTeleport) {
    return (
      <span
        className="relative inline-grid min-h-[1.15em] min-w-[12ch] place-items-center text-center"
        aria-live="polite"
      >
        <span className="col-start-1 row-start-1 text-3xl font-medium tabular-nums leading-none text-violet-400 teleport-mode-flash">
          Teleporting
        </span>
      </span>
    );
  }

  return (
    <span
      className="relative inline-grid min-h-[1.15em] min-w-[12ch] place-items-center text-center"
      aria-live="polite"
    >
      {MODES.map((m) => (
        <span
          key={m}
          aria-hidden={mode !== m}
          className={`col-start-1 row-start-1 text-3xl font-medium tabular-nums leading-none transition-opacity duration-500 ease-in-out ${
            m === "Searching" ? "text-yellow-400" : "text-green-400"
          } ${mode === m ? "z-[1] opacity-100" : "z-0 opacity-0"}`}
        >
          {m}
        </span>
      ))}
    </span>
  );
}
