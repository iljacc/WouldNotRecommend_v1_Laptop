"use client";

import type { BotMode } from "@/lib/types";

interface Props {
  mode: BotMode;
}

export function ModeIndicator({ mode }: Props) {
  const color =
    mode === "Searching" ? "text-yellow-400" : "text-green-400";
  return (
    <span className={`text-3xl font-medium tabular-nums leading-none ${color}`}>
      {mode}
    </span>
  );
}
