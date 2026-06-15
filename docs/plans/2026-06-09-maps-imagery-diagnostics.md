# Maps Imagery Diagnostics Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add automated diagnostics for intermittent Google Street View black frames, 429s, and 503s so the bot records what happened, when backoff activated, and whether the canvas appeared black.

**Architecture:** Extend the existing client-only Maps CDN monitor into a small diagnostics module that emits structured resource-error and burst summaries. Keep adaptive slowdown in `Bot`, publish concise `MAPS` activity lines to `/terminal`, and add a lightweight, best-effort canvas brightness sampler from `StreetViewController` without depending on Google internals.

**Tech Stack:** Next.js App Router, React client runtime, TypeScript, browser `PerformanceObserver`, Google Maps JavaScript API Street View, `BroadcastChannel` terminal activity.

---

## Context

The repo is `D:\CODE\WouldNotRecommend_v1`. It is a Next.js kiosk-style Street View installation. The relevant files are:

- `src/lib/maps-cdn-stress.ts`: currently observes Performance Resource Timing and calls `onBurst` when several 429/502/503/504 imagery failures occur.
- `src/engine/bot.ts`: starts the monitor, slows walking during stress, and posts activity to `/terminal`.
- `src/engine/street-view-controller.ts`: owns the Street View panorama and exposes the container/canvas.
- `src/lib/config.ts`: holds `MAPS_CDN` and Street View timing defaults.
- `src/lib/bot-activity.ts`: terminal activity broadcaster.
- `docs/how-the-bot-works.md`: operational docs.
- `docs/llm-handoff/README.md`: maintainer handoff.

Do not turn this into a generic observability product. Keep the feature local to this installation and focused on Google Street View imagery pressure.

## Requirements

1. Detect and summarize Google imagery resource failures:
   - URL patterns must remain focused on Maps/Street View imagery hosts, not local `/api/*`.
   - Count `429`, `502`, `503`, and `504` in a rolling window.
   - Preserve the existing `startMapsImageryCdnErrorMonitor(onBurst)` export for compatibility.
   - Add a richer diagnostics export that supports per-error and per-burst callbacks.

2. Emit useful terminal lines without spamming:
   - On occasional single failures, post at most one concise `MAPS` line per throttle interval.
   - On burst, post a `MAPS` line that includes status counts, rolling window, current state, current effective wander interval, and whether backoff is active.
   - On recovery, post a `MAPS` line when the stress quiet timer restores the base interval.

3. Add best-effort black-frame sampling:
   - Sample the Street View canvas infrequently while the bot is running.
   - If sampling is unavailable or throws because of browser/canvas restrictions, silently disable sampling and post one diagnostic line.
   - If a sample is near black, post a concise `MAPS` line including brightness, bot state, current coords, current backoff flag, and recent error counts.
   - Do not use per-frame sampling.
   - Do not block walking, TTS, or review flow.

4. Keep behavior safe for Google imagery load:
   - Do not add extra Street View API calls.
   - Do not add `setPov` calls.
   - Do not increase walk cadence.
   - Keep canvas sampling low frequency and tiny resolution.

5. Add regression coverage:
   - Add a Node test script that statically verifies the diagnostics module still counts `429/502/503/504`, exposes the compatibility wrapper, has throttled terminal configuration, and does not include local API routes in the imagery URL matcher.
   - Add an npm script for that test.

6. Update docs:
   - Explain how to use `/terminal` MAPS lines to troubleshoot black frames.
   - Explain dev-vs-production interpretation: Fast Refresh/dev reloads can create extra Street View churn.

## Proposed Implementation

### Task 1: Expand Maps CDN Monitor Into Diagnostics API

**Files:**
- Modify: `src/lib/maps-cdn-stress.ts`
- Modify: `src/lib/config.ts`
- Test: `scripts/maps-imagery-diagnostics.test.mjs`
- Modify: `package.json`

**Step 1: Add config fields**

In `src/lib/config.ts`, extend `MAPS_CDN` with:

```ts
  /** Minimum ms between non-burst MAPS terminal lines for individual imagery errors. */
  ERROR_ACTIVITY_MIN_INTERVAL_MS: 15_000,
  /** How often to sample the Street View canvas for near-black frames. */
  BLACK_FRAME_SAMPLE_INTERVAL_MS: 2_500,
  /** 0-255 average brightness below which the sampled canvas is treated as near-black. */
  BLACK_FRAME_BRIGHTNESS_THRESHOLD: 8,
  /** Minimum ms between repeated black-frame activity lines. */
  BLACK_FRAME_ACTIVITY_MIN_INTERVAL_MS: 10_000,
```

Do not change current timing values unless needed for type consistency.

**Step 2: Define diagnostics types**

In `src/lib/maps-cdn-stress.ts`, add exported types:

```ts
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
```

