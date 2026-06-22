# Installation Audio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stream shuffled city ambience with natural and teleport crossfades, and play a varied supplied two-foot recording for every successful Street View step.

**Architecture:** A build-time FFmpeg script converts source masters into a static manifest, streaming Opus ambience, and decoded WAV step pairs. Pure shuffle helpers isolate deterministic selection logic; `AudioEngine` owns dual ambient media decks, a duckable ambient bus, and buffered footstep playback, while `Bot` reports successful movement and teleport outcomes.

**Tech Stack:** Next.js 15, TypeScript, Web Audio API, HTMLAudioElement, Node.js scripts/tests, FFmpeg/FFprobe

---

## File Structure

- Create `scripts/prepare-audio-assets.cjs`: discover, deduplicate, inspect, normalize, transcode, and write the web manifest.
- Create `scripts/audio-assets.test.mjs`: verify generated manifest and duplicate removal.
- Create `scripts/audio-runtime.test.mjs`: verify shuffle, variation, and bot hook contracts.
- Create `src/engine/audio-shuffle.ts`: pure no-immediate-repeat shuffle bag and bounded variation helpers.
- Create `src/lib/audio-assets.ts`: typed static generated asset manifest.
- Modify `src/engine/audio-engine.ts`: dual streaming ambience, duck bus, teleport transitions, and buffered footsteps.
- Modify `src/engine/bot.ts`: successful-step playback and teleport result notifications.
- Modify `src/lib/config.ts`: audio timing and variation defaults.
- Modify `package.json`: preparation and focused audio test commands.
- Modify `docs/how-the-bot-works.md`: installation audio behavior.
- Modify `docs/llm-handoff/README.md`: asset workflow and runtime ownership.

### Task 1: Asset Preparation Pipeline

**Files:**
- Create: `scripts/prepare-audio-assets.cjs`
- Create: `scripts/audio-assets.test.mjs`
- Create: `src/lib/audio-assets.ts`
- Modify: `package.json`
- Generate: `public/audio/ambient/*`
- Generate: `public/audio/steps/*`

- [ ] **Step 1: Write a failing asset test**

Assert that `src/lib/audio-assets.ts` exports seven unique ambient URLs and twelve step URLs, that every referenced file exists, and that no manifest entry contains spaces or the duplicate `(1)` source suffix.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `node scripts/audio-assets.test.mjs`

Expected: FAIL because the manifest and generated files do not exist.

- [ ] **Step 3: Implement deterministic conversion**

Implement a CommonJS script that:

```js
const SOURCE = join(ROOT, "audio");
const OUTPUT = join(ROOT, "public", "audio");
const AMBIENT_TARGET_LUFS = -36;
const STEP_TARGET_LUFS = -27;
```

It must require `ffmpeg` and `ffprobe`, hash source files with SHA-256, keep the lexicographically first file for duplicate hashes, and sort all results before assigning `ambient-01.webm` and `step-01.wav` names. Use `loudnorm` with `linear=true`, resample to 48 kHz stereo, encode ambience with `libopus -b:a 160k`, encode steps as `pcm_s16le`, strip metadata/artwork with `-map_metadata -1 -vn`, and write a literal typed manifest:

```ts
export const AMBIENT_AUDIO_URLS = ["/audio/ambient/ambient-01.webm"] as const;
export const FOOTSTEP_AUDIO_URLS = ["/audio/steps/step-01.wav"] as const;
```

Add `audio:prepare` and `test:audio-assets` scripts to `package.json`, and include the focused test in `npm test`.

- [ ] **Step 4: Generate assets and pass the test**

Run: `npm run audio:prepare && npm run test:audio-assets`

Expected: seven ambient assets, twelve step assets, and PASS.

- [ ] **Step 5: Commit the asset pipeline**

Commit only the script, test, manifest, generated browser assets, and `package.json` changes.

### Task 2: Pure Shuffle And Variation Logic

**Files:**
- Create: `src/engine/audio-shuffle.ts`
- Create: `scripts/audio-runtime.test.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write failing runtime tests**

Test seeded selection through injected random values. Assert a bag emits every item once, never repeats across bag boundaries, returns `undefined` for an empty pool, and produces playback rates within `0.975..1.025` and gains within `-1.5..1.5` dB.

- [ ] **Step 2: Run and verify failure**

Run: `node scripts/audio-runtime.test.mjs`

Expected: FAIL because `audio-shuffle.ts` is absent.

- [ ] **Step 3: Implement pure helpers**

Export:

```ts
export class ShuffleBag<T> {
  constructor(items: readonly T[], random?: () => number);
  next(): T | undefined;
}

