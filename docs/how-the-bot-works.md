# How the GSV bot navigates, finds reviews, and moves the camera

This document describes **how the installation bot behaves today**: what “walking” means in software, how far it looks for businesses, how reviews are obtained (spoiler: not by scraping web pages), and how the Street View camera is driven. It is written for **non-developers** first, with a **technical summary** at the end for anyone reading the code.

---

## Plain English

### What “walking” actually is

The bot does not drive a car or simulate physics. It uses **Google Street View** as a network of **360° panoramas** connected by **links** (think: “you can step from this bubble to that bubble along the sidewalk”). On a timer, the bot picks one of those links and jumps to the next panorama—roughly like clicking “forward” along the street. Your **wander region** (bounding box or polygon from admin settings) limits *which businesses count* and where teleports may land; it does not draw a path on a map for each step.

### How it decides where to go next (while wandering)

Each time it “steps,” it looks at all **outgoing links** from the current panorama and chooses one:

- **Forward + wobble (default):** prefer the link whose direction is closest to the direction the bot is already facing, with a bit of randomness so it does not always pick the exact same branch.
- **Straight:** same idea but **no** random wobble—more rigidly “keep going the way we’re pointed.”
- **Random link:** pick any connected panorama at random—more chaotic paths.

After moving, the camera heading is **smoothly blended** toward the new link’s heading so the view does not snap unnaturally.

### “How far” does it look for a business?

Think of three different circles (all distances are **meters** in code; defaults live in `src/lib/config.ts` and can be overridden in the admin panel):

1. **Places search radius** — When the bot decides to **refresh its list** of nearby businesses, it asks the server: “What establishments exist within this radius of my current position?” Default **200 m**.
2. **Detection radius** — From the **cached** list, the bot only **notices** a business if it is within this distance of the Street View position. Default **150 m**. The nearest qualifying business is the one considered “detected.”
3. **Query movement threshold** — The bot does not call the server on every frame. It only runs a new nearby search when it has moved at least this far since the last search **and** enough time has passed. Default **75 m** between queries, with a **minimum interval** between queries (default **30 s**) so it does not hammer the API.

So: **search** casts a wider net; **detection** is stricter and decides what you can “see” right now; **query throttling** keeps API usage reasonable.

### How reviews show up (not “scraping”)

The bot **does not** open Google Maps in a browser and scrape HTML. It uses **Google’s official Places API** through your app’s backend:

1. **Nearby Search** (`/api/places` GET): the bot uses **lazy pagination** (`lazy=1`) — it loads **one page** (~20 POIs) per refresh, then requests **additional pages** only while hunting for a qualifying review, up to **`nearbySearchMaxPages`** (1–3). A legacy path without `lazy` can still merge multiple pages in one request (e.g. tooling). The server can cache the **first page** plus `next_page_token` for the same rough location (see admin: `nearbyCacheTtlMs`).
2. When a place is chosen, **Place Details** (`/api/places` POST with a `placeId`) asks Google for that place’s **review objects** among other fields. Those reviews are **whatever Google returns** in the API response (text, rating, author metadata)—subject to Google’s terms, quotas, and what each place exposes. In one **detection tick**, the bot may try **several** nearest candidates (sorted by distance, then lower Google rating) up to **`MAX_PLACE_DETAILS_ATTEMPTS_PER_CHECK`**, then optionally load another Nearby page before the next 3s interval.

So “scraping” in everyday language is better described as **authorized API fetch**: the server calls Google with your API key; the browser talks only to your server.

### How a review is picked to read aloud

After fetching reviews for one place, the bot **filters** them:

- **Star rating** must match the configured **target** (by default, **1 star**).
- **Length** must be between a **minimum** and **maximum** character range (defaults tuned for short-ish quotes).
- **Already read recently** (by a simple hash of the text) is skipped for a configurable **cooldown** (default about **30 minutes**) so the same line is not repeated back-to-back; after that, it may be read again (useful when the audience turns over in an installation).
- **Language heuristic:** reviews where very little of the text looks Latin letters may be dropped (reduces noisy non-Latin spam in an English-forward install).

If anything passes the filter, one review is chosen by mode:

- **Random** — pick one at random from the filtered set.
- **Shortest / longest** — pick the shortest or longest text among the filtered set.

If **nothing** passes, that place is marked “exhausted” for a **cooldown** (default about **30 minutes**), then it can be tried again.

### Cooldown between reviews

Even if a business is right next to you, the bot will not immediately chain another review. It must complete a minimum number of **successful wander steps** since the last review (default **3 steps**). That spacing is separate from the distance thresholds above—it is a **step count**, not meters.

### High-level emotional arc (states)

In simple terms:

1. **Wandering** — Moving along Street View, ambient “searching” mood, periodically checking for businesses.
2. **Detect** — Something qualifies as the nearest business; walking stops; the view **pans** to face toward that business; a timer runs for alignment.
3. **Deliver** — If a review was found, ambient ducks down and **text-to-speech** reads it (with on-screen typewriter subtitles). A screenshot may be taken for logging.
4. **Return** — The camera **pans back** toward the direction it was wandering before; then walking resumes.

If the bot is **stuck** (barely moving for long enough) or **imagery fails**, it can **teleport** to a new area (from your destination list or custom spawn points) and continue wandering.

### How the camera behaves

