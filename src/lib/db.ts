import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import type {
  BotMonitorEvent,
  BotMonitorEventInput,
  BotMonitorReport,
  BotMonitorWarning,
  ReviewLogEntry,
  SessionStats,
} from "./types";

const DB_DIR = path.join(process.cwd(), "data", "db");
const DB_PATH = path.join(DB_DIR, "would-not-recommend.db");

let database: Database.Database | null = null;

function openDb(): Database.Database {
  fs.mkdirSync(DB_DIR, { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  initSchema(db);
  return db;
}

function db(): Database.Database {
  if (!database) {
    database = openDb();
  }
  return database;
}

function initSchema(instance: Database.Database): void {
  instance.exec(`
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

    CREATE TABLE IF NOT EXISTS bot_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL DEFAULT '',
      timestamp TEXT NOT NULL,
      tag TEXT NOT NULL,
      message TEXT NOT NULL,
      lat REAL,
      lng REAL,
      state TEXT NOT NULL DEFAULT '',
      status_code INTEGER,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_bot_events_session_id_id
      ON bot_events (session_id, id);

    CREATE INDEX IF NOT EXISTS idx_bot_events_timestamp
      ON bot_events (timestamp);

    CREATE INDEX IF NOT EXISTS idx_bot_events_status_code
      ON bot_events (status_code);

    CREATE TABLE IF NOT EXISTS review_corpus_places (
      place_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      types_json TEXT NOT NULL DEFAULT '[]',
      rating REAL,
      total_ratings INTEGER,
      source TEXT NOT NULL DEFAULT '',
      source_url TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS review_corpus_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      place_id TEXT NOT NULL,
      review_text TEXT NOT NULL,
      review_rating INTEGER NOT NULL DEFAULT 1,
      author_name TEXT NOT NULL DEFAULT '',
      relative_time_description TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT '',
      source_url TEXT NOT NULL DEFAULT '',
      imported_at TEXT NOT NULL DEFAULT (datetime('now')),
      read_count INTEGER NOT NULL DEFAULT 0,
      last_read_at TEXT,
      last_selected_at TEXT,
      FOREIGN KEY (place_id) REFERENCES review_corpus_places(place_id) ON DELETE CASCADE,
      UNIQUE(place_id, review_text)
    );

    CREATE INDEX IF NOT EXISTS idx_review_corpus_places_lat_lng
      ON review_corpus_places (lat, lng);

    CREATE INDEX IF NOT EXISTS idx_review_corpus_reviews_place_rating
      ON review_corpus_reviews (place_id, review_rating);
  `);
  migrateSchema(instance);
}

function migrateSchema(instance: Database.Database): void {
  ensureColumns(instance, "review_log", {
    city: "TEXT NOT NULL DEFAULT 'Unknown'",
    business_type: "TEXT NOT NULL DEFAULT ''",
    review_rating: "INTEGER NOT NULL DEFAULT 1",
    tts_duration_seconds: "REAL NOT NULL DEFAULT 0",
    screenshot_filename: "TEXT NOT NULL DEFAULT ''",
    created_at: "TEXT NOT NULL DEFAULT ''",
  });
  ensureColumns(instance, "sessions", {
    teleports: "INTEGER NOT NULL DEFAULT 0",
  });
  ensureColumns(instance, "bot_events", {
    session_id: "TEXT NOT NULL DEFAULT ''",
    timestamp: "TEXT NOT NULL DEFAULT ''",
    tag: "TEXT NOT NULL DEFAULT ''",
    message: "TEXT NOT NULL DEFAULT ''",
    lat: "REAL",
    lng: "REAL",
    state: "TEXT NOT NULL DEFAULT ''",
    status_code: "INTEGER",
    metadata_json: "TEXT NOT NULL DEFAULT '{}'",
    created_at: "TEXT NOT NULL DEFAULT ''",
  });
  ensureColumns(instance, "review_corpus_reviews", {
    read_count: "INTEGER NOT NULL DEFAULT 0",
    last_read_at: "TEXT",
    last_selected_at: "TEXT",
  });
}

function ensureColumns(
  instance: Database.Database,
  tableName: string,
  columns: Record<string, string>,
): void {
  const existing = new Set(
    (
      instance.prepare(`PRAGMA table_info(${tableName})`).all() as {
        name: string;
      }[]
    ).map((column) => column.name),
  );

  for (const [columnName, definition] of Object.entries(columns)) {
    if (!existing.has(columnName)) {
      instance.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
    }
  }
}

export function createSession(sessionId: string): void {
  db()
    .prepare("INSERT OR IGNORE INTO sessions (session_id) VALUES (?)")
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
  }>,
): void {
  const sets: string[] = [];
  const values: (number | string)[] = [];

  const add = (column: string, value: number | undefined) => {
    if (value === undefined) return;
    sets.push(`${column} = ?`);
    values.push(value);
  };

  add("runtime_seconds", updates.runtimeSeconds);
  add("distance_km", updates.distanceKm);
  add("locations_scanned", updates.locationsScanned);
  add("reviews_read", updates.reviewsRead);
  add("screenshots_taken", updates.screenshotsTaken);
  add("teleports", updates.teleports);

  if (sets.length === 0) return;

  values.push(sessionId);
  db()
    .prepare(`UPDATE sessions SET ${sets.join(", ")} WHERE session_id = ?`)
    .run(...values);
}

export function insertReviewLog(entry: ReviewLogEntry): void {
  db()
    .prepare(
      `INSERT INTO review_log
       (session_id, entry_number, timestamp, lat, lng, city, business_name, business_type, review_text, review_rating, tts_duration_seconds, screenshot_filename)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      entry.screenshotFilename,
    );
}

export function addCountry(country: string): void {
  db()
    .prepare("INSERT OR IGNORE INTO countries_visited (country) VALUES (?)")
    .run(country);
}

export function getStats(): Omit<SessionStats, "reviewsToday"> {
  const one = <T>(query: string) => db().prepare(query).get() as T;

  const sessions = one<{ count: number }>("SELECT COUNT(*) as count FROM sessions");
  const runtime = one<{ total: number }>(
    "SELECT COALESCE(SUM(runtime_seconds), 0) as total FROM sessions",
  );
  const distance = one<{ total: number }>(
    "SELECT COALESCE(SUM(distance_km), 0) as total FROM sessions",
  );
  const scanned = one<{ total: number }>(
    "SELECT COALESCE(SUM(locations_scanned), 0) as total FROM sessions",
  );
  const reviews = one<{ total: number }>(
    "SELECT COUNT(*) as total FROM review_log",
  );
  const screenshots = one<{ total: number }>(
    "SELECT COALESCE(SUM(screenshots_taken), 0) as total FROM sessions",
  );
  const teleports = one<{ total: number }>(
    "SELECT COALESCE(SUM(teleports), 0) as total FROM sessions",
  );
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
    countriesVisited: countries.map((row) => row.country),
    totalTeleports: teleports.total,
  };
}

/** Count rows whose `timestamp` is in [startIso, endIsoExclusive) (ISO 8601 strings). */
export function countReviewsBetween(startIso: string, endIsoExclusive: string): number {
  const row = db()
    .prepare(
      `SELECT COUNT(*) as total FROM review_log WHERE timestamp >= ? AND timestamp < ?`,
    )
    .get(startIso, endIsoExclusive) as { total: number };
  return row.total;
}

type BotMonitorEventRow = {
  id: number;
  session_id: string;
  timestamp: string;
  tag: string;
  message: string;
  lat: number | null;
  lng: number | null;
  state: string;
  status_code: number | null;
  metadata_json: string;
};

function parseMetadata(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Keep malformed historical rows readable.
  }
  return {};
}

function monitorRowToEvent(row: BotMonitorEventRow): BotMonitorEvent {
  return {
    id: row.id,
    sessionId: row.session_id,
    timestamp: row.timestamp,
    tag: row.tag,
    message: row.message,
    lat: row.lat,
    lng: row.lng,
    state: row.state,
    statusCode: row.status_code,
    metadata: parseMetadata(row.metadata_json),
  };
}

function eventTimeMs(event: Pick<BotMonitorEvent, "timestamp">): number {
  const ms = Date.parse(event.timestamp);
  return Number.isFinite(ms) ? ms : 0;
}

function extractNumber(pattern: RegExp, text: string): number | undefined {
  const match = text.match(pattern);
  if (!match) return undefined;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : undefined;
}

const REVIEW_GAP_WARNING_MS = 2 * 60 * 1000;
const DETECT_STALL_WARNING_MS = 10 * 1000;
const RUNTIME_HEARTBEAT_GAP_WARNING_MS = 45 * 1000;

export function insertBotEvent(input: BotMonitorEventInput): void {
  const timestamp = input.timestamp || new Date().toISOString();
  const metadataJson = JSON.stringify(input.metadata ?? {});
  db()
    .prepare(
      `INSERT INTO bot_events
       (session_id, timestamp, tag, message, lat, lng, state, status_code, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.sessionId ?? "",
      timestamp,
      input.tag,
      input.message,
      input.lat ?? null,
      input.lng ?? null,
      input.state ?? "",
      input.statusCode ?? null,
      metadataJson,
    );
}

export function getLatestBotSessionId(): string {
  const row = db()
    .prepare(
      `SELECT session_id
       FROM bot_events
       WHERE session_id <> ''
       ORDER BY id DESC
       LIMIT 1`,
    )
    .get() as { session_id: string } | undefined;
  return row?.session_id ?? "";
}

export function getRecentBotEvents(options?: {
  sessionId?: string;
  limit?: number;
}): BotMonitorEvent[] {
  const capped = Math.min(1000, Math.max(1, Math.floor(options?.limit ?? 200)));
  const sessionId = options?.sessionId?.trim();
  const rows = sessionId
    ? (db()
        .prepare(
          `SELECT id, session_id, timestamp, tag, message, lat, lng, state, status_code, metadata_json
           FROM bot_events
           WHERE session_id = ?
           ORDER BY id DESC
           LIMIT ?`,
        )
        .all(sessionId, capped) as BotMonitorEventRow[])
    : (db()
        .prepare(
          `SELECT id, session_id, timestamp, tag, message, lat, lng, state, status_code, metadata_json
           FROM bot_events
           ORDER BY id DESC
           LIMIT ?`,
        )
        .all(capped) as BotMonitorEventRow[]);

  return rows.map(monitorRowToEvent);
}

function getBotEventsForReport(sessionId: string): BotMonitorEvent[] {
  const rows = db()
    .prepare(
      `SELECT id, session_id, timestamp, tag, message, lat, lng, state, status_code, metadata_json
       FROM bot_events
       WHERE session_id = ?
       ORDER BY id ASC`,
    )
    .all(sessionId) as BotMonitorEventRow[];
  return rows.map(monitorRowToEvent);
}

function warning(
  level: BotMonitorWarning["level"],
  code: string,
  message: string,
  since?: string,
): BotMonitorWarning {
  return { level, code, message, since };
}

export function getBotMonitorReport(sessionIdInput?: string): BotMonitorReport {
  const sessionId = sessionIdInput?.trim() || getLatestBotSessionId();
  const events = sessionId ? getBotEventsForReport(sessionId) : [];
  const now = Date.now();
  const first = events[0] ?? null;
  const last = events[events.length - 1] ?? null;
  const countsByTag: Record<string, number> = {};
  const statusCounts: Record<number, number> = {};

  for (const event of events) {
    countsByTag[event.tag] = (countsByTag[event.tag] ?? 0) + 1;
    if (event.statusCode !== null) {
      statusCounts[event.statusCode] = (statusCounts[event.statusCode] ?? 0) + 1;
    }
  }

  const reviews = events.filter(
    (event) => event.tag === "REVIEW" && event.message.startsWith("placeId="),
  );
  const searching = events.filter((event) => event.tag === "SEARCHING");
  const teleports = events.filter((event) => event.tag === "TELEPORT");
  const boundaries = events.filter((event) => event.tag === "BOUNDARY");
  const mapsErrors = events.filter(
    (event) =>
      event.tag === "MAPS" &&
      (event.statusCode !== null ||
        /status=|black-frame|tile\/CDN burst/i.test(event.message)),
  );
  const runtimeEvents = events.filter((event) => event.tag === "RUNTIME");
  const runtimeHeartbeatGaps = runtimeEvents.filter(
    (event) =>
      /heartbeat_gap/i.test(event.message) ||
      (typeof event.metadata.deltaMs === "number" &&
        event.metadata.deltaMs >= RUNTIME_HEARTBEAT_GAP_WARNING_MS),
  );
  const runtimeHiddenEvents = runtimeEvents.filter(
    (event) =>
      /hidden=true|visibility=hidden/i.test(event.message) ||
      event.metadata.hidden === true ||
      event.metadata.visibilityState === "hidden",
  );
  const runtimeBlurEvents = runtimeEvents.filter(
    (event) =>
      /(^|\s)blur(\s|\|)|focused=false/i.test(event.message) ||
      event.metadata.event === "blur" ||
      event.metadata.focused === false,
  );
  const runtimeLifecyclePauses = runtimeEvents.filter(
    (event) =>
      /(^|\s)(freeze|pagehide|offline)(\s|\|)/i.test(event.message) ||
      event.metadata.event === "freeze" ||
      event.metadata.event === "pagehide" ||
      event.metadata.event === "offline",
  );
  const stateEvents = events.filter((event) => event.tag === "STATE");
  const errorEvents = events.filter(
    (event) =>
      event.tag === "WARN" ||
      event.statusCode !== null ||
      /error|failed|fault|timeout|black-frame|429|503/i.test(event.message),
  );
  const warnings: BotMonitorWarning[] = [];
  const lastEventAgeMs = last ? now - eventTimeMs(last) : Infinity;
  const lastReview = reviews[reviews.length - 1] ?? null;
  const lastStep = searching[searching.length - 1] ?? null;
  const lastState = stateEvents[stateEvents.length - 1] ?? null;
  const lastStepAt = lastStep ? eventTimeMs(lastStep) : 0;
  let maxReviewGapMs = 0;
  let maxReviewGapFrom: BotMonitorEvent | null = null;
  let maxReviewGapTo: BotMonitorEvent | null = null;
  for (let index = 1; index < reviews.length; index += 1) {
    const from = reviews[index - 1]!;
    const to = reviews[index]!;
    const gapMs = eventTimeMs(to) - eventTimeMs(from);
    if (gapMs > maxReviewGapMs) {
      maxReviewGapMs = gapMs;
      maxReviewGapFrom = from;
      maxReviewGapTo = to;
    }
  }

  let maxDetectStallMs = 0;
  let maxDetectStallFrom: BotMonitorEvent | null = null;
  let maxDetectStallTo: BotMonitorEvent | null = null;
  for (let index = 0; index < stateEvents.length - 1; index += 1) {
    const from = stateEvents[index]!;
    const to = stateEvents[index + 1]!;
    if (!from.message.startsWith("DETECT") || !to.message.startsWith("DELIVER")) {
      continue;
    }
    const gapMs = eventTimeMs(to) - eventTimeMs(from);
    if (gapMs > maxDetectStallMs) {
      maxDetectStallMs = gapMs;
      maxDetectStallFrom = from;
      maxDetectStallTo = to;
    }
  }

  if (!last) {
    warnings.push(
      warning(
        "info",
        "no_events",
        "No monitor events have been recorded yet. Start /bot to begin an overnight run.",
      ),
    );
  } else if (lastEventAgeMs > 10 * 60 * 1000) {
    warnings.push(
      warning(
        "critical",
        "event_silence",
        "No bot activity has been recorded for more than 10 minutes.",
        last.timestamp,
      ),
    );
  }

  if (lastReview && now - eventTimeMs(lastReview) > 45 * 60 * 1000) {
    warnings.push(
      warning(
        "warning",
        "review_drought",
        "No review has been selected for more than 45 minutes.",
        lastReview.timestamp,
      ),
    );
  } else if (!lastReview && first && now - eventTimeMs(first) > 45 * 60 * 1000) {
    warnings.push(
      warning(
        "warning",
        "review_drought",
        "This session has run for more than 45 minutes without selecting a review.",
        first.timestamp,
      ),
    );
  }

  if (maxReviewGapMs >= REVIEW_GAP_WARNING_MS && maxReviewGapFrom && maxReviewGapTo) {
    const runtimeContext = runtimeEvents
      .filter(
        (event) =>
          eventTimeMs(event) >= eventTimeMs(maxReviewGapFrom!) &&
          eventTimeMs(event) <= eventTimeMs(maxReviewGapTo!),
      )
      .filter(
        (event) =>
          /heartbeat_gap|hidden=true|visibility=hidden|focused=false|blur|freeze|pagehide|offline/i.test(
            event.message,
          ) ||
          event.metadata.hidden === true ||
          event.metadata.focused === false ||
          event.metadata.event === "heartbeat_gap",
      );
    warnings.push(
      warning(
        maxReviewGapMs >= 10 * 60 * 1000 ? "critical" : "warning",
        "review_gap_history",
        `Longest completed review gap was ${Math.round(maxReviewGapMs / 1000)} seconds.${
          runtimeContext.length > 0
            ? ` Runtime visibility/heartbeat signals occurred inside that gap (${runtimeContext.length}).`
            : ""
        }`,
        maxReviewGapFrom.timestamp,
      ),
    );
  }

  if (
    maxDetectStallMs >= DETECT_STALL_WARNING_MS &&
    maxDetectStallFrom &&
    maxDetectStallTo
  ) {
    warnings.push(
      warning(
        maxDetectStallMs >= 60 * 1000 ? "critical" : "warning",
        "detect_stall_history",
        `Longest DETECT to DELIVER stall was ${Math.round(maxDetectStallMs / 1000)} seconds.`,
        maxDetectStallFrom.timestamp,
      ),
    );
  }

  if (lastStep && now - eventTimeMs(lastStep) > 10 * 60 * 1000) {
    warnings.push(
      warning(
        "warning",
        "movement_gap",
        "No SEARCHING step has been recorded for more than 10 minutes.",
        lastStep.timestamp,
      ),
    );
  }

  if (
    lastState &&
    /DETECT|DELIVER|RETURN|TELEPORT/.test(lastState.message) &&
    eventTimeMs(lastState) > lastStepAt &&
    now - eventTimeMs(lastState) > 5 * 60 * 1000
  ) {
    warnings.push(
      warning(
        "critical",
        "state_stall",
        `Bot appears stuck after state event: ${lastState.message}`,
        lastState.timestamp,
      ),
    );
  }

  const status429 = statusCounts[429] ?? 0;
  const status503 = statusCounts[503] ?? 0;
  if (status429 > 0 || status503 > 0) {
    warnings.push(
      warning(
        status429 + status503 > 5 ? "critical" : "warning",
        "maps_429_503",
        `Observed Google imagery HTTP errors: 429=${status429}, 503=${status503}.`,
      ),
    );
  }

  const blackFrames = mapsErrors.filter((event) => /black-frame/i.test(event.message));
  if (blackFrames.length > 0) {
    warnings.push(
      warning(
        "warning",
        "black_frames",
        `Observed ${blackFrames.length} Street View black-frame diagnostic event(s).`,
        blackFrames[blackFrames.length - 1]?.timestamp,
      ),
    );
  }

  if (teleports.length >= 10) {
    warnings.push(
      warning(
        "warning",
        "frequent_teleports",
        `Observed ${teleports.length} teleport event(s); inspect causes for loops or imagery recovery.`,
      ),
    );
  }

  if (boundaries.length > 0) {
    warnings.push(
      warning(
        "info",
        "boundary_activity",
        `Observed ${boundaries.length} boundary/fallback event(s).`,
        boundaries[boundaries.length - 1]?.timestamp,
      ),
    );
  }

  if (runtimeHeartbeatGaps.length > 0) {
    const worstGap = runtimeHeartbeatGaps.reduce((worst, event) => {
      const delta =
        typeof event.metadata.deltaMs === "number" ? event.metadata.deltaMs : 0;
      const worstDelta =
        typeof worst.metadata.deltaMs === "number" ? worst.metadata.deltaMs : 0;
      return delta > worstDelta ? event : worst;
    }, runtimeHeartbeatGaps[0]!);
    const deltaMs =
      typeof worstGap.metadata.deltaMs === "number"
        ? worstGap.metadata.deltaMs
        : undefined;
    warnings.push(
      warning(
        deltaMs && deltaMs >= 5 * 60 * 1000 ? "critical" : "warning",
        "runtime_heartbeat_gap",
        `Observed ${runtimeHeartbeatGaps.length} delayed runtime heartbeat(s)${
          deltaMs ? `; worst was ${Math.round(deltaMs / 1000)} seconds` : ""
        }. Browser, display, OS sleep, or tab throttling may have paused the bot page.`,
        worstGap.timestamp,
      ),
    );
  }

  if (runtimeHiddenEvents.length > 0) {
    warnings.push(
      warning(
        "warning",
        "runtime_hidden",
        `Bot page reported hidden visibility ${runtimeHiddenEvents.length} time(s). This can throttle rendering and Street View step callbacks.`,
        runtimeHiddenEvents[runtimeHiddenEvents.length - 1]?.timestamp,
      ),
    );
  }

  if (runtimeBlurEvents.length > 0) {
    warnings.push(
      warning(
        "info",
        "runtime_blur",
        `Bot page reported loss of focus or focused=false ${runtimeBlurEvents.length} time(s).`,
        runtimeBlurEvents[runtimeBlurEvents.length - 1]?.timestamp,
      ),
    );
  }

  if (runtimeLifecyclePauses.length > 0) {
    warnings.push(
      warning(
        "warning",
        "runtime_lifecycle_pause",
        `Observed ${runtimeLifecyclePauses.length} page lifecycle/offline pause signal(s).`,
        runtimeLifecyclePauses[runtimeLifecyclePauses.length - 1]?.timestamp,
      ),
    );
  }

  const statusFromText = events
    .map((event) => extractNumber(/status=(\d{3})/, event.message))
    .filter((status): status is number => status !== undefined);
  for (const status of statusFromText) {
    if ((status === 429 || status === 503) && !statusCounts[status]) {
      warnings.push(
        warning(
          "warning",
          "maps_status_text",
          `Observed Google imagery status ${status} in diagnostic text.`,
        ),
      );
      break;
    }
  }

  const startedAt = first?.timestamp ?? new Date().toISOString();
  const lastEventAt = last?.timestamp ?? startedAt;
  const runtimeSeconds = Math.max(
    0,
    Math.round((eventTimeMs({ timestamp: lastEventAt }) - eventTimeMs({ timestamp: startedAt })) / 1000),
  );

  return {
    sessionId,
    startedAt,
    lastEventAt,
    runtimeSeconds,
    totalEvents: events.length,
    countsByTag,
    statusCounts,
    reviewsRead: reviews.length,
    teleports: teleports.length,
    boundaryEvents: boundaries.length,
    mapsErrors: mapsErrors.length,
    runtimeEvents: runtimeEvents.length,
    runtimeHeartbeatGaps: runtimeHeartbeatGaps.length,
    runtimeHiddenEvents: runtimeHiddenEvents.length,
    runtimeBlurEvents: runtimeBlurEvents.length,
    lastRuntime: runtimeEvents[runtimeEvents.length - 1] ?? null,
    lastReview,
    lastError: errorEvents[errorEvents.length - 1] ?? null,
    warnings,
    recentEvents: events.slice(-200).reverse(),
  };
}

export type RecentReviewLogRow = {
  id: number;
  timestamp: string;
  businessName: string;
  city: string;
  reviewRating: number;
  reviewText: string;
};

export type ReviewCorpusPlace = {
  placeId: string;
  name: string;
  location: { lat: number; lng: number };
  types: string[];
  source?: "local";
  rating?: number;
  totalRatings?: number;
};

export type ReviewCorpusReview = {
  reviewId: string;
  text: string;
  rating: number;
  authorName: string;
  relativeTimeDescription: string;
  usedRecentFallback?: boolean;
};

export type ReviewCorpusMapPlace = {
  placeId: string;
  name: string;
  lat: number;
  lng: number;
  reviewCount: number;
  oneStarReviewCount: number;
  source: string;
  sourceUrl: string;
};

export type TtsLabReviewSample = {
  id: string;
  placeName: string;
  text: string;
  rating: number;
  authorName: string;
  source: string;
};

export function getRecentReviewLogs(limit: number): RecentReviewLogRow[] {
  const capped = Math.min(200, Math.max(1, Math.floor(limit)));
  const rows = db()
    .prepare(
      `SELECT id, timestamp, business_name, city, review_rating, review_text
       FROM review_log
       ORDER BY id DESC
       LIMIT ?`,
    )
    .all(capped) as {
    id: number;
    timestamp: string;
    business_name: string;
    city: string;
    review_rating: number;
    review_text: string;
  }[];

  return rows.map((r) => ({
    id: r.id,
    timestamp: r.timestamp,
    businessName: r.business_name,
    city: r.city,
    reviewRating: r.review_rating,
    reviewText: r.review_text,
  }));
}

function hasTable(tableName: string): boolean {
  const row = db()
    .prepare(
      "SELECT 1 as found FROM sqlite_master WHERE type = 'table' AND name = ?",
    )
    .get(tableName) as { found: number } | undefined;
  return Boolean(row);
}

function countTable(tableName: string): number {
  if (!hasTable(tableName)) return 0;
  const safeTables = new Set([
    "offline_places",
    "offline_reviews",
    "review_corpus_places",
    "review_corpus_reviews",
  ]);
  if (!safeTables.has(tableName)) return 0;
  const row = db()
    .prepare(`SELECT COUNT(*) as total FROM ${tableName}`)
    .get() as { total: number };
  return row.total;
}

function parseTypes(typesJson: string): string[] {
  try {
    const value = JSON.parse(typesJson) as unknown;
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === "string");
    }
  } catch {
    // Fall through to the forgiving CSV-ish parser below.
  }
  return typesJson
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function distanceMeters(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): number {
  const radius = 6_371_000;
  const dLat = ((to.lat - from.lat) * Math.PI) / 180;
  const dLng = ((to.lng - from.lng) * Math.PI) / 180;
  const latA = (from.lat * Math.PI) / 180;
  const latB = (to.lat * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const value =
    sinDLat * sinDLat + Math.cos(latA) * Math.cos(latB) * sinDLng * sinDLng;
  return radius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function getReviewCorpusStats(): { places: number; reviews: number } {
  return {
    places:
      countTable("offline_places") + countTable("review_corpus_places"),
    reviews:
      countTable("offline_reviews") + countTable("review_corpus_reviews"),
  };
}

export function getReviewCorpusMapPlaces(): ReviewCorpusMapPlace[] {
  const places: ReviewCorpusMapPlace[] = [];

  if (hasTable("offline_places") && hasTable("offline_reviews")) {
    const rows = db()
      .prepare(
        `SELECT
           'offline:' || p.id as place_id,
           p.name,
           p.lat,
           p.lng,
           COUNT(r.id) as review_count,
           SUM(CASE WHEN r.rating = 1 THEN 1 ELSE 0 END) as one_star_review_count,
           p.source as source,
           '' as source_url
         FROM offline_places p
         JOIN offline_reviews r ON r.place_id = p.id
         GROUP BY p.id
         HAVING one_star_review_count > 0`,
      )
      .all() as {
      place_id: string;
      name: string;
      lat: number;
      lng: number;
      review_count: number;
      one_star_review_count: number;
      source: string;
      source_url: string;
    }[];

    places.push(
      ...rows.map((row) => ({
        placeId: row.place_id,
        name: row.name,
        lat: row.lat,
        lng: row.lng,
        reviewCount: row.review_count,
        oneStarReviewCount: row.one_star_review_count,
        source: row.source,
        sourceUrl: row.source_url,
      })),
    );
  }

  if (hasTable("review_corpus_places") && hasTable("review_corpus_reviews")) {
    const rows = db()
      .prepare(
        `SELECT
           p.place_id,
           p.name,
           p.lat,
           p.lng,
           COUNT(r.id) as review_count,
           SUM(CASE WHEN r.review_rating = 1 THEN 1 ELSE 0 END) as one_star_review_count,
           p.source,
           p.source_url
         FROM review_corpus_places p
         JOIN review_corpus_reviews r ON r.place_id = p.place_id
         GROUP BY p.place_id
         HAVING one_star_review_count > 0`,
      )
      .all() as {
      place_id: string;
      name: string;
      lat: number;
      lng: number;
      review_count: number;
      one_star_review_count: number;
      source: string;
      source_url: string;
    }[];

    places.push(
      ...rows.map((row) => ({
        placeId: row.place_id,
        name: row.name,
        lat: row.lat,
        lng: row.lng,
        reviewCount: row.review_count,
        oneStarReviewCount: row.one_star_review_count,
        source: row.source,
        sourceUrl: row.source_url,
      })),
    );
  }

  return places.sort((a, b) => b.oneStarReviewCount - a.oneStarReviewCount);
}

export function getTtsLabReviewSamples(options: {
  targetRating: number;
  minLength: number;
  maxLength: number;
  limit: number;
}): TtsLabReviewSample[] {
  const rows: TtsLabReviewSample[] = [];
  const limit = Math.min(80, Math.max(1, Math.floor(options.limit)));

  if (hasTable("review_corpus_places") && hasTable("review_corpus_reviews")) {
    const reviewCorpusRows = db()
      .prepare(
        `SELECT
           'review_corpus:' || r.id as id,
           p.name as place_name,
           r.review_text as text,
           r.review_rating as rating,
           r.author_name,
           r.source
         FROM review_corpus_reviews r
         JOIN review_corpus_places p ON p.place_id = r.place_id
         WHERE r.review_rating = ?
           AND length(r.review_text) BETWEEN ? AND ?
         ORDER BY
           r.last_read_at IS NULL DESC,
           abs(length(r.review_text) - 220) ASC,
           r.id ASC
         LIMIT ?`,
      )
      .all(options.targetRating, options.minLength, options.maxLength, limit) as {
      id: string;
      place_name: string;
      text: string;
      rating: number;
      author_name: string;
      source: string;
    }[];

    rows.push(
      ...reviewCorpusRows.map((row) => ({
        id: row.id,
        placeName: row.place_name,
        text: row.text,
        rating: row.rating,
        authorName: row.author_name,
        source: row.source || "review_corpus",
      })),
    );
  }

  if (rows.length < limit && hasTable("offline_places") && hasTable("offline_reviews")) {
    const offlineRows = db()
      .prepare(
        `SELECT
           'offline:' || r.id as id,
           p.name as place_name,
           r.text,
           r.rating,
           r.author_name,
           r.source
         FROM offline_reviews r
         JOIN offline_places p ON p.id = r.place_id
         WHERE r.rating = ?
           AND length(r.text) BETWEEN ? AND ?
         ORDER BY
           r.last_read_at IS NULL DESC,
           abs(length(r.text) - 220) ASC,
           r.id ASC
         LIMIT ?`,
      )
      .all(
        options.targetRating,
        options.minLength,
        options.maxLength,
        limit - rows.length,
      ) as {
      id: string;
      place_name: string;
      text: string;
      rating: number;
      author_name: string;
      source: string;
    }[];

    rows.push(
      ...offlineRows.map((row) => ({
        id: row.id,
        placeName: row.place_name,
        text: row.text,
        rating: row.rating,
        authorName: row.author_name,
        source: row.source || "offline",
      })),
    );
  }

  return rows;
}

export function getNearbyReviewCorpusPlaces(options: {
  lat: number;
  lng: number;
  limit?: number;
  targetRating?: number;
}): ReviewCorpusPlace[] {
  const { lat, lng, targetRating } = options;
  const limit = Math.min(250, Math.max(1, Math.floor(options.limit ?? 80)));
  const ratingFilter = Number.isFinite(targetRating) ? targetRating : null;
  const places: ReviewCorpusPlace[] = [];

  if (hasTable("offline_places") && hasTable("offline_reviews")) {
    const rows = db()
      .prepare(
        `SELECT id, source_place_id, name, lat, lng, types_json, rating, user_ratings_total
         FROM offline_places
         WHERE EXISTS (
             SELECT 1 FROM offline_reviews
             WHERE offline_reviews.place_id = offline_places.id
               AND (? IS NULL OR offline_reviews.rating = ?)
           )`,
      )
      .all(ratingFilter, ratingFilter) as {
      id: number;
      source_place_id: string;
      name: string;
      lat: number;
      lng: number;
      types_json: string;
      rating: number | null;
      user_ratings_total: number | null;
    }[];

    places.push(
      ...rows.map((row) => ({
        placeId: `offline:${row.id}`,
        name: row.name,
        location: { lat: row.lat, lng: row.lng },
        types: parseTypes(row.types_json),
        source: "local" as const,
        rating: row.rating ?? undefined,
        totalRatings: row.user_ratings_total ?? undefined,
      })),
    );
  }

  if (hasTable("review_corpus_places") && hasTable("review_corpus_reviews")) {
    const rows = db()
      .prepare(
        `SELECT place_id, name, lat, lng, types_json, rating, total_ratings
         FROM review_corpus_places
         WHERE EXISTS (
             SELECT 1 FROM review_corpus_reviews
             WHERE review_corpus_reviews.place_id = review_corpus_places.place_id
               AND (? IS NULL OR review_corpus_reviews.review_rating = ?)
           )`,
      )
      .all(ratingFilter, ratingFilter) as {
    place_id: string;
    name: string;
    lat: number;
    lng: number;
    types_json: string;
    rating: number | null;
    total_ratings: number | null;
  }[];

    places.push(
      ...rows.map((row) => ({
        placeId: row.place_id,
        name: row.name,
        location: { lat: row.lat, lng: row.lng },
        types: parseTypes(row.types_json),
        source: "local" as const,
        rating: row.rating ?? undefined,
        totalRatings: row.total_ratings ?? undefined,
      })),
    );
  }

  const origin = { lat, lng };
  return places
    .map((place) => ({
      place,
      distance: distanceMeters(origin, place.location),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit)
    .map(({ place }) => place);
}

export function getReviewCorpusReviews(
  placeId: string,
  options?: {
    targetRating?: number;
    minLength?: number;
    maxLength?: number;
    cooldownMinutes?: number;
    nowIso?: string;
  },
): ReviewCorpusReview[] {
  const targetRating = Number.isFinite(options?.targetRating)
    ? options?.targetRating
    : null;
  const minLength = Number.isFinite(options?.minLength) ? options?.minLength : 0;
  const maxLength = Number.isFinite(options?.maxLength)
    ? options?.maxLength
    : 1_000_000;
  const cooldownMinutes = Math.max(0, options?.cooldownMinutes ?? 0);
  const nowIso = options?.nowIso ?? new Date().toISOString();

  if (placeId.startsWith("offline:") && hasTable("offline_reviews")) {
    const offlinePlaceId = Number(placeId.slice("offline:".length));
    if (!Number.isFinite(offlinePlaceId)) return [];
    const baseWhere = `
      place_id = ?
      AND (? IS NULL OR rating = ?)
      AND length(text) BETWEEN ? AND ?
    `;
    const eligibleRows = db()
      .prepare(
        `SELECT id, text, rating, author_name, relative_time_description, 0 as used_recent_fallback
         FROM offline_reviews
         WHERE ${baseWhere}
           AND (
             last_read_at IS NULL OR
             datetime(last_read_at, '+' || ? || ' minutes') <= datetime(?)
           )
         ORDER BY last_read_at IS NULL DESC, read_count ASC, id ASC`,
      )
      .all(
        offlinePlaceId,
        targetRating,
        targetRating,
        minLength,
        maxLength,
        cooldownMinutes,
        nowIso,
      ) as {
      id: number;
      text: string;
      rating: number;
      author_name: string;
      relative_time_description: string;
      used_recent_fallback: number;
    }[];

    const rows =
      eligibleRows.length > 0
        ? eligibleRows
        : (db()
            .prepare(
              `SELECT id, text, rating, author_name, relative_time_description, 1 as used_recent_fallback
               FROM offline_reviews
               WHERE ${baseWhere}
               ORDER BY
                 last_read_at IS NULL DESC,
                 datetime(last_read_at) ASC,
                 read_count ASC,
                 id ASC`,
            )
            .all(offlinePlaceId, targetRating, targetRating, minLength, maxLength) as typeof eligibleRows);

    return rows.map((row) => ({
      reviewId: String(row.id),
      text: row.text,
      rating: row.rating,
      authorName: row.author_name,
      relativeTimeDescription: row.relative_time_description,
      usedRecentFallback: Boolean(row.used_recent_fallback),
    }));
  }

  if (!hasTable("review_corpus_reviews")) return [];

  const baseWhere = `
    place_id = ?
    AND (? IS NULL OR review_rating = ?)
    AND length(review_text) BETWEEN ? AND ?
  `;
  const eligibleRows = db()
    .prepare(
      `SELECT id, review_text, review_rating, author_name, relative_time_description, 0 as used_recent_fallback
       FROM review_corpus_reviews
       WHERE ${baseWhere}
         AND (
           last_read_at IS NULL OR
           datetime(last_read_at, '+' || ? || ' minutes') <= datetime(?)
         )
       ORDER BY last_read_at IS NULL DESC, read_count ASC, id ASC`,
    )
    .all(placeId, targetRating, targetRating, minLength, maxLength, cooldownMinutes, nowIso) as {
    id: number;
    review_text: string;
    review_rating: number;
    author_name: string;
    relative_time_description: string;
    used_recent_fallback: number;
  }[];

  const rows =
    eligibleRows.length > 0
      ? eligibleRows
      : (db()
          .prepare(
            `SELECT id, review_text, review_rating, author_name, relative_time_description, 1 as used_recent_fallback
             FROM review_corpus_reviews
             WHERE ${baseWhere}
             ORDER BY
               last_read_at IS NULL DESC,
               datetime(last_read_at) ASC,
               read_count ASC,
               id ASC`,
          )
          .all(placeId, targetRating, targetRating, minLength, maxLength) as typeof eligibleRows);

  return rows.map((row) => ({
    reviewId: String(row.id),
    text: row.review_text,
    rating: row.review_rating,
    authorName: row.author_name,
    relativeTimeDescription: row.relative_time_description,
    usedRecentFallback: Boolean(row.used_recent_fallback),
  }));
}

export function markReviewCorpusReviewRead(options: {
  placeId: string;
  reviewId?: string;
  reviewText?: string;
  readAtIso?: string;
}): boolean {
  const readAtIso = options.readAtIso ?? new Date().toISOString();

  if (options.placeId.startsWith("offline:") && hasTable("offline_reviews")) {
    const offlinePlaceId = Number(options.placeId.slice("offline:".length));
    const reviewId = Number(options.reviewId);
    if (!Number.isFinite(offlinePlaceId)) return false;

    const result = Number.isFinite(reviewId)
      ? db()
          .prepare(
            `UPDATE offline_reviews
             SET read_count = read_count + 1,
                 last_read_at = ?,
                 last_selected_at = ?
             WHERE place_id = ? AND id = ?`,
          )
          .run(readAtIso, readAtIso, offlinePlaceId, reviewId)
      : db()
          .prepare(
            `UPDATE offline_reviews
             SET read_count = read_count + 1,
                 last_read_at = ?,
                 last_selected_at = ?
             WHERE place_id = ? AND text = ?`,
          )
          .run(readAtIso, readAtIso, offlinePlaceId, options.reviewText ?? "");

    return result.changes > 0;
  }

  if (!hasTable("review_corpus_reviews")) return false;

  const reviewId = Number(options.reviewId);
  const result = Number.isFinite(reviewId)
    ? db()
        .prepare(
          `UPDATE review_corpus_reviews
           SET read_count = read_count + 1,
               last_read_at = ?,
               last_selected_at = ?
           WHERE place_id = ? AND id = ?`,
        )
        .run(readAtIso, readAtIso, options.placeId, reviewId)
    : db()
        .prepare(
          `UPDATE review_corpus_reviews
           SET read_count = read_count + 1,
               last_read_at = ?,
               last_selected_at = ?
           WHERE place_id = ? AND review_text = ?`,
        )
        .run(readAtIso, readAtIso, options.placeId, options.reviewText ?? "");

  return result.changes > 0;
}
