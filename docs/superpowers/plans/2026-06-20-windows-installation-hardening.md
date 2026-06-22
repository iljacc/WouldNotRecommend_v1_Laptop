# Windows Installation Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a reversible Windows hardening script and a clean, monitor-aware Chrome kiosk launcher for the two-screen gallery installation.

**Architecture:** A PowerShell command owns reporting, backup, apply, and restore behavior while keeping unsupported display and TV settings as explicit manual checks. A small CommonJS monitor module obtains Windows monitor bounds and deterministically maps `/bot` to the primary 4K display and `/terminal` to the secondary 1080p display; the existing launcher consumes it and retains environment overrides.

**Tech Stack:** PowerShell 5.1+, Node.js CommonJS, Next.js production launcher, Node built-in test/assert APIs.

---

### Task 1: Reversible Windows Configuration Command

**Files:**
- Create: `scripts/configure-installation-windows.ps1`
- Modify: `scripts/setup-windows-kiosk.bat`
- Delete: `scripts/setup-windows-kiosk.ps1`
- Test: `scripts/windows-installation-config.test.mjs`

- [ ] **Step 1: Write a failing source-contract test**

Assert that the new script exposes exactly one of `-Report`, `-WhatIf`, `-Apply`, or `-Restore`; stores a versioned JSON backup below `.tmp/windows-installation-backup`; checks administrator status before mutations; records missing registry values; changes only AC power settings; creates the kiosk profile; and documents all manual checks. Assert that the legacy one-way PowerShell script is removed and the batch wrapper invokes `-Apply`.

- [ ] **Step 2: Run the test and verify it fails**

Run: `node scripts/windows-installation-config.test.mjs`

Expected: FAIL because `configure-installation-windows.ps1` does not exist.

- [ ] **Step 3: Implement report, preview, backup, apply, and restore**

Use parameter sets for the four modes. Read the active scheme with `powercfg`, back up affected power and registry values once, and serialize registry entries with `exists`, `kind`, and `value`. Apply AC monitor/sleep/hibernate/lid settings, disable hibernation, update current-user screen saver, Dynamic Lock, notification/suggestion, and Chrome GPU preference values, and create `.tmp/kiosk-browser`. Restore only recorded entries and report per-setting failures without resetting unrelated defaults.

- [ ] **Step 4: Replace the elevation wrapper**

Keep `scripts/setup-windows-kiosk.bat` as a discoverable compatibility entry point. It requests elevation and invokes `configure-installation-windows.ps1 -Apply`.

- [ ] **Step 5: Run non-mutating verification**

Run:

```powershell
node scripts/windows-installation-config.test.mjs
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/configure-installation-windows.ps1 -Report
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/configure-installation-windows.ps1 -WhatIf
```

Expected: source-contract test passes; both PowerShell modes exit 0 without requesting elevation or changing state.

### Task 2: Monitor Detection And Route Assignment

**Files:**
- Create: `scripts/windows-monitor-layout.cjs`
- Test: `scripts/windows-monitor-layout.test.cjs`

- [ ] **Step 1: Write failing unit tests for monitor assignment**

Cover the target topology, negative left-screen coordinates, swapped enumeration order, ambiguous topology, and explicit bounds override. Expected target mapping is `/bot` to primary 3840x2160 and `/terminal` to non-primary 1920x1080.

- [ ] **Step 2: Run the tests and verify they fail**

Run: `node --test scripts/windows-monitor-layout.test.cjs`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the monitor helper**

Export pure `parseBounds`, `selectPresentationBounds`, and `describeMonitors` functions. On Windows, obtain monitor device name, primary state, and physical bounds through a short encoded PowerShell command using `System.Windows.Forms.Screen`. Return `null` on discovery failure so the launcher can use documented fallback bounds.

- [ ] **Step 4: Run unit tests**

Run: `node --test scripts/windows-monitor-layout.test.cjs`

Expected: all tests pass.

### Task 3: Clean Monitor-Aware Kiosk Launcher

**Files:**
- Modify: `scripts/start-with-kiosk.cjs`
- Modify: `package.json`
- Test: `scripts/kiosk-launcher.test.mjs`
- Test: `scripts/runtime-environment-monitor.test.mjs`

- [ ] **Step 1: Write failing launcher contract tests**

Assert Chrome is preferred over Edge on Windows, the dedicated profile and app/fullscreen arguments remain present, monitor discovery is used when no bounds override exists, `/bot` and `/terminal` receive route-specific bounds, `start:kiosk` and `start:server` scripts exist, and restart delay is bounded.

- [ ] **Step 2: Run launcher tests and verify failure**

Run: `node scripts/kiosk-launcher.test.mjs`

Expected: FAIL on missing monitor-aware and npm-script behavior.

- [ ] **Step 3: Integrate monitor selection and clean Chrome preference**

Prefer an explicitly configured browser, then Chrome, then Edge. Resolve route bounds after the server becomes ready. Use the one dedicated user-data directory, retain `GSV_KIOSK_BOUNDS` precedence, log detected monitor topology and selected targets, and use fallback bounds when discovery is unavailable.

- [ ] **Step 4: Add explicit npm commands**

Set `start:kiosk` to the launcher with kiosk forced on and `start:server` to `next start`. Preserve `npm start` compatibility.

- [ ] **Step 5: Add bounded relaunch behavior**

Track browser child exit when the process provides an owned child handle, retry with bounded exponential delay, and suppress retries during intentional shutdown. Log recovery activity below `.tmp/kiosk-logs` without treating delegated Chrome process exit as a crash.

- [ ] **Step 6: Run launcher verification**

Run:

```powershell
node scripts/kiosk-launcher.test.mjs
node scripts/runtime-environment-monitor.test.mjs
```

Expected: both tests pass.

### Task 4: Operator Documentation And Full Verification

**Files:**
- Modify: `.env.example`
- Modify: `docs/installation-laptop.md`
- Modify: `docs/how-the-bot-works.md`
- Modify: `docs/llm-handoff/README.md`

- [ ] **Step 1: Document exact operator commands**

Document `-Report`, `-WhatIf`, `-Apply`, `-Restore`, `npm run start:kiosk`, and `npm run start:server`; explain the TCL-primary/Samsung-left topology, manual `GSV_KIOSK_BOUNDS` override, F11/window movement, and settings the script intentionally leaves manual.

- [ ] **Step 2: Run static and behavioral verification**

Run:

```powershell
npm run typecheck
npm run lint
node scripts/windows-installation-config.test.mjs
node --test scripts/windows-monitor-layout.test.cjs
node scripts/kiosk-launcher.test.mjs
node scripts/runtime-environment-monitor.test.mjs
git diff --check
```

Expected: every command exits 0.

- [ ] **Step 3: Review scope and generated files**

Confirm `data/db/would-not-recommend.db` remains untouched by this work and no `.tmp` backup, kiosk profile, or logs are staged.
