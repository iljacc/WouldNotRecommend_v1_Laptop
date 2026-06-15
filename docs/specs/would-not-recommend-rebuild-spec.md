# Would Not Recommend Rebuild Specification

This document is the rebuild specification for `would-not-recommend`, a kiosk-style web artwork built around autonomous Google Street View wandering and local one-star review readouts.

It is written so another implementation agent can rebuild the app without needing the original source tree. Preserve the artwork behavior and visible experience first. Internal architecture may differ if the external behavior, data contracts, timing, and operator surfaces remain equivalent.

## 1. Product Definition

### 1.1 One-sentence concept

An autonomous bot wanders through Google Street View, finds nearby businesses from a local review corpus, faces them, reads a one-star review aloud, logs the event, then continues wandering.

### 1.2 Required experience

The app must feel like a self-running installation, not a conventional map product. The visitor should see a full-screen Street View journey with a sparse diagnostic HUD, subtle surveillance/computer-vision mood, generated ambient sound, and one-star reviews delivered as spoken narration with typewriter subtitles.

### 1.3 Non-goals

Do not rebuild this as:

- a generic Google Maps browser
- a public review platform
- a scraper or crawler
- a multi-user dashboard
- a live Google Places review app
- an admin-heavy SaaS product

Reviews must come from the local SQLite corpus. Google is used for browser Street View imagery only.

## 2. Technology Baseline

Use equivalent tools if needed, but the current rebuild target is:

| Layer | Requirement |
| --- | --- |
| App framework | Next.js App Router with React and TypeScript |
| Styling | Tailwind-style utility CSS or equivalent CSS |
| Street View | Google Maps JavaScript API, Street View panorama in browser |
| Review storage | Local SQLite database |
| DB library | Synchronous or async SQLite wrapper equivalent to `better-sqlite3` |
| Audio | Web Audio API |
| TTS | Server-generated WAV via local Piper by default; Kokoro optional for lab |
| Activity feed | Browser `BroadcastChannel`, same-origin and same-browser only |

Required env/config:

| Variable | Meaning |
| --- | --- |
| `NEXT_PUBLIC_MAPS_JAVASCRIPT_API_KEY` | Required for Street View and review map rendering |
| `NEXT_PUBLIC_KIOSK_MODE` | If `true`, `/bot` auto-starts after 1 second |
| `NEXT_PUBLIC_CITY_TOUR` | If not `"false"`, enable curated city-tour rotation when data exists |
| `NEXT_PUBLIC_BOT_CCTV_OVERLAY` | If `true`, enable optional decorative Three.js CCTV overlay |
| `TTS_ENGINE` | Default TTS engine for `/api/tts`; default `piper` |
| `PIPER_PATH` | Optional explicit Piper executable |
| `KOKORO_PYTHON_PATH` | Optional explicit Kokoro Python executable |
| `KOKORO_VOICE`, `KOKORO_SPEED`, `KOKORO_LANG` | Optional Kokoro defaults |

## 3. Top-level Routes

### 3.1 `/`

Redirect immediately to `/bot`.

### 3.2 `/bot`

The main kiosk artwork.

Behavior:

- Render a full-viewport Street View canvas.
- Hide the OS/browser cursor while on this route.
- If kiosk mode is enabled, auto-start the bot after 1 second.
- If kiosk mode is disabled, show a transparent full-screen "Click to start" button until user activation starts audio and Street View.
- If startup fails, show the startup error in place of "Click to start".
- No conventional navigation, menus, or explanatory text appear in the artwork view.

Layer order from back to front:

1. Static fallback background image, `public/connection-lost-bg.png`, centered and cover-sized.
2. Google Street View panorama layer.
3. Optional CCTV/WebGL overlay at low opacity.
4. Teleport dim/black overlay.
5. HUD and subtitles.
6. Start overlay button when not started and not in kiosk mode.

### 3.3 `/terminal`

Same-browser bot activity mirror.

Behavior:

- Subscribe to the `gsv-bot-activity` `BroadcastChannel`.
- Show up to the most recent 500 formatted lines.
- Auto-scroll to the newest line.
- When empty, show: `Waiting for bot activity... (start the experience at /bot)`.
- This page is not persisted, not cross-device, and not server-synchronized.

Visual style:

- Full viewport.
- Dark green-black terminal background.
- Monospace text in muted green.
- Teleport lines are purple-tinted.
- State lines are brighter green.
- Font size scales with viewport using a constrained clamp.

### 3.4 `/review-map`

Operator-only visual coverage map for the local review corpus.

Behavior:

- Load Google Maps JavaScript API.
- Fetch `GET /api/review-map`.
- Draw the bot wander region as a green polygon/box.
- Draw the search radius as a subtle amber circle around the region center.
- Draw all corpus places as circles:
  - orange/red for places inside the region
  - gray/desaturated for places outside the region
  - radius and fill opacity scale with one-star review count
