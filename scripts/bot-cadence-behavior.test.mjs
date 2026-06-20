import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const config = readFileSync(join(root, "src/lib/config.ts"), "utf8");
const settings = readFileSync(join(root, "src/lib/bot-settings.ts"), "utf8");
const stateMachine = readFileSync(join(root, "src/engine/state-machine.ts"), "utf8");
const db = readFileSync(join(root, "src/lib/db.ts"), "utf8");
const placesRoute = readFileSync(join(root, "src/app/api/places/route.ts"), "utf8");
const reviewManager = readFileSync(join(root, "src/engine/review-manager.ts"), "utf8");
const bot = readFileSync(join(root, "src/engine/bot.ts"), "utf8");
const controller = readFileSync(
  join(root, "src/engine/street-view-controller.ts"),
  "utf8",
);

function numericConst(name) {
  const match = config.match(new RegExp(`${name}:\\s*([\\d_]+)`));
  assert.ok(match, `Missing ${name}`);
  return Number(match[1].replaceAll("_", ""));
}

assert.equal(
  numericConst("WANDER_STEP_INTERVAL"),
  3000,
  "default walking should step every 3 seconds for a review barrage",
);

assert.equal(
  numericConst("QUERY_MIN_INTERVAL"),
  9000,
  "nearby refresh should allow a new search after three default steps",
);

assert.equal(
  numericConst("REVIEW_ALIGN_DURATION"),
  1800,
  "review alignment should no longer create a long pause",
);

assert.equal(
  numericConst("ALIGN_PAN_MS"),
  2500,
  "business alignment should use a deliberate 2.5 second pan",
);

assert.equal(
  numericConst("RETURN_STATE_TIMER_MS"),
  1400,
  "return should be brief so reviews chain quickly",
);

assert.doesNotMatch(
  settings,
  /localStorage|BroadcastChannel|settingsVersion|saveBotSettings|saveFullBotSettings|resetBotSettingsToDefaults|subscribeBotSettings|reloadBotSettingsFromStorage/,
  "bot settings must be deterministic from config.ts only, with no browser persistence or hot-reload settings channel",
);

assert.doesNotMatch(
  bot,
  /reloadBotSettingsFromStorage|subscribeBotSettings|applySettingsHotReload|applySoftReset/,
  "bot runtime should not subscribe to browser-local settings overrides",
);

const businessDetectedBlock = stateMachine.match(
  /event\.type === "BUSINESS_DETECTED"[\s\S]*?if \(event\.type === "STUCK_DETECTED"/,
);
assert.ok(businessDetectedBlock, "Missing BUSINESS_DETECTED transition");
assert.match(
  businessDetectedBlock[0],
  /effects:\s*\[\s*\{ type: "STOP_WALKING" \},\s*\{ type: "PLAY_BLEEP" \},\s*\{ type: "CROSSFADE_TO_B" \},\s*\{ type: "PAN_TO_BUSINESS", bearingDeg: event\.business\.bearing \},\s*\]/,
  "business detection must stop, bleep, crossfade, then pan",
);

assert.match(
  bot,
  /handleBusinessPan[\s\S]*?panToHeading\(bearingDeg, timing\.alignPanMs\)[\s\S]*?alignHoldMs[\s\S]*?this\.dispatch\(\{ type: "DETECT_COMPLETE" \}\)/,
  "review delivery should start only after the business-facing pan and hold complete",
);

assert.match(
  controller,
  /this\.stepForward\(\);[\s\S]*?this\.moveInterval = window\.setInterval/,
  "startWalking should take a step immediately before waiting for the interval",
);

assert.match(
  controller,
  /function easeInOutSine\(t: number\): number \{[\s\S]*?Math\.min\(1, Math\.max\(0, t\)\)[\s\S]*?-\(Math\.cos\(Math\.PI \* x\) - 1\) \/ 2;[\s\S]*?\}/,
  "controller should define a clamped sine ease for scripted pans",
);

assert.match(
  controller,
  /panToHeading[\s\S]*?runHeadingMotion\(fromHeading, targetHeading, durationMs, easeInOutSine\)/,
  "panToHeading should use gentler sine easing",
);

assert.match(
  controller,
  /stepForward[\s\S]*?runHeadingMotion\([\s\S]*?easeInOutQuint/,
  "linked step heading blending should retain quint easing",
);

assert.doesNotMatch(
  db,
  /\.filter\(\(\{ distance \}\) => distance <= safeRadius\)/,
  "local corpus place discovery should return nearest places instead of dropping everything outside a radius",
);

assert.match(
  placesRoute,
  /limit:\s*PLACES\.LOCAL_CORPUS_NEAREST_PLACE_LIMIT/,
  "local corpus route should cap nearest-place results explicitly",
);

assert.match(
  reviewManager,
  /business\.source === "local"[\s\S]*?business\.distance <= places\.detectionRadius/,
  "local corpus candidates should bypass detection radius while Google candidates remain radius-limited",
);
