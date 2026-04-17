import { MAPS_CDN } from "@/lib/config";

/** Host/path patterns for Maps JS tile & Street View imagery (not Places HTTP APIs). */
const MAPS_IMAGERY_URL_RE =
  /maps\.googleapis\.com|mt[0-9]?\.googleapis\.com|kh\.google|\.ggpht\.com|streetviewpixels|googleusercontent\.com\/.*StreetView/i;

function isMapsImageryTileUrl(name: string): boolean {
  return MAPS_IMAGERY_URL_RE.test(name);
}

function resourceEntryCdnErrorStatus(
  entry: PerformanceResourceTiming,
): number | undefined {
  const rs = (entry as PerformanceResourceTiming & { responseStatus?: number })
    .responseStatus;
  return typeof rs === "number" && rs > 0 ? rs : undefined;
}

function isRetryableCdnHttpStatus(status: number): boolean {
  return status === 502 || status === 503 || status === 504;
}

/**
 * Observes Performance Resource Timing for Maps imagery URLs. When several
 * 502/503/504 responses land in a short window (visible when the CDN exposes
 * `responseStatus`, often same-origin or TAO), invokes `onBurst`.
 *
 * Returns a disconnect function. No-ops if PerformanceObserver is unavailable.
 */
export function startMapsImageryCdnErrorMonitor(
  onBurst: () => void,
): () => void {
  if (typeof PerformanceObserver === "undefined") {
    return () => {};
  }

  const windowMs = MAPS_CDN.ERROR_BURST_WINDOW_MS;
  const threshold = MAPS_CDN.ERROR_BURST_THRESHOLD;
  const eventTimes: number[] = [];
  let burstCooldownUntil = 0;

  const flushOld = (now: number): void => {
    const cutoff = now - windowMs;
    while (eventTimes.length > 0 && eventTimes[0]! < cutoff) {
      eventTimes.shift();
    }
  };

  const recordError = (): void => {
    const now = performance.now();
    flushOld(now);
    eventTimes.push(now);
    if (eventTimes.length < threshold) return;
    if (now < burstCooldownUntil) return;

    onBurst();
    eventTimes.length = 0;
    burstCooldownUntil = now + MAPS_CDN.BURST_COOLDOWN_MS;
  };

  const handleEntry = (entry: PerformanceEntry): void => {
    if (entry.entryType !== "resource") return;
    const res = entry as PerformanceResourceTiming;
    if (!isMapsImageryTileUrl(res.name)) return;
    const status = resourceEntryCdnErrorStatus(res);
    if (status === undefined || !isRetryableCdnHttpStatus(status)) return;
    recordError();
  };

  let observer: PerformanceObserver;
  try {
    observer = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        handleEntry(e);
      }
    });
  } catch {
    return () => {};
  }

  try {
    observer.observe({ type: "resource", buffered: true } as PerformanceObserverInit);
  } catch {
    try {
      observer.observe({ entryTypes: ["resource"] });
    } catch {
      return () => {};
    }
  }

  return () => observer.disconnect();
}
