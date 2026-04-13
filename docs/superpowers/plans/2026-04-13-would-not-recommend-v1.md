# Would Not Recommend — V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a gallery installation where an autonomous bot wanders Google Street View, finds nearby businesses via Google Places API, and reads their 1-star reviews aloud via TTS — with ambient audio, UI overlay, visual effects, and persistent logging.

**Architecture:** Next.js app running on a local machine. Client-side: Street View rendering, behavior engine, audio system, UI overlay. Server-side (API routes): Google Places/Geocoding API proxying (hides API keys), SQLite database for review logging and persistent statistics, screenshot file storage. The behavior engine is a state machine (WANDER → DETECT → APPROACH → INSPECT → DELIVER → LINGER → DEPART) that drives all other systems.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS v4, Google Maps JavaScript API (`@googlemaps/js-api-loader`), Three.js for the V1 visual effects layer, Web Speech API (TTS), Web Audio API, `better-sqlite3` (SQLite)

---

## File Structure

```
src/
  app/
    page.tsx                          — Main page, mounts the bot
    layout.tsx                        — Root layout, loads monospace font
    globals.css                       — Tailwind + global styles + kiosk overrides
    api/
      places/route.ts                 — Proxy: Google Places Nearby Search + Place Details
      geocode/route.ts                — Proxy: Google Reverse Geocoding
      log/route.ts                    — POST review log entries, GET stats
      screenshots/route.ts            — POST to save screenshot files
  lib/
    types.ts                          — All shared types, enums, interfaces
    config.ts                         — All timing, threshold, and behavior constants
    db.ts                             — SQLite schema, setup, query functions
  engine/
    state-machine.ts                  — Pure state machine: transitions, timers, cooldown
    street-view-controller.ts         — Street View navigation: move, pan, get coords/links
    review-manager.ts                 — Fetch reviews, filter, select, deduplicate
    tts-engine.ts                     — TTS interface + Web Speech API implementation
    audio-engine.ts                   — Ambient layers, crossfade, bleep/bloop, file loading
    teleport-manager.ts               — Curated destinations, stuck detection, trigger logic
    bot.ts                            — Top-level orchestrator: wires state machine to all systems
  components/
    StreetViewCanvas.tsx              — Street View panorama container
    HUD.tsx                           — Overlay container for all UI elements
    PulsingDot.tsx                    — Animated status dot
    Coordinates.tsx                   — Lat/lng display
    CityLocation.tsx                  — Reverse-geocoded location name
    ModeIndicator.tsx                 — Searching / Processing text
    SessionCounter.tsx                — Review count number
    Timestamp.tsx                     — Elapsed session time
    VisualEffects.tsx                 — Three.js overlay: shader color grading, slow zoom/drift, teleport fade
  hooks/
    useBot.ts                         — React hook: initializes and runs the bot
public/
  audio/
    ambient-a.mp3                     — Searching ambient (placeholder)
    ambient-b.mp3                     — Processing ambient (placeholder)
    bleep.mp3                         — Mode enter SFX (placeholder)
    bloop.mp3                         — Mode exit SFX (placeholder)
data/
  teleport-destinations.json          — Curated locations with verified Street View coverage
.env.local                            — Google API keys (gitignored)
```

**Key design decisions:**
- Visual effects use Three.js in V1. The Street View panorama remains the primary image, but a full-screen transparent WebGL overlay supplies the state-linked color wash, very subtle drift/zoom, and teleport fade. The processing target remains 3/10: the audience should still feel they are seeing Street View, not a heavy shader demo.
- The behavior engine (`state-machine.ts`) is a pure function — no side effects, no DOM, no audio. It receives the current state and an event, returns the next state. Everything else subscribes to state changes.
- TTS engine has a swappable interface. Web Speech API for V1, ElevenLabs pluggable later.
- All Google API calls go through server-side API routes to hide keys and enable rate limiting.

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `.env.local`, `.env.example`, `.gitignore`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`

- [ ] **Step 1: Initialize Next.js project**

```bash
cd /Users/iljak/Documents/CODE/gsv_bot_claude
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --no-import-alias --turbopack
```

Accept defaults. This creates the base project.

- [ ] **Step 2: Install dependencies**

```bash
npm install @googlemaps/js-api-loader better-sqlite3 three
npm install -D @types/better-sqlite3 @types/three
```

- [ ] **Step 3: Create environment files**

Create `.env.example`:
```
GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here
GOOGLE_PLACES_API_KEY=your_google_places_api_key_here
```

Create `.env.local` with actual keys (this file is already in `.gitignore` from create-next-app).

- [ ] **Step 4: Update `.gitignore`**

Append to the existing `.gitignore`:
```
# Project data
data/db/
data/screenshots/
```

- [ ] **Step 5: Create data directories**

```bash
mkdir -p data/db data/screenshots public/audio
```

- [ ] **Step 6: Update `src/app/globals.css`**

Replace contents with:
```css
@import "tailwindcss";

@font-face {
  font-family: 'JetBrains Mono';
  src: url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400&display=swap');
}

/* Kiosk mode: hide all browser/system UI */
html, body {
  margin: 0;
  padding: 0;
  overflow: hidden;
  cursor: none;
  background: black;
  width: 100vw;
  height: 100vh;
}

/* Hide Google Street View default UI */
.gm-style > div:first-child > div:nth-child(2),
.gm-style > div:first-child > div:nth-child(3),
.gm-style .gm-iv-address,
.gm-style .gm-compass,
.gm-style .gm-control-active,
.gm-style .gm-fullscreen-control,
.gm-style .gm-bundled-control,
.gm-style .gm-sv-label,
.gm-style .gmnoprint,
.gm-style .gm-style-mtc,
.gm-style [class*="watermark"],
.gm-style .gm-iv-short-address-description,
a[href*="maps.google.com/maps"],
a[href*="google.com/maps"] {
  display: none !important;
}

/* Remove Google logo and terms links */
.gm-style .gm-style-cc,
.gm-style a[title="Report errors in the road map or imagery to Google"] {
  display: none !important;
}
```

- [ ] **Step 7: Update `src/app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["300", "400"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Would Not Recommend",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={mono.variable}>
      <body className="font-mono antialiased">{children}</body>
    </html>
  );
}
```

- [ ] **Step 8: Create minimal `src/app/page.tsx`**

```tsx
export default function Home() {
  return (
    <main className="w-screen h-screen bg-black flex items-center justify-center">
      <p className="text-white/60 text-sm font-mono">
        Would Not Recommend — initializing...
      </p>
    </main>
  );
}
```

- [ ] **Step 9: Verify dev server starts**

```bash
npm run dev
```

Open `http://localhost:3000`. Verify: black screen with "Would Not Recommend — initializing..." in white text. Cursor is hidden.

- [ ] **Step 10: Commit**

```bash
git init
git add -A
git commit -m "feat: project scaffolding — Next.js, Tailwind, monospace font, kiosk CSS"
```

---

## Task 2: Types and Configuration

**Files:**
- Create: `src/lib/types.ts`, `src/lib/config.ts`

- [ ] **Step 1: Create `src/lib/types.ts`**

```typescript
// === Bot States ===

export enum BotState {
  WANDER = "WANDER",
  DETECT = "DETECT",
  APPROACH = "APPROACH",
  INSPECT = "INSPECT",
  DELIVER = "DELIVER",
  LINGER = "LINGER",
  DEPART = "DEPART",
  TELEPORT = "TELEPORT",
}

export type BotMode = "Searching" | "Processing";
export type TeleportPhase = "none" | "fade-out" | "black" | "fade-in";

export function stateToMode(state: BotState): BotMode {
  switch (state) {
    case BotState.WANDER:
    case BotState.DETECT:
      return "Searching";
    default:
      return "Processing";
  }
}

// === State Machine Events ===

export type BotEvent =
  | { type: "BUSINESS_DETECTED"; business: DetectedBusiness }
  | { type: "APPROACH_COMPLETE" }
  | { type: "INSPECT_COMPLETE" }
  | { type: "DELIVER_COMPLETE" }
  | { type: "LINGER_COMPLETE" }
  | { type: "DEPART_COMPLETE" }
  | { type: "TELEPORT_TRIGGERED" }
  | { type: "TELEPORT_COMPLETE" }
  | { type: "STUCK_DETECTED" };

// === State Machine Context ===

export interface BotContext {
  state: BotState;
  mode: BotMode;
  teleportPhase: TeleportPhase;
  currentCoords: LatLng;
  currentCity: string;
  targetBusiness: DetectedBusiness | null;
  reviewToRead: Review | null;
  sessionReviewCount: number;
  sessionStartTime: number;
  lastReviewTime: number;
  lastQueryCoords: LatLng | null;
  readReviewHashes: Set<string>;
  stuckCheckTimestamp: number;
  stuckCheckCoords: LatLng | null;
}

// === Google Maps Types ===

export interface LatLng {
  lat: number;
  lng: number;
}

export interface StreetViewLink {
  pano: string;
  heading: number;
  description?: string;
}

// === Places / Reviews ===

export interface DetectedBusiness {
  placeId: string;
  name: string;
  location: LatLng;
  types: string[];
  bearing: number; // heading from bot to business in degrees
  distance: number; // meters from bot
}

export interface Review {
  text: string;
  rating: number;
  authorName: string;
  relativeTimeDescription: string;
  hash: string; // for dedup
}

export interface ReviewLogEntry {
  sessionId: string;
  entryNumber: number;
  timestamp: string;
  lat: number;
  lng: number;
  city: string;
  businessName: string;
  businessType: string;
  reviewText: string;
  reviewRating: number;
  ttsDurationSeconds: number;
  screenshotFilename: string;
}

// === Statistics ===

export interface SessionStats {
  totalSessions: number;
  totalRuntimeSeconds: number;
  totalDistanceKm: number;
  totalLocationsScanned: number;
  totalReviewsRead: number;
  totalScreenshots: number;
  countriesVisited: string[];
  totalTeleports: number;
}

// === Audio ===

export type AmbientLayer = "A" | "B";

// === TTS ===

export interface TTSEngine {
  speak(text: string): Promise<void>;
  stop(): void;
  isSpeaking(): boolean;
}
```

- [ ] **Step 2: Create `src/lib/config.ts`**

