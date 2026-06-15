import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const monitor = readFileSync(join(root, "src/lib/maps-cdn-stress.ts"), "utf8");
const config = readFileSync(join(root, "src/lib/config.ts"), "utf8");
const bot = readFileSync(join(root, "src/engine/bot.ts"), "utf8");
const controller = readFileSync(
  join(root, "src/engine/street-view-controller.ts"),
  "utf8",
);

for (const status of [429, 502, 503, 504]) {
  assert.match(
    monitor,
    new RegExp(`status === ${status}`),
    `Maps imagery diagnostics should count ${status}`,
  );
}

assert.match(
  monitor,
  /startMapsImageryCdnDiagnosticsMonitor/,
  "diagnostics monitor export should exist",
);

assert.match(
  monitor,
  /startMapsImageryCdnErrorMonitor[\s\S]*startMapsImageryCdnDiagnosticsMonitor/,
  "legacy error monitor should wrap diagnostics monitor",
);

assert.doesNotMatch(
  monitor,
  /\/api\/places|\/api\/log|\/api\/geocode|\/api\/tts/,
  "imagery matcher should not target local API routes",
);

assert.match(
  config,
  /ERROR_ACTIVITY_MIN_INTERVAL_MS/,
  "config should include terminal throttle for individual imagery errors",
);

assert.match(
  config,
  /BLACK_FRAME_SAMPLE_INTERVAL_MS/,
  "config should include black-frame sampling interval",
);

assert.match(
  bot,
  /startMapsImageryCdnDiagnosticsMonitor/,
  "bot should use richer diagnostics monitor",
);

assert.match(
  controller,
  /sampleCanvasBrightness/,
  "StreetViewController should expose best-effort canvas brightness sampling",
);

assert.match(
  bot,
  /checkStreetViewBlackFrame/,
  "bot should periodically check for near-black Street View canvas frames",
);