- **While walking:** The “navigation heading” tracks which way the bot is going along links. Optionally, a **gentle sway** (yaw and a little pitch) is applied on top so the view feels alive—this is **look-only** and does not change which link is chosen.
- **When aligning for a review:** The camera **rotates** (pan) toward the **bearing** from the Street View position to the business coordinates—so the storefront direction matches geometry, not just link headings.
- **After the review:** It **rotates back** toward the remembered wander heading.
- **Teleports:** Position jumps to new lat/lng; heading may reset; the float effect stops until walking resumes.

---

## Technical reference (maps to code)

| Topic | Where / what |
|--------|----------------|
| **State machine** | `src/engine/state-machine.ts` — `WANDER` → `DETECT` → `DELIVER` → `RETURN`; teleports `TELEPORT`. |
| **Orchestration** | `src/engine/bot.ts` — timers, `checkForBusiness` every 3s in wander, `onWanderStep`, effects. |
| **Street View movement** | `src/engine/street-view-controller.ts` — `stepForward()` chooses `StreetViewLink` by `linkSelectionMode` + `wanderHeadingWobble`; `setPano`; `runHeadingMotion` for blends; `panToHeading` for detect/return; `ensureWanderFloatLoop` for optional POV sway. |
| **Places: list nearby** | `GET /api/places` → Nearby Search; **`lazy=1`** first page + `nextPageToken`; **`pageToken=`** for the next page. Optional merged multi-page without `lazy`. In-memory TTL cache in `src/app/api/places/` + `places-nearby-cache.ts`. |
| **Places: reviews** | `POST /api/places` → Google **Place Details** `details/json`, `fields=name,reviews,types,geometry`. |
| **Distances & filters** | `ReviewManager` — `shouldQuery`, `fetchNearbyBusinessesFirstPage`, `fetchNearbyNextPage`, `findNearestBusiness` (sorted candidates), `fetchAndSelectReview`, `filterReviews`, `selectReview`. |
| **Default distances** | `src/lib/config.ts` — `PLACES.QUERY_DISTANCE_THRESHOLD`, `QUERY_MIN_INTERVAL`, `SEARCH_RADIUS`, `DETECTION_RADIUS`, `MIN_STEPS_BETWEEN_REVIEWS`; `STREET_VIEW.*`; `TIMING.*`. |
| **Teleport / spawn** | `src/engine/teleport-manager.ts` — `getRandomSpawnCoords`, `selectDestination`, stuck detection vs `TIMING.STUCK_*`. |
| **Configurable settings** | `src/lib/bot-settings.ts` + admin UI — wander region polygon, spawn points, timings, places radii, review modes. |

### Default numbers (from `config.ts`; admin may override)

| Setting | Default | Meaning |
|---------|---------|---------|
| `searchRadius` | 200 m | Nearby Search radius |
| `detectionRadius` | 150 m | Max distance to accept cached business as “nearest” |
| `queryDistanceThreshold` | 75 m | Min movement since last query coords to allow a new nearby fetch |
| `queryMinInterval` | 30_000 ms | Min time between nearby fetches |
| `minStepsBetweenReviews` | 3 | Successful `stepForward` callbacks before another detection attempt |
| `wanderStepInterval` | 15_000 ms | Clock for periodic `stepForward` while walking (default tuned to reduce imagery churn) |
| `stuckCheckInterval` | 30_000 ms | How often stuck logic runs |
| `stuckDistanceThreshold` | 10 m | If movement &lt; this for ~one interval → stuck teleport |
| Review `targetRating` | 1 | Filter reviews to this star value |
| Review length | 20–500 chars | Filter window |
| `nearbySearchMaxPages` | 3 | Cap on lazy Nearby pages per anchor (1–3; each page is one API request) |
| `nearbyCacheTtlMs` | 600_000 ms | Server first-page lazy cache TTL; `0` disables |
| `MAX_PLACE_DETAILS_ATTEMPTS_PER_CHECK` | 12 | Max Place Details calls per 3s `checkForBusiness` tick |
| `NEARBY_EXTRA_PAGE_ROUNDS_PER_CHECK` | 2 | Max extra Nearby page fetches in the same tick if no POI yields a review |
| `reviewRepeatCooldownMinutes` | 30 | Min time before the same review text can be read again |
| `placeRetryCooldownMinutes` | 30 | Min time before re-trying a place that had no passing review |

### Camera-related timings (defaults)

| Effect | Typical duration source |
|--------|-------------------------|
| Pan to business (`PAN_TO_BUSINESS`) | `timing.alignPanMs` (default 3600 ms) |
| Detect phase before `DETECT_COMPLETE` | `timing.reviewAlignDuration` (must cover align + hold) |
| Pan back to wander heading | `timing.returnPanMs` / return timer |
| Step heading blend after link step | `streetView.stepHeadingBlendMs` (default 520 ms) |

---

## Operational notes

- **API key:** Nearby + Details run **server-side** with `PLACES_API_KEY` or `GEOCODING_API_KEY` (see `src/app/api/places/route.ts`). The Maps **JavaScript** key is for the client map and Street View only.
- **Quotas & billing:** Each **page** of Nearby Search and each Details call counts against your Google Cloud project (multi-page nearby means up to three Nearby requests per refresh). Admin throttling and optional nearby cache reduce unnecessary repeats.
- **Accuracy:** Street View position is **pano-based**; business coordinates are **Places** geometry. Bearings use `haversine`-style math in `review-manager.ts`—good enough for “face roughly toward the POI,” not survey-grade.

---

*Generated to reflect the codebase structure; if behavior changes, update this doc alongside `src/lib/config.ts` and `src/lib/bot-settings.ts` defaults.*
