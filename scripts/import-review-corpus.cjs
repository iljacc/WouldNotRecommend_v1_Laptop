/* eslint-disable @typescript-eslint/no-require-imports */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const inputPath = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : path.join(process.cwd(), "data", "review-corpus.json");

if (!fs.existsSync(inputPath)) {
  console.error(`Review corpus file not found: ${inputPath}`);
  console.error("Usage: npm run import:reviews -- data/review-corpus.json");
  process.exit(1);
}

const dbPath = process.env.REVIEW_DB_PATH
  ? path.resolve(process.cwd(), process.env.REVIEW_DB_PATH)
  : path.join(process.cwd(), "data", "db", "would-not-recommend.db");
const dbDir = path.dirname(dbPath);
fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
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

function ensureColumns(tableName, columns) {
  const existing = new Set(
    db.prepare(`PRAGMA table_info(${tableName})`).all().map((column) => column.name),
  );

  for (const [columnName, definition] of Object.entries(columns)) {
    if (!existing.has(columnName)) {
      db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
    }
  }
}

ensureColumns("review_corpus_reviews", {
  read_count: "INTEGER NOT NULL DEFAULT 0",
  last_read_at: "TEXT",
  last_selected_at: "TEXT",
});

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      field += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  row.push(field);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  if (rows.length === 0) return [];

  const headers = rows[0].map((header) => header.trim());
  return rows.slice(1).map((values) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = values[index] ? values[index].trim() : "";
    });
    return record;
  });
}

function readRecords(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  if (filePath.toLowerCase().endsWith(".csv")) {
    return parseCsv(raw);
  }

  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.places)) return parsed.places;
  if (Array.isArray(parsed.records)) return parsed.records;
  throw new Error("Expected a JSON array, { places: [...] }, { records: [...] }, or CSV.");
}

function pick(record, names, fallback = "") {
  for (const name of names) {
    if (record[name] !== undefined && record[name] !== null && record[name] !== "") {
      return record[name];
    }
  }
  return fallback;
}

function toNumber(value, fallback = null) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return fallback;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toInt(value, fallback = null) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return fallback;
  }
  const n = parseInt(String(value), 10);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeTypes(value) {
  if (Array.isArray(value)) return value.filter((item) => typeof item === "string");
  if (typeof value !== "string") return [];
  const trimmed = value.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.filter((item) => typeof item === "string");
      }
    } catch {
      // Fall through to separator parsing.
    }
  }
  return trimmed
    .split(/[|;,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function stablePlaceId(record, name, lat, lng) {
  const raw = pick(record, ["placeId", "place_id", "id"], "");
  if (raw) return String(raw);
  const hash = crypto
    .createHash("sha1")
    .update(`${name}|${lat.toFixed(6)}|${lng.toFixed(6)}`)
    .digest("hex")
    .slice(0, 16);
  return `local:${hash}`;
}

function expandRecords(records) {
  const expanded = [];
  for (const record of records) {
    if (record && Array.isArray(record.reviews)) {
      for (const review of record.reviews) {
        expanded.push({ ...record, ...review, reviews: undefined });
      }
    } else {
      expanded.push(record);
    }
  }
  return expanded;
}

const insertPlace = db.prepare(`
  INSERT INTO review_corpus_places
    (place_id, name, lat, lng, types_json, rating, total_ratings, source, source_url, updated_at)
  VALUES
    (@placeId, @name, @lat, @lng, @typesJson, @rating, @totalRatings, @source, @sourceUrl, datetime('now'))
  ON CONFLICT(place_id) DO UPDATE SET
    name = excluded.name,
    lat = excluded.lat,
    lng = excluded.lng,
    types_json = excluded.types_json,
    rating = excluded.rating,
    total_ratings = excluded.total_ratings,
    source = excluded.source,
    source_url = excluded.source_url,
    updated_at = datetime('now')
`);

const insertReview = db.prepare(`
  INSERT OR IGNORE INTO review_corpus_reviews
    (place_id, review_text, review_rating, author_name, relative_time_description, source, source_url)
  VALUES
    (@placeId, @text, @rating, @authorName, @relativeTimeDescription, @source, @sourceUrl)
`);

const records = expandRecords(readRecords(inputPath));
let placeWrites = 0;
let reviewWrites = 0;

const importRows = db.transaction((rows) => {
  for (const record of rows) {
    const name = String(
      pick(record, ["name", "placeName", "place_name", "businessName"], ""),
    ).trim();
    const lat = toNumber(pick(record, ["lat", "latitude", "place_lat"], ""));
    const lng = toNumber(pick(record, ["lng", "lon", "longitude", "place_lng"], ""));
    const text = String(pick(record, ["reviewText", "review_text", "text", "review"], "")).trim();

    if (!name || lat === null || lng === null || !text) continue;

    const placeId = stablePlaceId(record, name, lat, lng);
    const source = String(pick(record, ["source"], "google_one_star_csv")).trim();
    const sourceUrl = String(
      pick(record, ["sourceUrl", "source_url", "url", "place_url"], ""),
    ).trim();

    const placeResult = insertPlace.run({
      placeId,
      name,
      lat,
      lng,
      typesJson: JSON.stringify(normalizeTypes(pick(record, ["types", "type"], ""))),
      rating: toNumber(pick(record, ["placeRating", "place_rating", "businessRating"], ""), null),
      totalRatings: toInt(
        pick(record, ["totalRatings", "total_ratings", "userRatingsTotal", "user_review_count"], ""),
        null,
      ),
      source,
      sourceUrl,
    });
    placeWrites += placeResult.changes;

    const reviewResult = insertReview.run({
      placeId,
      text,
      rating: toInt(pick(record, ["reviewRating", "review_rating", "rating"], 1), 1),
      authorName: String(pick(record, ["authorName", "author_name", "author", "username"], "")).trim(),
      relativeTimeDescription: String(
        pick(record, ["relativeTimeDescription", "relative_time_description", "relative_date", "date"], ""),
      ).trim(),
      source,
      sourceUrl,
    });
    reviewWrites += reviewResult.changes;
  }
});

importRows(records);

const totals = db
  .prepare(
    `SELECT
       (SELECT COUNT(*) FROM review_corpus_places) as places,
       (SELECT COUNT(*) FROM review_corpus_reviews) as reviews`,
  )
  .get();

console.log(`Imported/updated place rows: ${placeWrites}`);
console.log(`Inserted new review rows: ${reviewWrites}`);
console.log(`Corpus totals: ${totals.places} places, ${totals.reviews} reviews`);