```typescript
import type { LatLng } from "./types";

// === Timing (milliseconds) ===

export const TIMING = {
  /** Minimum ms between end of DEPART and next DETECT */
  REVIEW_COOLDOWN: 10_000,
  /** Duration of DETECT state */
  DETECT_DURATION: 3_000,
  /** Duration of APPROACH state (varies, this is base) */
  APPROACH_DURATION: 5_000,
  /** Duration of pan during INSPECT */
  INSPECT_PAN_DURATION: 3_000,
  /** Duration of stillness after pan during INSPECT */
  INSPECT_HOLD_DURATION: 3_000,
  /** Duration of LINGER after TTS ends */
  LINGER_DURATION: 3_500,
  /** Duration of DEPART (turning away + starting to walk) */
  DEPART_DURATION: 3_000,
  /** Interval between forward steps during WANDER (ms) */
  WANDER_STEP_INTERVAL: 2_000,
  /** Teleport fade out duration */
  TELEPORT_FADE_OUT: 800,
  /** Teleport hold on black */
  TELEPORT_HOLD_BLACK: 500,
  /** Teleport fade in duration */
  TELEPORT_FADE_IN: 800,
  /** Audio crossfade duration between ambient layers */
  AUDIO_CROSSFADE: 4_000,
  /** How often to check for stuck state (ms) */
  STUCK_CHECK_INTERVAL: 30_000,
  /** If bot hasn't moved this far in STUCK_CHECK_INTERVAL, consider stuck (meters) */
  STUCK_DISTANCE_THRESHOLD: 10,
  /** If bot hasn't completed a review in this long, consider teleporting (ms) */
  NO_REVIEW_TELEPORT_THRESHOLD: 180_000, // 3 minutes
} as const;

// === Places API ===

export const PLACES = {
  /** Minimum distance moved before re-querying Places API (meters) */
  QUERY_DISTANCE_THRESHOLD: 75,
  /** Minimum time between Places API queries (ms) */
  QUERY_MIN_INTERVAL: 30_000,
  /** Radius for Nearby Search (meters) */
  SEARCH_RADIUS: 200,
  /** Maximum distance for a business to be "detectable" (meters) */
  DETECTION_RADIUS: 150,
} as const;

// === Review Filtering ===

export const REVIEWS = {
  /** Minimum review text length (characters) */
  MIN_LENGTH: 20,
  /** Maximum review text length (characters) */
  MAX_LENGTH: 500,
  /** Only select reviews with this rating */
  TARGET_RATING: 1,
} as const;

// === Street View ===

export const STREET_VIEW = {
  /** Pan speed during INSPECT (degrees per second) */
  PAN_SPEED: 30,
  /** Movement heading wobble (degrees, random offset per step) */
  WANDER_HEADING_WOBBLE: 15,
  /** FOV (field of view) for the panorama */
  FOV: 90,
  /** Pitch (vertical angle) */
  PITCH: 0,
} as const;

// === Visual Effects ===

export const VISUAL = {
  /** Zoom factor during LINGER (1.0 = no zoom, 1.03 = 3% zoom) */
  LINGER_ZOOM: 1.025,
  /** Shader uniform targets per state — [brightness, saturate, hue-rotate-deg] */
  COLOR_GRADING: {
    WANDER: { brightness: 0.98, saturate: 0.95, hueRotate: -2 },
    DETECT: { brightness: 1.0, saturate: 1.0, hueRotate: 0 },
    APPROACH: { brightness: 1.01, saturate: 1.02, hueRotate: 1 },
    INSPECT: { brightness: 1.02, saturate: 1.03, hueRotate: 2 },
    DELIVER: { brightness: 0.97, saturate: 0.93, hueRotate: 0 },
    LINGER: { brightness: 0.97, saturate: 0.93, hueRotate: 0 },
    DEPART: { brightness: 0.98, saturate: 0.95, hueRotate: -1 },
    TELEPORT: { brightness: 1.0, saturate: 1.0, hueRotate: 0 },
  },
  /** Transition duration for color grading changes (ms) */
  COLOR_TRANSITION: 3_000,
  /** Full-screen Three.js overlay opacity; keep low so Street View remains honest */
  OVERLAY_OPACITY: 0.18,
  /** Subtle procedural drift strength used by the fragment shader */
  DRIFT_STRENGTH: 0.006,
} as const;

// === Audio ===

export const AUDIO = {
  /** Master volume (0-1) */
  MASTER_VOLUME: 0.7,
  /** Ambient volume during searching */
  AMBIENT_SEARCHING_VOLUME: 0.3,
  /** Ambient volume during processing (not during TTS) */
  AMBIENT_PROCESSING_VOLUME: 0.25,
  /** Ambient volume during TTS delivery (ducked) */
  AMBIENT_DELIVER_VOLUME: 0.08,
  /** SFX volume for bleep/bloop */
  SFX_VOLUME: 0.4,
  /** TTS volume */
  TTS_VOLUME: 0.9,
} as const;

// === Pulsing Dot ===

export const PULSING_DOT = {
  /** Size in pixels */
  SIZE: 8,
  /** Pulse cycle duration during Searching (ms) */
  SEARCHING_CYCLE: 2_000,
  /** Pulse cycle duration during Processing (ms) */
  PROCESSING_CYCLE: 1_000,
} as const;

// === Default Starting Location ===

export const DEFAULT_START: LatLng = {
  lat: 40.758,
  lng: -73.9855,
}; // Times Square, NYC
```

- [ ] **Step 3: Verify types compile**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/types.ts src/lib/config.ts
git commit -m "feat: shared types, enums, and configuration constants"
```

---

## Task 3: Database Layer

**Files:**
- Create: `src/lib/db.ts`, `src/app/api/log/route.ts`
- Test: manual verification via API route

- [ ] **Step 1: Create `src/lib/db.ts`**

```typescript
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import type { ReviewLogEntry, SessionStats } from "./types";

const DB_DIR = path.join(process.cwd(), "data", "db");
const DB_PATH = path.join(DB_DIR, "would-not-recommend.db");

