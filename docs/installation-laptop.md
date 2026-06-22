# Installation Laptop Setup

Use this when preparing a second Windows laptop for the gallery installation.

## One-Time Setup

```bash
git clone https://github.com/iljacc/WouldNotRecommend_v1.git
cd WouldNotRecommend_v1
npm ci
npm run setup:piper
copy .env.example .env.local
```

Edit `.env.local` and set:

```bash
NEXT_PUBLIC_MAPS_JAVASCRIPT_API_KEY=your_maps_javascript_api_key_here
TTS_ENGINE=piper
NEXT_PUBLIC_KIOSK_MODE=true
NEXT_PUBLIC_CITY_TOUR=false
```

Without the real Maps JavaScript key, Street View will not load panoramas. Without
`npm run setup:piper`, local review speech will not be synthesized.

The committed SQLite review corpus lives at:

```txt
data/db/would-not-recommend.db
```

Do not commit `.env.local`, `.venv-piper`, `.tmp`, `.next`, `node_modules`, or downloaded voice models.

## Piper Voice

The live bot uses the fixed voice configured in:

```txt
src/lib/piper-config.ts
```

`npm run setup:piper` reads `PIPER_VOICE_INDEX`, downloads the matching Piper ONNX model and JSON metadata into `vendor/piper-voices/`, and installs the local `.venv-piper` runtime. The current live voice is index `2`, `en_US-ryan-medium`.

## Run

For development:

```bash
npm run dev
```

For the event laptop, build once and start the two-screen presentation:

```bash
npm run build
npm run start:kiosk
```

`npm run start:kiosk` starts Next.js, waits for it to answer, and opens `/bot`
and `/terminal` in fullscreen Chrome app windows. Both windows share the clean
profile at `.tmp/kiosk-browser`; the launcher never opens the personal Chrome
profile. `npm start` remains an equivalent Windows-compatible command.

To run only the server:

```bash
npm run start:server
```

## Windows Installation Profile

Preview the Windows changes without administrator rights:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/configure-installation-windows.ps1 -Report
powershell -ExecutionPolicy Bypass -File scripts/configure-installation-windows.ps1 -WhatIf
```

Apply the profile from an Administrator PowerShell window:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/configure-installation-windows.ps1 -Apply
```

The script stores the original affected values once under
`.tmp/windows-installation-backup`. Restore those recorded values with:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/configure-installation-windows.ps1 -Restore
```

Double-clicking `scripts/setup-windows-kiosk.bat` is a compatibility shortcut
that requests elevation and runs `-Apply`.

The script changes AC sleep/display/lid settings, disables hibernation and the
screen saver, suppresses notification banners and suggestions, and selects the
high-performance GPU for Chrome. It does not disable Windows security or update
services, change battery-mode behavior, alter Wi-Fi/accounts, or force display
scaling through unsupported registry values.

## Display Layout

Configure Windows before launching:

- TCL 75P81K: primary, 3840x2160, 60 Hz, initially 200% scaling.
- Samsung UE32N5000AW: left secondary, 1920x1080, 60 Hz, 100% scaling.
- Use Extend and disable the closed laptop panel with `Win+P`.
- Turn HDR, Night Light, and variable refresh rate off initially.

The launcher reads the active monitor bounds. It maps `/bot` to the primary 4K
display and `/terminal` to the non-primary 1080p display, regardless of Windows
display numbers. If detection is ambiguous, it logs the topology and uses the
installation fallback.

To override placement permanently, add route-order bounds to `.env.local`:

```dotenv
GSV_KIOSK_BOUNDS=0,0,3840,2160;-1920,540,1920,1080
```

For a temporary correction, press `F11`, move the app window with
`Shift+Win+Left/Right`, then press `F11` again. Launcher recovery logs live at
`.tmp/kiosk-logs/launcher.log`.

## Manual Reliability Checks

- Complete Windows Update, restart, then pause updates for the exhibition.
- Use Windows Balanced power mode and Lenovo Vantage conservation mode.
- Disable TV sleep/eco timers, HDMI-CEC power behavior, and overscan.
- Confirm the audio output after both HDMI displays are connected.
- Keep the laptop and charger away from the radiator with every vent exposed.

## Verify

```bash
npm run typecheck
npm run lint
npm run test
node scripts/windows-installation-config.test.mjs
node --test scripts/windows-monitor-layout.test.cjs
node scripts/kiosk-launcher.test.mjs
```

Open these routes locally:

```txt
http://localhost:3000/bot
http://localhost:3000/terminal
http://localhost:3000/monitor
http://localhost:3000/review-map
http://localhost:3000/tts-lab
```