- Draw spawn/teleport starts as numbered markers.
- Draw a blue polyline through spawn positions.
- Clicking a review circle populates "Selected place" details in the side panel.

Layout:

- Desktop: map left, 360 px side panel right.
- Mobile/narrow: map top, side panel below.
- Dark operator UI, monospace text, compact diagnostic cards.

### 3.5 `/tts-lab`

Operator-only TTS and subtitle timing lab.

Behavior:

- Fetch review samples from `GET /api/tts-lab/reviews`.
- Allow selecting a review sample and editing the text.
- Allow selecting TTS engine:
  - Piper with voice index and length scale.
  - Kokoro with voice and speed.
- Allow adjusting:
  - hold before voice
  - subtitle lead/lag
  - linger after voice
- POST to `/api/tts`, play returned WAV, and preview subtitle reveal timing.
- This page must not change live `/bot` settings.

## 4. Main Bot Runtime

### 4.1 Core state model

The bot has exactly these runtime states:

| State | Mode label | Meaning |
| --- | --- | --- |
| `WANDER` | `Searching` | Walking through Street View and periodically querying local candidates |
| `DETECT` | `Searching` | Stopped and panning toward the selected business |
| `DELIVER` | `Processing` | Reading the selected review aloud |
| `RETURN` | `Processing` | Panning back to the pre-review road heading |
| `TELEPORT` | `Processing` | Fading, jumping to a new spawn, and fading back in |

`Searching` is used for `WANDER` and `DETECT`. `Processing` is used for all other states.

### 4.2 Initial session

On start:

1. Initialize Web Audio and resume it.
2. Choose spawn:
   - If city tour is active, choose a random spawn from the current city-tour stop.
   - Else choose a custom spawn if configured.
   - Else choose a point from `data/teleport-destinations.json` inside the wander region.
   - Else choose a random coordinate in the wander region.
3. Create initial context:
   - state `WANDER`
   - mode `Searching`
   - current coords at spawn
   - city `Unknown`, unless city tour supplies a label
   - review count 0
   - steps since last review equal to the minimum, so an initial review can trigger after the first candidate query
4. Initialize Street View at spawn with default UI disabled.
5. Create a session row through `/api/log`.
6. Post a `SESSION` activity message.
7. Start ambient audio.
8. Start walking.
9. Start periodic checks.
10. If city tour is off, resolve city label from `/api/geocode`.

### 4.3 State transitions

Required transition table:

| Current | Event | Next | Effects |
| --- | --- | --- | --- |
| `WANDER` | `BUSINESS_DETECTED` | `DETECT` | stop walking, crossfade to processing ambience, pan to business bearing |
| `WANDER` | `STUCK_DETECTED` or `TELEPORT_TRIGGERED` | `TELEPORT` | stop walking, start teleport fade |
| `DETECT` | `DETECT_COMPLETE` with review text | `DELIVER` | duck ambient, take screenshot, start TTS |
| `DETECT` | `DETECT_COMPLETE` without text | `RETURN` | pan to wander heading, schedule return complete |
| `DETECT` | `TELEPORT_TRIGGERED` | `TELEPORT` | stop walking, start teleport fade |
| `DELIVER` | `DELIVER_COMPLETE` | `RETURN` | unduck ambient, log review, increment counter, pan to wander heading |
| `DELIVER` | `TELEPORT_TRIGGERED` | `TELEPORT` | stop walking, start teleport fade |
| `RETURN` | `RETURN_COMPLETE` | `WANDER` | play bloop, crossfade to searching ambience, start walking |
| `RETURN` | `TELEPORT_TRIGGERED` | `TELEPORT` | stop walking, start teleport fade |
| `TELEPORT` | `TELEPORT_COMPLETE` | `WANDER` | crossfade to searching ambience, start walking |

The heading before review must be captured when leaving `WANDER` for `DETECT`, then used during `RETURN`.

### 4.4 Timing defaults

| Setting | Default |
| --- | ---: |
| Align pan to business | 1350 ms |
| Hold after align | 450 ms |
| Return pan duration | 1200 ms |
| Return state timer | 1400 ms |
| Wander step interval | 3000 ms |
| Teleport fade out | 2000 ms |
| Teleport dim hold | 1000 ms |
| Teleport fade in | 2000 ms |
| Audio crossfade | 4000 ms |
| Stuck check interval | 12000 ms |
| Stuck distance threshold | 10 m |
| Stats update interval | 30000 ms |
| Subtitle linger after complete | 3500 ms |
| Subtitle fade out | 1200 ms |

Imagery-fault recovery teleports use short fades instead of the full teleport timing:

- fade out: 80 ms
- fade in: 120 ms

### 4.5 Wander region defaults

Default region is central The Hague:

| Bound | Value |
| --- | ---: |
| minLat | 52.071814 |
| maxLat | 52.084390 |
| minLng | 4.303831 |
| maxLng | 4.324271 |

Default start placeholder before real spawn:

```text
52.078102, 4.314051
```

Containment may be a bounding box or polygon. If a polygon path with at least three vertices exists, use polygon containment. Otherwise use the bounding box.

## 5. Street View Navigation

### 5.1 Street View initialization

Use Google Maps JavaScript API Street View panorama with:

- address control off
- fullscreen control off
- motion tracking off
- pan control off
- zoom control off
- links control off
- close button off
- road labels off
- click-to-go off
- default UI disabled
- scroll wheel off
- double-click zoom off
- zoom `0`

### 5.2 Walking

Walking means jumping from one Street View panorama to a linked next panorama on a timer.

Each step:

1. Read outgoing Street View links.
2. If no links exist, nudge to a random coordinate 28-260 m away and randomize heading.
3. Otherwise choose the next link by the configured link mode:
   - `forward_wobble`: choose link closest to current heading, adding random wobble.
   - `straight`: choose link closest to current heading with no wobble.
   - `random_link`: choose any outgoing link uniformly.
4. Set the new pano.
5. Smoothly blend heading to the chosen link heading over 520 ms.
6. Count a successful wander step only after the heading blend settles.

Default Street View camera settings:

| Setting | Default |
| --- | ---: |
| heading wobble | 15 degrees |
| fov | 90 |
| pitch | 0 |
| step heading blend | 520 ms |

### 5.3 Camera movement

Scripted pans use the shortest angular path and an ease-in-out quint curve. The bot only calls real Street View POV updates for:

- heading blends after navigation steps
- pan to selected business
- pan back to wander heading
- applying current heading after teleport/nudge/stop

Do not implement per-frame wandering look as Google `setPov`; it risks extra imagery/tile churn. The wandering look drift must be a local CSS transform on the rendered Street View layer.

### 5.4 Imagery fault handling

Monitor Street View status:

- `OK`: imagery is renderable, reset fault state.
- `ZERO_RESULTS`: trigger imagery-fault teleport.
- non-OK after previously seeing OK: trigger imagery-fault teleport.
- `UNKNOWN_ERROR` before ever seeing OK: allow 3500 ms grace, then trigger imagery-fault teleport.

Debounce status checks by roughly 200 ms. Avoid repeated fault events until status becomes OK again or a teleport resets fault state.

### 5.5 Maps CDN stress handling

Monitor browser performance resources for Google imagery/tile errors. If at least five `429` or `5xx` Maps/Street View resource responses occur within 10000 ms:

- mark CDN stress backoff active
- if currently wandering, raise walking interval to at least 9000 ms
- post a `MAPS` activity message
- after 90000 ms of quiet, restore the configured wander interval
- ignore repeated burst callbacks for roughly 4000 ms

This is separate from local review lookup.

## 6. Review Discovery and Selection

### 6.1 Candidate query cadence

While in `WANDER`, every 3000 ms run the business check. A review may trigger only when:

- state is `WANDER`
- running is true
- `stepsSinceLastReview >= minStepsBetweenReviews`

Defaults:

| Setting | Default |
| --- | ---: |
| query distance threshold | 75 m |
| query minimum interval | 9000 ms |
| search radius | 700 m |
| detection radius | 700 m |
| minimum successful steps between reviews | 3 |
| nearest local place limit | 80 |
| max place details attempts per check | 12 |

If the bot has moved far enough and enough time has passed, call `GET /api/places?lat={lat}&lng={lng}&radius={searchRadius}&targetRating={targetRating}`.

Local corpus candidates are nearest-neighbor and do not need to be within hard detection radius. Legacy/non-local candidates, if ever reintroduced, must remain detection-radius gated.

### 6.2 Candidate sorting

For each local place candidate:

- reject if no location
- reject if outside wander region
- compute current bearing from bot to place
- compute current haversine distance
- include `rating` and `totalRatings` when available

Sort candidates:

1. nearest first
2. lower aggregate rating first
3. higher total ratings first

Places that recently had no passing review are exhausted for 5 minutes by default.

### 6.3 Review filtering

When a candidate is selected, POST to `/api/places` with:

```json
{
  "placeId": "string",
  "targetRating": 1,
  "minLength": 20,
  "maxLength": 500,
  "cooldownMinutes": 180
}
```

Filter returned reviews:

- rating exactly equals target rating, default `1`
- text length between 20 and 500 characters
- exact text hash has not been read within 180 minutes, unless the server marks the result as recent fallback
- at least 50 percent of non-whitespace characters are Latin letters