function getDb(): Database.Database {
  fs.mkdirSync(DB_DIR, { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

let _db: Database.Database | null = null;

function db(): Database.Database {
  if (!_db) {
    _db = getDb();
    initSchema(_db);
  }
  return _db;
}

function initSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS review_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      entry_number INTEGER NOT NULL,
      timestamp TEXT NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      city TEXT NOT NULL DEFAULT 'Unknown',
      business_name TEXT NOT NULL,
      business_type TEXT NOT NULL DEFAULT '',
      review_text TEXT NOT NULL,
      review_rating INTEGER NOT NULL DEFAULT 1,
      tts_duration_seconds REAL NOT NULL DEFAULT 0,
      screenshot_filename TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL UNIQUE,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      ended_at TEXT,
      runtime_seconds REAL NOT NULL DEFAULT 0,
      distance_km REAL NOT NULL DEFAULT 0,
      locations_scanned INTEGER NOT NULL DEFAULT 0,
      reviews_read INTEGER NOT NULL DEFAULT 0,
      screenshots_taken INTEGER NOT NULL DEFAULT 0,
      teleports INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS countries_visited (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      country TEXT NOT NULL UNIQUE
    );
  `);
}

// === Session Management ===

export function createSession(sessionId: string): void {
  db()
    .prepare("INSERT INTO sessions (session_id) VALUES (?)")
    .run(sessionId);
}

export function updateSession(
  sessionId: string,
  updates: Partial<{
    runtimeSeconds: number;
    distanceKm: number;
    locationsScanned: number;
    reviewsRead: number;
    screenshotsTaken: number;
    teleports: number;
  }>
): void {
  const sets: string[] = [];
  const values: (string | number)[] = [];

  if (updates.runtimeSeconds !== undefined) {
    sets.push("runtime_seconds = ?");
    values.push(updates.runtimeSeconds);
  }
  if (updates.distanceKm !== undefined) {
    sets.push("distance_km = ?");
    values.push(updates.distanceKm);
  }
  if (updates.locationsScanned !== undefined) {
    sets.push("locations_scanned = ?");
    values.push(updates.locationsScanned);
  }
  if (updates.reviewsRead !== undefined) {
    sets.push("reviews_read = ?");
    values.push(updates.reviewsRead);
  }
  if (updates.screenshotsTaken !== undefined) {
    sets.push("screenshots_taken = ?");
    values.push(updates.screenshotsTaken);
  }
  if (updates.teleports !== undefined) {
    sets.push("teleports = ?");
    values.push(updates.teleports);
  }

  if (sets.length === 0) return;
  values.push(sessionId);
  db()
    .prepare(`UPDATE sessions SET ${sets.join(", ")} WHERE session_id = ?`)
    .run(...values);
}

// === Review Log ===

export function insertReviewLog(entry: ReviewLogEntry): void {
  db()
    .prepare(
      `INSERT INTO review_log
       (session_id, entry_number, timestamp, lat, lng, city, business_name, business_type, review_text, review_rating, tts_duration_seconds, screenshot_filename)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      entry.sessionId,
      entry.entryNumber,
      entry.timestamp,
      entry.lat,
      entry.lng,
      entry.city,
      entry.businessName,
      entry.businessType,
      entry.reviewText,
      entry.reviewRating,
      entry.ttsDurationSeconds,
      entry.screenshotFilename
    );
}

// === Countries ===

export function addCountry(country: string): void {
  db()
    .prepare(
      "INSERT OR IGNORE INTO countries_visited (country) VALUES (?)"
    )
    .run(country);
}

// === Statistics ===

export function getStats(): SessionStats {
  const sessions = db()
    .prepare("SELECT COUNT(*) as count FROM sessions")
    .get() as { count: number };

  const runtime = db()
    .prepare("SELECT COALESCE(SUM(runtime_seconds), 0) as total FROM sessions")
    .get() as { total: number };

  const distance = db()
    .prepare("SELECT COALESCE(SUM(distance_km), 0) as total FROM sessions")
    .get() as { total: number };

  const scanned = db()
    .prepare(
      "SELECT COALESCE(SUM(locations_scanned), 0) as total FROM sessions"
    )
    .get() as { total: number };

  const reviews = db()
    .prepare("SELECT COALESCE(SUM(reviews_read), 0) as total FROM sessions")
    .get() as { total: number };

  const screenshots = db()
    .prepare(
      "SELECT COALESCE(SUM(screenshots_taken), 0) as total FROM sessions"
    )
    .get() as { total: number };

  const teleports = db()
    .prepare("SELECT COALESCE(SUM(teleports), 0) as total FROM sessions")
    .get() as { total: number };

  const countries = db()
    .prepare("SELECT country FROM countries_visited ORDER BY country")
    .all() as { country: string }[];

  return {
    totalSessions: sessions.count,
    totalRuntimeSeconds: runtime.total,
    totalDistanceKm: distance.total,
    totalLocationsScanned: scanned.total,
    totalReviewsRead: reviews.total,
    totalScreenshots: screenshots.total,
    countriesVisited: countries.map((c) => c.country),
    totalTeleports: teleports.total,
  };
}
```

- [ ] **Step 2: Create `src/app/api/log/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import {
  createSession,
  updateSession,
  insertReviewLog,
  addCountry,
  getStats,
} from "@/lib/db";
import type { ReviewLogEntry } from "@/lib/types";

export async function GET() {
  try {
    const stats = getStats();
    return NextResponse.json(stats);
  } catch (error) {
    console.error("Failed to get stats:", error);
    return NextResponse.json(
      { error: "Failed to get stats" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case "createSession":
        createSession(body.sessionId);
        return NextResponse.json({ ok: true });

      case "updateSession":
        updateSession(body.sessionId, body.updates);
        return NextResponse.json({ ok: true });

      case "logReview":
        insertReviewLog(body.entry as ReviewLogEntry);
        return NextResponse.json({ ok: true });

      case "addCountry":
        addCountry(body.country);
        return NextResponse.json({ ok: true });

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("Log API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 3: Verify database creates and API responds**

```bash
npm run dev
```

In another terminal:
```bash
curl -X POST http://localhost:3000/api/log \
  -H "Content-Type: application/json" \
  -d '{"action":"createSession","sessionId":"test_001"}'

curl http://localhost:3000/api/log
```

Expected: `{"ok":true}` for POST. Stats JSON with `totalSessions: 1` for GET.

- [ ] **Step 4: Clean up test data and commit**

```bash
rm -f data/db/would-not-recommend.db
git add src/lib/db.ts src/app/api/log/route.ts
git commit -m "feat: SQLite database layer — review log, sessions, statistics"
```

---

## Task 4: Google Places API Route

**Files:**
- Create: `src/app/api/places/route.ts`, `src/app/api/geocode/route.ts`

- [ ] **Step 1: Create `src/app/api/places/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";

const API_KEY = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY;

export async function GET(request: NextRequest) {
  if (!API_KEY) {
    return NextResponse.json(
      { error: "Google API key not configured" },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");
  const radius = searchParams.get("radius") || "200";

  if (!lat || !lng) {
    return NextResponse.json(
      { error: "lat and lng required" },
      { status: 400 }
    );
  }

  try {
    // Step 1: Nearby Search
    const nearbyUrl = new URL(
      "https://maps.googleapis.com/maps/api/place/nearbysearch/json"
    );
    nearbyUrl.searchParams.set("location", `${lat},${lng}`);
    nearbyUrl.searchParams.set("radius", radius);
    nearbyUrl.searchParams.set("key", API_KEY);

    const nearbyRes = await fetch(nearbyUrl.toString());
    const nearbyData = await nearbyRes.json();

    if (nearbyData.status !== "OK" && nearbyData.status !== "ZERO_RESULTS") {
      console.error("Places API error:", nearbyData.status, nearbyData.error_message);
      return NextResponse.json(
        { error: nearbyData.status, places: [] },
        { status: 200 }
      );
    }

    const places = (nearbyData.results || []).map(
      (p: {
        place_id: string;
        name: string;
        geometry: { location: { lat: number; lng: number } };
        types: string[];
        rating?: number;
        user_ratings_total?: number;
      }) => ({
        placeId: p.place_id,
        name: p.name,
        location: {
          lat: p.geometry.location.lat,
          lng: p.geometry.location.lng,
        },
        types: p.types || [],
        rating: p.rating,
        totalRatings: p.user_ratings_total,
      })
    );

    return NextResponse.json({ places });
  } catch (error) {
    console.error("Places fetch error:", error);
    return NextResponse.json({ error: "Fetch failed", places: [] }, { status: 500 });
  }
}

// Separate endpoint for place details (reviews)
export async function POST(request: NextRequest) {
  if (!API_KEY) {
    return NextResponse.json(
      { error: "Google API key not configured" },
      { status: 500 }
    );
  }

  try {
    const { placeId } = await request.json();

    if (!placeId) {
      return NextResponse.json(
        { error: "placeId required" },
        { status: 400 }
      );
    }

    const detailsUrl = new URL(
      "https://maps.googleapis.com/maps/api/place/details/json"
    );
    detailsUrl.searchParams.set("place_id", placeId);
    detailsUrl.searchParams.set("fields", "name,reviews,types");
    detailsUrl.searchParams.set("key", API_KEY);

    const detailsRes = await fetch(detailsUrl.toString());
    const detailsData = await detailsRes.json();

    if (detailsData.status !== "OK") {
      return NextResponse.json({ reviews: [] });
    }

    const reviews = (detailsData.result?.reviews || []).map(
      (r: {
        text: string;
        rating: number;
        author_name: string;
        relative_time_description: string;
      }) => ({
        text: r.text,
        rating: r.rating,
        authorName: r.author_name,
        relativeTimeDescription: r.relative_time_description,
      })
    );

    return NextResponse.json({
      name: detailsData.result?.name,
      types: detailsData.result?.types || [],
      reviews,
    });
  } catch (error) {
    console.error("Place details fetch error:", error);
    return NextResponse.json({ reviews: [] }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create `src/app/api/geocode/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";

const API_KEY = process.env.GOOGLE_MAPS_API_KEY;

export async function GET(request: NextRequest) {
  if (!API_KEY) {
    return NextResponse.json({ city: "Unknown" });
  }

  const { searchParams } = new URL(request.url);
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");

  if (!lat || !lng) {
    return NextResponse.json({ city: "Unknown" });
  }

  try {
    const url = new URL(
      "https://maps.googleapis.com/maps/api/geocode/json"
    );
    url.searchParams.set("latlng", `${lat},${lng}`);
    url.searchParams.set("result_type", "locality|administrative_area_level_1|country");
    url.searchParams.set("key", API_KEY);

    const res = await fetch(url.toString());
    const data = await res.json();

    if (data.status !== "OK" || !data.results?.length) {
      return NextResponse.json({ city: "Unknown", country: null });
    }

    // Extract city and country from address components
    let city = "";
    let country = "";

    for (const result of data.results) {
      for (const component of result.address_components || []) {
        const types: string[] = component.types || [];
        if (types.includes("locality") && !city) {
          city = component.long_name;
        }
        if (types.includes("administrative_area_level_1") && !city) {
          city = component.long_name;
        }
        if (types.includes("country") && !country) {
          country = component.long_name;
        }
      }
      if (city && country) break;
    }

    const display = city && country ? `${city}, ${country}` : country || city || "Unknown";

    return NextResponse.json({ city: display, country: country || null });
  } catch (error) {
    console.error("Geocode error:", error);
    return NextResponse.json({ city: "Unknown", country: null });
  }
}
```

- [ ] **Step 3: Verify Places API works**

```bash
# Replace with actual coordinates and ensure API key is set in .env.local
curl "http://localhost:3000/api/places?lat=40.758&lng=-73.9855&radius=200"
curl "http://localhost:3000/api/geocode?lat=40.758&lng=-73.9855"
```

Expected: JSON with places array (may be empty if API key isn't configured yet — that's OK, just verify no 500 errors).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/places/route.ts src/app/api/geocode/route.ts
git commit -m "feat: Google Places and Geocoding API proxy routes"
```

---

## Task 5: Review Manager

**Files:**
- Create: `src/engine/review-manager.ts`

- [ ] **Step 1: Create `src/engine/review-manager.ts`**

```typescript
import { PLACES, REVIEWS } from "@/lib/config";
import type { LatLng, DetectedBusiness, Review } from "@/lib/types";

/**
 * Calculate distance between two coordinates in meters (Haversine formula)
 */
export function haversineDistance(a: LatLng, b: LatLng): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const aVal =
    sinDLat * sinDLat +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      sinDLng * sinDLng;
  const c = 2 * Math.atan2(Math.sqrt(aVal), Math.sqrt(1 - aVal));
  return R * c;
}

/**
 * Calculate bearing from point A to point B in degrees (0-360)
 */
export function bearing(from: LatLng, to: LatLng): number {
  const dLng = ((to.lng - from.lng) * Math.PI) / 180;
  const fromLat = (from.lat * Math.PI) / 180;
  const toLat = (to.lat * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(toLat);
  const x =
    Math.cos(fromLat) * Math.sin(toLat) -
    Math.sin(fromLat) * Math.cos(toLat) * Math.cos(dLng);
  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}

/**
 * Hash a review text for deduplication
 */
export function hashReview(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32-bit integer
  }
  return `r_${hash.toString(36)}`;
}

/**
 * Filter reviews: 1-star, English, appropriate length, not already read
 */
export function filterReviews(
  reviews: Review[],
  readHashes: Set<string>
): Review[] {
  return reviews.filter((r) => {
    if (r.rating !== REVIEWS.TARGET_RATING) return false;
    if (r.text.length < REVIEWS.MIN_LENGTH) return false;
    if (r.text.length > REVIEWS.MAX_LENGTH) return false;
    if (readHashes.has(r.hash)) return false;
    // Basic English detection: reject if mostly non-Latin characters
    const latinChars = r.text.replace(/[^a-zA-Z]/g, "").length;
    const totalChars = r.text.replace(/\s/g, "").length;
    if (totalChars > 0 && latinChars / totalChars < 0.5) return false;
    return true;
  });
}

/**
 * Select one review from filtered list (random for V1)
 */
export function selectReview(reviews: Review[]): Review | null {
  if (reviews.length === 0) return null;
  const index = Math.floor(Math.random() * reviews.length);
  return reviews[index];
}

/**
 * ReviewManager: handles fetching, caching, and selecting reviews
 */
export class ReviewManager {
  private readHashes: Set<string>;
  private lastQueryCoords: LatLng | null = null;
  private lastQueryTime: number = 0;
  private cachedBusinesses: DetectedBusiness[] = [];

  constructor(readHashes: Set<string>) {
    this.readHashes = readHashes;
  }

  /**
   * Check if we should re-query the Places API based on distance moved and time elapsed
   */
  shouldQuery(currentCoords: LatLng): boolean {
    const now = Date.now();
    if (now - this.lastQueryTime < PLACES.QUERY_MIN_INTERVAL) return false;
    if (!this.lastQueryCoords) return true;
    const dist = haversineDistance(this.lastQueryCoords, currentCoords);
    return dist >= PLACES.QUERY_DISTANCE_THRESHOLD;
  }

  /**
   * Fetch nearby businesses from the Places API proxy
   */
  async fetchNearbyBusinesses(currentCoords: LatLng): Promise<DetectedBusiness[]> {
    this.lastQueryCoords = { ...currentCoords };
    this.lastQueryTime = Date.now();

    try {
      const res = await fetch(
        `/api/places?lat=${currentCoords.lat}&lng=${currentCoords.lng}&radius=${PLACES.SEARCH_RADIUS}`
      );
      const data = await res.json();

      if (!data.places || data.places.length === 0) {
        this.cachedBusinesses = [];
        return [];
      }

      this.cachedBusinesses = data.places.map(
        (p: { placeId: string; name: string; location: LatLng; types: string[] }) => ({
          placeId: p.placeId,
          name: p.name,
          location: p.location,
          types: p.types,
          bearing: bearing(currentCoords, p.location),
          distance: haversineDistance(currentCoords, p.location),
        })
      );

      return this.cachedBusinesses;
    } catch (error) {
      console.error("Failed to fetch nearby businesses:", error);
      return this.cachedBusinesses;
    }
  }

  /**
   * Find the nearest business within detection radius from cached results
   */
  findNearestBusiness(currentCoords: LatLng): DetectedBusiness | null {
    // Recalculate distances from current position
    const updated = this.cachedBusinesses.map((b) => ({
      ...b,
      distance: haversineDistance(currentCoords, b.location),
      bearing: bearing(currentCoords, b.location),
    }));

    const inRange = updated
      .filter((b) => b.distance <= PLACES.DETECTION_RADIUS)
      .sort((a, b) => a.distance - b.distance);

    return inRange[0] || null;
  }

  /**
   * Fetch reviews for a specific business and return a filtered 1-star review
   */
  async fetchAndSelectReview(
    placeId: string
  ): Promise<{ review: Review | null; businessTypes: string[] }> {
    try {
      const res = await fetch("/api/places", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeId }),
      });
      const data = await res.json();

      const reviews: Review[] = (data.reviews || []).map(
        (r: { text: string; rating: number; authorName: string; relativeTimeDescription: string }) => ({
          ...r,
          hash: hashReview(r.text),
        })
      );

      const filtered = filterReviews(reviews, this.readHashes);
      const selected = selectReview(filtered);

      if (selected) {
        this.readHashes.add(selected.hash);
      }

      return { review: selected, businessTypes: data.types || [] };
    } catch (error) {
      console.error("Failed to fetch reviews:", error);
      return { review: null, businessTypes: [] };
    }
  }
}
```

- [ ] **Step 2: Verify the module compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/engine/review-manager.ts
git commit -m "feat: review manager — Places API client, filtering, dedup, geo utils"
```

---

## Task 6: State Machine

**Files:**
- Create: `src/engine/state-machine.ts`

- [ ] **Step 1: Create `src/engine/state-machine.ts`**

This is a pure state machine — no side effects, no DOM. It receives events and produces state transitions with scheduled timers.

```typescript
import { BotState, type BotEvent, type BotContext, type LatLng, stateToMode } from "@/lib/types";
import { TIMING } from "@/lib/config";

export interface StateTransition {
  newState: BotState;
  /** Timer to schedule (fires the given event after delay) */
  scheduleTimer?: { event: BotEvent; delayMs: number };
  /** Side effects to trigger */
  effects: Effect[];
}

export type Effect =
  | { type: "START_WALKING" }
  | { type: "STOP_WALKING" }
  | { type: "PAN_TO_BUSINESS"; bearingDeg: number }
  | { type: "START_TTS"; text: string }
  | { type: "START_LINGER_ZOOM" }
  | { type: "RESET_ZOOM" }
  | { type: "PLAY_BLEEP" }
  | { type: "PLAY_BLOOP" }
  | { type: "CROSSFADE_TO_A" }
  | { type: "CROSSFADE_TO_B" }
  | { type: "DUCK_AMBIENT" }
  | { type: "UNDUCK_AMBIENT" }
  | { type: "START_TELEPORT_FADE" }
  | { type: "COMPLETE_TELEPORT"; destination: LatLng }
  | { type: "TAKE_SCREENSHOT" }
  | { type: "LOG_REVIEW" }
  | { type: "INCREMENT_COUNTER" };

/**
 * Pure state transition function.
 * Given the current context and an event, returns the new state and any effects to execute.
 */
export function transition(
  context: BotContext,
  event: BotEvent
): StateTransition | null {
  const { state } = context;

  switch (state) {
    case BotState.WANDER: {
      if (event.type === "BUSINESS_DETECTED") {
        return {
          newState: BotState.DETECT,
          scheduleTimer: {
            event: { type: "APPROACH_COMPLETE" },
            delayMs: TIMING.DETECT_DURATION + TIMING.APPROACH_DURATION,
          },
          effects: [
            { type: "PLAY_BLEEP" },
            { type: "CROSSFADE_TO_B" },
          ],
        };
      }
      if (event.type === "STUCK_DETECTED" || event.type === "TELEPORT_TRIGGERED") {
        return {
          newState: BotState.TELEPORT,
          effects: [
            { type: "STOP_WALKING" },
            { type: "START_TELEPORT_FADE" },
          ],
        };
      }
      return null;
    }

    case BotState.DETECT: {
      // DETECT transitions automatically into APPROACH — they share a timer
      // The APPROACH_COMPLETE event fires when both DETECT + APPROACH time has elapsed
      if (event.type === "APPROACH_COMPLETE") {
        return {
          newState: BotState.INSPECT,
          scheduleTimer: {
            event: { type: "INSPECT_COMPLETE" },
            delayMs: TIMING.INSPECT_PAN_DURATION + TIMING.INSPECT_HOLD_DURATION,
          },
          effects: [
            { type: "STOP_WALKING" },
            {
              type: "PAN_TO_BUSINESS",
              bearingDeg: context.targetBusiness?.bearing ?? 0,
            },
            { type: "TAKE_SCREENSHOT" },
          ],
        };
      }
      return null;
    }

    case BotState.APPROACH: {
      // APPROACH is folded into DETECT's timer for simplicity
      return null;
    }

    case BotState.INSPECT: {
      if (event.type === "INSPECT_COMPLETE") {
        const reviewText = context.reviewToRead?.text;
        if (!reviewText) {
          // No review available — skip to depart
          return {
            newState: BotState.DEPART,
            scheduleTimer: {
              event: { type: "DEPART_COMPLETE" },
              delayMs: TIMING.DEPART_DURATION,
            },
            effects: [
              { type: "PLAY_BLOOP" },
              { type: "CROSSFADE_TO_A" },
              { type: "RESET_ZOOM" },
              { type: "START_WALKING" },
            ],
          };
        }
        return {
          newState: BotState.DELIVER,
          effects: [
            { type: "DUCK_AMBIENT" },
            { type: "START_TTS", text: reviewText },
          ],
        };
      }
      return null;
    }

    case BotState.DELIVER: {
      if (event.type === "DELIVER_COMPLETE") {
        return {
          newState: BotState.LINGER,
          scheduleTimer: {
            event: { type: "LINGER_COMPLETE" },
            delayMs: TIMING.LINGER_DURATION,
          },
          effects: [
            { type: "UNDUCK_AMBIENT" },
            { type: "START_LINGER_ZOOM" },
            { type: "LOG_REVIEW" },
            { type: "INCREMENT_COUNTER" },
          ],
        };
      }
      return null;
    }

    case BotState.LINGER: {
      if (event.type === "LINGER_COMPLETE") {
        return {
          newState: BotState.DEPART,
          scheduleTimer: {
            event: { type: "DEPART_COMPLETE" },
            delayMs: TIMING.DEPART_DURATION,
          },
          effects: [
            { type: "PLAY_BLOOP" },
            { type: "CROSSFADE_TO_A" },
            { type: "RESET_ZOOM" },
            { type: "START_WALKING" },
          ],
        };
      }
      return null;
    }

    case BotState.DEPART: {
      if (event.type === "DEPART_COMPLETE") {
        return {
          newState: BotState.WANDER,
          effects: [],
        };
      }
      return null;
    }

    case BotState.TELEPORT: {
      if (event.type === "TELEPORT_COMPLETE") {
        return {
          newState: BotState.WANDER,
          effects: [
            { type: "CROSSFADE_TO_A" },
            { type: "START_WALKING" },
          ],
        };
      }
      return null;
    }
  }

  return null;
}

/**
 * Check if the bot is in cooldown (too soon since last review)
 */
export function isInCooldown(context: BotContext): boolean {
  if (context.lastReviewTime === 0) return false;
  return Date.now() - context.lastReviewTime < TIMING.REVIEW_COOLDOWN;
}

/**
 * Check if the bot should teleport due to being stuck
 */
export function shouldTeleport(context: BotContext): boolean {
  const now = Date.now();

  // No review in a long time
  if (
    context.lastReviewTime > 0 &&
    now - context.lastReviewTime > TIMING.NO_REVIEW_TELEPORT_THRESHOLD
  ) {
    return true;
  }

  // Hasn't moved significantly
  if (context.stuckCheckCoords) {
    // This is checked externally — the bot orchestrator computes distance
    return false; // The orchestrator handles this check
  }

  return false;
}

/**
 * Create the initial bot context
 */
export function createInitialContext(startCoords: LatLng): BotContext {
  return {
    state: BotState.WANDER,
    mode: "Searching",
    teleportPhase: "none",
    currentCoords: startCoords,
    currentCity: "Unknown",
    targetBusiness: null,
    reviewToRead: null,
    sessionReviewCount: 0,
    sessionStartTime: Date.now(),
    lastReviewTime: 0,
    lastQueryCoords: null,
    readReviewHashes: new Set(),
    stuckCheckTimestamp: Date.now(),
    stuckCheckCoords: startCoords,
  };
}
```

- [ ] **Step 2: Verify compilation**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/engine/state-machine.ts
git commit -m "feat: pure state machine — transitions, effects, cooldown, stuck detection"
```

---

## Task 7: TTS Engine

**Files:**
- Create: `src/engine/tts-engine.ts`

- [ ] **Step 1: Create `src/engine/tts-engine.ts`**

```typescript
import type { TTSEngine } from "@/lib/types";

/**
 * Web Speech API implementation of TTSEngine.
 * Swappable — replace with ElevenLabs implementation later by matching the interface.
 */
export class WebSpeechTTS implements TTSEngine {
  private synth: SpeechSynthesis;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private speaking: boolean = false;

  constructor() {
    this.synth = window.speechSynthesis;
  }

  /**
   * Speak the given text. Returns a promise that resolves when speech completes.
   */
  speak(text: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Cancel any ongoing speech
      this.stop();

      const utterance = new SpeechSynthesisUtterance(text);

      // Configure for flat, monotone delivery
      utterance.rate = 0.9; // Slightly slower than normal
      utterance.pitch = 0.8; // Lower pitch for flatness
      utterance.volume = 1.0;

      // Try to select a suitable voice
      const voices = this.synth.getVoices();
      const preferred = voices.find(
        (v) =>
          v.lang.startsWith("en") &&
          (v.name.toLowerCase().includes("daniel") ||
            v.name.toLowerCase().includes("alex") ||
            v.name.toLowerCase().includes("google us english") ||
            v.name.toLowerCase().includes("samantha"))
      );
      const fallback = voices.find((v) => v.lang.startsWith("en"));
      if (preferred) {
        utterance.voice = preferred;
      } else if (fallback) {
        utterance.voice = fallback;
      }

      utterance.onstart = () => {
        this.speaking = true;
      };

      utterance.onend = () => {
        this.speaking = false;
        this.currentUtterance = null;
        resolve();
      };

      utterance.onerror = (event) => {
        this.speaking = false;
        this.currentUtterance = null;
        // Don't reject on "interrupted" — that's expected when we call stop()
        if (event.error === "interrupted" || event.error === "canceled") {
          resolve();
        } else {
          console.error("TTS error:", event.error);
          reject(new Error(`TTS error: ${event.error}`));
        }
      };

      this.currentUtterance = utterance;
      this.synth.speak(utterance);
    });
  }

  stop(): void {
    if (this.synth.speaking) {
      this.synth.cancel();
    }
    this.speaking = false;
    this.currentUtterance = null;
  }

  isSpeaking(): boolean {
    return this.speaking;
  }
}

/**
 * Ensure voices are loaded (they load async in some browsers)
 */
export function waitForVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      resolve(voices);
      return;
    }
    window.speechSynthesis.onvoiceschanged = () => {
      resolve(window.speechSynthesis.getVoices());
    };
  });
}
```

- [ ] **Step 2: Verify compilation**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/engine/tts-engine.ts
git commit -m "feat: TTS engine — Web Speech API with swappable interface"
```

---

## Task 8: Audio Engine

**Files:**
- Create: `src/engine/audio-engine.ts`

- [ ] **Step 1: Create `src/engine/audio-engine.ts`**

```typescript
import { AUDIO, TIMING } from "@/lib/config";
import type { AmbientLayer } from "@/lib/types";

/**
 * AudioEngine manages all audio: two ambient layers, crossfading, bleep/bloop SFX, and file loading.
 * All transitions are smooth crossfades — no hard cuts.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  // Ambient layers
  private ambientASource: AudioBufferSourceNode | null = null;
  private ambientBSource: AudioBufferSourceNode | null = null;
  private ambientAGain: GainNode | null = null;
  private ambientBGain: GainNode | null = null;
  private ambientABuffer: AudioBuffer | null = null;
  private ambientBBuffer: AudioBuffer | null = null;

  // SFX buffers
  private bleepBuffer: AudioBuffer | null = null;
  private bloopBuffer: AudioBuffer | null = null;

  // State
  private activeLayer: AmbientLayer = "A";
  private initialized = false;

  /**
   * Initialize the audio context. Must be called after a user gesture (browser policy).
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    this.ctx = new AudioContext();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = AUDIO.MASTER_VOLUME;
    this.masterGain.connect(this.ctx.destination);

    // Create gain nodes for each ambient layer
    this.ambientAGain = this.ctx.createGain();
    this.ambientAGain.gain.value = AUDIO.AMBIENT_SEARCHING_VOLUME;
    this.ambientAGain.connect(this.masterGain);

    this.ambientBGain = this.ctx.createGain();
    this.ambientBGain.gain.value = 0;
    this.ambientBGain.connect(this.masterGain);

    // Load audio files
    await Promise.all([
      this.loadAudioFile("/audio/ambient-a.mp3").then((buf) => {
        this.ambientABuffer = buf;
      }),
      this.loadAudioFile("/audio/ambient-b.mp3").then((buf) => {
        this.ambientBBuffer = buf;
      }),
      this.loadAudioFile("/audio/bleep.mp3").then((buf) => {
        this.bleepBuffer = buf;
      }),
      this.loadAudioFile("/audio/bloop.mp3").then((buf) => {
        this.bloopBuffer = buf;
      }),
    ]).catch((err) => {
      console.warn("Some audio files failed to load — using generated fallbacks:", err);
    });

    // Generate fallback SFX if files weren't loaded
    if (!this.bleepBuffer) {
      this.bleepBuffer = this.generateTone(660, 0.3, "ascending");
    }
    if (!this.bloopBuffer) {
      this.bloopBuffer = this.generateTone(440, 0.3, "descending");
    }

    // Generate fallback ambient if files weren't loaded
    if (!this.ambientABuffer) {
      this.ambientABuffer = this.generateAmbient(30, 120); // 30 seconds, 120 Hz base
    }
    if (!this.ambientBBuffer) {
      this.ambientBBuffer = this.generateAmbient(30, 150); // 30 seconds, 150 Hz base
    }

    this.initialized = true;
  }

  /**
   * Start playing the ambient layers. Call after init().
   */
  startAmbient(): void {
    if (!this.ctx || !this.masterGain) return;
    this.startAmbientLayer("A");
    this.startAmbientLayer("B");
  }

  private startAmbientLayer(layer: AmbientLayer): void {
    if (!this.ctx || !this.masterGain) return;

    const buffer = layer === "A" ? this.ambientABuffer : this.ambientBBuffer;
    const gainNode = layer === "A" ? this.ambientAGain : this.ambientBGain;
    if (!buffer || !gainNode) return;

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(gainNode);
    source.start();

    if (layer === "A") {
      this.ambientASource = source;
    } else {
      this.ambientBSource = source;
    }
  }

  /**
   * Crossfade to the specified ambient layer over the configured duration.
   */
  crossfadeTo(layer: AmbientLayer): void {
    if (!this.ctx || !this.ambientAGain || !this.ambientBGain) return;
    if (this.activeLayer === layer) return;

    const now = this.ctx.currentTime;
    const duration = TIMING.AUDIO_CROSSFADE / 1000;

    const targetVolume =
      layer === "A"
        ? AUDIO.AMBIENT_SEARCHING_VOLUME
        : AUDIO.AMBIENT_PROCESSING_VOLUME;

    if (layer === "A") {
      // Fade in A, fade out B
      this.ambientAGain.gain.linearRampToValueAtTime(targetVolume, now + duration);
      this.ambientBGain.gain.linearRampToValueAtTime(0, now + duration);
    } else {
      // Fade in B, fade out A
      this.ambientBGain.gain.linearRampToValueAtTime(targetVolume, now + duration);
      this.ambientAGain.gain.linearRampToValueAtTime(0, now + duration);
    }

    this.activeLayer = layer;
  }

  /**
   * Duck the ambient volume (during TTS delivery)
   */
  duckAmbient(): void {
    if (!this.ctx || !this.ambientBGain) return;
    const now = this.ctx.currentTime;
    this.ambientBGain.gain.linearRampToValueAtTime(
      AUDIO.AMBIENT_DELIVER_VOLUME,
      now + 0.5
    );
  }

  /**
   * Restore ambient volume after TTS
   */
  unduckAmbient(): void {
    if (!this.ctx || !this.ambientBGain) return;
    const now = this.ctx.currentTime;
    this.ambientBGain.gain.linearRampToValueAtTime(
      AUDIO.AMBIENT_PROCESSING_VOLUME,
      now + 0.5
    );
  }

  /**
   * Play the bleep sound effect (entering Processing mode)
   */
  playBleep(): void {
    this.playSFX(this.bleepBuffer);
  }

  /**
   * Play the bloop sound effect (exiting Processing mode)
   */
  playBloop(): void {
    this.playSFX(this.bloopBuffer);
  }

  private playSFX(buffer: AudioBuffer | null): void {
    if (!this.ctx || !this.masterGain || !buffer) return;

    const source = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    gain.gain.value = AUDIO.SFX_VOLUME;

    source.buffer = buffer;
    source.connect(gain);
    gain.connect(this.masterGain);
    source.start();
  }

  /**
   * Fade all audio to silence (for teleport)
   */
  fadeToSilence(durationMs: number): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    this.masterGain.gain.linearRampToValueAtTime(0, now + durationMs / 1000);
  }

  /**
   * Restore master volume (after teleport)
   */
  fadeFromSilence(durationMs: number): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    this.masterGain.gain.setValueAtTime(0, now);
    this.masterGain.gain.linearRampToValueAtTime(
      AUDIO.MASTER_VOLUME,
      now + durationMs / 1000
    );
  }

  /**
   * Load an audio file and decode it
   */
  private async loadAudioFile(url: string): Promise<AudioBuffer> {
    if (!this.ctx) throw new Error("AudioContext not initialized");
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to load audio: ${url}`);
    const arrayBuffer = await response.arrayBuffer();
    return this.ctx.decodeAudioData(arrayBuffer);
  }

  /**
   * Generate a simple tone for bleep/bloop fallback
   */
  private generateTone(
    baseFreq: number,
    durationSec: number,
    direction: "ascending" | "descending"
  ): AudioBuffer {
    if (!this.ctx) throw new Error("AudioContext not initialized");

    const sampleRate = this.ctx.sampleRate;
    const length = Math.floor(sampleRate * durationSec);
    const buffer = this.ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    const freq1 = direction === "ascending" ? baseFreq : baseFreq * 1.25;
    const freq2 = direction === "ascending" ? baseFreq * 1.25 : baseFreq;

    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      const progress = i / length;
      const freq = freq1 + (freq2 - freq1) * progress;
      // Sine wave with fade envelope
      const envelope =
        Math.min(1, progress * 20) * Math.min(1, (1 - progress) * 10);
      data[i] = Math.sin(2 * Math.PI * freq * t) * envelope * 0.3;
    }

    return buffer;
  }

  /**
   * Generate a simple ambient drone for fallback
   */
  private generateAmbient(durationSec: number, baseFreq: number): AudioBuffer {
    if (!this.ctx) throw new Error("AudioContext not initialized");

    const sampleRate = this.ctx.sampleRate;
    const length = Math.floor(sampleRate * durationSec);
    const buffer = this.ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      // Low drone with slow modulation
      const mod = 1 + 0.3 * Math.sin(2 * Math.PI * 0.1 * t);
      const drone =
        Math.sin(2 * Math.PI * baseFreq * t * mod) * 0.15 +
        Math.sin(2 * Math.PI * baseFreq * 1.5 * t) * 0.08 +
        Math.sin(2 * Math.PI * baseFreq * 0.5 * t) * 0.1;
      // Add slight noise texture
      const noise = (Math.random() - 0.5) * 0.02;
      data[i] = drone + noise;
    }

    return buffer;
  }

  /**
   * Resume AudioContext if suspended (browser autoplay policy)
   */
  async resume(): Promise<void> {
    if (this.ctx?.state === "suspended") {
      await this.ctx.resume();
    }
  }

  destroy(): void {
    this.ambientASource?.stop();
    this.ambientBSource?.stop();
    this.ctx?.close();
    this.initialized = false;
  }
}
```

- [ ] **Step 2: Verify compilation**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/engine/audio-engine.ts
git commit -m "feat: audio engine — ambient layers, crossfade, bleep/bloop, file loading"
```

---

## Task 9: Street View Controller

**Files:**
- Create: `src/engine/street-view-controller.ts`

- [ ] **Step 1: Create `src/engine/street-view-controller.ts`**

```typescript
import { Loader } from "@googlemaps/js-api-loader";
import { STREET_VIEW } from "@/lib/config";
import type { LatLng, StreetViewLink } from "@/lib/types";

/**
 * Wraps the Google Street View Panorama API.
 * Handles rendering, navigation, panning, and coordinate retrieval.
 */
export class StreetViewController {
  private panorama: google.maps.StreetViewPanorama | null = null;
  private currentHeading: number = 0;
  private isMoving: boolean = false;
  private moveInterval: number | null = null;

  /**
   * Initialize Street View in the given container element.
   */
  async init(container: HTMLElement, startCoords: LatLng): Promise<void> {
    const loader = new Loader({
      apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "",
      version: "weekly",
    });

    await loader.importLibrary("streetView");

    this.panorama = new google.maps.StreetViewPanorama(container, {
      position: startCoords,
      pov: {
        heading: this.currentHeading,
        pitch: STREET_VIEW.PITCH,
      },
      zoom: 0,
      // Disable all default UI
      addressControl: false,
      fullscreenControl: false,
      motionTracking: false,
      motionTrackingControl: false,
      panControl: false,
      zoomControl: false,
      linksControl: false,
      enableCloseButton: false,
      showRoadLabels: false,
      clickToGo: false,
      disableDefaultUI: true,
      // Disable keyboard/mouse interaction — the bot controls everything
      scrollwheel: false,
      disableDoubleClickZoom: true,
    });

    // Set initial heading randomly
    this.currentHeading = Math.random() * 360;
    this.panorama.setPov({
      heading: this.currentHeading,
      pitch: STREET_VIEW.PITCH,
    });
  }

  /**
   * Get the current GPS coordinates of the panorama.
   */
  getCoords(): LatLng {
    if (!this.panorama) return { lat: 0, lng: 0 };
    const pos = this.panorama.getPosition();
    if (!pos) return { lat: 0, lng: 0 };
    return { lat: pos.lat(), lng: pos.lng() };
  }

  /**
   * Get the current heading in degrees.
   */
  getHeading(): number {
    return this.currentHeading;
  }

  /**
   * Get available links (adjacent panoramas) from the current position.
   */
  getLinks(): StreetViewLink[] {
    if (!this.panorama) return [];
    const links = this.panorama.getLinks();
    if (!links) return [];
    return links.map((link) => ({
      pano: link.pano || "",
      heading: link.heading || 0,
      description: link.description || undefined,
    }));
  }

  /**
   * Move to the next panorama along the current heading direction.
   * Picks the link closest to the current heading.
   */
  stepForward(): boolean {
    const links = this.getLinks();
    if (links.length === 0) return false;

    // Find the link closest to current heading
    let bestLink = links[0];
    let bestDelta = 360;

    for (const link of links) {
      let delta = Math.abs(link.heading - this.currentHeading);
      if (delta > 180) delta = 360 - delta;
      // Add small random wobble to make movement feel natural
      const wobble = (Math.random() - 0.5) * STREET_VIEW.WANDER_HEADING_WOBBLE;
      delta += wobble;
      if (delta < bestDelta) {
        bestDelta = delta;
        bestLink = link;
      }
    }

    if (!this.panorama) return false;

    this.panorama.setPano(bestLink.pano);
    this.currentHeading = bestLink.heading;
    this.panorama.setPov({
      heading: this.currentHeading,
      pitch: STREET_VIEW.PITCH,
    });

    return true;
  }

  /**
   * Smoothly pan the camera to face a specific heading (degrees).
   * Returns a promise that resolves when the pan completes.
   */
  panToHeading(targetHeading: number, durationMs: number): Promise<void> {
    return new Promise((resolve) => {
      if (!this.panorama) {
        resolve();
        return;
      }

      const startHeading = this.currentHeading;
      let delta = targetHeading - startHeading;
      // Take the shortest path
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;

      const startTime = performance.now();

      const animate = () => {
        const elapsed = performance.now() - startTime;
        const progress = Math.min(1, elapsed / durationMs);
        // Ease-in-out curve
        const eased =
          progress < 0.5
            ? 2 * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 2) / 2;

        this.currentHeading = (startHeading + delta * eased + 360) % 360;
        this.panorama?.setPov({
          heading: this.currentHeading,
          pitch: STREET_VIEW.PITCH,
        });

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          this.currentHeading = (targetHeading + 360) % 360;
          resolve();
        }
      };

      requestAnimationFrame(animate);
    });
  }

  /**
   * Teleport to a new location (no animation — used with fade overlay).
   */
  teleportTo(coords: LatLng): void {
    if (!this.panorama) return;
    this.panorama.setPosition(coords);
    this.currentHeading = Math.random() * 360;
    this.panorama.setPov({
      heading: this.currentHeading,
      pitch: STREET_VIEW.PITCH,
    });
  }

  /**
   * Start walking forward at intervals.
   */
  startWalking(intervalMs: number): void {
    if (this.isMoving) return;
    this.isMoving = true;
    this.moveInterval = window.setInterval(() => {
      if (!this.stepForward()) {
        // Dead end — can't move forward. Will be caught by stuck detection.
      }
    }, intervalMs);
  }

  /**
   * Stop walking.
   */
  stopWalking(): void {
    this.isMoving = false;
    if (this.moveInterval !== null) {
      clearInterval(this.moveInterval);
      this.moveInterval = null;
    }
  }

  /**
   * Get a reference to the panorama container for screenshot capture.
   */
  getContainer(): HTMLElement | null {
    if (!this.panorama) return null;
    return (this.panorama as unknown as { getDiv: () => HTMLElement }).getDiv?.() || null;
  }

  destroy(): void {
    this.stopWalking();
    this.panorama = null;
  }
}
```

- [ ] **Step 2: Verify compilation**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/engine/street-view-controller.ts
git commit -m "feat: Street View controller — navigation, panning, teleport"
```

---

## Task 10: Teleport Manager

**Files:**
- Create: `src/engine/teleport-manager.ts`, `data/teleport-destinations.json`

- [ ] **Step 1: Create `data/teleport-destinations.json`**

Curated list of locations with verified Street View coverage. Geographically diverse.

```json
[
  { "lat": 40.758, "lng": -73.9855, "label": "Times Square, NYC" },
  { "lat": 48.8566, "lng": 2.3522, "label": "Paris, France" },
  { "lat": 35.6762, "lng": 139.6503, "label": "Tokyo, Japan" },
  { "lat": 51.5074, "lng": -0.1278, "label": "London, UK" },
  { "lat": -33.8688, "lng": 151.2093, "label": "Sydney, Australia" },
  { "lat": 55.7558, "lng": 37.6173, "label": "Moscow, Russia" },
  { "lat": 37.7749, "lng": -122.4194, "label": "San Francisco, USA" },
  { "lat": -22.9068, "lng": -43.1729, "label": "Rio de Janeiro, Brazil" },
  { "lat": 52.52, "lng": 13.405, "label": "Berlin, Germany" },
  { "lat": 1.3521, "lng": 103.8198, "label": "Singapore" },
  { "lat": 41.0082, "lng": 28.9784, "label": "Istanbul, Turkey" },
  { "lat": 13.7563, "lng": 100.5018, "label": "Bangkok, Thailand" },
  { "lat": 64.1466, "lng": -21.9426, "label": "Reykjavik, Iceland" },
  { "lat": -34.6037, "lng": -58.3816, "label": "Buenos Aires, Argentina" },
  { "lat": 37.9838, "lng": 23.7275, "label": "Athens, Greece" },
  { "lat": 30.0444, "lng": 31.2357, "label": "Cairo, Egypt" },
  { "lat": 35.1796, "lng": 136.9066, "label": "Nagoya, Japan" },
  { "lat": 45.4642, "lng": 9.19, "label": "Milan, Italy" },
  { "lat": 59.3293, "lng": 18.0686, "label": "Stockholm, Sweden" },
  { "lat": 25.2048, "lng": 55.2708, "label": "Dubai, UAE" },
  { "lat": 43.6532, "lng": -79.3832, "label": "Toronto, Canada" },
  { "lat": 34.0522, "lng": -118.2437, "label": "Los Angeles, USA" },
  { "lat": 38.7223, "lng": -9.1393, "label": "Lisbon, Portugal" },
  { "lat": 50.0755, "lng": 14.4378, "label": "Prague, Czech Republic" },
  { "lat": 47.4979, "lng": 19.0402, "label": "Budapest, Hungary" },
  { "lat": -6.2088, "lng": 106.8456, "label": "Jakarta, Indonesia" },
  { "lat": 19.4326, "lng": -99.1332, "label": "Mexico City, Mexico" },
  { "lat": 36.7213, "lng": -4.4217, "label": "Malaga, Spain" },
  { "lat": 60.1699, "lng": 24.9384, "label": "Helsinki, Finland" },
  { "lat": -33.9249, "lng": 18.4241, "label": "Cape Town, South Africa" }
]
```

- [ ] **Step 2: Create `src/engine/teleport-manager.ts`**

```typescript
import { TIMING } from "@/lib/config";
import { haversineDistance } from "./review-manager";
import type { LatLng } from "@/lib/types";
import destinations from "../../data/teleport-destinations.json";

interface TeleportDestination {
  lat: number;
  lng: number;
  label: string;
}

/**
 * Manages teleportation: destination selection, stuck detection, and timing.
 */
export class TeleportManager {
  private visitedDestinations: Set<number> = new Set();
  private stuckCheckCoords: LatLng | null = null;
  private stuckCheckTimestamp: number = 0;
  private lastReviewTimestamp: number = 0;
  private destinationsList: TeleportDestination[] = destinations;

  /**
   * Select a teleport destination. Prefers unvisited destinations that are
   * geographically distant from the current position.
   */
  selectDestination(currentCoords: LatLng): LatLng {
    // Filter to unvisited destinations
    let candidates = this.destinationsList.filter(
      (_, i) => !this.visitedDestinations.has(i)
    );

    // If all visited, reset and use all
    if (candidates.length === 0) {
      this.visitedDestinations.clear();
      candidates = [...this.destinationsList];
    }

    // Sort by distance from current position (descending — prefer far destinations)
    const withDistance = candidates.map((dest, originalIndex) => ({
      dest,
      originalIndex: this.destinationsList.indexOf(dest),
      distance: haversineDistance(currentCoords, { lat: dest.lat, lng: dest.lng }),
    }));
    withDistance.sort((a, b) => b.distance - a.distance);

    // Pick from the top 5 farthest destinations (with some randomness)
    const topN = withDistance.slice(0, Math.min(5, withDistance.length));
    const selected = topN[Math.floor(Math.random() * topN.length)];

    this.visitedDestinations.add(selected.originalIndex);

    return { lat: selected.dest.lat, lng: selected.dest.lng };
  }

  /**
   * Update the stuck detection state. Call periodically with current coords.
   */
  updateStuckCheck(currentCoords: LatLng): void {
    const now = Date.now();

    if (!this.stuckCheckCoords) {
      this.stuckCheckCoords = currentCoords;
      this.stuckCheckTimestamp = now;
      return;
    }

    // Only check at the configured interval
    if (now - this.stuckCheckTimestamp < TIMING.STUCK_CHECK_INTERVAL) return;

    this.stuckCheckCoords = currentCoords;
    this.stuckCheckTimestamp = now;
  }

  /**
   * Check if the bot should teleport. Returns true if stuck or if too long without a review.
   */
  shouldTeleport(currentCoords: LatLng): boolean {
    const now = Date.now();

    // Check: haven't moved significantly since last stuck check
    if (this.stuckCheckCoords) {
      const dist = haversineDistance(this.stuckCheckCoords, currentCoords);
      const timeSinceCheck = now - this.stuckCheckTimestamp;
      if (
        timeSinceCheck >= TIMING.STUCK_CHECK_INTERVAL &&
        dist < TIMING.STUCK_DISTANCE_THRESHOLD
      ) {
        return true;
      }
    }

    // Check: no review for a long time
    if (
      this.lastReviewTimestamp > 0 &&
      now - this.lastReviewTimestamp > TIMING.NO_REVIEW_TELEPORT_THRESHOLD
    ) {
      return true;
    }

    // First 3 minutes without any review at all
    if (
      this.lastReviewTimestamp === 0 &&
      this.stuckCheckTimestamp > 0 &&
      now - this.stuckCheckTimestamp > TIMING.NO_REVIEW_TELEPORT_THRESHOLD
    ) {
      return true;
    }

    return false;
  }

  /**
   * Record that a review was just delivered.
   */
  recordReview(): void {
    this.lastReviewTimestamp = Date.now();
  }

  /**
   * Reset stuck detection (called after teleport).
   */
  resetStuckDetection(newCoords: LatLng): void {
    this.stuckCheckCoords = newCoords;
    this.stuckCheckTimestamp = Date.now();
  }
}
```

- [ ] **Step 3: Enable JSON imports in `tsconfig.json`**

Add to `compilerOptions` in `tsconfig.json`:
```json
"resolveJsonModule": true
```

- [ ] **Step 4: Verify compilation**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/engine/teleport-manager.ts data/teleport-destinations.json tsconfig.json
git commit -m "feat: teleport manager — curated destinations, stuck detection"
```

---

## Task 11: Screenshot API Route

**Files:**
- Create: `src/app/api/screenshots/route.ts`

- [ ] **Step 1: Create `src/app/api/screenshots/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const SCREENSHOTS_DIR = path.join(process.cwd(), "data", "screenshots");

export async function POST(request: NextRequest) {
  try {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

    const body = await request.json();
    const { filename, dataUrl } = body;

    if (!filename || !dataUrl) {
      return NextResponse.json(
        { error: "filename and dataUrl required" },
        { status: 400 }
      );
    }

    // Strip the data URL prefix to get raw base64
    const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");

    const filepath = path.join(SCREENSHOTS_DIR, filename);
    fs.writeFileSync(filepath, buffer);

    return NextResponse.json({ ok: true, path: filepath });
  } catch (error) {
    console.error("Screenshot save error:", error);
    return NextResponse.json(
      { error: "Failed to save screenshot" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/screenshots/route.ts
git commit -m "feat: screenshot API route — saves base64 images to filesystem"
```

---

## Task 12: UI Components

**Files:**
- Create: `src/components/PulsingDot.tsx`, `src/components/Coordinates.tsx`, `src/components/CityLocation.tsx`, `src/components/ModeIndicator.tsx`, `src/components/SessionCounter.tsx`, `src/components/Timestamp.tsx`, `src/components/HUD.tsx`, `src/components/VisualEffects.tsx`

- [ ] **Step 1: Create `src/components/PulsingDot.tsx`**

```tsx
"use client";

import { PULSING_DOT } from "@/lib/config";
import type { BotMode } from "@/lib/types";

interface Props {
  mode: BotMode;
}

export function PulsingDot({ mode }: Props) {
  const cycle =
    mode === "Searching"
      ? PULSING_DOT.SEARCHING_CYCLE
      : PULSING_DOT.PROCESSING_CYCLE;

  return (
    <div
      className="rounded-full bg-white"
      style={{
        width: PULSING_DOT.SIZE,
        height: PULSING_DOT.SIZE,
        animation: `pulse ${cycle}ms ease-in-out infinite`,
      }}
    />
  );
}
```

- [ ] **Step 2: Create `src/components/Coordinates.tsx`**

```tsx
"use client";

import type { LatLng } from "@/lib/types";

interface Props {
  coords: LatLng;
}

export function Coordinates({ coords }: Props) {
  const latDir = coords.lat >= 0 ? "N" : "S";
  const lngDir = coords.lng >= 0 ? "E" : "W";
  const lat = Math.abs(coords.lat).toFixed(4);
  const lng = Math.abs(coords.lng).toFixed(4);

  return (
    <span className="text-white/60 text-xs font-mono tracking-wider">
      {lat}&deg; {latDir}, {lng}&deg; {lngDir}
    </span>
  );
}
```

- [ ] **Step 3: Create `src/components/CityLocation.tsx`**

```tsx
"use client";

interface Props {
  city: string;
}

export function CityLocation({ city }: Props) {
  return (
    <span className="text-white/60 text-xs font-mono tracking-wider">
      {city}
    </span>
  );
}
```

- [ ] **Step 4: Create `src/components/ModeIndicator.tsx`**

```tsx
"use client";

import type { BotMode } from "@/lib/types";

interface Props {
  mode: BotMode;
}

export function ModeIndicator({ mode }: Props) {
  return (
    <span className="text-white/60 text-xs font-mono tracking-wider">
      {mode}
    </span>
  );
}
```

- [ ] **Step 5: Create `src/components/SessionCounter.tsx`**

```tsx
"use client";

interface Props {
  count: number;
}

export function SessionCounter({ count }: Props) {
  return (
    <span className="text-white/60 text-xs font-mono tracking-wider tabular-nums">
      {count}
    </span>
  );
}
```

- [ ] **Step 6: Create `src/components/Timestamp.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";

interface Props {
  startTime: number;
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

export function Timestamp({ startTime }: Props) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Date.now() - startTime);
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  return (
    <span className="text-white/60 text-xs font-mono tracking-wider tabular-nums">
      {formatElapsed(elapsed)}
    </span>
  );
}
```

- [ ] **Step 7: Create `src/components/VisualEffects.tsx`**

```tsx
"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { TIMING, VISUAL } from "@/lib/config";
import type { BotState } from "@/lib/types";

interface Props {
  botState: BotState;
  teleportPhase: "none" | "fade-out" | "black" | "fade-in";
}

const vertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const fragmentShader = `
  precision highp float;

  varying vec2 vUv;
  uniform float uTime;
  uniform float uOpacity;
  uniform float uBrightness;
  uniform float uSaturate;
  uniform float uHue;
  uniform float uDrift;

  vec3 hueShift(vec3 color, float angle) {
    const vec3 k = vec3(0.57735);
    float cosAngle = cos(angle);
    return color * cosAngle + cross(k, color) * sin(angle) + k * dot(k, color) * (1.0 - cosAngle);
  }

  void main() {
    vec2 centered = vUv - 0.5;
    float scan = sin((vUv.y + uTime * 0.018) * 18.0) * 0.5 + 0.5;
    float drift = sin((centered.x * 7.0) + (uTime * 0.12)) * uDrift;
    vec3 wash = vec3(0.52 + drift, 0.55 + scan * 0.04, 0.58);
    vec3 graded = hueShift(wash * uBrightness, uHue);
    float gray = dot(graded, vec3(0.299, 0.587, 0.114));
    graded = mix(vec3(gray), graded, uSaturate);
    gl_FragColor = vec4(graded, uOpacity);
  }
`;

function targetOpacity(teleportPhase: Props["teleportPhase"]): number {
  if (teleportPhase === "fade-out" || teleportPhase === "black") return 1;
  if (teleportPhase === "fade-in") return 0;
  return VISUAL.OVERLAY_OPACITY;
}

export function VisualEffects({ botState, teleportPhase }: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uOpacity: { value: VISUAL.OVERLAY_OPACITY },
      uBrightness: { value: 1 },
      uSaturate: { value: 1 },
      uHue: { value: 0 },
      uDrift: { value: VISUAL.DRIFT_STRENGTH },
    }),
    []
  );

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: false,
      powerPreference: "low-power",
    });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geometry = new THREE.PlaneGeometry(2, 2);
    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.NormalBlending,
    });
    materialRef.current = material;
    scene.add(new THREE.Mesh(geometry, material));

    let animationId = 0;
    const clock = new THREE.Clock();
    const render = () => {
      uniforms.uTime.value = clock.getElapsedTime();
      renderer.render(scene, camera);
      animationId = requestAnimationFrame(render);
    };
    render();

    const resize = () => {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", resize);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", resize);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      materialRef.current = null;
    };
  }, [uniforms]);

  useEffect(() => {
    const material = materialRef.current;
    if (!material) return;

    const grading = VISUAL.COLOR_GRADING[botState] || VISUAL.COLOR_GRADING.WANDER;
    const start = {
      brightness: material.uniforms.uBrightness.value as number,
      saturate: material.uniforms.uSaturate.value as number,
      hue: material.uniforms.uHue.value as number,
      opacity: material.uniforms.uOpacity.value as number,
    };
    const target = {
      brightness: grading.brightness,
      saturate: grading.saturate,
      hue: (grading.hueRotate * Math.PI) / 180,
      opacity: targetOpacity(teleportPhase),
    };
    const duration =
      teleportPhase === "fade-out"
        ? TIMING.TELEPORT_FADE_OUT
        : teleportPhase === "fade-in"
          ? TIMING.TELEPORT_FADE_IN
          : VISUAL.COLOR_TRANSITION;
    const startedAt = performance.now();
    let frame = 0;

    const tick = () => {
      const progress = Math.min(1, (performance.now() - startedAt) / duration);
      const eased = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      material.uniforms.uBrightness.value = start.brightness + (target.brightness - start.brightness) * eased;
      material.uniforms.uSaturate.value = start.saturate + (target.saturate - start.saturate) * eased;
      material.uniforms.uHue.value = start.hue + (target.hue - start.hue) * eased;
      material.uniforms.uOpacity.value = start.opacity + (target.opacity - start.opacity) * eased;
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    tick();
    return () => cancelAnimationFrame(frame);
  }, [botState, teleportPhase]);

  return (
    <div
      ref={mountRef}
      className="absolute inset-0 pointer-events-none z-10"
      aria-hidden="true"
    />
  );
}
```

**Three.js V1 requirements:**
- The WebGL canvas is a transparent full-screen overlay above Street View and below the HUD. It must not frame the Street View scene or make the main experience feel embedded.
- The shader supplies only subtle state-linked grading and a barely perceptible procedural drift. No grain, scanlines, glitching, heavy vignette, or decorative bokeh/orbs.
- LINGER zoom is still allowed, but implement it on the Street View wrapper or through the controller FOV so it is stable and only 2–3%.
- Teleport fade should be driven by the same Three.js visual layer where possible; if browser/WebGL support fails, fall back to a plain black DOM overlay rather than blocking the installation.
- Before final handoff, verify with browser screenshots that the Three.js canvas is nonblank, correctly layered, transparent over Street View, and not blocking pointer/click startup.

- [ ] **Step 8: Create `src/components/HUD.tsx`**

```tsx
"use client";

