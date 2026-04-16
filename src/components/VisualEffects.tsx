"use client";

import type { CSSProperties } from "react";
import { TIMING, VISUAL } from "@/lib/config";
import { BotState, type TeleportPhase } from "@/lib/types";

interface Props {
  teleportPhase: TeleportPhase;
}

const GRADING_KEYS = VISUAL.COLOR_GRADING;

const TELEPORT_BLUR_PX = 14;

export function getStreetViewEffectStyle(
  botState: BotState,
  teleportPhase: TeleportPhase = "none",
): CSSProperties {
  const grading =
    GRADING_KEYS[botState as keyof typeof GRADING_KEYS] ?? GRADING_KEYS.WANDER;

  const blurPx =
    teleportPhase === "none" || teleportPhase === "fade-in"
      ? 0
      : TELEPORT_BLUR_PX;

  const filter = `brightness(${grading.brightness}) saturate(${grading.saturate}) hue-rotate(${grading.hueRotate}deg) blur(${blurPx}px)`;

  const teleporting = teleportPhase !== "none";
  const filterTransition = teleporting
    ? teleportPhase === "fade-out"
      ? `filter ${TIMING.TELEPORT_FADE_OUT}ms ease-in`
      : teleportPhase === "fade-in"
        ? `filter ${TIMING.TELEPORT_FADE_IN}ms ease-out`
        : `filter 120ms linear`
    : `filter ${VISUAL.COLOR_TRANSITION}ms ease`;

  return {
    filter,
    transform: "scale(1)",
    transition: `${filterTransition}, transform 500ms ease`,
    transformOrigin: "center center",
  };
}

export function VisualEffects({ teleportPhase }: Props) {
  const opacity =
    teleportPhase === "none"
      ? 0
      : teleportPhase === "fade-out"
        ? 0.88
        : teleportPhase === "warp"
          ? 0.94
          : 0;
  const transition =
    teleportPhase === "none"
      ? "none"
      : teleportPhase === "fade-out"
        ? `opacity ${TIMING.TELEPORT_FADE_OUT}ms ease-in`
        : teleportPhase === "fade-in"
          ? `opacity ${TIMING.TELEPORT_FADE_IN}ms ease-out`
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
