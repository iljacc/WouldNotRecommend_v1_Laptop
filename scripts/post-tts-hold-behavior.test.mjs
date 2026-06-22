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
  numericConst("POST_TTS_HOLD_MS"),
  2000,
  "the bot should remain still for two seconds after speech ends",
);

assert.match(
  settings,
  /postTtsHoldMs:\s*number/,
  "bot timing settings should expose postTtsHoldMs",
);

assert.match(
  settings,
  /postTtsHoldMs:\s*TIMING\.POST_TTS_HOLD_MS/,
  "default post-TTS hold should come from config",
);

assert.match(
  bot,
  /await this\.tts\.speak[\s\S]*?await this\.sleep\(getBotSettings\(\)\.timing\.postTtsHoldMs\)[\s\S]*?this\.dispatch\(\{ type: "DELIVER_COMPLETE" \}\)/,
  "DELIVER_COMPLETE must wait for the configured post-speech hold",
);