import { PulsingDot } from "./PulsingDot";
import { Coordinates } from "./Coordinates";
import { CityLocation } from "./CityLocation";
import { ModeIndicator } from "./ModeIndicator";
import { SessionCounter } from "./SessionCounter";
import { Timestamp } from "./Timestamp";
import type { BotMode, LatLng } from "@/lib/types";

interface Props {
  mode: BotMode;
  coords: LatLng;
  city: string;
  reviewCount: number;
  sessionStartTime: number;
}

export function HUD({ mode, coords, city, reviewCount, sessionStartTime }: Props) {
  return (
    <div className="absolute inset-0 pointer-events-none z-20">
      {/* Bottom left cluster */}
      <div className="absolute bottom-6 left-6 flex flex-col gap-1.5">
        <PulsingDot mode={mode} />
        <ModeIndicator mode={mode} />
        <SessionCounter count={reviewCount} />
      </div>

      {/* Bottom right cluster */}
      <div className="absolute bottom-6 right-6 flex flex-col gap-1.5 items-end">
        <Coordinates coords={coords} />
        <CityLocation city={city} />
        <Timestamp startTime={sessionStartTime} />
      </div>
    </div>
  );
}
```

- [ ] **Step 9: Add pulse animation to `globals.css`**

Append to `src/app/globals.css`:
```css
@keyframes pulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
}
```

- [ ] **Step 10: Verify compilation**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 11: Commit**

```bash
git add src/components/ src/app/globals.css
git commit -m "feat: UI components — HUD, pulsing dot, coordinates, city, mode, counter, timestamp, visual effects"
```

---

## Task 13: Bot Orchestrator

**Files:**
- Create: `src/engine/bot.ts`, `src/hooks/useBot.ts`

- [ ] **Step 1: Create `src/engine/bot.ts`**

The orchestrator wires the state machine to all side-effectful systems.

```typescript
import { BotState, type BotContext, type BotEvent, type LatLng, stateToMode } from "@/lib/types";
import { TIMING, PLACES, DEFAULT_START } from "@/lib/config";
import {
  transition,
  createInitialContext,
  isInCooldown,
  type Effect,
} from "./state-machine";
import { StreetViewController } from "./street-view-controller";
import { ReviewManager } from "./review-manager";
import { WebSpeechTTS, waitForVoices } from "./tts-engine";
import { AudioEngine } from "./audio-engine";
import { TeleportManager } from "./teleport-manager";

