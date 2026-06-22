import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const scriptPath = join(root, "scripts", "configure-installation-windows.ps1");
const wrapperPath = join(root, "scripts", "setup-windows-kiosk.bat");
const legacyPath = join(root, "scripts", "setup-windows-kiosk.ps1");

assert.ok(existsSync(scriptPath), "reversible Windows configuration script should exist");
assert.ok(!existsSync(legacyPath), "legacy one-way PowerShell script should be removed");

const script = readFileSync(scriptPath, "utf8");
const wrapper = readFileSync(wrapperPath, "utf8");

for (const mode of ["Report", "WhatIf", "Apply", "Restore"]) {
  assert.match(script, new RegExp(`\\[switch\\] \\$${mode}\\b`), `${mode} mode should exist`);
}
assert.match(script, /exactly one mode/i, "script should reject ambiguous mode selection");
assert.match(script, /windows-installation-backup/, "backup should use the ignored .tmp backup directory");
assert.match(script, /backup-version/i, "backup should be versioned");
assert.match(script, /Exists\s*=/, "registry backup should record missing values");
assert.match(script, /RegistryValueKind|Kind\s*=/, "registry backup should preserve value kinds");
assert.match(script, /IsInRole/, "mutating modes should verify administrator privileges");
assert.match(script, /standby-timeout-ac/, "AC sleep timeout should be configured");
assert.match(script, /monitor-timeout-ac/, "AC display timeout should be configured");
assert.doesNotMatch(script, /standby-timeout-dc|monitor-timeout-dc/, "battery timeout should remain unchanged");
assert.match(script, /LIDACTION/, "AC lid-close behavior should be configured");
assert.match(script, /GpuPreference=2;/, "Chrome should prefer the high-performance GPU");
assert.match(script, /\.tmp[\\\/]kiosk-browser|kiosk-browser/, "dedicated kiosk profile should be created");
assert.match(script, /Windows Update/i, "report should cover manual Windows Update checks");
assert.match(script, /TCL 75P81K/, "report should cover the main display");
assert.match(script, /Samsung UE32N5000AW/, "report should cover the terminal display");
assert.match(script, /Lenovo Vantage/, "report should cover Lenovo conservation mode");
assert.match(script, /radiator/i, "report should include the physical cooling warning");
assert.match(wrapper, /configure-installation-windows\.ps1/, "wrapper should call the reversible script");
assert.match(wrapper, /-Apply/, "wrapper should apply the installation profile");

console.log("Windows installation configuration contract passed.");
