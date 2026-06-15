# Overnight Bot Monitor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Persist and summarize long-running bot behavior so an overnight kiosk run can be inspected for navigation stalls, review droughts, Street View imagery failures, and 429/503 bursts.

**Architecture:** Reuse the existing bot activity stream as the capture point, persist structured events in SQLite, expose monitor APIs for recent events and derived run reports, and add a `/monitor` page for live status plus morning-after analysis. Keep review/session logging intact and treat monitor events as operational diagnostics.

**Tech Stack:** Next.js App Router, React client page, TypeScript, SQLite through `better-sqlite3`, existing `BroadcastChannel` bot activity utilities.

---

## Scope

- Record every `postActivity()` message to a durable `bot_events` table.
- Attach the active bot `sessionId` to activity messages once a session starts.
- Preserve existing `/terminal` behavior.
- Capture Google Maps imagery HTTP failures, especially `429` and `503`, from the existing PerformanceObserver diagnostics.
- Add monitor APIs:
  - `GET /api/monitor/events`
  - `POST /api/monitor/events`
  - `GET /api/monitor/report`
- Add `/monitor` for live overnight status and morning-after warnings.

## Derived Warnings

The report should flag:

- No events recently while the session appears active.
- No successful review read for 45+ minutes.
- No `SEARCHING` movement step for 10+ minutes.
- State stuck in `DETECT`, `DELIVER`, `RETURN`, or `TELEPORT` for 5+ minutes.
- Any 429 or 503 imagery events.
- Repeated teleport activity.
- Boundary fallback/exit activity.
- Black-frame events.

## Implementation Tasks

### Task 1: SQLite Event Storage

**Files:**
- Modify: `src/lib/db.ts`
- Modify: `src/lib/types.ts`

Add `bot_events` with columns for `session_id`, `timestamp`, `tag`, `message`, `lat`, `lng`, `state`, `status_code`, and JSON metadata. Add helper functions to insert, query recent events, list sessions, and build an overnight report.

### Task 2: Monitor API

**Files:**
- Create: `src/app/api/monitor/events/route.ts`
- Create: `src/app/api/monitor/report/route.ts`

Use the DB helpers. `POST /api/monitor/events` accepts client activity messages. `GET /api/monitor/events` returns recent rows. `GET /api/monitor/report` returns the latest or requested session summary.

### Task 3: Activity Persistence

**Files:**
- Modify: `src/lib/bot-activity.ts`
- Modify: `src/engine/bot.ts`

Extend activity payloads with optional structured metadata, current session ID, status code, state, and coordinates. Keep the public helper easy to call. Persist events with `navigator.sendBeacon()` when available, falling back to `fetch(..., { keepalive: true })`.

### Task 4: Monitor Page

**Files:**
- Create: `src/app/monitor/page.tsx`

Build a dense, operational page that polls the report and recent events. Show current session, runtime, counts, warnings, latest review, latest errors, and the raw event tail.

### Task 5: Documentation And Verification

**Files:**
- Modify: `docs/how-the-bot-works.md`
- Modify: `docs/llm-handoff/README.md`

Document how to use `/monitor` during an overnight run and how 429/503 imagery errors are surfaced.

Run:

```bash
npm run typecheck
npm run lint
```
