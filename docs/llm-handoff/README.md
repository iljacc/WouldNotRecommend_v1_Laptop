# Would Not Recommend - LLM Handoff

This is a first-pass architecture handoff for future engineers or LLM sessions. Verify behavior against the current tree when in doubt.

## Summary

`would-not-recommend` is a Next.js 15 kiosk-style web app for an art installation. A bot wanders Google Street View within a configured region, periodically asks the local SQLite review corpus for nearby businesses, selects one-star reviews, and reads them aloud with browser/local TTS.

The app does not scrape Google Maps pages and does not call Google Places APIs. Google is used for browser Street View imagery through Maps JavaScript API only.

## Tech Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 15 App Router, React 19, TypeScript |
| Styling | Tailwind CSS 4 |
| Street View | `@googlemaps/js-api-loader`, Maps JavaScript API |
| Review/session data | SQLite through `better-sqlite3`, DB at `data/db/would-not-recommend.db` |
| Speech/audio | Web Speech, local Piper/Kokoro TTS, Web Audio API |
| Activity mirror | Browser `BroadcastChannel` |

## Run And Verify

```bash
npm install
cp .env.example .env.local
npm run setup:piper
npm run dev
npm run typecheck
npm run lint
npm run build
npm run test:no-google-places
```

Populate local reviews with:

```bash
npm run import:reviews -- data/review-corpus.json
```

For a second gallery laptop, use `docs/installation-laptop.md`.

## Environment

| Variable | Role |
| --- | --- |
| `NEXT_PUBLIC_MAPS_JAVASCRIPT_API_KEY` | Browser Street View and map rendering |
| `NEXT_PUBLIC_KIOSK_MODE` | Auto-start `/bot` when true |
| `NEXT_PUBLIC_CITY_TOUR` | Optional curated multi-city rotation; `true` enables it, default/off is fixed The Hague |
| `TTS_ENGINE` | `piper` or `kokoro` |
| `PIPER_PERSISTENT_WORKER` | Default `true`; set `false` to force slower one-shot Piper for diagnostics |
| `NEXT_PUBLIC_BOT_CCTV_OVERLAY` | Optional `/bot` overlay |
| `NEXT_PUBLIC_ADMIN_PASSWORD` | Optional local admin gate |
| `GSV_KIOSK` | `npm start` browser launcher toggle; `0` disables, `1` forces |
| `GSV_KIOSK_URLS` | Optional comma-separated launcher paths; defaults to `/bot,/terminal` |
| `GSV_KIOSK_MODE` | Launcher window mode: `app` or `kiosk`; multiple windows default to `app` |
| `GSV_KIOSK_BOUNDS` | Optional semicolon-separated `x,y,width,height` window placement |

No Places API key is needed or used.

## User-Facing Routes

| Path | Purpose |
| --- | --- |
| `/bot` | Main kiosk experience |
| `/terminal` | Same-browser activity mirror via `BroadcastChannel` |
| `/monitor` | Persistent overnight run monitor and warning report |
| `/review-map` | Local review corpus coverage map |
| `/tts-lab` | Voice/subtitle timing lab using local review samples |
| `/admin` | Local tuning and diagnostics when present in the tree |

## API Routes

| Route | Purpose |
| --- | --- |
| `GET/POST /api/places` | Local SQLite place/review lookup and read marking |
| `GET/POST /api/log` | Session and review logging |
| `GET /api/log/recent` | Recent review logs |
| `GET/POST /api/monitor/events` | Persistent bot activity events for overnight diagnostics |
| `GET /api/monitor/report` | Latest/session monitor summary with warnings |
| `GET /api/geocode` | Fixed installation city label (`The Hague`) |
| `GET /api/review-map` | Local review map data |
| `GET /api/tts-lab/reviews` | Local TTS sample rows |
| `POST /api/tts` | Local speech synthesis endpoint |
| `POST /api/screenshots` | Review screenshot persistence |
| `GET /api/health` | Maps JS and local DB health |

## Core Files

| Path | Role |
| --- | --- |
| `src/app/bot/page.tsx` | Main Street View UI |
| `src/engine/bot.ts` | Orchestration: walking, detection, TTS, logging, teleports |
| `src/engine/review-manager.ts` | Local candidate cache, review filtering, repeat suppression |
| `src/engine/street-view-controller.ts` | Street View panorama wrapper and movement/camera behavior |
| `src/engine/state-machine.ts` | Bot state transitions |
| `src/lib/db.ts` | SQLite schema, local corpus lookup, read history |
| `src/lib/config.ts` | Default timing, region, local review query, review, and Street View settings |
| `src/lib/bot-settings.ts` | Settings adapter over defaults |
| `docs/local-review-database.md` | Supported local review schemas and import notes |
| `docs/how-the-bot-works.md` | Plain-English behavior description |

## Behavior Notes

- `/api/places` always serves local SQLite data.
- When a review target is selected, the bot stops walking and plays the entry
  bleep before the camera moves. By default, it turns toward the business over
  2.5 seconds with gentle easing, holds briefly, and then reads the review while
  stopped.
  During speech, the original HUD presentation remains green Processing text
  with a white pulsing text glyph. After speech, a two-second stopped hold keeps
  the exact reading view on screen. The exit
  bloop then starts immediately before the return pan begins and may overlap it;
  walking resumes only after that pan completes.
