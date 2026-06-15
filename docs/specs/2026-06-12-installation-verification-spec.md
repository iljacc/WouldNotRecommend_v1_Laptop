# Installation Verification And Soak Testing Spec

## Goal

Define how to test whether the `would-not-recommend` bot is safe to run in an exhibition setting: frequent review delivery, bounded visual/navigation stalls, no pathological repeats, and monitor evidence that explains failures after a run.

This spec is for later implementation. Do not change bot behavior from this document alone.

## Current Manual Workflow

Use this before building the automated verifier.

1. Build and run production mode:

```powershell
cd D:\CODE\WouldNotRecommend_v1
npm run build
npm run start:next
```

2. Open exactly one `/bot` tab:

```text
http://localhost:3000/bot
```

3. Open `/monitor` in a second tab/window:

```text
http://localhost:3000/monitor
```

4. Keep the machine plugged in and prevent OS sleep. Display sleep is also risky because browser rendering and timers may throttle.

5. Run a 20-30 minute smoke test first. If acceptable, run a 2 hour test. If acceptable, run overnight.

## Exhibition Success Criteria

The bot is acceptable for exhibition only if these hold during a 2 hour production-mode run:

- No completed review gap above 120 seconds.
- No `DETECT -> DELIVER` stall above 6 seconds.
- No event silence above 60 seconds while the browser/machine is supposed to be awake.
- No `RUNTIME heartbeat_gap` above 60 seconds while the browser/machine is
  supposed to be awake.
- No hidden/frozen/pagehide/offline runtime signal during the run unless the
  operator intentionally backgrounds, locks, sleeps, or disconnects the display.
- No exact review text repeats within 30 minutes.
- No teleport loop of 5 or more recovery teleports within 10 minutes.
- No prolonged out-of-region state above 120 seconds.
- If Google imagery reports 429/503 bursts, review delivery still continues.

For overnight runs, the same criteria apply, but failures should be reported as time ranges and counts rather than a single pass/fail.

## Review Repeat Policy

### Definition Of Session

In the current code, a "session" means one bot runtime instance from `Bot.start()` until the tab/app is refreshed, stopped, or destroyed. A long overnight run is one session.

### Desired Artwork Policy

The previous "never repeat exact review text in one session" rule is too strict for the artwork. It protects uniqueness but can hurt cadence when the bot is in a sparse location or when fallback recovery has only a few usable reviews.

Desired policy:

- Prefer unread reviews first.
- If multiple eligible reviews exist for the selected place or fallback anchor, do not repeat the exact same review.
- If no fresh eligible review exists, repeating is allowed after 30 minutes.
- Repeats under 30 minutes should be treated as a bug unless explicitly caused by a test fixture.
- Same-place repeats are acceptable if the review text is different.
- Exact same text from different places should still count as a repeat because the audience hears the same line.

### Implementation Direction

Replace the current session-long exact-review block with a `sessionReadReviewAtByHash` map:

```text
reviewHash -> last selected timestamp
```

Filtering should reject a hash only while:

```text
now - lastSelectedAt < 30 minutes
```

When no non-repeated reviews pass, fallback selection may allow older repeated reviews, but it should log:

```text
WARN review_repeat_fallback
```

## Automated Verifier Types

### 1. Static Regression Tests

Purpose: catch known code-shape regressions quickly.

Existing style:

```powershell
node scripts/detect-timeout-behavior.test.mjs
node scripts/review-session-repeat-guard.test.mjs
node scripts/monitor-historical-stall-report.test.mjs
```

Future static tests:

- Assert `DETECT_MAX_WAIT_MS` exists and is <= 6000.
- Assert monitor reports historical `DETECT -> DELIVER` stalls.
- Assert review repeat policy uses timestamp cooldown, not session-long block.
- Assert monitor distinguishes raw resource 429/503 events from burst summary events.
- Assert `/bot` emits runtime visibility/focus/page-lifecycle heartbeat events.
- Assert monitor reports historical runtime heartbeat gaps and hidden-page signals.

### 2. Unit Tests

Purpose: test real logic without browser/Street View.

Targets:

- `ReviewManager` repeat policy.
- `filterReviews` with fresh, recently read, older repeated, too-short, too-long, wrong rating, non-Latin review rows.
- `getBotMonitorReport` with synthetic event rows.
- State-machine transitions for `WANDER -> DETECT -> DELIVER -> RETURN`.

Required cases:

- Recently selected exact review is blocked.
- Exact review becomes eligible after 30 minutes if no fresher review exists.
- Different review from the same place remains eligible.
- Historical 3 minute review gap creates a monitor warning.
- Historical 10 second `DETECT -> DELIVER` stall creates a monitor warning.

