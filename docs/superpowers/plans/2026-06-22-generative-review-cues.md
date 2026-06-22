# Generative Review Cues Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed review bleep/bloop with paired, session-evolving Markov harmony and restrained synthetic mechanical accents, plus a browser audition page.

**Architecture:** A pure `GenerativeCueComposer` owns the weighted harmonic graph, 25 percent bounded variation, and paired entry/exit episode data. `AudioEngine` renders those immutable cue gestures through the existing Web Audio master/SFX path while preserving `playBleep()` and `playBloop()` as the bot integration boundary. A client-only `/audio-lab` route provides manual and sequenced audition controls.

**Tech Stack:** TypeScript, Vitest, Web Audio API, React 19, Next.js 15 App Router, Tailwind CSS 4

---

## File Structure

- Create `src/engine/generative-cue.ts`: pure graph, weighted selection, voicing, pairing, and diagnostic types.
- Create `scripts/generative-cue.test.ts`: deterministic behavioral tests for the composition model.
- Modify `src/engine/audio-engine.ts`: synthesize cue gestures and clean up scheduled nodes.
- Modify `src/lib/config.ts`: stable cue level, variation, and duration constants.
- Create `src/app/audio-lab/page.tsx`: development audition interface.
- Modify `scripts/audio-runtime.test.ts`: integration and listening-route contracts.
- Modify `package.json`: focused cue test command included by the audio runtime suite.
- Modify `docs/how-the-bot-works.md`: explain paired generative cue behavior and lab route.
- Modify `docs/llm-handoff/README.md`: record module ownership and session behavior.

### Task 1: Pure Generative Composer

**Files:**
- Create: `scripts/generative-cue.test.ts`
- Create: `src/engine/generative-cue.ts`
- Modify: `package.json`

- [ ] **Step 1: Write failing deterministic tests**

Create tests that instantiate the wished-for API:

```ts
const composer = new GenerativeCueComposer(sequenceRandom([0.1, 0.7, 0.3]), 0.25);
const entry = composer.beginEpisode();
const exit = composer.finishEpisode();

expect(exit.episodeId).toBe(entry.episodeId);
expect(CUE_STATE_IDS).toContain(entry.stateId);
expect(entry.voices.every((voice) => entry.pitchClasses.includes(voice.midi % 12))).toBe(true);
expect(Object.values(entry.variation).every((value) => value >= 0.75 && value <= 1.25)).toBe(true);
```

Also test that every exported graph edge targets a valid state, repeated episodes do not immediately reuse the same transition plus voicing when alternatives exist, and `finishEpisode()` without an entry returns a valid standalone exit.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx vitest run scripts/generative-cue.test.ts`

Expected: FAIL because `src/engine/generative-cue.ts` does not exist.

- [ ] **Step 3: Implement the minimal pure model**

Export these stable interfaces:

```ts
export type CuePhase = "entry" | "exit";
export type CueVoice = { midi: number; frequency: number; gain: number; onsetSec: number; durationSec: number };
export type MechanicalHit = { onsetSec: number; frequency: number; gain: number; decaySec: number };
export type CueGesture = {
  episodeId: number;
  phase: CuePhase;
  stateId: CueStateId;
  transitionName: string;
  pitchClasses: readonly number[];
  voices: CueVoice[];
  mechanicalHits: MechanicalHit[];
  variation: { timbre: number; envelope: number; spread: number; mechanics: number };
  durationSec: number;
};

export class GenerativeCueComposer {
  constructor(random: () => number = Math.random, variationAmount = 0.25);
  beginEpisode(): CueGesture;
  finishEpisode(): CueGesture;
  getStatus(): { stateId: CueStateId; transitionName: string; episodeId: number };
}
```

Use seven named pitch-class states and explicit weighted edges. Select with the injected random source, retain the paired exit gesture, and clamp random samples before converting them to the `[0.75, 1.25]` variation range.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npx vitest run scripts/generative-cue.test.ts`

Expected: all composer tests PASS.

- [ ] **Step 5: Add the focused command**

Add `"test:generative-cues": "vitest run scripts/generative-cue.test.ts"` and invoke it from `test:audio-runtime` before the existing runtime test.

- [ ] **Step 6: Commit the pure model**

```bash
git add package.json scripts/generative-cue.test.ts src/engine/generative-cue.ts
git commit -m "Add generative review cue composer"
```

### Task 2: Web Audio Cue Rendering