Review selection mode:

- `random` by default
- `shortest` optional
- `longest` optional

When a review is selected:

- set its in-memory hash read timestamp immediately
- call `/api/places` again with `action: "markRead"`
- use fixed live Piper voice index 2
- prepare TTS before panning when possible
- post a `REVIEW` activity message with metadata and the review text
- transition to `DETECT`

If no review passes, mark the place exhausted and continue trying candidates up to the per-check attempt limit.

### 6.4 Review text hash

Hash exact review text into a stable short string. The original implementation uses a simple signed 32-bit rolling hash and emits `r_{abs(hash).toString(36)}`. Any deterministic exact-text hash is acceptable if repeat suppression is preserved.

## 7. Teleportation and City Tour

### 7.1 Teleport causes

Teleport when:

- stuck detection fires
- Street View imagery fault fires
- city-tour segment expires
- an explicit teleport event interrupts detect/deliver/return

Telemetry cause labels should distinguish:

- `stuck_threshold`
- `imagery_fault`
- `scheduled_city_hop`
- `interrupt_during_detect`
- `interrupt_during_deliver`
- `interrupt_during_return`

### 7.2 Stuck detection

Every stuck-check interval while in `WANDER`:

- compare current coords with last stuck-check coords
- if elapsed time is at least 12000 ms and distance is less than 10 m, trigger teleport
- if distance is at least 10 m, update stuck-check anchor and timestamp

Reset stuck detection after every teleport.

### 7.3 Teleport sequence

For normal teleports:

1. Set teleport phase `fade-out`.
2. Fade master audio to silence.
3. Wait fade-out duration.
4. Set teleport phase `warp`.
5. Wait dim hold duration.
6. Pick destination.
7. Set Street View position to destination.
8. Randomize heading.
9. Clear current target business and review.
10. Increment teleport count.
11. Update session stats.
12. Set teleport phase `fade-in`.
13. Fade master audio back in.
14. Wait fade-in duration.
15. Set phase `none`.
16. Dispatch `TELEPORT_COMPLETE`.

The visible teleport effect is black overlay opacity plus blur on the Street View layer.

### 7.4 Destination selection

If city tour supplies an explicit next-city destination, use it.

Otherwise:

- If custom spawn points exist, pick a custom spawn inside the wander region, falling back to any custom spawn if none are in region.
- Else if city tour is active and a city anchor is provided, pick a random coordinate 35-450 m from that anchor, avoiding destinations within 22 m of current coords when possible.
- Else pick a random configured teleport destination inside the wander region, avoiding immediate repeats within 25 m when possible.
- Else pick a random coordinate inside the wander region.
- Last fallback: random coordinate 120-650 m from current coords.

### 7.5 City tour

Use `data/city-tour.json` with stops:

```ts
type CityTourStop = {
  label: string;
  spawnPoints: { lat: number; lng: number; label?: string }[];
};
```

City tour is active when:

- `NEXT_PUBLIC_CITY_TOUR !== "false"`
- at least one stop exists
- every stop has at least one spawn point

Default segment duration: 600000 ms, or 10 minutes.

Behavior:

- Start at a random spawn from current stop.
- Show current city label in HUD.
- Show countdown to segment end.
- Show next stop label.
- When the segment expires, trigger scheduled teleport only while in `WANDER`.
- If segment expires during `DETECT`, `DELIVER`, `RETURN`, or `TELEPORT`, defer until the bot returns to `WANDER`.
- Scheduled city teleport uses the next stop's random spawn.
- After scheduled teleport completes, advance city index and reset segment clock.

## 8. Audio and Speech

### 8.1 Audio graph

Use Web Audio:

- master gain to destination
- TTS gain into master
- ambient layer A gain into master
- ambient layer B gain into master
- SFX gain into master

Default volumes:

| Channel | Gain |
| --- | ---: |
| master | 0.875 |
| ambient searching | 0.375 |
| ambient processing | 0.3125 |
| ambient deliver ducked | 0.1 |
| SFX | 0.5 |
| TTS | 0.2 |

### 8.2 Ambient sound

Generate two looping 30-second mono drone buffers:

- Layer A base frequency around 120 Hz for searching.
- Layer B base frequency around 150 Hz for processing.
- Each combines low sine tones plus slight noise.
- Crossfade between A and B over the configured audio crossfade duration.

### 8.3 SFX

Generate short 0.3 s tone buffers:

- bleep: 660 Hz rising to 825 Hz
- bloop: 550 Hz falling to 440 Hz, or equivalent descending tone

Use the bloop when returning to wander. A bleep buffer may exist for future/optional cues.

### 8.4 TTS

Live `/bot` uses Piper through `/api/tts`.

Default live voice:

