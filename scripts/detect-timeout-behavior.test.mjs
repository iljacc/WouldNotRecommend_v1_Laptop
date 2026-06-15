import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const config = readFileSync(join(root, "src/lib/config.ts"), "utf8");
const settings = readFileSync(join(root, "src/lib/bot-settings.ts"), "utf8");
const bot = readFileSync(join(root, "src/engine/bot.ts"), "utf8");

function numericConst(name) {
  const match = config.match(new RegExp(`${name}:\\s*([\\d_]+)`));
  assert.ok(match, `Missing ${name}`);
  return Number(match[1].replaceAll("_", ""));
}

assert.equal(
  numericConst("DETECT_MAX_WAIT_MS"),
  6000,
  "DETECT must have a hard maximum wait before review delivery starts",
);

assert.match(
  settings,
  /detectMaxWaitMs:\s*number/,
  "bot timing settings should expose detectMaxWaitMs",
);

assert.match(
  settings,
  /detectMaxWaitMs:\s*TIMING\.DETECT_MAX_WAIT_MS/,
  "default bot timing should read detectMaxWaitMs from config",
);

assert.match(
  bot,
  /raceWithTimeout|withTimeout/,
  "business pan should be wrapped in a timeout helper",
);

assert.match(
  bot,
  /postActivity\("WARN"[\s\S]*detect_timeout/,
  "detect timeout should be logged to the monitor before forcing review delivery",
);

assert.match(
  bot,
  /this\.dispatch\(\{ type: "DETECT_COMPLETE" \}\)/,
  "DETECT timeout path should still dispatch DETECT_COMPLETE",
);
