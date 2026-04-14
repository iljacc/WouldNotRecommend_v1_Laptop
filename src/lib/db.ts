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
  `);
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

export function getStats(): SessionStats {
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

export type RecentReviewLogRow = {
  id: number;
  timestamp: string;
  businessName: string;
  city: string;
  reviewRating: number;
  reviewText: string;
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