| Index | Model |
| ---: | --- |
| 2 | `vendor/piper-voices/en_US-ryan-medium.onnx` |

Supported Piper models:

| Index | Model |
| ---: | --- |
| 0 | `en_US-lessac-medium.onnx` |
| 1 | `en_US-amy-medium.onnx` |
| 2 | `en_US-ryan-medium.onnx` |
| 3 | `en_US-joe-medium.onnx` |
| 4 | `en_US-hfc_female-medium.onnx` |
| 5 | `en_US-norman-medium.onnx` |
| 6 | `en_US-libritts_r-medium.onnx` |

Live TTS flow:

1. Prepare/fetch TTS audio after selecting review.
2. On `DELIVER`, set subtitle to full text with revealed count 0.
3. Play decoded WAV through TTS gain.
4. Reveal subtitle characters in proportion to audio playback progress.
5. At end, reveal full text.
6. Linger 3500 ms.
7. Fade subtitles for 1200 ms.
8. Clear subtitle payload.

If TTS fails, log error to console and still complete the delivery state so the bot does not stall.

### 8.5 `/api/tts`

Accept `POST` JSON:

```json
{
  "text": "string",
  "engine": "piper",
  "piperVoiceIndex": 2,
  "piperLengthScale": 1,
  "kokoroVoice": "af_heart",
  "kokoroSpeed": 1
}
```

Requirements:

- Reject invalid JSON with HTTP 400.
- Trim text.
- Reject missing text with HTTP 400.
- Reject text over 8000 characters with HTTP 400.
- Write temporary files under `.tmp`.
- Return `audio/wav` with `Cache-Control: no-store`.
- Delete temp files after synthesis.
- For Piper:
  - default engine
  - clamp length scale to 0.5-2 if provided
  - use requested valid voice index or default index 2
  - run local Piper executable/module with selected ONNX model
- For Kokoro:
  - optional lab engine
  - clamp speed to 0.5-2
  - run local `scripts/kokoro-synth.py`

## 9. Visual and UI Specification

### 9.1 Overall visual language

The app should feel like a sparse surveillance terminal layered over real Street View:

- full-bleed imagery
- no cards around the main image
- monochrome/low-saturation HUD
- black translucent chips
- small monospace text
- no marketing copy
- no decorative hero section
- no visible instructions in `/bot` except the start overlay when needed
- Google default Street View UI hidden as much as possible

### 9.2 `/bot` HUD layout

HUD is pointer-events none and fills the viewport.

Required positions:

- Top-left: review stats chip.
- Top-right: coordinate chip and city/time chip stacked right-aligned.
- Bottom-right: mode chip with pulsing glyph and mode label.
- Bottom-center: subtitles while a review is being read.

Spacing:

- 24 px from viewport edges on small screens.
- 32 px from viewport edges on larger screens.

Typography:

- Monospace everywhere.
- Small HUD text.
- No negative letter spacing.

### 9.3 Review stats chip

Show:

- today's review count if known
- lifetime total review count if known

Stats are loaded from `/api/log` on page start, refreshed every 60 seconds, and refreshed again shortly after session review count increases.

### 9.4 Coordinates chip

Show current latitude and longitude with fixed precision suitable for a kiosk diagnostic readout, typically 5 or 6 decimals.

### 9.5 City/time chip

If city tour is inactive:

- Show fixed city label and session elapsed time.

If city tour is active:

- Show current city label and countdown to the city segment end.
- Show second line: `Next: {nextCityLabel}`.

The fixed geocode route returns `The Hague, Netherlands` for valid coordinates when city tour is off.

### 9.6 Mode chip

Show a pulsing glyph and text mode:

- `Searching` for `WANDER` and `DETECT`.
- `Processing` for `DELIVER`, `RETURN`, `TELEPORT`.
- During scheduled city-tour teleport, show city-hop styling: purple ellipsis pulse and a teleport-specific mode text/style.

Glyph behavior:

- `WANDER`: magnifier icon.
- `DELIVER`: text-lines icon.
- all other states: horizontal ellipsis.
- Pulse size base: 30 px.
- Searching cycle: 2000 ms.
- Processing cycle: 1000 ms.
- Scheduled city teleport cycle: 5000 ms and violet color.

### 9.7 Subtitles

Subtitles are not a full card. They are bottom-center text with black highlighter strips behind inline text.

Requirements:

- `aria-live="polite"`.
- Width: no wider than 42 rem and constrained by viewport.
- Bottom position must avoid the bottom-right mode chip on small screens.
- Text is centered, balanced, wraps words, and can scroll vertically if too long.
- Max subtitle block height: about `min(28vh, calc(50svh - 9rem))`.
- Text color: near-white at about 88 percent opacity.
- Background strip: black at about 55 percent opacity.
- While typing, show a thin blinking cursor after visible text.
- After full text is revealed, linger then fade out.

