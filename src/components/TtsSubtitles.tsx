"use client";

import { useEffect, useState } from "react";
import { SUBTITLE_TIMING } from "@/lib/config";
import type { TtsSubtitlePayload } from "@/lib/types";

interface Props {
  subtitle: TtsSubtitlePayload | null;
}

/**
 * Bottom-center narration: text with per-line “highlighter” strips (`bg-black/55` like `HudChip`),
 * not a full bounding card — avoids overlapping the bottom-right mode chip on small viewports.
 * After the typewriter catches up, text lingers then fades (see SUBTITLE_TIMING; bot clears after fade).
 */
export function TtsSubtitles({ subtitle }: Props) {
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    if (!subtitle) {
      setFadeOut(false);
      return;
    }
    const complete =
      subtitle.fullText.length > 0 &&
      subtitle.revealed >= subtitle.fullText.length;
    if (!complete) {
      setFadeOut(false);
      return;
    }
    setFadeOut(false);
    const id = window.setTimeout(
      () => setFadeOut(true),
      SUBTITLE_TIMING.LINGER_AFTER_COMPLETE_MS,
    );
    return () => window.clearTimeout(id);
  }, [subtitle?.fullText, subtitle?.revealed]);

  if (!subtitle) return null;

  const visible = subtitle.fullText.slice(0, subtitle.revealed);
  const typing = subtitle.revealed < subtitle.fullText.length;

  return (
    <div
      aria-live="polite"
      className={`pointer-events-none fixed left-1/2 z-[38] w-[min(calc(100vw-6.5rem),42rem)] max-w-[min(calc(100vw-6.5rem),42rem)] min-w-0 -translate-x-1/2 px-3 text-center font-mono text-sm leading-relaxed transition-opacity ease-out sm:w-[min(92vw,42rem)] bottom-[max(6.75rem,env(safe-area-inset-bottom,0px))] md:bottom-[max(4.25rem,env(safe-area-inset-bottom,0px))] lg:bottom-[max(2.75rem,env(safe-area-inset-bottom,0px))] ${
        fadeOut ? "opacity-0" : "opacity-100"
      }`}
      style={{
        transitionDuration: `${SUBTITLE_TIMING.FADE_OUT_MS}ms`,
      }}
    >
      <p
        className="mx-auto block w-full min-w-0 max-h-[min(28vh,calc(50svh-9rem))] overflow-x-hidden overflow-y-auto text-balance [text-wrap:balance] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        <span className="inline break-words bg-black/55 px-1.5 py-0.5 text-white/88 [box-decoration-break:clone] [-webkit-box-decoration-break:clone]">
          {visible}
          {typing ? (
            <span
              className="ml-0.5 inline-block min-h-[1em] w-px animate-pulse bg-white/50 align-middle"
              aria-hidden
            />
          ) : null}
        </span>
      </p>
    </div>
  );
}