**Step 3: Implement richer monitor**

Add:

```ts
export function startMapsImageryCdnDiagnosticsMonitor(
  options: MapsImageryDiagnosticsOptions,
): () => void
```

Expected behavior:

- Maintain a rolling array of `{ time, status }`.
- `onResourceError` fires for every retryable imagery status.
- `onBurst` fires when rolling retryable errors reach `MAPS_CDN.ERROR_BURST_THRESHOLD`, respecting `MAPS_CDN.BURST_COOLDOWN_MS`.
- `dominantStatus` is the status with the highest count in the current window. Tie-break by the latest event status.
- `countsByStatus` should be a plain object sorted only by normal JS key behavior; exact order is not important.
- Continue to no-op safely if `PerformanceObserver` is unavailable.

Keep:

```ts
export function startMapsImageryCdnErrorMonitor(onBurst: () => void): () => void
```

as a wrapper around `startMapsImageryCdnDiagnosticsMonitor({ onBurst: () => onBurst() })`.

**Step 4: Add static regression test**

Create `scripts/maps-imagery-diagnostics.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const monitor = readFileSync(join(root, "src/lib/maps-cdn-stress.ts"), "utf8");
const config = readFileSync(join(root, "src/lib/config.ts"), "utf8");
const bot = readFileSync(join(root, "src/engine/bot.ts"), "utf8");

for (const status of [429, 502, 503, 504]) {
  assert.match(
    monitor,
    new RegExp(`status === ${status}`),
    `Maps imagery diagnostics should count ${status}`,
  );
}

assert.match(
  monitor,
  /startMapsImageryCdnDiagnosticsMonitor/,
  "diagnostics monitor export should exist",
);

assert.match(
  monitor,
  /startMapsImageryCdnErrorMonitor[\s\S]*startMapsImageryCdnDiagnosticsMonitor/,
  "legacy error monitor should wrap diagnostics monitor",
);

assert.doesNotMatch(
  monitor,
  /\/api\/places|\/api\/log|\/api\/geocode|\/api\/tts/,
  "imagery matcher should not target local API routes",
);

assert.match(
  config,
  /ERROR_ACTIVITY_MIN_INTERVAL_MS/,
  "config should include terminal throttle for individual imagery errors",
);

assert.match(
  config,
  /BLACK_FRAME_SAMPLE_INTERVAL_MS/,
  "config should include black-frame sampling interval",
);

assert.match(
  bot,
  /startMapsImageryCdnDiagnosticsMonitor/,
  "bot should use richer diagnostics monitor",
);
```

Add to `package.json`:

```json
"test:maps-diagnostics": "node scripts/maps-imagery-diagnostics.test.mjs"
```

Run:

```bash
npm run test:maps-diagnostics
```

Expected: PASS.

### Task 2: Integrate Diagnostics Into Bot Activity and Backoff

**Files:**
- Modify: `src/engine/bot.ts`
- Modify: `src/lib/maps-cdn-stress.ts`
- Test: `scripts/maps-imagery-diagnostics.test.mjs`

**Step 1: Replace monitor import**

In `src/engine/bot.ts`, replace:

```ts
import { startMapsImageryCdnErrorMonitor } from "@/lib/maps-cdn-stress";
```

with:

```ts
import {
  startMapsImageryCdnDiagnosticsMonitor,
  type MapsImageryBurst,
  type MapsImageryResourceError,
  type MapsImageryStatusCounts,
} from "@/lib/maps-cdn-stress";
```

**Step 2: Track recent diagnostics state**

Add private fields to `Bot`:

```ts
  private lastMapsErrorActivityAt = 0;
  private lastMapsErrorCounts: MapsImageryStatusCounts = {};
  private lastMapsErrorWindowMs = MAPS_CDN.ERROR_BURST_WINDOW_MS;
  private lastMapsDominantStatus = 0;
```

**Step 3: Start richer monitor**

In `start`, replace the monitor setup with:

```ts
    this.stopMapsCdnMonitor = startMapsImageryCdnDiagnosticsMonitor({
      onResourceError: (event) => this.onMapsCdnResourceError(event),
      onBurst: (burst) => this.onMapsCdnStressBurst(burst),
    });
```

**Step 4: Add helper formatting methods**

Add private helpers:

```ts
  private formatMapsStatusCounts(counts: MapsImageryStatusCounts): string {
    const entries = Object.entries(counts)
      .map(([status, count]) => `${status}=${count}`)
      .join(" ");
    return entries || "none";
  }

  private mapsDiagnosticsContext(): string {
    return `state=${this.context.state} backoff=${this.mapsCdnStressBackoff ? "on" : "off"} stepMs=${this.getEffectiveWanderStepInterval()}`;
  }
```

**Step 5: Add individual error handler**

Add:

```ts
  private onMapsCdnResourceError(event: MapsImageryResourceError): void {
    this.lastMapsErrorCounts = event.countsByStatus;
    this.lastMapsErrorWindowMs = event.windowMs;
    this.lastMapsDominantStatus = event.status;

    const now = Date.now();
    if (
      now - this.lastMapsErrorActivityAt <
      MAPS_CDN.ERROR_ACTIVITY_MIN_INTERVAL_MS
    ) {
      return;
    }

    this.lastMapsErrorActivityAt = now;
    postActivity("MAPS", [
      `imagery status=${event.status} host=${event.host} count=${event.countInWindow}/${event.windowMs}ms counts=${this.formatMapsStatusCounts(event.countsByStatus)} ${this.mapsDiagnosticsContext()}`,
    ]);
  }
```

**Step 6: Update burst handler**

Change `private onMapsCdnStressBurst(): void` to accept optional detail:

```ts
  private onMapsCdnStressBurst(burst?: MapsImageryBurst): void
```

If burst is provided, update `lastMapsErrorCounts`, `lastMapsErrorWindowMs`, and `lastMapsDominantStatus`.

Change the activity line to include:

```ts
const counts = burst
  ? this.formatMapsStatusCounts(burst.countsByStatus)
  : this.formatMapsStatusCounts(this.lastMapsErrorCounts);
postActivity("MAPS", [
  `tile/CDN burst counts=${counts} window=${burst?.windowMs ?? MAPS_CDN.ERROR_BURST_WINDOW_MS}ms ${this.mapsDiagnosticsContext()} -> wander ${ms}ms`,
]);
```

Do not remove the existing backoff behavior.

**Step 7: Add recovery activity**

Inside the existing recovery timeout, after restoring `mapsCdnStressBackoff = false` and updating walking interval, post:

```ts
      postActivity("MAPS", [
        `recovered quietMs=${MAPS_CDN.STRESS_RECOVERY_QUIET_MS} ${this.mapsDiagnosticsContext()}`,
      ]);
```

Be careful that `mapsDiagnosticsContext()` runs after `mapsCdnStressBackoff` is false.

Run:

```bash
npm run test:maps-diagnostics
npm run typecheck
```

Expected: both pass.

### Task 3: Add Best-Effort Black-Frame Sampling

**Files:**
- Modify: `src/engine/street-view-controller.ts`
- Modify: `src/engine/bot.ts`
- Modify: `src/lib/config.ts`
- Test: `scripts/maps-imagery-diagnostics.test.mjs`

**Step 1: Add sample type and method**

In `src/engine/street-view-controller.ts`, export:

```ts
export type StreetViewCanvasSample =
  | {
      available: true;
      brightness: number;
      width: number;
      height: number;
    }
  | {
      available: false;
      reason: string;
    };
```

Add method to `StreetViewController`:

```ts
  sampleCanvasBrightness(): StreetViewCanvasSample {
    const container = this.getContainer();
    const canvas = container?.querySelector("canvas");
    if (!canvas || canvas.width <= 0 || canvas.height <= 0) {
      return { available: false, reason: "no_canvas" };
    }

    const sampleSize = 8;
    const scratch = document.createElement("canvas");
    scratch.width = sampleSize;
    scratch.height = sampleSize;
    const ctx = scratch.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      return { available: false, reason: "no_2d_context" };
    }

    try {
      ctx.drawImage(canvas, 0, 0, sampleSize, sampleSize);
      const { data } = ctx.getImageData(0, 0, sampleSize, sampleSize);
      let total = 0;
      for (let i = 0; i < data.length; i += 4) {
        total += (data[i]! + data[i + 1]! + data[i + 2]!) / 3;
      }
      return {
        available: true,
        brightness: total / (data.length / 4),
        width: canvas.width,
        height: canvas.height,
      };
    } catch (error) {
      const reason =
        error instanceof DOMException && error.name
          ? error.name
          : "sample_failed";
      return { available: false, reason };
    }
  }
```

This method must not throw.

**Step 2: Add bot timer fields**

In `src/engine/bot.ts`:

```ts
  private blackFrameInterval: Interval | null = null;
  private blackFrameSamplingUnavailable = false;
  private lastBlackFrameActivityAt = 0;
```

**Step 3: Start/stop sampler**

In `startPeriodicChecks`, add:

```ts
    this.blackFrameInterval = setInterval(() => {
      this.checkStreetViewBlackFrame();
    }, MAPS_CDN.BLACK_FRAME_SAMPLE_INTERVAL_MS);
```

In `destroy`, clear it:

```ts
    if (this.blackFrameInterval) clearInterval(this.blackFrameInterval);
```

**Step 4: Add sampler handler**

Add:

```ts
  private checkStreetViewBlackFrame(): void {
    if (!this.running || this.blackFrameSamplingUnavailable) return;
    if (this.context.teleportPhase !== "none") return;

    const sample = this.streetView.sampleCanvasBrightness();
    if (!sample.available) {
      this.blackFrameSamplingUnavailable = true;
      postActivity("MAPS", [`canvas sampling unavailable reason=${sample.reason}`]);
      return;
    }

    if (sample.brightness > MAPS_CDN.BLACK_FRAME_BRIGHTNESS_THRESHOLD) return;

    const now = Date.now();
    if (
      now - this.lastBlackFrameActivityAt <
      MAPS_CDN.BLACK_FRAME_ACTIVITY_MIN_INTERVAL_MS
    ) {
      return;
    }

    this.lastBlackFrameActivityAt = now;
    const coords = this.streetView.getCoords();
    postActivity("MAPS", [
      `black-frame brightness=${sample.brightness.toFixed(1)} canvas=${sample.width}x${sample.height} lat=${coords.lat.toFixed(6)} lng=${coords.lng.toFixed(6)} counts=${this.formatMapsStatusCounts(this.lastMapsErrorCounts)} window=${this.lastMapsErrorWindowMs}ms dominant=${this.lastMapsDominantStatus || "none"} ${this.mapsDiagnosticsContext()}`,
    ]);
  }
```

Notes:

- The threshold may occasionally flag intentionally black UI if the Street View canvas is hidden. Skipping teleport phases avoids the most obvious false positive.
- Do not sample during every animation frame.
- If the first sample is unavailable, disable sampling for the session.

**Step 5: Extend static test**

Update `scripts/maps-imagery-diagnostics.test.mjs` to assert:

```js
const controller = readFileSync(
  join(root, "src/engine/street-view-controller.ts"),
  "utf8",
);

assert.match(
  controller,
  /sampleCanvasBrightness/,
  "StreetViewController should expose best-effort canvas brightness sampling",
);

assert.match(
  bot,
  /checkStreetViewBlackFrame/,
  "bot should periodically check for near-black Street View canvas frames",
);
```

Run:

```bash
npm run test:maps-diagnostics
npm run typecheck
npm run lint
```

Expected:

- `test:maps-diagnostics`: PASS
- `typecheck`: PASS
- `lint`: PASS, except the known unrelated `src/components/TtsSubtitles.tsx` hook dependency warning may remain.

### Task 4: Document the Diagnostic Workflow

**Files:**
- Modify: `docs/how-the-bot-works.md`
- Modify: `docs/llm-handoff/README.md`

**Step 1: Update user-facing troubleshooting docs**

In `docs/how-the-bot-works.md`, update the existing "Troubleshooting temporary black Street View frames" section to explain:

- `MAPS imagery status=...` means an individual throttled/failed Google imagery tile was observed.
- `MAPS tile/CDN burst ... -> wander ...` means adaptive backoff activated.
- `MAPS recovered ...` means quiet recovery restored the configured cadence.
- `MAPS black-frame ...` means the app sampled a near-black Street View canvas and correlated it with recent Maps errors.
- Dev mode `[Fast Refresh]` can add Street View churn; compare against production with `npm run build` and `npm run start:next`.

**Step 2: Update maintainer handoff**

In `docs/llm-handoff/README.md`, add a short behavior note:

```md
- Maps imagery diagnostics are client-only. `src/lib/maps-cdn-stress.ts` observes Street View imagery failures, `Bot` publishes `MAPS` activity lines, and `StreetViewController.sampleCanvasBrightness()` best-effort samples the Street View canvas. These diagnostics must not add Street View API calls or per-frame camera updates.
```

Run:

```bash
npm run test:maps-diagnostics
npm run typecheck
```

Expected: both pass.

## Final Verification

Run from `D:\CODE\WouldNotRecommend_v1`:

```bash
npm run test:maps-diagnostics
npm run typecheck
npm run lint
```

Expected:

- `test:maps-diagnostics` passes.
- `typecheck` passes.
- `lint` has no new errors. If the existing `src/components/TtsSubtitles.tsx` warning appears, mention it as pre-existing/unrelated.

Manual smoke test:

1. Start dev server with `npm run dev`.
2. Open `/bot` and `/terminal` in the same browser profile.
3. Let the bot walk for several minutes.
4. Confirm `/terminal` shows `MAPS` lines only when imagery errors, bursts, recovery, sampling-unavailable, or black-frame events occur.
5. Confirm `/api/places`, `/api/log`, and `/api/geocode` are not described as Maps imagery failures.

## Non-Goals

- Do not persist diagnostics to SQLite in this first pass.
- Do not add an admin dashboard.
- Do not add screenshots or canvas image storage.
- Do not query Google Places APIs.
- Do not add new dependencies.
- Do not change bot review selection, TTS, teleport destination logic, or Street View walking path selection.