### 9.8 Street View visual effects

Apply color grading by bot state:

| State | Brightness | Saturation | Hue rotate |
| --- | ---: | ---: | ---: |
| `WANDER` | 0.98 | 0.95 | -2 deg |
| `DETECT` | 1.00 | 1.00 | 0 deg |
| `DELIVER` | 0.97 | 0.93 | 0 deg |
| `RETURN` | 0.98 | 0.95 | -1 deg |
| `TELEPORT` | 1.00 | 1.00 | 0 deg |

Transitions:

- normal color transition: 3000 ms ease
- teleport fade-out filter transition: 2000 ms ease-in
- teleport fade-in filter transition: 2000 ms ease-out
- warp filter transition: 120 ms linear

Teleport blur:

- no blur when phase `none` or `fade-in`
- 14 px blur when phase `fade-out` or `warp`

Teleport overlay opacity:

- `none`: 0
- `fade-out`: 0.88
- `warp`: 0.94
- `fade-in`: 0

### 9.9 Wandering visual drift

While in `WANDER` and not teleporting, apply a CSS-only transform animation to the Street View layer if enabled.

Defaults:

| Setting | Default |
| --- | ---: |
| enabled | true |
| yaw sway | 1.2 deg |
| pitch sway | 0.25 deg |
| drift | 0.42 |

Convert these into subtle pixel translations, tiny rotation, and slight scale so no black edges show. Do not call Google camera APIs for this effect.

### 9.10 Optional CCTV overlay

If `NEXT_PUBLIC_BOT_CCTV_OVERLAY=true`, mount a pointer-events-none full-screen Three.js overlay between Street View and HUD:

- z-index below HUD and above Street View
- opacity about 0.1
- purely decorative/experimental
- app must work identically when disabled

## 10. Data Model and Persistence

### 10.1 SQLite location

Use:

```text
data/db/would-not-recommend.db
```

Create the directory automatically.

Use WAL mode and foreign keys.

### 10.2 Required app tables

`review_log`:

| Column | Type | Notes |
| --- | --- | --- |
| id | integer primary key | autoincrement |
| session_id | text | required |
| entry_number | integer | required |
| timestamp | text | ISO timestamp |
| lat | real | bot coords at read |
| lng | real | bot coords at read |
| city | text | default `Unknown` |
| business_name | text | required |
| business_type | text | default empty |
| review_text | text | required |
| review_rating | integer | default 1 |
| tts_duration_seconds | real | default 0 |
| screenshot_filename | text | default empty |
| created_at | text | DB timestamp |

`sessions`:

| Column | Type | Notes |
| --- | --- | --- |
| id | integer primary key | autoincrement |
| session_id | text unique | required |
| started_at | text | DB timestamp |
| ended_at | text | optional |
| runtime_seconds | real | default 0 |
| distance_km | real | default 0 |
| locations_scanned | integer | default 0 |
| reviews_read | integer | default 0 |
| screenshots_taken | integer | default 0 |
| teleports | integer | default 0 |

`countries_visited`:

| Column | Type | Notes |
| --- | --- | --- |
| id | integer primary key | autoincrement |
| country | text unique | required |

### 10.3 Supported review corpus tables

Support both table families.

`review_corpus_places`:

| Column | Required meaning |
| --- | --- |
| place_id | primary key exposed to bot |
| name | business name |
| lat, lng | coordinates |
| types_json | JSON array or CSV-like fallback |
| rating | optional aggregate rating |
| total_ratings | optional aggregate count |
| source | source label |
| source_url | optional source URL |

`review_corpus_reviews`:

| Column | Required meaning |
| --- | --- |
| id | local review id |
| place_id | references place |
| review_text | text to read |
| review_rating | star rating |
| author_name | optional |
| relative_time_description | optional |
| source | source label |
| source_url | optional source URL |
| read_count | local read counter |
| last_read_at | ISO timestamp |
| last_selected_at | ISO timestamp |

Legacy/offline family:

- `offline_places`
- `offline_reviews`

Expose offline place IDs to the client as `offline:{id}`.

### 10.4 Read history

When marking a review read:

- increment `read_count`
- set `last_read_at` to current ISO timestamp
- set `last_selected_at` to same timestamp

If a review ID is provided, update by ID. Otherwise update by exact review text.

## 11. API Contract

All server routes run in Node.js runtime.

### 11.1 `GET /api/places`

Query params:

- `lat`: required number
- `lng`: required number
- `radius`: accepted for compatibility
- `targetRating`: optional number

Responses:

Success:

```json
{
  "places": [
    {
      "placeId": "string",
      "name": "string",
      "location": { "lat": 0, "lng": 0 },
      "types": ["string"],
      "source": "local",
      "rating": 1.5,
      "totalRatings": 12
    }
  ],
  "nextPageToken": null,
  "source": "local"
}
```

Invalid coordinates: HTTP 400 with empty `places`.

Implementation:

- Return nearest corpus places capped at 80 by default.
- Only return places that have at least one review at target rating when target rating is supplied.
- Sort by distance from query coordinates.
- Do not call Google Places APIs.

### 11.2 `POST /api/places`

Body for fetching reviews:

```json
{
  "placeId": "string",
  "targetRating": 1,
  "minLength": 20,
  "maxLength": 500,
  "cooldownMinutes": 180
}
```

Response:

```json
{
  "name": null,
  "types": [],
  "reviews": [
    {
      "reviewId": "string",
      "text": "string",
      "rating": 1,
      "authorName": "string",
      "relativeTimeDescription": "string",
      "usedRecentFallback": false
    }
  ],
  "source": "local"
}
```

Body for marking read:

```json
{
  "action": "markRead",
  "placeId": "string",
  "reviewId": "string",
  "reviewText": "string"
}
```

Response:

```json
{ "ok": true, "source": "local" }
```

If all matching reviews are inside cooldown, the server may return the oldest recently read row with `usedRecentFallback: true` so the bot can continue speaking.

### 11.3 `GET /api/log`

Query behavior:

- no params: return full session stats plus today's review count
- `metric=reviewsToday`: return `{ "reviewsToday": number }`
- `metric=totalReviewsRead`: return `{ "totalReviewsRead": number }`
- optional `dayStart` and `dayEnd` ISO params define review-day bounds

Full response:

```json
{
  "totalSessions": 0,
  "totalRuntimeSeconds": 0,
  "totalDistanceKm": 0,
  "totalLocationsScanned": 0,
  "totalReviewsRead": 0,
  "reviewsToday": 0,
  "totalScreenshots": 0,
  "countriesVisited": ["Netherlands"],
  "totalTeleports": 0
}
```

### 11.4 `POST /api/log`

Actions:

- `createSession`
- `updateSession`
- `logReview`
- `addCountry`

`createSession` body:

```json
{ "action": "createSession", "sessionId": "string" }
```

`updateSession` body:

```json
{
  "action": "updateSession",
  "sessionId": "string",
  "updates": {
    "runtimeSeconds": 1,
    "distanceKm": 0.1,
    "locationsScanned": 10,
    "reviewsRead": 1,
    "screenshotsTaken": 1,
    "teleports": 0
  }
}
```

`logReview` body contains a review log entry with session ID, entry number, timestamp, coords, city, business, review text, rating, TTS duration, and screenshot filename.

### 11.5 `GET /api/log/recent`

Query:

- `limit`: optional, default 30, capped at 200

Response:

```json
{
  "entries": [
    {
      "id": 1,
      "timestamp": "ISO",
      "businessName": "string",
      "city": "string",
      "reviewRating": 1,
      "reviewText": "string"
    }
  ]
}
```

### 11.6 `GET /api/geocode`

Accept `lat` and `lng`.

For valid numeric coordinates, always return:

```json
{
  "city": "The Hague",
  "country": "Netherlands",
  "lookupStatus": "FIXED"
}
```

For missing/invalid coordinates, return:

```json
{
  "city": "Unknown",
  "country": null,
  "lookupStatus": "INVALID_PARAMS"
}
```

### 11.7 `GET /api/health`

Return booleans and counts only, never secrets:

```json
{
  "ok": true,
  "mapsJavascriptApiKeyConfigured": true,
  "reviewSource": "local",
  "reviewCorpus": { "places": 0, "reviews": 0 },
  "databaseOk": true
}
```

`ok` is true only when Maps key exists, DB is readable, and local corpus has places and reviews.

### 11.8 `POST /api/screenshots`

Body:

```json
{
  "filename": "safe.jpg",
  "dataUrl": "data:image/jpeg;base64,..."
}
```

Behavior:

- Save under `data/screenshots`.
- Strip path from filename with basename.
- Decode base64 image data.
- Return saved path in response.

### 11.9 `GET /api/review-map`

Return:

```json
{
  "places": [
    {
      "placeId": "string",
      "name": "string",
      "lat": 0,
      "lng": 0,
      "reviewCount": 10,
      "oneStarReviewCount": 3,
      "source": "string",
      "sourceUrl": "string"
    }
  ],
  "defaults": {
    "wanderRegion": {},
    "searchRadius": 700,
    "detectionRadius": 700,
    "targetRating": 1
  }
}
```

Only include places with at least one one-star review.

### 11.10 `GET /api/tts-lab/reviews`

Return up to 24 review samples matching live review defaults:

```json
{
  "reviews": [
    {
      "id": "string",
      "placeName": "string",
      "text": "string",
      "rating": 1,
      "authorName": "string",
      "source": "string"
    }
  ]
}
```

Prefer never-read reviews and text length near 220 characters.

## 12. Activity Feed

Use browser `BroadcastChannel` named:

```text
gsv-bot-activity
```

Message shape:

```ts
type BotActivityMessage = {
  ts: string;
  tag: string;
  lines: string[];
};
```

Required tags:

- `SESSION`
- `SEARCHING`
- `REVIEW`
- `STATE`
- `WALK`
- `STOP`
- `TELEPORT`
- `MAPS`

Activity examples:

- `SESSION`: session ID and spawn coords.
- `SEARCHING`: one line for each successful Street View step with lat/lng/city.
- `REVIEW`: metadata line plus review text line.
- `STATE`: non-wander state changes.
- `TELEPORT`: fade-out, warp, jump, fade-in, complete.
- `MAPS`: CDN stress backoff.

## 13. Screenshot and Logging Behavior

When a review is delivered:

1. Before TTS starts, attempt to capture the Street View canvas.
2. Save JPEG via `/api/screenshots`.
3. During TTS, measure elapsed delivery duration.
4. On delivery complete, log review via `/api/log`.
5. Increment session review count.
6. Reset `stepsSinceLastReview` to 0.

Screenshot capture may fail silently if the canvas is unavailable or blocked. Logging should still happen.

Stats update:

- Every 30000 ms, update runtime, distance, locations scanned, reviews read, screenshots, and teleports.
- Distance is accumulated from Street View coordinate movement except during teleport.
- Ignore implausible distance segments over 2 km.

## 14. Navigation Behavior Summary

There is no user navigation UI in `/bot`.

Operator navigation is URL-based:

- `/bot` for the artwork.
- `/terminal` for same-browser activity.
- `/review-map` for corpus/spawn coverage.
- `/tts-lab` for voice testing.

Browser behavior:

- `/bot` fills the screen and hides cursor.
- `/terminal` can run in another tab/window of the same browser profile.
- `/review-map` and `/tts-lab` are normal scrollable pages.
- The app must be same-origin friendly because BroadcastChannel only works in that context.

## 15. Required Data Files and Assets

Required:

- `public/connection-lost-bg.png`: fallback background behind Street View.
- `data/teleport-destinations.json`: array of `{ lat, lng, label }` default spawn/teleport points.
- `data/city-tour.json`: curated city-tour stops and spawn points.
- `vendor/piper-voices/*.onnx`: Piper voice models and matching metadata JSON.

Generated/local, do not commit:

- `data/db/would-not-recommend.db`
- `data/screenshots/*`
- `.tmp/*`
- `.env.local`
- `.next`
- `node_modules`
- local logs

## 16. Verification Requirements

A rebuild should pass these behavioral checks:

1. `/` redirects to `/bot`.
2. `/bot` starts on click without kiosk mode.
3. `/bot` auto-starts when `NEXT_PUBLIC_KIOSK_MODE=true`.
4. Missing Maps key produces a visible startup error.
5. Street View default Google controls are hidden.
6. The bot walks from pano to pano on the configured cadence.
7. The bot waits at least 3 successful steps between review deliveries.
8. `/api/places` serves local SQLite results and never calls Google Places.
9. A selected business causes walking to stop, camera to pan toward the business, review to be spoken, then camera to return.
10. Subtitles reveal in sync with TTS duration, linger, fade, and clear.
11. Review logs appear in SQLite after delivery.
12. `/terminal` receives `BroadcastChannel` messages from `/bot`.
13. `/review-map` renders corpus circles, wander region, search radius, and spawn markers.
14. `/tts-lab` can synthesize and play a sample through `/api/tts`.
15. Imagery faults trigger a short recovery teleport.
16. Stuck movement triggers a normal teleport.
17. City tour, when enabled, shows current/next city and advances after 10 minutes, deferred until `WANDER`.
18. Wandering visual drift is CSS-only and does not call Street View `setPov` every frame.
19. Maps CDN stress backoff increases wander interval to at least 9000 ms.
20. `npm run typecheck`, `npm run lint`, and `npm run build` should pass in the rebuilt project.

## 17. Rebuild Priorities

If implementation time is limited, preserve features in this order:

1. `/bot` full-screen Street View kiosk loop.
2. Local SQLite review lookup and one-star review selection.
3. TTS readout with synchronized subtitles.
4. State transitions, stop/pan/read/return behavior.
5. Logging and stats.
6. Teleport/stuck/imagery recovery.
7. `/terminal` activity mirror.
8. `/review-map`.
9. `/tts-lab`.
10. Optional CCTV overlay.
