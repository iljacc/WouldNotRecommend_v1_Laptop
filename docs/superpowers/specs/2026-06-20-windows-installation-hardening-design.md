# Windows Installation Hardening Design

**Date:** 2026-06-20

## Goal

Prepare the Lenovo ThinkPad P16v Gen 2 for a multi-day, continuously running
gallery installation using:

- TCL 75P81K at 3840x2160 for `/bot`
- Samsung UE32N5000AW at 1920x1080 for `/terminal`
- The closed laptop panel disabled during presentation
- Chrome presentation windows launched from the repository

The setup must reduce interruptions without disabling Windows security or
making unrelated changes to the user's laptop.

## Deliverables

### Windows Configuration Script

Create `scripts/configure-installation-windows.ps1` with four explicit modes:

```powershell
.\scripts\configure-installation-windows.ps1 -Report
.\scripts\configure-installation-windows.ps1 -WhatIf
.\scripts\configure-installation-windows.ps1 -Apply
.\scripts\configure-installation-windows.ps1 -Restore
```

The script requires an elevated PowerShell session for `-Apply` and `-Restore`.
It must fail with a clear message when elevation is required rather than
partially applying changes.

`-Report` and `-WhatIf` must not change system state. `-WhatIf` describes each
planned change and its current value. `-Report` summarizes installation
readiness and manual checks.

### Kiosk Launcher

Add explicit npm commands:

- `npm run start:kiosk`: start the production Next.js server and presentation
  windows.
- `npm run start:server`: start Next.js without presentation windows.

The kiosk launcher uses a dedicated browser profile under
`.tmp/kiosk-browser`. It must not use or modify the user's personal Chrome
profile.

## Automated Windows Changes

Before applying changes, record every affected setting under
`.tmp/windows-installation-backup/`. The backup must distinguish a missing
registry value from a present value so restore can delete values that did not
exist originally.

`-Apply` configures only the following:

1. On AC power, display timeout, system sleep, and hibernation are set to Never.
2. On AC power, closing the lid performs no action.
3. Hibernation is disabled, which also disables Fast Startup.
4. The Windows screen saver is disabled for the current installation user.
5. Dynamic Lock is disabled for the current installation user.
6. Notification banners and Windows promotional suggestions are disabled for
   the current installation user.
7. When Chrome is installed, its Windows graphics preference is set to the
   high-performance GPU.
8. The dedicated kiosk browser directory is created without copying data from
   another Chrome profile.

Battery-mode power behavior remains unchanged. Re-running `-Apply` must be
idempotent and must not overwrite the original backup with already-modified
values.

`-Restore` restores only settings recorded by this script. It must not infer or
reset unrelated defaults. After successful restoration, it reports which
values were restored and which could not be restored.

## Settings That Remain Manual

The script reports but does not force settings that lack a stable, supported,
or sufficiently safe automation path:

- Windows Update pause and restart-notification settings
- Display arrangement, primary-display selection, DPI scaling, resolution, and
  refresh rate
- `Win+P` selection used to disable the laptop panel
- Lenovo Vantage conservation mode, BIOS, and firmware updates
- TV overscan, PC/Game mode, HDMI-CEC, sleep timers, eco shutdown, and input
  selection
- Default Windows audio output
- Physical ventilation and distance from the radiator
- Unrelated startup applications

The readiness report recommends:

- TCL: primary display, 3840x2160, 60 Hz, 200% scaling initially
- Samsung: left secondary display, 1920x1080, 60 Hz, 100% scaling
- HDR, Night Light, and variable refresh rate off initially
- Windows display mode set to Extend with the internal panel disabled
- Windows power mode Balanced
- Windows Update deliberately completed, restarted, and then paused for the
  exhibition period
- Lenovo battery conservation enabled and all vents unobstructed

## Monitor-Aware Window Placement

Windows display numbers are not stable identifiers. The launcher therefore
uses the active monitor topology at launch time:

1. The primary 3840x2160 monitor is the preferred `/bot` target.
2. The active 1920x1080 non-primary monitor is the preferred `/terminal`
   target.
3. The internal panel is ignored when the two expected external displays are
   present.
4. Actual monitor bounds are used, including negative coordinates for a screen
   positioned left of the primary display.
5. Existing `GSV_KIOSK_BOUNDS` remains the explicit operator override and takes
   precedence over automatic placement.
6. If the expected topology is ambiguous, the launcher logs the detected
   monitors and uses a documented fallback instead of silently guessing.

Both presentation windows use Chrome app mode and the same dedicated profile,
preserving `BroadcastChannel` communication while removing normal browser UI.
The windows open fullscreen on their assigned displays. An operator can leave
fullscreen with `F11`, move a window with Windows keyboard shortcuts, and
return to fullscreen. Permanent corrections use `GSV_KIOSK_BOUNDS`.

## Recovery Behavior

The launcher waits for the local HTTP server before opening Chrome. It records
server startup, monitor selection, browser launch, exit, and relaunch events in
a local ignored log directory.

Unexpected browser-window exits are relaunched with bounded exponential
backoff. Recovery must avoid a tight restart loop. Stopping the launcher
intentionally must stop recovery and clean up child processes it owns.

The implementation preserves the existing runtime heartbeat, Screen Wake Lock,
`/monitor`, shared browser profile, and Street View request cadence. It must not
increase Google Street View polling or camera updates.

## Safety Boundaries

The implementation must not:

- Disable Windows Defender, Firewall, SmartScreen, or Windows Update services
- Modify Wi-Fi, accounts, passwords, automatic sign-in, or remote access
- Change battery-mode sleep and lid behavior
- Copy, delete, or open the user's personal browser profile
- Apply unsupported display-scaling registry edits
- Modify Lenovo firmware settings
- Commit generated backups, browser profiles, logs, or local database changes

## Verification

Automated checks cover:

- PowerShell syntax and non-mutating `-Report`/`-WhatIf` behavior
- Backup serialization, missing-value handling, idempotency, and restoration
- Monitor selection from representative mixed-DPI monitor data
- Manual bounds overriding automatic selection
- Clean kiosk-profile arguments and shared-profile behavior
- Relaunch backoff and intentional shutdown behavior
- Existing typecheck, lint, launcher tests, and runtime-monitor regressions

The final installation check is performed with both TVs connected and the lid
closed. It confirms native resolutions and refresh rates, route placement,
fullscreen recovery, terminal activity delivery, audio output, and sustained
operation through a deliberate browser restart.
