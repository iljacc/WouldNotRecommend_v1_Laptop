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

For the event laptop:

```bash
npm run build
npm start
```

On Windows, `npm start` launches `/bot` and `/terminal` in fullscreen app windows by default. Use `GSV_KIOSK=0 npm start` when you want to start only the server.

## Verify

```bash
npm run typecheck
npm run lint
npm run test
```

Open these routes locally:

```txt
http://localhost:3000/bot
http://localhost:3000/terminal
http://localhost:3000/monitor
http://localhost:3000/review-map
http://localhost:3000/tts-lab
```
