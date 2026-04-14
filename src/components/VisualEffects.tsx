"use client";

import type { CSSProperties } from "react";
import { VISUAL } from "@/lib/config";
import { BotState, type TeleportPhase } from "@/lib/types";

interface Props {
  teleportPhase: TeleportPhase;
}

const GRADING_KEYS = VISUAL.COLOR_GRADING;

export function getStreetViewEffectStyle(botState: BotState): CSSProperties {
  const grading =
    GRADING_KEYS[botState as keyof typeof GRADING_KEYS] ?? GRADING_KEYS.WANDER;

  return {
    filter: `brightness(${grading.brightness}) saturate(${grading.saturate}) hue-rotate(${grading.hueRotate}deg)`,
    transform: "scale(1)",
    transition: `filter ${VISUAL.COLOR_TRANSITION}ms ease, transform 500ms ease`,
    transformOrigin: "center center",
  };
}

export function VisualEffects({ teleportPhase }: Props) {
  /** Light dim only — never a full black frame. */
  const opacity =
    teleportPhase === "fade-out"
      ? 0.12
      : teleportPhase === "warp"
        ? 0.08
        : teleportPhase === "fade-in"
          ? 0.12
          : 0;
  const transition =
    teleportPhase === "fade-out"
      ? "opacity 600ms ease-in"
      : teleportPhase === "fade-in"
        ? "opacity 600ms ease-out"
        : teleportPhase === "warp"
          ? "opacity 120ms linear"
          : "none";

  return (
    <div
      className="pointer-events-none absolute inset-0 z-30 bg-black"
      style={{ opacity, transition }}
    />
  );
}
