import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const db = readFileSync(join(root, "src/lib/db.ts"), "utf8");
const monitorPage = readFileSync(join(root, "src/app/monitor/page.tsx"), "utf8");

assert.match(
  db,
  /detect_stall_history/,
  "monitor report should include historical DETECT->DELIVER stall warnings",
);

assert.match(
  db,
  /review_gap_history/,
  "monitor report should include historical long review-gap warnings",
);

assert.match(
  db,
  /REVIEW_GAP_WARNING_MS/,
  "review-gap warning threshold should be named and easy to tune",
);

assert.match(
  db,
  /DETECT_STALL_WARNING_MS/,
  "detect-stall warning threshold should be named and easy to tune",
);

assert.match(
  db,
  /WARN/,
  "monitor report should treat WARN activity as an error-like signal",
);

assert.match(
  monitorPage,
  /Warnings/,
  "monitor page should surface warnings from the report",
);
