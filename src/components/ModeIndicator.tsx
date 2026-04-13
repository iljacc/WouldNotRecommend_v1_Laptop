"use client";

import type { BotMode } from "@/lib/types";

interface Props {
  mode: BotMode;
}

export function ModeIndicator({ mode }: Props) {
  return <span className="text-xs text-white/60">{mode}</span>;
}
