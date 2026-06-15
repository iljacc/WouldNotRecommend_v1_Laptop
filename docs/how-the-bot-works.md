# How the GSV bot navigates, finds reviews, and moves the camera

This document describes how the installation bot behaves today: it wanders through Google Street View, checks a local SQLite review corpus for nearby businesses, chooses a one-star review, and reads it aloud. It does not scrape Google Maps pages and it does not call Google Places APIs.

## Plain English

### What "walking" means

The bot uses Google Street View as a network of 360-degree panoramas connected by links. On a timer, it picks one outgoing Street View link and jumps to the next panorama. The wander region in `src/lib/config.ts` controls which business locations count and where normal recovery teleports may land.

Start positions, teleports, and dead-end recovery resolve through the Street View service before the viewer moves. Coordinate searches request only `StreetViewSource.OUTDOOR`, and candidate panoramas must expose at least one outgoing pano link. This keeps the bot out of user-contributed photospheres where the image can be viewed but not walked.

If Street View walks outside the review region, the bot does not keep drifting silently. After one outside-region step it may query reviews from a fallback anchor inside the corpus region, so speech can continue even while recovery is pending. After two consecutive outside-region steps it triggers a normal `boundary_exit` teleport back into the configured review region.

### How it chooses a path

Each step looks at outgoing Street View links from the current panorama. Before entering a linked pano, the bot prefetches that pano's metadata and skips links that do not have walkable outgoing links:

- **Forward + wobble:** prefer the link closest to the current heading, with a little randomness.
- **Straight:** prefer the current heading without random wobble.
- **Random link:** pick any connected panorama.

After moving, the camera heading blends smoothly toward the chosen link heading.
While wandering, the rendered Street View layer also has a very slight CSS-only
wiggle. This is a local transform on the already-rendered DOM surface; it does
not call Google camera APIs or request new Street View imagery.

### How far it looks for reviews

The bot periodically asks `/api/places` for local corpus places near its current coordinates. The server returns the nearest eligible local places, capped by `PLACES.LOCAL_CORPUS_NEAREST_PLACE_LIMIT`.

The query is throttled by `queryDistanceThreshold` and `queryMinInterval`, so the bot does not ask the server on every frame. Local corpus candidates bypass the old hard detection-radius cutoff; the nearest qualifying local business can be considered even if the Street View panorama is not exactly beside it.

### How reviews show up

`GET /api/places` reads nearby businesses from SQLite tables in `data/db/would-not-recommend.db`. `POST /api/places` reads review rows for a selected local place and can mark the selected review as read.

The live bot always uses the configured Piper voice in `src/lib/piper-config.ts`.
It is currently pinned to `en_US-ryan-medium`, a male voice, for every review
readout. `/tts-lab` can still audition alternate voices without changing the
live kiosk behavior. Run `npm run setup:piper` on a new laptop to install
`.venv-piper` and download the configured model into `vendor/piper-voices/`.
Before Piper synthesis, `/api/tts` normalizes review text
and strips unsafe hidden control characters plus surrogate code units from the
Piper-only copy; subtitles keep the original review text. If synthesis still
fails, the server logs the full Piper stderr with place/review context.

Supported table families are documented in `docs/local-review-database.md`:

- `offline_places` / `offline_reviews`
- `review_corpus_places` / `review_corpus_reviews`

The bot still uses Google Maps JavaScript API for browser Street View imagery. That is separate from reviews; review data is local.

### How a review is picked

After fetching reviews for one place, the bot filters them:

- Rating must match `REVIEWS.TARGET_RATING`, default `1`.
- Text length must be within `REVIEWS.MIN_LENGTH` and `REVIEWS.MAX_LENGTH`.
- The exact review text is skipped while it is inside `reviewRepeatCooldownMinutes`.
- During the current running `/bot` tab, the exact review text is also skipped
  for `sessionReviewRepeatCooldownMinutes`, default `30`. This is a short
  session-level freshness guard, not a whole-session ban.
- Local read history is persisted with `read_count`, `last_read_at`, and `last_selected_at`.
- A simple Latin-character heuristic filters out text that is likely unsuitable for the configured voice.

If multiple reviews pass, the bot chooses by the configured mode: random, shortest, or longest. If none pass, that place is marked exhausted for `placeRetryCooldownMinutes`.

### State flow

1. **Wander:** move through Street View and periodically check local review candidates.
2. **Detect:** stop walking, face the chosen business location, and briefly hold the view.
3. **Deliver:** read the selected review aloud with subtitles and optional screenshot logging while still stopped.
4. **Return:** pan back toward the wander heading, then continue walking.
5. **Teleport:** jump to a configured destination if the bot is stuck, imagery fails, leaves the review region, or city-tour timing advances.

## Technical Reference

| Topic | Where / what |
| --- | --- |
| State machine | `src/engine/state-machine.ts` |
| Orchestration | `src/engine/bot.ts`, especially `checkForBusiness` |
| Street View movement | `src/engine/street-view-controller.ts` |
| Local places/reviews route | `src/app/api/places/route.ts` |
| Local corpus DB helpers | `src/lib/db.ts` |
| Review selection | `src/engine/review-manager.ts` |
| Defaults | `src/lib/config.ts` |
| Admin/local settings adapter | `src/lib/bot-settings.ts` |

## Defaults

| Setting | Default | Meaning |
| --- | ---: | --- |
| `queryDistanceThreshold` | 75 m | Minimum movement before another local candidate query can run |
| `queryMinInterval` | 9,000 ms | Minimum time between local candidate queries |
| `searchRadius` | 700 m | Kept for coverage visualization and settings continuity |
| `detectionRadius` | 700 m | Kept for settings continuity; local candidates bypass the hard cutoff |
| `LOCAL_CORPUS_NEAREST_PLACE_LIMIT` | 80 | Max local place candidates returned per position |
| `MAX_PLACE_DETAILS_ATTEMPTS_PER_CHECK` | 12 | Max local candidates tried per business-check tick |
| `OUT_OF_REGION_STEPS_BEFORE_FALLBACK_REVIEW` | 1 | Outside-region steps before using an in-region review anchor |
| `OUT_OF_REGION_STEPS_BEFORE_TELEPORT` | 2 | Outside-region steps before teleporting back into the corpus region |
| `minStepsBetweenReviews` | 3 | Successful Street View steps before another review can trigger |
| `reviewRepeatCooldownMinutes` | 180 | Time before the same review text can repeat |
| `sessionReviewRepeatCooldownMinutes` | 30 | Time before the same review text can repeat in the current bot tab |
| `placeRetryCooldownMinutes` | 5 | Time before retrying a place that had no passing review |

## Operational Notes

- Required remote key: `NEXT_PUBLIC_MAPS_JAVASCRIPT_API_KEY` for browser Street View.
- Review data: local SQLite only.
- Second laptop setup: `docs/installation-laptop.md`.
- City display: `/api/geocode` validates coordinates and returns the fixed
  installation label `The Hague`.
- Populate review data with `npm run import:reviews -- data/review-corpus.json` or an equivalent CSV/JSON corpus.
- Use `/review-map` to inspect local review coverage.
- Use `/tts-lab` to audition local review readout timing.
- Use `/monitor` during or after an overnight run to inspect persistent bot
  events, warning conditions, review droughts, navigation stalls, boundary
  recovery, teleports, runtime visibility/heartbeat signals, and Google imagery
  HTTP errors such as 429 and 503.
- `/bot` emits `RUNTIME` monitor events after startup. These include a periodic
  heartbeat plus browser signals for visibility, focus/blur, pagehide/pageshow,
  freeze/resume, online/offline, resize, window/screen dimensions, device pixel
  ratio, and screen orientation. JavaScript cannot log while the machine is
  actually asleep, but the first heartbeat after wake records a large
  `heartbeat_gap` delta.
- While `/bot` is running, it requests the browser Screen Wake Lock API and logs
  wake-lock acquired/released/failed/unsupported events as `RUNTIME` activity.
  This helps keep a visible kiosk display awake, but OS power settings, laptop
  lid policy, and browser visibility still take priority.
- `npm start` runs `scripts/start-with-kiosk.cjs`, which starts the production
  Next server and, by default on Windows, opens `/bot` and `/terminal` in
  fullscreen app windows using one shared browser profile. Keeping both windows
  in the same profile preserves the `/terminal` `BroadcastChannel` mirror.
  Override the launched paths with `GSV_KIOSK_URLS=/bot,/monitor` or disable
  browser launch with `GSV_KIOSK=0`.

### Troubleshooting temporary black Street View frames

If the Street View canvas flashes black for one step and recovers on the next,
first check DevTools Console/Network for Google imagery URLs such as
`*.ggpht.com`, `kh.google`, `streetviewpixels`, or `maps.googleapis.com`.
Repeated `429 Too Many Requests` responses usually mean the Street View tile CDN
is throttling a burst of pano/tile requests, not that local review lookup is
broken.

Recommended checks:

- Confirm the errors are imagery tile requests, not `/api/places`, `/api/log`, or
  `/api/geocode`.
- Watch `/terminal` for `MAPS` lines:
  - `MAPS imagery status=...` means the browser observed an individual
    throttled or failed Google imagery resource. These lines are throttled so a
    burst does not flood the terminal.
  - `MAPS tile/CDN burst ... -> wander ...` means repeated 429/502/503/504
    imagery responses hit the rolling threshold and adaptive wander backoff
    activated.
  - `MAPS recovered ...` means the quiet timer elapsed and the bot restored the
    configured wander cadence.
  - `MAPS black-frame ...` means the app sampled a near-black Street View canvas
    and included recent Maps error counts for correlation.
- Watch `/monitor` for persistent summaries:
  - The `429 / 503` metric counts explicit Google imagery HTTP failures captured
    by browser Performance Resource Timing when the status is exposed.
  - `Warnings` flags long gaps without events, long gaps without reviews, lack of
    movement steps, stuck non-wander states, boundary activity, repeated
    teleports, runtime heartbeat/visibility problems, and black-frame
    diagnostics.
  - `Runtime signals` is shown as `events / heartbeat gaps / hidden events`.
    If a long review gap overlaps `RUNTIME` heartbeat gaps, hidden visibility,
    blur/focus loss, freeze/pagehide, or offline signals, the gap likely involved
    browser, display, OS sleep, or tab throttling rather than review data.
  - The event tail is stored in SQLite, so it remains available in the morning
    even if `/terminal` was not open.
- If black frames persist, increase `MAPS_CDN.STRESS_MIN_WANDER_INTERVAL_MS` or
  `TIMING.WANDER_STEP_INTERVAL` in `src/lib/config.ts`.
- Keep `STREET_VIEW.WANDER_LOOK_FLOAT_ENABLED` CSS-only. Tune the wiggle through
  `WANDER_LOOK_SWAY_DEG`, `WANDER_LOOK_PITCH_SWAY_DEG`, and
  `WANDER_LOOK_DRIFT`; avoid per-frame `setPov` calls.
- Avoid running multiple `/bot` tabs with the same Maps key during testing,
  because each tab adds Street View tile load.
- Development Fast Refresh and dev-server reloads can add extra Street View
  churn. Compare against a production run with `npm run build` and
  `npm run start:next` before changing cadence defaults.
