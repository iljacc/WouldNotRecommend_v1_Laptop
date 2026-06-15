"use client";

import { useEffect, useRef } from "react";
import { postActivity } from "@/lib/bot-activity";

export const RUNTIME_HEARTBEAT_INTERVAL_MS = 15_000;
const RUNTIME_HEARTBEAT_GAP_MS = 45_000;

type RuntimeSnapshot = {
  visibilityState: string;
  hidden: boolean;
  focused: boolean;
  online: boolean;
  innerWidth: number;
  innerHeight: number;
  outerWidth: number;
  outerHeight: number;
  screenWidth: number;
  screenHeight: number;
  availWidth: number;
  availHeight: number;
  colorDepth: number;
  pixelRatio: number;
  orientation: string;
  isExtended?: boolean;
};

function getScreenIsExtended(): boolean | undefined {
  const maybeScreen = screen as Screen & { isExtended?: unknown };
  return typeof maybeScreen.isExtended === "boolean"
    ? maybeScreen.isExtended
    : undefined;
}

function snapshotRuntime(): RuntimeSnapshot {
  const orientation = screen.orientation?.type ?? "";
  return {
    visibilityState: document.visibilityState,
    hidden: document.hidden,
    focused: document.hasFocus(),
    online: navigator.onLine,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    outerWidth: window.outerWidth,
    outerHeight: window.outerHeight,
    screenWidth: screen.width,
    screenHeight: screen.height,
    availWidth: screen.availWidth,
    availHeight: screen.availHeight,
    colorDepth: screen.colorDepth,
    pixelRatio: window.devicePixelRatio,
    orientation,
    isExtended: getScreenIsExtended(),
  };
}

function formatSnapshot(snapshot: RuntimeSnapshot): string {
  const extended =
    snapshot.isExtended === undefined ? "" : ` extended=${snapshot.isExtended}`;
  return [
    `visibility=${snapshot.visibilityState}`,
    `hidden=${snapshot.hidden}`,
    `focused=${snapshot.focused}`,
    `online=${snapshot.online}`,
    `window=${snapshot.innerWidth}x${snapshot.innerHeight}`,
    `outer=${snapshot.outerWidth}x${snapshot.outerHeight}`,
    `screen=${snapshot.screenWidth}x${snapshot.screenHeight}`,
    `avail=${snapshot.availWidth}x${snapshot.availHeight}`,
    `dpr=${snapshot.pixelRatio}`,
    `orientation=${snapshot.orientation || "unknown"}${extended}`,
  ].join(" ");
}

function postRuntimeActivity(
  event: string,
  details: string,
  extra?: Record<string, unknown>,
): void {
  const snapshot = snapshotRuntime();
  postActivity("RUNTIME", [`${event} ${details} | ${formatSnapshot(snapshot)}`], {
    metadata: {
      event,
      ...snapshot,
      ...extra,
    },
  });
}

export function useRuntimeEnvironmentMonitor(enabled: boolean): void {
  const lastHeartbeatAtRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled) return undefined;

    const heartbeat = () => {
      const now = Date.now();
      const previous = lastHeartbeatAtRef.current || now;
      const deltaMs = now - previous;
      lastHeartbeatAtRef.current = now;
      const event =
        deltaMs > RUNTIME_HEARTBEAT_GAP_MS ? "heartbeat_gap" : "heartbeat";
      postRuntimeActivity(event, `deltaMs=${Math.round(deltaMs)}`, {
        deltaMs,
        thresholdMs: RUNTIME_HEARTBEAT_GAP_MS,
      });
    };

    const postLifecycle = (event: string, details = "") => {
      postRuntimeActivity(event, details);
    };

    lastHeartbeatAtRef.current = Date.now();
    postLifecycle("startup");

    const onVisibilityChange = () => postLifecycle("visibilitychange");
    const onFocus = () => postLifecycle("focus");
    const onBlur = () => postLifecycle("blur");
    const onOnline = () => postLifecycle("online");
    const onOffline = () => postLifecycle("offline");
    const onResize = () => postLifecycle("resize");
    const onPageHide = (event: PageTransitionEvent) =>
      postLifecycle("pagehide", `persisted=${event.persisted}`);
    const onPageShow = (event: PageTransitionEvent) =>
      postLifecycle("pageshow", `persisted=${event.persisted}`);
    const onFreeze = () => postLifecycle("freeze");
    const onResume = () => postLifecycle("resume");

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("resize", onResize);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("freeze", onFreeze);
    document.addEventListener("resume", onResume);

    const interval = window.setInterval(
      heartbeat,
      RUNTIME_HEARTBEAT_INTERVAL_MS,
    );

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("freeze", onFreeze);
      document.removeEventListener("resume", onResume);
      postLifecycle("shutdown");
    };
  }, [enabled]);
}
