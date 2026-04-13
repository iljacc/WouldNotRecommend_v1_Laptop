"use client";

import type { CSSProperties } from "react";
import { VISUAL } from "@/lib/config";
import { BotState, type TeleportPhase } from "@/lib/types";

interface Props {
  teleportPhase: TeleportPhase;
}

export function getStreetViewEffectStyle(botState: BotState): CSSProperties {
  const grading = VISUAL.COLOR_GRADING[botState] || VISUAL.COLOR_GRADING.WANDER;
  const isLingering = botState === BotState.LINGER;

  return {
    filter: `brightness(${grading.brightness}) saturate(${grading.saturate}) hue-rotate(${grading.hueRotate}deg)`,
    transform: `scale(${isLingering ? VISUAL.LINGER_ZOOM : 1})`,
    transition: `filter ${VISUAL.COLOR_TRANSITION}ms ease, transform ${
      isLingering ? 3000 : 500
    }ms ease`,
    transformOrigin: "center center",
  };
}

export function VisualEffects({ teleportPhase }: Props) {
  const opacity =
    teleportPhase === "fade-out" || teleportPhase === "black" ? 1 : 0;
  const transition =
    teleportPhase === "fade-out"
      ? "opacity 800ms ease-in"
      : teleportPhase === "fade-in"
        ? "opacity 800ms ease-out"
        : "none";

  return (
    <div
      className="pointer-events-none absolute inset-0 z-30 bg-black"
      style={{ opacity, transition }}
    />
  );
}
