import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import type { ReviewLogEntry, SessionStats } from "./types";

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
  radius: number;
  targetRating?: number;
}): ReviewCorpusPlace[] {
  const { lat, lng, radius, targetRating } = options;
  const safeRadius = Math.max(1, radius);
  const ratingFilter = Number.isFinite(targetRating) ? targetRating : null;
  const latDelta = safeRadius / 111_320;
  const lngScale = Math.max(0.01, Math.cos((lat * Math.PI) / 180));
  const lngDelta = safeRadius / (111_320 * lngScale);

  const bounds = [
    lat - latDelta,
    lat + latDelta,
    lng - lngDelta,
    lng + lngDelta,
  ];
  const places: ReviewCorpusPlace[] = [];

  if (hasTable("offline_places") && hasTable("offline_reviews")) {
    const rows = db()
      .prepare(
        `SELECT id, source_place_id, name, lat, lng, types_json, rating, user_ratings_total
         FROM offline_places
         WHERE lat BETWEEN ? AND ?
           AND lng BETWEEN ? AND ?
           AND EXISTS (
             SELECT 1 FROM offline_reviews
             WHERE offline_reviews.place_id = offline_places.id
               AND (? IS NULL OR offline_reviews.rating = ?)
           )`,
      )
      .all(...bounds, ratingFilter, ratingFilter) as {
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
         WHERE lat BETWEEN ? AND ?
           AND lng BETWEEN ? AND ?
           AND EXISTS (
             SELECT 1 FROM review_corpus_reviews
             WHERE review_corpus_reviews.place_id = review_corpus_places.place_id
               AND (? IS NULL OR review_corpus_reviews.review_rating = ?)
           )`,
      )
      .all(...bounds, ratingFilter, ratingFilter) as {
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
    .filter(({ distance }) => distance <= safeRadius)
    .sort((a, b) => a.distance - b.distance)
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
