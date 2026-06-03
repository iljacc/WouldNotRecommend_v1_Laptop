# Local review database

The installation can read reviews from `data/db/would-not-recommend.db` instead of making live Google Places review calls.

Set:

```env
REVIEW_SOURCE=local
```

The bot still renders Google Street View in the browser, but `/api/places` serves nearby businesses and reviews from SQLite.

When local mode is active, nearby lookup accepts the bot's configured `targetRating` and only returns places that have at least one review at that rating. With the default settings, this means the bot is handed places with one-star reviews instead of wasting detection attempts on nearby places that only have higher-rated reviews.

## Supported tables

The app supports the current offline scraper/import schema:

### `offline_places`

One row per business/place.

| Column | Meaning |
| --- | --- |
| `id` | Local integer primary key. The bot exposes this as `offline:<id>`. |
| `source` | Origin label, usually `google_places`. |
| `source_place_id` | Source-specific place id. |
| `name` | Business name shown/logged by the bot. |
| `lat`, `lng` | Business coordinates. These are used for distance filtering and camera bearing. |
| `formatted_address` | Optional address text. |
| `business_status` | Optional source status. |
| `types_json` | JSON array of place types. |
| `rating` | Aggregate place rating, used for candidate sorting when present. |
| `user_ratings_total` | Aggregate review count, used as a secondary sort when present. |
| `raw_nearby_json`, `raw_details_json` | Optional raw source payloads. |
| `fetched_at`, `created_at` | Import timestamps. |

Useful indexes:

```sql
CREATE INDEX idx_offline_places_lat_lng ON offline_places (lat, lng);
CREATE UNIQUE INDEX sqlite_autoindex_offline_places_1
  ON offline_places (source, source_place_id);
```

### `offline_reviews`

One row per review.

| Column | Meaning |
| --- | --- |
| `id` | Local integer primary key. |
| `place_id` | References `offline_places.id`. |
| `source`, `source_review_id` | Source metadata. |
| `author_name`, `author_url`, `profile_photo_url` | Optional author metadata. |
| `language`, `original_language`, `translated` | Optional language metadata. |
| `rating` | Review star rating. The bot default filter reads rating `1`. |
| `relative_time_description`, `review_time` | Review date metadata. |
| `text` | Review text read aloud by the bot. |
| `raw_json` | Optional raw source payload. |
| `hash` | Unique review text/source hash. |
| `read_count`, `last_read_at`, `last_selected_at` | Offline corpus read bookkeeping. |
| `fetched_at`, `created_at` | Import timestamps. |

Useful indexes:

```sql
CREATE INDEX idx_offline_reviews_place ON offline_reviews (place_id);
CREATE INDEX idx_offline_reviews_rating_read
  ON offline_reviews (rating, read_count, last_read_at);
```

The app also supports the simpler `review_corpus_places` / `review_corpus_reviews` tables created by `scripts/import-review-corpus.cjs`.

Local review rows keep lightweight read history:

| Column | Meaning |
| --- | --- |
| `read_count` | How many times the bot selected this review from the local corpus. |
| `last_read_at` | ISO timestamp for the last selected/read time. |
| `last_selected_at` | Same selection timestamp, kept for compatibility with the older offline schema. |

When `/api/places` is in local mode, it prefers reviews that have never been read or whose
`last_read_at` is outside the configured cooldown. If every matching review for a place is still
inside cooldown, it can fall back to the oldest read row rather than going silent. This still allows
the bot to read another one-star review from the same place.

## Import formats

Run imports from the repo root:

```bash
npm run import:reviews -- data/review-corpus.json
npm run import:reviews -- D:/CODE/ArnauGoogleBot/google_one_star_reviews_52.078102_4.314051.csv
```

The importer accepts JSON arrays, `{ "places": [...] }`, `{ "records": [...] }`, and CSV files.
It also understands Google one-star review CSV exports with columns such as:

```text
id_review, place_lat, place_lng, place_name, place_url, rating, relative_date, review_text, username, user_review_count
```

Those rows are grouped into places by name and coordinates, then inserted into
`review_corpus_places` / `review_corpus_reviews`. Re-running the same file is safe because
reviews are deduplicated by `(place_id, review_text)`.

## Review cluster map

Open `/review-map` after importing local review rows. The page is read-only and draws:

- orange circles for local one-star review locations, scaled by review count
- the current bot wander area from default or browser-local admin settings
- the configured search-radius circle
- custom spawn points, or the default `data/teleport-destinations.json` starts when no custom spawns are saved
- a rough spawn-to-spawn line so coverage can be visually compared with review clusters

The map uses `NEXT_PUBLIC_MAPS_JAVASCRIPT_API_KEY` and reads corpus rows through
`GET /api/review-map`; it does not change bot settings or import data.

## TTS lab

Open `/tts-lab` to audition review readout timing. The page loads a small sample pack from the
local corpus and sends per-request options to `/api/tts`, so you can compare Piper voices, Kokoro
voices, speed/length scale, subtitle lead/lag, pre-read hold, and subtitle linger without changing
the running bot.

## Current movement defaults

The default wander area is now centered on:

```text
52.078102, 4.314051
```

with an approximate 700 m bounding box:

```text
minLat 52.071814
maxLat 52.084390
minLng 4.303831
maxLng 4.324271
```

`SEARCH_RADIUS` and `DETECTION_RADIUS` default to `700`, so the bot can select any local review in that area while wandering.

## Current imported database

Checked on 2026-05-24:

| Metric | Value |
| --- | ---: |
| SQLite integrity check | `ok` |
| `offline_places` rows | 2,945 |
| `offline_reviews` rows | 11,005 |
| One-star reviews | 1,933 |
| Places within 700 m of center | 1,664 |
| Places within 700 m with at least one one-star review | 429 |

Coordinate bounds in the imported DB:

```text
minLat 52.0653803
maxLat 52.0884634
minLng 4.2950743
maxLng 4.3328885
```

The local API was verified at the center point:

```text
GET /api/places?lat=52.078102&lng=4.314051&radius=700&lazy=1&targetRating=1
```

It returns `source: "local"` and starts with a nearby place that has a one-star review available.

## Operational check

Once a valid populated DB is present:

```bash
npm run dev
```

Then open `/admin`. Health should show:

```text
Review source: local
Local corpus: <places> places / <reviews> reviews
```

If the counts are `0`, either the DB is empty, the wrong tables are present, or `REVIEW_SOURCE=local` is not set.