export function randomBetween(min: number, max: number, random?: () => number): number;
export function decibelsToGain(decibels: number): number;
```

Use Fisher-Yates shuffling and rotate/swap the first entry when it equals the prior bag's final entry.

- [ ] **Step 4: Pass the focused runtime tests**

Run: `npm run test:audio-runtime`

Expected: PASS.

- [ ] **Step 5: Commit pure audio helpers**

Commit the helper, focused test, and package script.

### Task 3: Streaming Ambience And Buffered Footsteps

**Files:**
- Modify: `src/engine/audio-engine.ts`
- Modify: `src/lib/config.ts`
- Modify: `scripts/audio-runtime.test.mjs`

- [ ] **Step 1: Extend runtime contract tests**

Assert the engine imports both manifest arrays, creates two media element sources, owns a separate ambient bus and footsteps bus, uses `ShuffleBag`, and exposes `playFootsteps`, `beginTeleportAmbient`, and `completeTeleportAmbient`.

- [ ] **Step 2: Run and verify failure**

Run: `npm run test:audio-runtime`

Expected: FAIL because `AudioEngine` still generates synthetic drones.

- [ ] **Step 3: Add focused configuration**

Add these defaults to `AUDIO`:

```ts
AMBIENT_CROSSFADE_MS: 8_000,
AMBIENT_RECOVERY_FADE_MIN_MS: 1_000,
FOOTSTEP_VOLUME: 0.5,
FOOTSTEP_RATE_VARIATION: 0.025,
FOOTSTEP_GAIN_VARIATION_DB: 1.5,
```

- [ ] **Step 4: Replace synthetic ambient layers**

Create two `Audio` decks with `preload = "auto"`, route them through individual gain nodes into `ambientBusGain`, and connect that bus to the master. `startAmbient()` selects the first shuffled URL, begins at gain zero, and fades to `AMBIENT_SEARCHING_VOLUME`. Arm the next transition from `duration - AMBIENT_CROSSFADE_MS / 1000`, with `ended` as fallback. A transition starts the inactive deck at time zero, ramps deck gains in opposite directions, then pauses and resets the outgoing deck.

Make the legacy `crossfadeTo()` effects set the ambient bus's searching or processing level rather than switching recordings. Make `duckAmbient()` and `unduckAmbient()` ramp this same bus.

- [ ] **Step 5: Add footsteps**

During `init()`, fetch all step URLs independently and decode successful responses. `playFootsteps()` selects one decoded buffer from a shuffle bag, applies bounded playback-rate and dB gain variation, and routes the source through `footstepsGain` to master. One failed fetch logs once and does not reject initialization.

- [ ] **Step 6: Add teleport transition methods**

`beginTeleportAmbient(fadeOutMs)` cancels natural transitions and fades the active deck down using at least `AMBIENT_RECOVERY_FADE_MIN_MS`. `completeTeleportAmbient(changed, fadeInMs)` either starts the next shuffled track from zero when `changed` is true or resumes the current track when false, then fades it to full deck gain using the same minimum.

- [ ] **Step 7: Make cleanup exhaustive**

`destroy()` clears ambient timers/listeners, pauses and resets both decks, stops active buffer sources, disconnects nodes, and closes the context without throwing when initialization was partial.

- [ ] **Step 8: Run focused tests and typecheck**

Run: `npm run test:audio-runtime && npm run typecheck`

Expected: PASS.

- [ ] **Step 9: Commit the audio engine**

Commit the engine, config, and updated tests.

### Task 4: Bot Movement And Teleport Hooks

**Files:**
- Modify: `src/engine/bot.ts`
- Modify: `scripts/audio-runtime.test.mjs`

- [ ] **Step 1: Add failing hook assertions**

Assert `onWanderStep()` calls `this.audio.playFootsteps()` only after the existing running/state guard. Assert `handleTeleport()` calls `beginTeleportAmbient(fadeOut)`, passes `resolvedDestination !== null` to `completeTeleportAmbient`, and no longer calls shared-master `fadeToSilence`/`fadeFromSilence` for teleport visuals.

- [ ] **Step 2: Run and verify failure**

Run: `npm run test:audio-runtime`

Expected: FAIL on missing bot hooks.

- [ ] **Step 3: Wire successful movement**

Call `this.audio.playFootsteps()` at the start of the guarded successful-step handler, before counters and activity logging.

- [ ] **Step 4: Wire teleport outcomes**

Begin ambient fade with the teleport. After destination resolution, call:

```ts
this.audio.completeTeleportAmbient(resolvedDestination !== null, fadeIn);
```

This advances the shuffle only for a real Street View change and restores the prior recording after failure.

- [ ] **Step 5: Pass focused tests**

Run: `npm run test:audio-runtime && npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit bot integration**

Commit `bot.ts` and the updated runtime contract test.

### Task 5: Documentation And Full Verification

**Files:**
- Modify: `docs/how-the-bot-works.md`
- Modify: `docs/llm-handoff/README.md`

- [ ] **Step 1: Document artist-facing behavior**

Explain the seven-track shuffled rotation, eight-second natural crossfade, teleport advance-on-success rule, speech ducking, and one varied supplied pair per successful movement.

- [ ] **Step 2: Document maintainer workflow**

Record the `audio/` source folders, `npm run audio:prepare`, generated `public/audio/` outputs, FFmpeg dependency, and `AudioEngine` ownership.

- [ ] **Step 3: Run focused and repository checks**

Run:

```bash
npm run test:audio-assets
npm run test:audio-runtime
npm run typecheck
npm run lint
npm run build
```

Expected: all commands pass. If the build reports existing environment requirements, record the exact blocker without changing unrelated configuration.

- [ ] **Step 4: Inspect the final diff**

Run `git diff --check` and `git status --short`. Confirm no source masters, database files, or unrelated working-tree changes are staged.

- [ ] **Step 5: Commit documentation**

Commit only the two updated documentation files.
