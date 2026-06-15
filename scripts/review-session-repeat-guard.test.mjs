import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const reviewManager = readFileSync(
  join(root, "src/engine/review-manager.ts"),
  "utf8",
);
const config = readFileSync(join(root, "src/lib/config.ts"), "utf8");
const botSettings = readFileSync(join(root, "src/lib/bot-settings.ts"), "utf8");

assert.match(
  config,
  /SESSION_REVIEW_REPEAT_COOLDOWN_MINUTES:\s*30/,
  "session review repeats should have a named 30 minute policy value",
);

assert.match(
  botSettings,
  /sessionReviewRepeatCooldownMinutes:\s*number/,
  "bot settings should expose the session-level repeat cooldown",
);

assert.match(
  botSettings,
  /sessionReviewRepeatCooldownMinutes:\s*REVIEWS\.SESSION_REVIEW_REPEAT_COOLDOWN_MINUTES/,
  "session repeat cooldown should default from config",
);

assert.match(
  reviewManager,
  /sessionReadReviewAtByHash\s*=\s*new Map<string,\s*number>/,
  "ReviewManager should track selected review timestamps, not a forever session set",
);

assert.match(
  reviewManager,
  /pruneStaleReviewReads\(\s*this\.sessionReadReviewAtByHash,\s*sessionCooldownMs,\s*now,?\s*\)/s,
  "expired session review reads should be pruned before filtering",
);

assert.match(
  reviewManager,
  /!this\.isReviewInSessionCooldown\(\s*review\.hash,\s*now,\s*sessionCooldownMs,?\s*\)/s,
  "review filtering should only reject hashes inside the active session cooldown",
);

assert.match(
  reviewManager,
  /this\.sessionReadReviewAtByHash\.set\(selected\.hash,\s*now\)/,
  "selected review hash should be timestamped immediately in the session guard",
);

assert.match(
  reviewManager,
  /ignoreReadCooldown:\s*allowHistoricalFallback/,
  "server recent fallback may bypass long-term read history after session filtering",
);

assert.doesNotMatch(
  reviewManager,
  /sessionReadReviewHashes/,
  "the old forever-in-session repeat set should not remain",
);