### 3. Browser Fault-Injection Tests

Purpose: simulate the browser/Street View failures that caused overnight gaps.

Use Playwright or a small in-app fault mode. The fault mode should be disabled unless an explicit test flag is set.

Faults to simulate:

- `panToHeading()` never resolves.
- `panToHeading()` resolves slowly.
- TTS request hangs.
- TTS request returns 500.
- `/api/places` returns no reviews.
- `/api/places` returns only a recently repeated review.
- Street View coordinates stop changing.
- Google imagery emits 429/503 bursts.
- Bot leaves the review region.

Expected behavior:

- Review delivery continues or recovers within 120 seconds.
- `DETECT` timeout logs `WARN detect_timeout`.
- TTS timeout logs `WARN tts_timeout` and returns to wandering or selects a new review.
- Repeated review fallback logs `WARN review_repeat_fallback`.
- Monitor report includes the fault in warnings.

### 4. Soak Test Harness

Purpose: run the bot like an installation and fail if the audience experience collapses.

Command target:

```powershell
npm run test:soak-monitor
```

Proposed behavior:

1. Start production server or require one already running.
2. Launch one browser page at `/bot`.
3. Poll `/api/monitor/report` every 10 seconds.
4. Run for a configured duration:

```text
SMOKE: 20 minutes
SHORT_SOAK: 2 hours
OVERNIGHT: manual, report only
```

5. Fail the smoke/short soak if:

```text
maxReviewGapSeconds > 120
maxDetectStallSeconds > 6
eventSilenceSeconds > 60
exactRepeatUnder30MinutesCount > 0
teleportLoopCount > 0
stateStallCount > 0
```

6. Save a JSON report to:

```text
data/exports/monitor-reports/YYYY-MM-DD-sessionId.json
```

### 5. Post-Run Analyzer

Purpose: analyze a real overnight session after the fact.

Command target:

```powershell
npm run analyze:monitor -- --session latest
```

Output:

- Session ID and runtime.
- Total reviews.
- Reviews per hour.
- Max review gap and timestamp range.
- All review gaps above 120 seconds.
- Max `DETECT -> DELIVER` stall.
- Event silence periods.
- 429/503 raw resource counts and burst counts separately.
- Teleport causes and teleport clusters.
- Boundary events and out-of-region durations.
- Exact review repeats and repeat intervals.
- Top repeated places.
- Recommendation summary.

## Monitor API Additions

`GET /api/monitor/report` should eventually include:

```ts
{
  maxReviewGapSeconds: number;
  maxReviewGapFrom: string;
  maxReviewGapTo: string;
  reviewGapsOverThreshold: Array<{ from: string; to: string; seconds: number }>;
  maxDetectStallSeconds: number;
  detectStalls: Array<{ from: string; to: string; seconds: number }>;
  eventSilencePeriods: Array<{ from: string; to: string; seconds: number }>;
  exactRepeatUnder30MinutesCount: number;
  exactRepeats: Array<{ hash: string; previous: string; repeatedAt: string; seconds: number }>;
  rawStatusCounts: Record<number, number>;
  burstStatusCounts: Record<number, number>;
  teleportClusters: Array<{ from: string; to: string; count: number; cause: string }>;
  runtimeHeartbeatGaps: Array<{ at: string; seconds: number }>;
  runtimeHiddenEvents: number;
  runtimeBlurEvents: number;
}
```

## Proposed Implementation Order

1. Update repeat policy from session-long block to 30 minute timestamp cooldown.
2. Extend monitor report with structured max-gap, stall, repeat, and error-count fields.
3. Extend monitor report with runtime visibility, focus, lifecycle, and heartbeat-gap fields.
4. Build `analyze:monitor` post-run CLI.
5. Add fault-injection hooks behind a test-only flag.
6. Build Playwright-based 20 minute smoke verifier.
7. Build 2 hour soak verifier.

## Manual Notes For The Next Runs

For the 20 minute test:

- Start time:
- Session ID:
- Any visible pauses:
- Any `WARN detect_timeout`:
- Max review gap in `/monitor`:
- Runtime heartbeat gaps:
- Hidden/frozen/pagehide/offline runtime signals:
- Any exact repeats:

For the 2 hour test:

- Start time:
- Session ID:
- Max review gap:
- Number of gaps over 120 seconds:
- Max detect stall:
- Teleports:
- Runtime heartbeat gaps:
- Hidden/frozen/pagehide/offline runtime signals:
- Boundary events:
- 429/503:
- Exact repeats under 30 minutes:
