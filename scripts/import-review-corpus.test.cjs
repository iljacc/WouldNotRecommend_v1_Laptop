/* eslint-disable @typescript-eslint/no-require-imports */

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const Database = require("better-sqlite3");

const scriptPath = path.join(__dirname, "import-review-corpus.cjs");

test("imports Google one-star review CSV exports", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wnr-import-"));
  const csvPath = path.join(dir, "reviews.csv");
  const dbPath = path.join(dir, "would-not-recommend.db");

  fs.writeFileSync(
    csvPath,
    [
      "id_review,place_lat,place_lng,place_name,place_url,rating,relative_date,review_text,username,user_review_count",
      'review-1,52.0761277,4.312156,Chinese street,https://example.com/chinese-street,1,,"Nothing chinese...",Uli Bade,18',
      'review-2,52.079653,4.310319,Prison Gate Museum,https://example.com/prison-gate,1,,"Tour access was unclear.",Andrew Hill,7',
      "",
    ].join("\n"),
    "utf8",
  );

  execFileSync(process.execPath, [scriptPath, csvPath], {
    cwd: path.join(__dirname, ".."),
    env: { ...process.env, REVIEW_DB_PATH: dbPath },
    stdio: "pipe",
  });

  const db = new Database(dbPath, { readonly: true });
  const totals = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM review_corpus_places) as places,
         (SELECT COUNT(*) FROM review_corpus_reviews) as reviews`,
    )
    .get();
  const review = db
    .prepare(
      `SELECT p.place_id, p.name, p.lat, p.lng, p.source_url, r.review_rating, r.author_name
       FROM review_corpus_places p
       JOIN review_corpus_reviews r ON r.place_id = p.place_id
       WHERE p.name = ?`,
    )
    .get("Chinese street");

  db.close();

  assert.deepEqual(totals, { places: 2, reviews: 2 });
  assert.match(review.place_id, /^local:/);
  assert.equal(review.lat, 52.0761277);
  assert.equal(review.lng, 4.312156);
  assert.equal(review.source_url, "https://example.com/chinese-street");
  assert.equal(review.review_rating, 1);
  assert.equal(review.author_name, "Uli Bade");
});
