# AGENTS.md

This file is the first-stop context note for new agent sessions working in this repo.
For deeper architecture details, read `docs/llm-handoff/README.md`.

## Project Scope

`would-not-recommend` is a Next.js kiosk-style web app for an art installation:

- A Google Street View bot wanders within a configured region, defaulting to Den Haag.
- It queries the local SQLite review corpus through server routes, finds nearby businesses, selects one-star reviews, and reads them aloud in the browser.
- The main experience lives at `/bot`; `/terminal` mirrors bot activity via `BroadcastChannel`; `/admin` exposes local tuning, diagnostics, and saved region controls.
- Review/session metadata is stored in SQLite via `better-sqlite3`.

Keep work focused on that installation experience. Avoid turning this into a generic maps app, review platform, dashboard product, or crawler unless the user explicitly asks.

## Tech Stack

- Next.js 15 App Router, React 19, TypeScript
- Tailwind CSS 4
- Google Maps JavaScript API for browser Street View; local/offline server data for reviews and reverse geocoding
- SQLite through `better-sqlite3`
- Browser APIs for speech, audio, Street View, and tab-local activity broadcasting

## Important Paths

- `src/app/bot/page.tsx` - main Street View kiosk page
- `src/engine/bot.ts` - core orchestration for walking, detecting, reviewing, logging, and teleporting
- `src/engine/street-view-controller.ts` - Street View panorama wrapper and movement/camera behavior
- `src/engine/state-machine.ts` - bot state transitions
- `src/engine/review-manager.ts` - nearby place/review selection and repeat suppression
- `src/lib/config.ts` - default timing, region, local review query, review, and Street View settings
- `src/lib/bot-settings.ts` - admin/localStorage-tunable settings
- `src/lib/db.ts` - SQLite schema and persistence helpers
- `src/lib/bot-activity.ts` - activity messages consumed by `/terminal`
- `src/app/api/*` - server routes for log, local places/reviews, offline geocode, health, screenshots, and TTS
- `data/teleport-destinations.json` - configured teleport destinations
- `docs/how-the-bot-works.md` - plain-English behavior explanation
- `docs/llm-handoff/README.md` - full LLM/maintainer handoff

## Run And Verify

Use these commands from the repository root:

```bash
npm run dev
npm run typecheck
npm run lint
npm run build
```

Environment setup:

- Copy `.env.example` to `.env.local` for local secrets.
- Required Google keys are documented in `.env.example` and `docs/llm-handoff/README.md`.
- Do not commit real keys, `.env`, generated DB files, screenshots, `node_modules`, `.next`, or local logs.

## Working Rules

- Prefer existing architecture and settings hooks before adding new global state.
- Keep bot behavior understandable as an installation: changes to timing, camera movement, sound, review cadence, and teleport logic affect the live artwork.
- Treat Google Street View imagery/CDN pressure carefully. Avoid increasing local review polling or per-frame `setPov` behavior without a clear reason.
- Keep browser-only code out of server routes and server-only code out of client components.
- Preserve the separation between:
  - client bot/runtime behavior in `src/engine`, `src/hooks`, and `src/components`
  - server API/data behavior in `src/app/api` and `src/lib/db.ts`
  - defaults in `src/lib/config.ts`
  - admin overrides in `src/lib/bot-settings.ts`
- If behavior changes, update the relevant docs, especially `docs/how-the-bot-works.md` and `docs/llm-handoff/README.md`.

## Product Notes

- `/terminal` is same-browser, same-origin only because it uses `BroadcastChannel`; it is not a persisted multi-device feed.
- The bot does not scrape Google Maps pages and does not call Google Places APIs. Reviews come from the local SQLite corpus.
- The default review target is one-star reviews with length and repeat-cooldown filters.
- Kiosk behavior is controlled by `NEXT_PUBLIC_KIOSK_MODE`.
