"use client";

import { PULSING_DOT } from "@/lib/config";
import { BotState, type BotMode } from "@/lib/types";

interface Props {
  mode: BotMode;
  state: BotState;
  /** Purple ellipsis pulse only for scheduled city-tour teleports. */
  cityTourTeleportBlink: boolean;
}

/** Magnifier only while wandering; lines during TTS; ellipsis (…) for DETECT / RETURN / TELEPORT / etc. */
function glyphKind(state: BotState): "search" | "text" | "dot" {
  if (state === BotState.WANDER) return "search";
  if (state === BotState.DELIVER) return "text";
  return "dot";
}

function MagnifierGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className="h-full w-full"
      aria-hidden
    >
      <circle
        cx="10.5"
        cy="10.5"
        r="5.5"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M15.2 15.2 21 21"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function TextGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className="h-full w-full"
      aria-hidden
    >
      <path
        d="M4 7h16M4 12h16M4 17h11"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Horizontal ellipsis for DETECT / RETURN / TELEPORT / etc. */
function EllipsisGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className="h-full w-full"
      aria-hidden
    >
      <circle cx="6" cy="12" r="2.25" fill="currentColor" />
      <circle cx="12" cy="12" r="2.25" fill="currentColor" />
      <circle cx="18" cy="12" r="2.25" fill="currentColor" />
    </svg>
  );
}

export function ModePulseGlyph({ mode, state, cityTourTeleportBlink }: Props) {
  const kind = cityTourTeleportBlink ? "dot" : glyphKind(state);
  const cycle =
    cityTourTeleportBlink
      ? 5_000
      : kind === "search"
        ? PULSING_DOT.SEARCHING_CYCLE
        : kind === "text"
          ? PULSING_DOT.PROCESSING_CYCLE
          : mode === "Searching"
            ? PULSING_DOT.SEARCHING_CYCLE
            : PULSING_DOT.PROCESSING_CYCLE;

  return (
    <div
      aria-hidden
      data-mode-pulse-glyph
      className={`flex shrink-0 items-center justify-center will-change-[transform,opacity] ${
        state === BotState.DELIVER
          ? "text-current"
          : cityTourTeleportBlink
            ? "text-violet-400"
            : "text-white"
      }`}
      style={{
        width: PULSING_DOT.SIZE,
        height: PULSING_DOT.SIZE,
        animation: `pulse ${cycle}ms ease-in-out infinite`,
      }}
    >
      {kind === "search" ? (
        <MagnifierGlyph />
      ) : kind === "text" ? (
        <TextGlyph />
      ) : (
        <EllipsisGlyph />
      )}
    </div>
  );
}