**Files:**
- Modify: `scripts/audio-runtime.test.ts`
- Modify: `src/engine/audio-engine.ts`
- Modify: `src/lib/config.ts`

- [ ] **Step 1: Extend the runtime contract test**

Assert that `AudioEngine` owns `GenerativeCueComposer`, obtains gestures from `beginEpisode()`/`finishEpisode()`, renders oscillators through a dedicated cue gain connected to the master, exposes `getCueStatus()`, and no longer creates `bleepBuffer`, `bloopBuffer`, or calls `generateTone`.

- [ ] **Step 2: Run and verify RED**

Run: `npm run test:audio-runtime`

Expected: FAIL because the engine still uses fixed generated buffers.

- [ ] **Step 3: Add stable cue configuration**

Add these values under `AUDIO`:

```ts
CUE_VOLUME: 0.38,
CUE_VARIATION_AMOUNT: 0.25,
CUE_FILTER_MIN_HZ: 900,
CUE_FILTER_MAX_HZ: 2_800,
```

- [ ] **Step 4: Render immutable gestures**

Create a cue gain during `init()`, connect it to `masterGain`, and construct the composer with `AUDIO.CUE_VARIATION_AMOUNT`. Make `playBleep()` call `beginEpisode()` and `playBloop()` call `finishEpisode()`.

For tonal voices, schedule sine/triangle oscillators at each voice frequency, apply short attack and exponential release envelopes, and filter the combined signal using the gesture timbre value. For mechanical hits, schedule short square-wave resonances with fast exponential decay. Track all active oscillators in a set; disconnect each source and its private nodes from `onended`, and stop remaining sources in `destroy()`.

- [ ] **Step 5: Run and verify GREEN**

Run: `npm run test:audio-runtime && npm run typecheck`

Expected: all audio runtime tests PASS and TypeScript exits 0.

- [ ] **Step 6: Commit the renderer**

```bash
git add scripts/audio-runtime.test.ts src/engine/audio-engine.ts src/lib/config.ts
git commit -m "Render paired generative review cues"
```

### Task 3: Audition Route

**Files:**
- Create: `src/app/audio-lab/page.tsx`
- Modify: `scripts/audio-runtime.test.ts`

- [ ] **Step 1: Add a failing route contract test**

Read `src/app/audio-lab/page.tsx` and assert it constructs `AudioEngine`, calls `init()` and `resume()` from a user action, provides entry, matching-exit, and succession controls, prints `getCueStatus()` diagnostics, clears succession timers, and destroys the engine on unmount.

- [ ] **Step 2: Run and verify RED**

Run: `npm run test:audio-runtime`

Expected: FAIL because the route does not exist.

- [ ] **Step 3: Build the client-only lab**

Implement a compact dark monospace page with buttons `Initialize audio`, `Play entry`, `Play matching exit`, `Play 6-episode succession`, and `Stop`. Keep `AudioEngine` in a ref, display state/transition/episode diagnostics after every gesture, and schedule the succession as alternating entry/exit calls with enough space to hear each decay.

- [ ] **Step 4: Run and verify GREEN**

Run: `npm run test:audio-runtime && npm run typecheck && npm run lint`

Expected: tests pass and both static checks exit 0.

- [ ] **Step 5: Commit the listening surface**

```bash
git add scripts/audio-runtime.test.ts src/app/audio-lab/page.tsx
git commit -m "Add generative cue audition lab"
```

### Task 4: Documentation And End-to-End Verification

**Files:**
- Modify: `docs/how-the-bot-works.md`
- Modify: `docs/llm-handoff/README.md`

- [ ] **Step 1: Document runtime behavior**

Describe the paired question/answer episode, session-local Markov memory, bounded 25 percent timbral and rhythmic variation, light mechanical accents, unchanged bot timing, pure composer ownership, and `/audio-lab` listening route.

- [ ] **Step 2: Run complete automated verification**

Run: `npm run test`

Expected: every test command exits 0.

Run: `npm run build`

Expected: Next.js production build exits 0 and lists `/audio-lab`.

- [ ] **Step 3: Verify in a browser**

Start the app with `npm run dev`, open `/audio-lab`, initialize audio, audition at least six paired episodes, and confirm diagnostic transitions change, entry/exit pairs are distinct but related, output remains controlled, Stop silences scheduled succession, and the browser console contains no errors.

- [ ] **Step 4: Commit documentation**

```bash
git add docs/how-the-bot-works.md docs/llm-handoff/README.md
git commit -m "Document generative review cue system"
```