- `/bot` uses one fixed Piper voice for every review: `PIPER_VOICE_INDEX` in `src/lib/piper-config.ts`, currently `2` (`en_US-ryan-medium`, male). Do not rotate voices in the live kiosk path unless the artwork direction changes.
- `npm run setup:piper` creates `.venv-piper` and downloads only the configured Piper model plus metadata into `vendor/piper-voices/`. These generated runtime assets are intentionally ignored by Git.
- `/api/tts` reuses a persistent `scripts/piper-worker.py` process. The worker caches loaded voices, serializes synthesis requests, returns timing metadata, and restarts on a later request after exit. Worker failure falls back once to the one-shot Piper CLI. Successful responses include `Server-Timing` and `X-Piper-Model-Cache` headers.
- `/api/tts` sanitizes only the Piper-bound copy by normalizing Unicode and removing unsafe hidden control characters plus surrogate code units; subtitles keep the original review text. On synthesis failure, check the server console for full Piper stderr plus place/review context.
- `ReviewManager` queries local nearby candidates after enough time and movement have passed.
- Local nearby lookup is nearest-neighbor, capped by `PLACES.LOCAL_CORPUS_NEAREST_PLACE_LIMIT`.
- Boundary recovery prevents the bot from wandering silently outside the review corpus. After `PLACES.OUT_OF_REGION_STEPS_BEFORE_FALLBACK_REVIEW` outside-region Street View steps, `/bot` may query reviews from an in-region fallback anchor while preserving the real bot bearing for camera motion. After `PLACES.OUT_OF_REGION_STEPS_BEFORE_TELEPORT` outside-region steps, it triggers a normal `boundary_exit` teleport back into the configured review region.
- City tour is opt-in. Leave `NEXT_PUBLIC_CITY_TOUR=false` or unset for the fixed The Hague installation behavior. Set it to `true` only when deliberately testing the curated multi-city rotation in `data/city-tour.json`.
- Exact review repeat history is tracked in memory and persisted in corpus rows when supported. In-memory session history is timestamped: the current `/bot` tab avoids the same review hash for `sessionReviewRepeatCooldownMinutes` (default 30), then may reuse it if needed for cadence.
- `/terminal` is same-browser, same-origin only; it is not a persisted multi-device feed.
- `npm start` uses `scripts/start-with-kiosk.cjs` to launch production
  presentation windows after the server is ready. On Windows it defaults to
  `/bot` plus `/terminal` using one shared browser profile so `BroadcastChannel`
  still works across the two displays.
- `/monitor` persists the same activity stream to SQLite in `bot_events`, then
  summarizes long runs for review droughts, event silence, stalled non-wander
  states, boundary recovery, frequent teleports, `/bot` runtime
  visibility/heartbeat signals, black frames, and Google imagery HTTP 429/503
  errors when the browser exposes those status codes.
- `src/hooks/useRuntimeEnvironmentMonitor.ts` emits `RUNTIME` events after the
  bot starts: heartbeat, heartbeat_gap, visibilitychange, focus/blur,
  pagehide/pageshow, freeze/resume, online/offline, resize, and screen/window
  snapshots. Treat these as evidence of browser/display/OS throttling; they
  cannot log during actual machine sleep, only before and after it.
- `src/hooks/useScreenWakeLock.ts` requests the browser Screen Wake Lock API
  while `/bot` is started, and records wake-lock acquired/released/failed or
  unsupported events as `RUNTIME` activity. This is advisory and depends on the
  tab staying visible plus OS/browser policy allowing the lock.
- Street View imagery/CDN throttling is separate from review lookup. The bot watches repeated 429/5xx imagery responses and temporarily slows wander steps; avoid per-frame `setPov` behavior.
- Street View starts, teleports, nudges, and linked steps are filtered through `StreetViewService` in `src/engine/street-view-panorama-data.ts`. Coordinate searches use `StreetViewSource.OUTDOOR`, and candidate panos must have at least one outgoing link so the bot does not spawn in or step into non-walkable photospheres.
- Maps imagery diagnostics are client-only. `src/lib/maps-cdn-stress.ts` observes Street View imagery failures, `Bot` publishes `MAPS` activity lines, and `StreetViewController.sampleCanvasBrightness()` best-effort samples the Street View canvas. These diagnostics must not add Street View API calls or per-frame camera updates.
- The Street View layer has a continuous wobble in every bot state. During
  `WANDER`, maximum positive offsets are approximately 69 px horizontal and
  9 px vertical. Stopped, reading, `DETECT`, and `RETURN` states use about 14 px
  horizontal and 5.5 px vertical with reduced rotation. Registered CSS
  properties interpolate profile changes while the same eight-second irregular
  cycle continues through camera turns. Reduced-motion
  mode disables both the wobble and its transition. It transforms the rendered Street View layer
  with CSS only: it must not drive per-frame Google `setPov` updates, use browser
  timers, request extra imagery, add Google/Street View API or service calls or
  other network traffic, or change local review polling cadence.
- `ReviewStatsChip` is keyed by its displayed daily and lifetime totals. Each
  successful totals update remounts a 900 ms, `aria-hidden` pastel sparkle and
  clipped shimmer decoration without timers or changes to database refresh
  behavior. Reduced motion disables both animations.

## Local Review Corpus

Supported table families:

- `offline_places` / `offline_reviews`
- `review_corpus_places` / `review_corpus_reviews`

Local read history columns:

- `read_count`
- `last_read_at`
- `last_selected_at`

See `docs/local-review-database.md` for import formats and schema details.

## Regression Guard

`npm run test:no-google-places` scans runtime source and `.env.example` for old Places API paths, env toggles, and pagination settings. Keep it green when changing review lookup behavior.

`npm run test:street-view-css-wiggle` verifies the computed outputs from
`getStreetViewEffectStyle`, including the approximately 69/9 px `WANDER` and
14/5.5 px stopped/turning horizontal/vertical profiles, reduced rotations,
continuous eight-second irregular cycle, typed profile transitions, and
reduced-motion override. It also verifies that this style computation has no
direct browser-timer, network, or Google Street View POV side effects.