export type BotStateCallback = (context: BotContext) => void;

/**
 * The Bot orchestrator. Wires the pure state machine to all side-effectful systems:
 * Street View, audio, TTS, Places API, screenshots, and logging.
 */
export class Bot {
  // Systems
  private streetView: StreetViewController;
  private reviewManager: ReviewManager;
  private tts: WebSpeechTTS;
  private audio: AudioEngine;
  private teleportManager: TeleportManager;

  // State
  private context: BotContext;
  private sessionId: string;
  private timers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private stuckCheckInterval: ReturnType<typeof setInterval> | null = null;
  private queryCheckInterval: ReturnType<typeof setInterval> | null = null;
  private running: boolean = false;

  // Callbacks
  private onStateChange: BotStateCallback | null = null;

  constructor() {
    this.streetView = new StreetViewController();
    this.context = createInitialContext(DEFAULT_START);
    this.reviewManager = new ReviewManager(this.context.readReviewHashes);
    this.tts = new WebSpeechTTS();
    this.audio = new AudioEngine();
    this.teleportManager = new TeleportManager();
    this.sessionId = `ses_${Date.now()}`;
  }

  /**
   * Initialize all systems and start the bot.
   */
  async start(
    container: HTMLElement,
    onStateChange: BotStateCallback
  ): Promise<void> {
    this.onStateChange = onStateChange;

    // Wait for TTS voices to load
    await waitForVoices();

    // Initialize audio (needs user gesture context)
    await this.audio.init();
    await this.audio.resume();

    // Initialize Street View
    await this.streetView.init(container, DEFAULT_START);

    // Create session in database
    await this.logAction("createSession", { sessionId: this.sessionId });

    // Start ambient audio
    this.audio.startAmbient();

    // Start walking
    this.streetView.startWalking(TIMING.WANDER_STEP_INTERVAL);

    // Start periodic checks
    this.startPeriodicChecks();

    this.running = true;
    this.notifyStateChange();

    // Initial geocode
    this.updateCity();
  }

