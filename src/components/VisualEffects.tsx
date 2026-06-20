"use client";

import type { CSSProperties } from "react";
import { TIMING, VISUAL } from "@/lib/config";
import type { BotStreetViewSettings } from "@/lib/bot-settings";
import { BotState, type TeleportPhase } from "@/lib/types";

interface Props {
  teleportPhase: TeleportPhase;
}

const GRADING_KEYS = VISUAL.COLOR_GRADING;

const TELEPORT_BLUR_PX = 14;

export function getStreetViewEffectStyle(
  botState: BotState,
  teleportPhase: TeleportPhase = "none",
  streetView?: BotStreetViewSettings,
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

  const floatEnabled = Boolean(streetView?.wanderLookFloatEnabled);
  const intensity = botState === BotState.WANDER ? 1 : 0.35;
  const drift = Math.max(0.01, streetView?.wanderLookDrift ?? 0.38);
  const sway = Math.max(0, streetView?.wanderLookSwayDeg ?? 0);
  const pitchSway = Math.max(0, streetView?.wanderLookPitchSwayDeg ?? 0);
  const xPx = Math.min(54, sway * 3.8) * intensity;
  const yPx = Math.min(28, pitchSway * 10) * intensity;
  const rotateDeg = Math.min(1.05, sway * 0.075) * intensity;
  const durationSec = Math.min(34, Math.max(12, 10 / drift));
  // The floor covers default drift on small kiosks; extra padding follows tuned amplitude.
  const amplitudePadding =
    xPx * 0.00175 + yPx * 0.00175 + rotateDeg * 0.012;
  const scale = 1 + Math.max(0.03, amplitudePadding);

  const style: CSSProperties & Record<`--${string}`, string | number> = {
    filter,
    transform: floatEnabled ? undefined : "scale(1)",
    transition: `${filterTransition}, transform 500ms ease`,
    transformOrigin: "center center",
    animation: floatEnabled
      ? `wander-look-float ${durationSec}s ease-in-out infinite`
      : "none",
    willChange: floatEnabled ? "transform, filter" : "filter",
    "--wander-float-x": `${xPx.toFixed(2)}px`,
    "--wander-float-y": `${yPx.toFixed(2)}px`,
    "--wander-float-rotate": `${rotateDeg.toFixed(3)}deg`,
    "--wander-float-scale": scale.toFixed(4),
  };

  return style;
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
