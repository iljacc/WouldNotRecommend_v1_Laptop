import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const config = readFileSync(join(root, "src/lib/config.ts"), "utf8");
const bot = readFileSync(join(root, "src/engine/bot.ts"), "utf8");
const reviewManager = readFileSync(
  join(root, "src/engine/review-manager.ts"),
  "utf8",
);

function numericConst(name) {
  const match = config.match(new RegExp(`${name}:\\s*([\\d_]+)`));
  assert.ok(match, `Missing ${name}`);
  return Number(match[1].replaceAll("_", ""));
}

assert.equal(
  numericConst("OUT_OF_REGION_STEPS_BEFORE_FALLBACK_REVIEW"),
  1,
  "the bot should start using an in-region review fallback quickly after leaving the corpus region",
);

assert.equal(
  numericConst("OUT_OF_REGION_STEPS_BEFORE_TELEPORT"),
  2,
  "the bot should softly recover by teleporting after two outside-region Street View steps",
);

assert.match(
  bot,
  /private consecutiveOutOfRegionSteps = 0/,
  "bot should count consecutive outside-region wander steps",
);

assert.match(
  bot,
  /handleReviewRegionBoundary\(coords\)/,
  "successful wander steps should update boundary recovery state",
);

assert.match(
  bot,
  /reviewFallbackAnchor/,
  "bot should keep an in-region fallback review anchor while outside the review region",
);

assert.match(
  bot,
  /fetchNearbyBusinesses\(queryCoords,[\s\S]*?bearingFromCoords: coords/,
  "out-of-region fallback should query from an in-region anchor while preserving real bot bearing",
);

assert.match(
  bot,
  /boundary_exit/,
  "boundary recovery teleports should be tagged separately from imagery faults",
);

assert.match(
  reviewManager,
  /bearingFromCoords\?: LatLng/,
  "review manager should support query coords separate from bearing coords",
);