  /**
   * Send an event to the state machine and execute resulting effects.
   */
  private dispatch(event: BotEvent): void {
    const result = transition(this.context, event);
    if (!result) return;

    // Update state
    this.context = {
      ...this.context,
      state: result.newState,
      mode: stateToMode(result.newState),
    };

    // Schedule timer if needed
    if (result.scheduleTimer) {
      const timerKey = result.scheduleTimer.event.type;
      // Clear any existing timer with this key
      if (this.timers.has(timerKey)) {
        clearTimeout(this.timers.get(timerKey)!);
      }
      const timer = setTimeout(() => {
        this.timers.delete(timerKey);
        this.dispatch(result.scheduleTimer!.event);
      }, result.scheduleTimer.delayMs);
      this.timers.set(timerKey, timer);
    }

    // Execute effects
    for (const effect of result.effects) {
      this.executeEffect(effect);
    }

    this.notifyStateChange();
  }

  /**
   * Execute a side effect.
   */
  private executeEffect(effect: Effect): void {
    switch (effect.type) {
      case "START_WALKING":
        this.streetView.startWalking(TIMING.WANDER_STEP_INTERVAL);
        break;

      case "STOP_WALKING":
        this.streetView.stopWalking();
        break;

      case "PAN_TO_BUSINESS":
        this.streetView.panToHeading(
          effect.bearingDeg,
          TIMING.INSPECT_PAN_DURATION
        );
        break;

      case "START_TTS":
        this.handleTTS(effect.text);
        break;

      case "START_LINGER_ZOOM":
        // Handled by VisualEffects component via state
        break;

      case "RESET_ZOOM":
        // Handled by VisualEffects component via state
        break;

      case "PLAY_BLEEP":
        this.audio.playBleep();
        break;

      case "PLAY_BLOOP":
        this.audio.playBloop();
        break;

      case "CROSSFADE_TO_A":
        this.audio.crossfadeTo("A");
        break;

      case "CROSSFADE_TO_B":
        this.audio.crossfadeTo("B");
        break;

      case "DUCK_AMBIENT":
        this.audio.duckAmbient();
        break;

      case "UNDUCK_AMBIENT":
        this.audio.unduckAmbient();
        break;

      case "START_TELEPORT_FADE":
        this.handleTeleport();
        break;

      case "TAKE_SCREENSHOT":
        this.takeScreenshot();
        break;

      case "LOG_REVIEW":
        this.logCurrentReview();
        break;

      case "INCREMENT_COUNTER":
        this.context.sessionReviewCount++;
        this.context.lastReviewTime = Date.now();
        this.teleportManager.recordReview();
        break;

      default:
        break;
    }
  }

