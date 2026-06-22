# Bot Running And Turn Audio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace rotating ambience with one continuous bot-running loop and add duration-matched, sample-based drunken mechanical audio to both review turns while slowing those turns by 25%.

**Architecture:** The preparation script converts two named local masters into committed runtime assets and emits scalar manifest URLs. `AudioEngine` owns one looping media element plus one decoded turn buffer; a small pure helper produces bounded randomized turn parameters for testability. Bot effects start turn audio beside the corresponding Street View pan using the same duration.

**Tech Stack:** TypeScript, Web Audio API, HTMLAudioElement, FFmpeg, Vitest, Node contract tests.

---

### Task 1: Asset Contract And Preparation

**Files:**
- Modify: `scripts/audio-assets.test.mjs`
- Modify: `scripts/prepare-audio-assets.cjs`
- Modify: `src/lib/audio-assets.ts`
- Create: `public/audio/bot-running/bot-running.webm`
- Create: `public/audio/turning/turning-loop.wav`
- Delete: `public/audio/ambient/ambient-01.webm` through `ambient-07.webm`

- [ ] Change the asset contract to require `BOT_RUNNING_AUDIO_URL`, `TURNING_AUDIO_URL`, and twelve `FOOTSTEP_AUDIO_URLS`; run `npm run test:audio-assets` and confirm it fails because the scalar exports do not exist.
- [ ] Update preparation to read exactly one file from `audio/bot_running` and one from `audio/turning_loop`, normalize them, convert the background to 48 kHz Opus and the turn texture to 48 kHz PCM WAV, and emit:

```ts
export const BOT_RUNNING_AUDIO_URL = "/audio/bot-running/bot-running.webm";
export const TURNING_AUDIO_URL = "/audio/turning/turning-loop.wav";
```

- [ ] Run `npm run audio:prepare` and `npm run test:audio-assets`; expect both to pass and the seven old ambience assets to be absent.

### Task 2: Turn Variation And Audio Engine

**Files:**
- Modify: `scripts/audio-runtime.test.ts`
- Create: `src/engine/turn-audio.ts`
- Modify: `src/engine/audio-engine.ts`

- [ ] Add failing tests for a pure `createTurnPlaybackPlan(durationMs, bufferDurationSec, random)` helper. Assert random offset remains within the buffer, base rate stays within `0.96..1.04`, peak rate remains restrained, and duration converts exactly to seconds.
- [ ] Implement the minimal helper with this public shape:

```ts
export type TurnPlaybackPlan = {
  offsetSec: number;
  durationSec: number;
  startRate: number;
  peakRate: number;
  endRate: number;
};
```

- [ ] Replace the two-deck ambience shuffle with one looping `HTMLAudioElement` using `BOT_RUNNING_AUDIO_URL`. Preserve smooth searching, processing, and TTS-duck gain ramps.
- [ ] Load `TURNING_AUDIO_URL` once during initialization and add `playTurn(durationMs)`. Create a looping buffer source at the randomized offset, schedule playback-rate rise and fall, schedule gain attack and release, and stop at `durationMs` without awaiting playback.
- [ ] Run `npm run test:audio-runtime`; expect all variation and wiring tests to pass.

### Task 3: Bot Wiring And Slower Turns

**Files:**
- Modify: `scripts/bot-cadence-behavior.test.mjs`
- Modify: `scripts/audio-runtime.test.ts`
- Modify: `src/lib/config.ts`
- Modify: `src/engine/bot.ts`

- [ ] Add failing contract assertions for `ALIGN_PAN_MS: 3_125`, `RETURN_PAN_DURATION: 1_500`, `RETURN_STATE_TIMER_MS: 1_750`, and `playTurn` beside both pan effects.
- [ ] Update the three timing defaults.
- [ ] In `PAN_TO_BUSINESS`, call `audio.playTurn(timing.alignPanMs)` immediately before `handleBusinessPan`; in `PAN_TO_WANDER_HEADING`, call `audio.playTurn(timing.returnPanDuration)` immediately before `panToHeading`.
- [ ] Run `npm run test:cadence` and `npm run test:audio-runtime`; expect both to pass.

### Task 4: Documentation And Verification

**Files:**
- Modify: `docs/how-the-bot-works.md`
- Modify: `docs/installation-laptop.md`
- Modify: `docs/llm-handoff/README.md`

- [ ] Replace seven-ambience/crossfade documentation with the continuous bot-running loop, TTS ducking, randomized turn texture, source paths, and new pan timings.
- [ ] Run `git diff --check`, `npm test`, and `npm run build`; expect zero failures. The existing `TtsSubtitles.tsx` exhaustive-deps warning may remain.
- [ ] Commit all implementation files while leaving `data/db/would-not-recommend.db` unstaged.
