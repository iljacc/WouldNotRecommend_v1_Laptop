import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const checkedFiles = [
  ".env.example",
  "src/app/api/health/route.ts",
  "src/app/api/places/route.ts",
  "src/engine/review-manager.ts",
  "src/engine/bot.ts",
  "src/lib/bot-settings.ts",
  "src/lib/config.ts",
  "src/lib/types.ts",
];

const forbiddenPatterns = [
  /maps\.googleapis\.com\/maps\/api\/place/i,
  /\bPLACES_API_KEY\b/,
  /\bREVIEW_SOURCE\b/,
  /\bnearbySearchMaxPages\b/,
  /\bnearbyCacheTtlMs\b/,
  /\bNEARBY_SEARCH_MAX_PAGES\b/,
  /\bNEARBY_CACHE_TTL_MS\b/,
  /\bNEARBY_EXTRA_PAGE_ROUNDS_PER_CHECK\b/,
  /\bsource\?: "local" \| "google"/,
];

test("runtime code no longer contains Google Places API paths or mode toggles", () => {
  const matches = [];

  for (const file of checkedFiles) {
    const absolutePath = resolve(root, file);
    const contents = readFileSync(absolutePath, "utf8");
    for (const pattern of forbiddenPatterns) {
      if (pattern.test(contents)) {
        matches.push(`${relative(root, absolutePath)} matched ${pattern}`);
      }
    }
  }

  assert.deepEqual(matches, []);
});
