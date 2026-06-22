import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const launcher = readFileSync(join(root, "scripts", "start-with-kiosk.cjs"), "utf8");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

assert.match(launcher, /windows-monitor-layout\.cjs/, "launcher should use monitor discovery helper");
assert.match(launcher, /discoverWindowsMonitors/, "launcher should discover active Windows displays");
assert.match(launcher, /selectPresentationBounds/, "launcher should assign route-specific bounds");
assert.match(launcher, /GSV_KIOSK_BOUNDS/, "manual bounds should remain supported");
assert.match(launcher, /\["Google", "Chrome", "Application"\]/, "Chrome should be a Windows browser candidate");

const chromeIndex = launcher.indexOf('"Google", "Chrome"');
const edgeIndex = launcher.indexOf('"Microsoft", "Edge"');
assert.ok(chromeIndex >= 0 && edgeIndex >= 0 && chromeIndex < edgeIndex, "Chrome should be preferred over Edge");

assert.match(launcher, /--app=/, "presentation windows should use clean app mode");
assert.match(launcher, /--start-fullscreen/, "presentation windows should start fullscreen");
assert.match(launcher, /user-data-dir/, "both windows should use a dedicated shared profile");
assert.match(launcher, /kiosk-logs/, "launcher should record local recovery logs");
assert.match(launcher, /Math\.min\([^\n]*30_000/, "browser recovery delay should be bounded");
assert.match(launcher, /shuttingDown/, "intentional shutdown should suppress recovery");

assert.equal(pkg.scripts["start:kiosk"], "node scripts/start-with-kiosk.cjs --kiosk");
assert.equal(pkg.scripts["start:server"], "next start");
assert.equal(pkg.scripts.start, "node scripts/start-with-kiosk.cjs");

console.log("Kiosk launcher contract passed.");
