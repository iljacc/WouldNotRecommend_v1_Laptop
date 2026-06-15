import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const hook = readFileSync(
  join(root, "src/hooks/useRuntimeEnvironmentMonitor.ts"),
  "utf8",
);
const wakeLockHook = readFileSync(
  join(root, "src/hooks/useScreenWakeLock.ts"),
  "utf8",
);
const botPage = readFileSync(join(root, "src/app/bot/page.tsx"), "utf8");
const db = readFileSync(join(root, "src/lib/db.ts"), "utf8");
const monitorPage = readFileSync(join(root, "src/app/monitor/page.tsx"), "utf8");
const kioskLauncher = readFileSync(
  join(root, "scripts/start-with-kiosk.cjs"),
  "utf8",
);

assert.match(
  botPage,
  /useRuntimeEnvironmentMonitor\(/,
  "/bot should start the runtime environment monitor",
);

assert.match(
  botPage,
  /useScreenWakeLock\(/,
  "/bot should request a screen wake lock after startup",
);

assert.match(
  wakeLockHook,
  /wakeLock\.request\("screen"\)/,
  "screen wake lock hook should request a screen wake lock",
);

assert.match(
  wakeLockHook,
  /wake_lock_acquired/,
  "screen wake lock hook should log successful acquisition",
);

assert.match(
  wakeLockHook,
  /wake_lock_released/,
  "screen wake lock hook should log release events",
);

assert.match(
  hook,
  /visibilitychange/,
  "runtime monitor should record document visibility changes",
);

assert.match(
  hook,
  /document\.hasFocus\(\)/,
  "runtime monitor should snapshot window focus state",
);

assert.match(
  hook,
  /pagehide|pageshow/,
  "runtime monitor should record page lifecycle transitions",
);

assert.match(
  hook,
  /RUNTIME_HEARTBEAT_INTERVAL_MS/,
  "runtime heartbeat interval should be named and easy to tune",
);

assert.match(
  hook,
  /heartbeat_gap/,
  "runtime monitor should explicitly log delayed heartbeats",
);

assert.match(
  db,
  /runtime_heartbeat_gap/,
  "monitor report should warn about historical runtime heartbeat gaps",
);

assert.match(
  db,
  /runtime_hidden/,
  "monitor report should warn if the bot page reports hidden visibility",
);

assert.match(
  monitorPage,
  /Runtime signals/,
  "monitor page should show runtime signal counts",
);

assert.match(
  kioskLauncher,
  /GSV_KIOSK_URLS/,
  "kiosk launcher should support multiple presentation URLs",
);

assert.match(
  kioskLauncher,
  /\/bot,\/terminal/,
  "kiosk launcher should default to bot plus terminal windows",
);

assert.match(
  kioskLauncher,
  /user-data-dir/,
  "kiosk launcher should use one browser profile for BroadcastChannel",
);

assert.match(
  kioskLauncher,
  /disable-background-timer-throttling/,
  "kiosk launcher should pass timer throttling reduction flags",
);
