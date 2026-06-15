"use client";

import { useEffect, useRef } from "react";
import { postActivity } from "@/lib/bot-activity";

type WakeLockSentinelLike = EventTarget & {
  released?: boolean;
  release: () => Promise<void>;
};

type WakeLockLike = {
  request: (type?: "screen") => Promise<WakeLockSentinelLike>;
};

type NavigatorWithWakeLock = Navigator & {
  wakeLock?: WakeLockLike;
};

function postWakeLockActivity(
  event: string,
  details: string,
  extra?: Record<string, unknown>,
): void {
  postActivity("RUNTIME", [`${event} ${details}`], {
    metadata: {
      event,
      feature: "screen_wake_lock",
      ...extra,
    },
  });
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function useScreenWakeLock(enabled: boolean): void {
  const sentinelRef = useRef<WakeLockSentinelLike | null>(null);
  const unsupportedLoggedRef = useRef(false);

  useEffect(() => {
    if (!enabled) return undefined;

    let disposed = false;
    let requestInFlight = false;
    let retryTimer: number | undefined;

    const clearRetry = () => {
      if (retryTimer === undefined) return;
      window.clearTimeout(retryTimer);
      retryTimer = undefined;
    };

    const scheduleRetry = () => {
      if (disposed || document.visibilityState !== "visible") return;
      if (retryTimer !== undefined) return;
      retryTimer = window.setTimeout(() => {
        retryTimer = undefined;
        void requestWakeLock("release_retry");
      }, 1_000);
    };

    const requestWakeLock = async (reason: string) => {
      if (disposed || requestInFlight || sentinelRef.current) return;

      const wakeLock = (navigator as NavigatorWithWakeLock).wakeLock;
      if (!wakeLock) {
        if (!unsupportedLoggedRef.current) {
          unsupportedLoggedRef.current = true;
          postWakeLockActivity("wake_lock_unsupported", `reason=${reason}`);
        }
        return;
      }

      if (document.visibilityState !== "visible") {
        postWakeLockActivity("wake_lock_deferred", `reason=${reason}`, {
          visibilityState: document.visibilityState,
        });
        return;
      }

      requestInFlight = true;
      try {
        const sentinel = await wakeLock.request("screen");
        if (disposed) {
          await sentinel.release().catch(() => {});
          return;
        }

        sentinelRef.current = sentinel;
        sentinel.addEventListener("release", onRelease);
        postWakeLockActivity("wake_lock_acquired", `reason=${reason}`);
      } catch (error) {
        postWakeLockActivity("wake_lock_failed", `reason=${reason}`, {
          error: getErrorMessage(error),
          visibilityState: document.visibilityState,
        });
      } finally {
        requestInFlight = false;
      }
    };

    const onRelease = () => {
      const sentinel = sentinelRef.current;
      if (sentinel) {
        sentinel.removeEventListener("release", onRelease);
      }
      sentinelRef.current = null;
      postWakeLockActivity("wake_lock_released", `disposed=${disposed}`);
      scheduleRetry();
    };

    const onVisibleAgain = () => {
      if (document.visibilityState === "visible") {
        void requestWakeLock("visible");
      }
    };

    void requestWakeLock("startup");
    document.addEventListener("visibilitychange", onVisibleAgain);
    window.addEventListener("pageshow", onVisibleAgain);
    window.addEventListener("focus", onVisibleAgain);

    return () => {
      disposed = true;
      clearRetry();
      document.removeEventListener("visibilitychange", onVisibleAgain);
      window.removeEventListener("pageshow", onVisibleAgain);
      window.removeEventListener("focus", onVisibleAgain);

      const sentinel = sentinelRef.current;
      sentinelRef.current = null;
      if (sentinel && !sentinel.released) {
        sentinel.removeEventListener("release", onRelease);
        void sentinel.release().catch(() => {});
      }
    };
  }, [enabled]);
}
