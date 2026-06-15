import { MAPS_CDN } from "@/lib/config";

/** Host patterns for Maps JS tile & Street View imagery. */
const MAPS_IMAGERY_HOST_RE =
  /(^|\.)maps\.googleapis\.com$|^mt[0-9]?\.googleapis\.com$|(^|\.)kh\.google$|(^|\.)kh\.google\.com$|(^|\.)ggpht\.com$|streetviewpixels|(^|\.)googleusercontent\.com$/i;

export type MapsImageryStatusCounts = Record<number, number>;

export type MapsImageryResourceError = {
  url: string;
  host: string;
  status: number;
  nowMs: number;
  windowMs: number;
  countInWindow: number;
  countsByStatus: MapsImageryStatusCounts;
};

export type MapsImageryBurst = {
  nowMs: number;
  windowMs: number;
  threshold: number;
  countInWindow: number;
  countsByStatus: MapsImageryStatusCounts;
  dominantStatus: number;
  latest: MapsImageryResourceError;
};

export type MapsImageryDiagnosticsOptions = {
  onResourceError?: (event: MapsImageryResourceError) => void;
  onBurst?: (burst: MapsImageryBurst) => void;
};

function isMapsImageryTileUrl(name: string): boolean {
  try {
    const url = new URL(name);
    return MAPS_IMAGERY_HOST_RE.test(url.hostname);
  } catch {
    return false;
  }
}

function mapsImageryHost(name: string): string {
  try {
    return new URL(name).hostname;
  } catch {
    return "";
  }
}

function resourceEntryCdnErrorStatus(
  entry: PerformanceResourceTiming,
): number | undefined {
  const rs = (entry as PerformanceResourceTiming & { responseStatus?: number })
    .responseStatus;
  return typeof rs === "number" && rs > 0 ? rs : undefined;
}

function isRetryableCdnHttpStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

function countsByStatus(
  events: Array<{ time: number; status: number }>,
): MapsImageryStatusCounts {
  const counts: MapsImageryStatusCounts = {};
  for (const event of events) {
    counts[event.status] = (counts[event.status] ?? 0) + 1;
  }
  return counts;
}

function dominantStatus(
  counts: MapsImageryStatusCounts,
  latestStatus: number,
): number {
  let dominant = latestStatus;
  let dominantCount = counts[latestStatus] ?? 0;
  for (const [statusText, count] of Object.entries(counts)) {
    const status = Number(statusText);
    if (count > dominantCount) {
      dominant = status;
      dominantCount = count;
    }
  }
  return dominant;
}

/**
 * Observes Performance Resource Timing for Maps imagery URLs. When several
 * 429/502/503/504 responses land in a short window (visible when the CDN exposes
 * `responseStatus`, often same-origin or TAO), emits diagnostic callbacks.
 *
 * Returns a disconnect function. No-ops if PerformanceObserver is unavailable.
 */
export function startMapsImageryCdnDiagnosticsMonitor(
  options: MapsImageryDiagnosticsOptions,
): () => void {
  if (typeof PerformanceObserver === "undefined") {
    return () => {};
  }

  const windowMs = MAPS_CDN.ERROR_BURST_WINDOW_MS;
  const threshold = MAPS_CDN.ERROR_BURST_THRESHOLD;
  const events: Array<{ time: number; status: number }> = [];
  let burstCooldownUntil = 0;

  const flushOld = (now: number): void => {
    const cutoff = now - windowMs;
    while (events.length > 0 && events[0]!.time < cutoff) {
      events.shift();
    }
  };

  const recordError = (url: string, host: string, status: number): void => {
    const now = performance.now();
    flushOld(now);
    events.push({ time: now, status });

    const counts = countsByStatus(events);
    const latest: MapsImageryResourceError = {
      url,
      host,
      status,
      nowMs: now,
      windowMs,
      countInWindow: events.length,
      countsByStatus: counts,
    };
    options.onResourceError?.(latest);

    if (events.length < threshold) return;
    if (now < burstCooldownUntil) return;

    options.onBurst?.({
      nowMs: now,
      windowMs,
      threshold,
      countInWindow: events.length,
      countsByStatus: counts,
      dominantStatus: dominantStatus(counts, status),
      latest,
    });
    burstCooldownUntil = now + MAPS_CDN.BURST_COOLDOWN_MS;
  };

  const handleEntry = (entry: PerformanceEntry): void => {
    if (entry.entryType !== "resource") return;
    const res = entry as PerformanceResourceTiming;
    if (!isMapsImageryTileUrl(res.name)) return;
    const status = resourceEntryCdnErrorStatus(res);
    if (status === undefined || !isRetryableCdnHttpStatus(status)) return;
    recordError(res.name, mapsImageryHost(res.name), status);
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

export function startMapsImageryCdnErrorMonitor(
  onBurst: () => void,
): () => void {
  return startMapsImageryCdnDiagnosticsMonitor({ onBurst: () => onBurst() });
}
