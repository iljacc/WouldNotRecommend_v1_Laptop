/* eslint-disable @typescript-eslint/no-require-imports */

const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
const path = require("node:path");
const test = require("node:test");

function createDb() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE review_corpus_reviews (
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
      UNIQUE(place_id, review_text)
    );
  `);
  return db;
}

function selectOrdered(db, placeId, cooldownMinutes, nowIso) {
  return db
    .prepare(
      `SELECT review_text
       FROM review_corpus_reviews
       WHERE place_id = ?
       ORDER BY
         CASE
           WHEN last_read_at IS NULL THEN 0
           WHEN datetime(last_read_at, '+' || ? || ' minutes') <= datetime(?) THEN 0
           ELSE 1
         END ASC,
         last_read_at IS NULL DESC,
         datetime(last_read_at) ASC,
         read_count ASC,
         id ASC`,
    )
    .all(placeId, cooldownMinutes, nowIso)
    .map((row) => row.review_text);
}

test("orders unread or cooled-down reviews before recently read rows", () => {
  const db = createDb();
  db.prepare(
    `INSERT INTO review_corpus_reviews
     (place_id, review_text, read_count, last_read_at)
     VALUES (?, ?, ?, ?)`,
  ).run("place-1", "recent", 1, "2026-06-03T10:30:00.000Z");
  db.prepare(
    `INSERT INTO review_corpus_reviews
     (place_id, review_text, read_count, last_read_at)
     VALUES (?, ?, ?, ?)`,
  ).run("place-1", "oldest", 4, "2026-06-03T06:00:00.000Z");
  db.prepare(
    `INSERT INTO review_corpus_reviews
     (place_id, review_text, read_count, last_read_at)
     VALUES (?, ?, ?, ?)`,
  ).run("place-1", "unread", 0, null);

  const ordered = selectOrdered(db, "place-1", 180, "2026-06-03T11:00:00.000Z");

  assert.deepEqual(ordered, ["unread", "oldest", "recent"]);
  db.close();
});

test("project review_corpus_reviews schema has persistent read history columns", () => {
  const db = new Database(
    path.join(__dirname, "..", "data", "db", "would-not-recommend.db"),
    { readonly: true },
  );
  const columns = new Set(
    db.prepare("PRAGMA table_info(review_corpus_reviews)").all().map((row) => row.name),
  );

  assert.equal(columns.has("read_count"), true);
  assert.equal(columns.has("last_read_at"), true);
  assert.equal(columns.has("last_selected_at"), true);
  db.close();
});

test("marks a selected review as read", () => {
  const db = createDb();
  db.prepare(
    `INSERT INTO review_corpus_reviews (place_id, review_text)
     VALUES (?, ?)`,
  ).run("place-1", "selected");

  db.prepare(
    `UPDATE review_corpus_reviews
     SET read_count = read_count + 1,
         last_read_at = ?,
         last_selected_at = ?
     WHERE place_id = ? AND review_text = ?`,
  ).run(
    "2026-06-03T11:00:00.000Z",
    "2026-06-03T11:00:00.000Z",
    "place-1",
    "selected",
  );

  const row = db
    .prepare(
      `SELECT read_count, last_read_at, last_selected_at
       FROM review_corpus_reviews
       WHERE place_id = ? AND review_text = ?`,
    )
    .get("place-1", "selected");

  assert.deepEqual(row, {
    read_count: 1,
    last_read_at: "2026-06-03T11:00:00.000Z",
    last_selected_at: "2026-06-03T11:00:00.000Z",
  });
  db.close();
});