  /**
   * Handle TTS playback — when complete, dispatch DELIVER_COMPLETE.
   */
  private async handleTTS(text: string): Promise<void> {
    try {
      await this.tts.speak(text);
    } catch (err) {
      console.error("TTS error:", err);
    }
    // TTS done — dispatch event
    this.dispatch({ type: "DELIVER_COMPLETE" });
  }

  /**
   * Handle the teleport sequence: fade out → move → fade in.
   */
  private async handleTeleport(): Promise<void> {
    this.context = { ...this.context, teleportPhase: "fade-out" };
    this.notifyStateChange();

    // Fade audio to silence
    this.audio.fadeToSilence(TIMING.TELEPORT_FADE_OUT);

    // Wait for fade out
    await this.sleep(TIMING.TELEPORT_FADE_OUT);

    // Hold on black
    this.context = { ...this.context, teleportPhase: "black" };
    this.notifyStateChange();
    await this.sleep(TIMING.TELEPORT_HOLD_BLACK);

    // Teleport to new location
    const destination = this.teleportManager.selectDestination(
      this.context.currentCoords
    );
    this.streetView.teleportTo(destination);
    this.context.currentCoords = destination;
    this.teleportManager.resetStuckDetection(destination);

    // Update session stats
    await this.logAction("updateSession", {
      sessionId: this.sessionId,
      updates: { teleports: (this.context as { _teleportCount?: number })._teleportCount || 1 },
    });

    // Update city
    this.updateCity();

    // Fade audio back in
    this.context = { ...this.context, teleportPhase: "fade-in" };
    this.notifyStateChange();
    this.audio.fadeFromSilence(TIMING.TELEPORT_FADE_IN);

    // Wait for fade in
    await this.sleep(TIMING.TELEPORT_FADE_IN);

    this.context = { ...this.context, teleportPhase: "none" };
    this.notifyStateChange();

    // Dispatch teleport complete
    this.dispatch({ type: "TELEPORT_COMPLETE" });
  }

  /**
   * Start periodic checks for business detection and stuck state.
   */
  private startPeriodicChecks(): void {
    // Business detection check — runs frequently
    this.queryCheckInterval = setInterval(async () => {
      if (!this.running) return;
      if (this.context.state !== BotState.WANDER) return;
      if (isInCooldown(this.context)) return;

      const coords = this.streetView.getCoords();
      this.context.currentCoords = coords;

      // Check if we should query the Places API
      if (this.reviewManager.shouldQuery(coords)) {
        await this.reviewManager.fetchNearbyBusinesses(coords);
      }

      // Check for nearby business
      const business = this.reviewManager.findNearestBusiness(coords);
      if (business) {
        // Fetch reviews for this business
        const { review, businessTypes } =
          await this.reviewManager.fetchAndSelectReview(business.placeId);

        if (review) {
          this.context.targetBusiness = {
            ...business,
            types: businessTypes.length > 0 ? businessTypes : business.types,
          };
          this.context.reviewToRead = review;
          this.dispatch({ type: "BUSINESS_DETECTED", business: this.context.targetBusiness });
        }
      }
    }, 3000); // Check every 3 seconds

    // Stuck detection — runs less frequently
    this.stuckCheckInterval = setInterval(() => {
      if (!this.running) return;
      if (this.context.state !== BotState.WANDER) return;

      const coords = this.streetView.getCoords();
      this.teleportManager.updateStuckCheck(coords);

      if (this.teleportManager.shouldTeleport(coords)) {
        this.dispatch({ type: "STUCK_DETECTED" });
      }
    }, TIMING.STUCK_CHECK_INTERVAL);
  }

  /**
   * Take a screenshot of the current Street View.
   */
  private async takeScreenshot(): Promise<void> {
    try {
      const container = this.streetView.getContainer();
      if (!container) return;

      // Find the canvas element inside Street View
      const canvas = container.querySelector("canvas");
      if (!canvas) return;

      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      const counter = this.context.sessionReviewCount + 1;
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `${this.sessionId}_${timestamp}_${counter.toString().padStart(4, "0")}.jpg`;

      await fetch("/api/screenshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename, dataUrl }),
      });
    } catch (err) {
      console.error("Screenshot failed:", err);
    }
  }

  /**
   * Log the current review to the database.
   */
  private async logCurrentReview(): Promise<void> {
    if (!this.context.targetBusiness || !this.context.reviewToRead) return;

    const counter = this.context.sessionReviewCount + 1;
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const screenshotFilename = `${this.sessionId}_${timestamp}_${counter.toString().padStart(4, "0")}.jpg`;

    await this.logAction("logReview", {
      entry: {
        sessionId: this.sessionId,
        entryNumber: counter,
        timestamp: new Date().toISOString(),
        lat: this.context.currentCoords.lat,
        lng: this.context.currentCoords.lng,
        city: this.context.currentCity,
        businessName: this.context.targetBusiness.name,
        businessType: this.context.targetBusiness.types[0] || "",
        reviewText: this.context.reviewToRead.text,
        reviewRating: this.context.reviewToRead.rating,
        ttsDurationSeconds: 0, // TODO: measure actual TTS duration
        screenshotFilename,
      },
    });
  }

  /**
   * Update the current city via reverse geocoding.
   */
  private async updateCity(): Promise<void> {
    try {
      const coords = this.context.currentCoords;
      const res = await fetch(
        `/api/geocode?lat=${coords.lat}&lng=${coords.lng}`
      );
      const data = await res.json();
      this.context.currentCity = data.city || "Unknown";

      // Track country
      if (data.country) {
        await this.logAction("addCountry", { country: data.country });
      }

      this.notifyStateChange();
    } catch (err) {
      console.error("Geocode failed:", err);
    }
  }

  /**
   * Helper: post to the log API.
   */
  private async logAction(
    action: string,
    data: Record<string, unknown>
  ): Promise<void> {
    try {
      await fetch("/api/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...data }),
      });
    } catch (err) {
      console.error("Log action failed:", err);
    }
  }

  /**
   * Notify the React component of state changes.
   */
  private notifyStateChange(): void {
    if (this.onStateChange) {
      this.onStateChange({ ...this.context });
    }
  }

  /**
   * Get a snapshot of the current context (for React rendering).
   */
  getContext(): BotContext {
    return { ...this.context };
  }

  /**
   * Stop the bot and clean up.
   */
  destroy(): void {
    this.running = false;
    this.tts.stop();
    this.audio.destroy();
    this.streetView.destroy();

    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();

    if (this.stuckCheckInterval) clearInterval(this.stuckCheckInterval);
    if (this.queryCheckInterval) clearInterval(this.queryCheckInterval);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
```

- [ ] **Step 2: Create `src/hooks/useBot.ts`**

```typescript
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Bot } from "@/engine/bot";
import type { BotContext, BotMode, LatLng, TeleportPhase } from "@/lib/types";
import { BotState } from "@/lib/types";

export interface BotUIState {
  mode: BotMode;
  state: BotState;
  coords: LatLng;
  city: string;
  reviewCount: number;
  sessionStartTime: number;
  teleportPhase: TeleportPhase;
}

export function useBot() {
  const botRef = useRef<Bot | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isStarted, setIsStarted] = useState(false);
  const [uiState, setUIState] = useState<BotUIState>({
    mode: "Searching",
    state: BotState.WANDER,
    coords: { lat: 0, lng: 0 },
    city: "Initializing...",
    reviewCount: 0,
    sessionStartTime: Date.now(),
    teleportPhase: "none",
  });

  const handleStateChange = useCallback((context: BotContext) => {
    setUIState({
      mode: context.mode,
      state: context.state,
      coords: context.currentCoords,
      city: context.currentCity,
      reviewCount: context.sessionReviewCount,
      sessionStartTime: context.sessionStartTime,
      teleportPhase: context.teleportPhase,
    });
  }, []);

  const startBot = useCallback(async () => {
    if (!containerRef.current || botRef.current) return;

    const bot = new Bot();
    botRef.current = bot;

    try {
      await bot.start(containerRef.current, handleStateChange);
      setIsStarted(true);
    } catch (err) {
      console.error("Failed to start bot:", err);
    }
  }, [handleStateChange]);

  useEffect(() => {
    return () => {
      botRef.current?.destroy();
      botRef.current = null;
    };
  }, []);

  return {
    containerRef,
    uiState,
    isStarted,
    startBot,
  };
}
```

- [ ] **Step 3: Verify compilation**

```bash
npx tsc --noEmit
```

Fix any type errors that arise. Common ones:
- Ensure all imports resolve
- Ensure `BotContext` spread works with the `Set` field (may need special handling)

- [ ] **Step 4: Commit**

```bash
git add src/engine/bot.ts src/hooks/useBot.ts
git commit -m "feat: bot orchestrator and useBot hook — wires state machine to all systems"
```

---

## Task 14: Main Page — Putting It All Together

**Files:**
- Modify: `src/app/page.tsx`
- Create: `src/components/StreetViewCanvas.tsx`

- [ ] **Step 1: Create `src/components/StreetViewCanvas.tsx`**

```tsx
"use client";

import { forwardRef } from "react";

export const StreetViewCanvas = forwardRef<HTMLDivElement>(
  function StreetViewCanvas(_, ref) {
    return (
      <div
        ref={ref}
        className="absolute inset-0 w-full h-full"
        style={{ zIndex: 0 }}
      />
    );
  }
);
```

- [ ] **Step 2: Update `src/app/page.tsx`**

```tsx
"use client";

import { useBot } from "@/hooks/useBot";
import { StreetViewCanvas } from "@/components/StreetViewCanvas";
import { HUD } from "@/components/HUD";
import { VisualEffects } from "@/components/VisualEffects";

export default function Home() {
  const { containerRef, uiState, isStarted, startBot } = useBot();

  return (
    <main className="relative w-screen h-screen bg-black overflow-hidden">
      {/* Street View panorama */}
      <StreetViewCanvas ref={containerRef} />

      {/* Three.js visual effects overlay (color grading, drift, teleport fade) */}
      <VisualEffects
        botState={uiState.state}
        teleportPhase={uiState.teleportPhase}
      />

      {/* HUD overlay */}
      <HUD
        mode={uiState.mode}
        coords={uiState.coords}
        city={uiState.city}
        reviewCount={uiState.reviewCount}
        sessionStartTime={uiState.sessionStartTime}
      />

      {/* Start button — required for browser audio policy. Hidden after start. */}
      {!isStarted && (
        <button
          onClick={startBot}
          className="absolute inset-0 z-50 flex items-center justify-center bg-black cursor-pointer"
        >
          <span className="text-white/40 text-sm font-mono hover:text-white/70 transition-colors">
            Click to start
          </span>
        </button>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Add `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` to `.env.local`**

The Street View JS API needs the key on the client side:
```
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here
```

Also update `.env.example`:
```
GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here
GOOGLE_PLACES_API_KEY=your_google_places_api_key_here
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here
```

- [ ] **Step 4: Verify the app loads**

```bash
npm run dev
```

Open `http://localhost:3000`. Expected:
- Black screen with "Click to start" text
- After clicking: Street View panorama loads, HUD elements appear in corners
- Coordinates should tick as the bot moves
- The bot should begin wandering
- If a business with a 1-star review is nearby, the bot should stop and read it

This is the first full integration test. Debug any issues that arise.

- [ ] **Step 5: Commit**

```bash
git add src/components/StreetViewCanvas.tsx src/app/page.tsx .env.example
git commit -m "feat: main page — Street View, HUD, visual effects, start button"
```

---

## Task 15: Polish and Kiosk Mode

**Files:**
- Modify: `src/app/page.tsx`, `src/app/globals.css`

- [ ] **Step 1: Add auto-start support for kiosk mode**

In a gallery setting, the installation should start without requiring a click. Add an environment variable to bypass the click-to-start:

Add to `.env.local`:
```
NEXT_PUBLIC_KIOSK_MODE=false
```

Update `src/app/page.tsx` — replace the start button section:

```tsx
"use client";

import { useEffect } from "react";
import { useBot } from "@/hooks/useBot";
import { StreetViewCanvas } from "@/components/StreetViewCanvas";
import { HUD } from "@/components/HUD";
import { VisualEffects } from "@/components/VisualEffects";

const KIOSK_MODE = process.env.NEXT_PUBLIC_KIOSK_MODE === "true";

export default function Home() {
  const { containerRef, uiState, isStarted, startBot } = useBot();

  // In kiosk mode, auto-start after a brief delay
  // (Note: browsers may still block audio — kiosk browser configs can disable this)
  useEffect(() => {
    if (KIOSK_MODE && !isStarted) {
      const timer = setTimeout(() => {
        startBot();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isStarted, startBot]);

  return (
    <main className="relative w-screen h-screen bg-black overflow-hidden">
      <StreetViewCanvas ref={containerRef} />

      <VisualEffects
        botState={uiState.state}
        teleportPhase={uiState.teleportPhase}
      />

      <HUD
        mode={uiState.mode}
        coords={uiState.coords}
        city={uiState.city}
        reviewCount={uiState.reviewCount}
        sessionStartTime={uiState.sessionStartTime}
      />

      {!isStarted && !KIOSK_MODE && (
        <button
          onClick={startBot}
          className="absolute inset-0 z-50 flex items-center justify-center bg-black cursor-pointer"
        >
          <span className="text-white/40 text-sm font-mono hover:text-white/70 transition-colors">
            Click to start
          </span>
        </button>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Verify full flow**

```bash
npm run dev
```

Full verification checklist:
1. Black screen → "Click to start" → Street View loads
2. HUD visible: pulsing dot, coordinates, city name, "Searching", counter (0), timestamp
3. Bot walks forward through Street View
4. When near a business with a 1-star review: bleep, mode changes to "Processing", bot stops and pans
5. TTS reads the review
6. After review: bloop, mode returns to "Searching", bot walks away
7. Counter increments
8. Ambient audio plays and crossfades between states
9. Three.js overlay is visible but subtle: state color shifts/drift are present, Street View remains legible, and the HUD stays above the WebGL canvas
10. If the bot wanders too long without a review: teleport (Three.js fade to black, new location, fade back in)
11. City name updates after teleport

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: kiosk mode, auto-start, full integration"
```

---

## Task 16: Session Statistics Tracking

**Files:**
- Modify: `src/engine/bot.ts`

- [ ] **Step 1: Add runtime and distance tracking to the bot**

Add a periodic stats update method to `src/engine/bot.ts`. Add the following inside the `Bot` class, and call it from `startPeriodicChecks`:

Add a new interval in `startPeriodicChecks` (append after the stuck detection interval):

```typescript
// Session stats update — every 30 seconds
this.statsInterval = setInterval(async () => {
  if (!this.running) return;
  const runtimeSeconds = (Date.now() - this.context.sessionStartTime) / 1000;

  // Calculate distance moved since last check
  const currentCoords = this.streetView.getCoords();
  // Simple accumulation — tracked via the session update
  await this.logAction("updateSession", {
    sessionId: this.sessionId,
    updates: {
      runtimeSeconds,
      reviewsRead: this.context.sessionReviewCount,
    },
  });
}, 30_000);
```

Add the `statsInterval` property to the class and clear it in `destroy()`.

- [ ] **Step 2: Verify stats are recorded**

Start the bot, let it run for 1 minute. Then:
```bash
curl http://localhost:3000/api/log
```

Expected: JSON with `totalSessions >= 1`, `totalRuntimeSeconds > 0`.

- [ ] **Step 3: Commit**

```bash
git add src/engine/bot.ts
git commit -m "feat: periodic session statistics tracking"
```

---

## Summary: Build Order

```
Task  1: Project scaffolding
Task  2: Types and configuration
Task  3: Database layer (SQLite)
Task  4: Google Places API route
Task  5: Review manager (filtering, dedup, geo utils)
Task  6: State machine (pure transitions)
Task  7: TTS engine (Web Speech API)
Task  8: Audio engine (ambient, crossfade, SFX)
Task  9: Street View controller (navigation, panning)
Task 10: Teleport manager (destinations, stuck detection)
Task 11: Screenshot API route
Task 12: UI components (HUD, all elements)
Task 13: Bot orchestrator + useBot hook
Task 14: Main page (full integration)
Task 15: Kiosk mode + polish
Task 16: Session statistics tracking
```

Tasks 1–12 can be built and committed independently — each produces working code that compiles. Task 13 wires them together. Task 14 makes it visible. Tasks 15–16 are polish.

**Total estimated time:** 6–10 hours for a focused implementation session.
