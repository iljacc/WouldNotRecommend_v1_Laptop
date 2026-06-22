# Exit Bloop And Strong Wobble Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Play the exit bloop before the road-facing return pan and make the existing CSS-only wobble strongly visible at approximately 28 px stopped and 46 px walking on a four-second cycle.

**Architecture:** Keep sound sequencing in the existing state-machine effect lists and keep all visual motion in `getStreetViewEffectStyle` plus the existing CSS keyframes. Raise configuration defaults and the stopped-state multiplier without adding Google POV updates, browser timers, imagery requests, or new state.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS 4, Node assertion scripts, Vitest.

---

### Task 1: Move Exit Bloop Before Return Pan

**Files:**
- Modify: `scripts/bot-cadence-behavior.test.mjs`
- Modify: `src/engine/state-machine.ts`

- [ ] **Step 1: Add failing transition-order assertions**

Add these state block extractions and assertions to `scripts/bot-cadence-behavior.test.mjs`:

```js
const deliverCompleteBlock = stateMachine.match(
  /case BotState\.DELIVER:[\s\S]*?event\.type === "DELIVER_COMPLETE"[\s\S]*?case BotState\.RETURN:/,
);
assert.ok(deliverCompleteBlock, "Missing DELIVER_COMPLETE transition");
assert.match(
  deliverCompleteBlock[0],
  /UNDUCK_AMBIENT[\s\S]*LOG_REVIEW[\s\S]*INCREMENT_COUNTER[\s\S]*PLAY_BLOOP[\s\S]*PAN_TO_WANDER_HEADING/,
  "the exit bloop should play immediately before the return pan",
);

const returnCompleteBlock = stateMachine.match(
  /case BotState\.RETURN:[\s\S]*?event\.type === "RETURN_COMPLETE"[\s\S]*?case BotState\.TELEPORT:/,
);
assert.ok(returnCompleteBlock, "Missing RETURN_COMPLETE transition");
assert.doesNotMatch(
  returnCompleteBlock[0],
  /PLAY_BLOOP/,
  "walking resume must not delay the exit bloop until after the pan",
);
```

- [ ] **Step 2: Run the cadence test and confirm failure**

Run: `npm run test:cadence`

Expected: FAIL because `PLAY_BLOOP` is currently in `RETURN_COMPLETE` rather than `DELIVER_COMPLETE`.

- [ ] **Step 3: Reorder the state-machine effects**

Change `DELIVER_COMPLETE` in `src/engine/state-machine.ts` to:

```ts
effects: [
  { type: "UNDUCK_AMBIENT" },
  { type: "LOG_REVIEW" },
  { type: "INCREMENT_COUNTER" },
  { type: "PLAY_BLOOP" },
  { type: "PAN_TO_WANDER_HEADING" },
],
```

Change `RETURN_COMPLETE` to:

```ts
effects: [
  { type: "CROSSFADE_TO_A" },
  { type: "START_WALKING" },
],
```

- [ ] **Step 4: Run sound-flow verification**

Run: `npm run test:cadence && npm run test:post-tts-hold && npm run typecheck`

Expected: all commands PASS. The post-TTS test must still report a single configured 1,000 ms hold before `DELIVER_COMPLETE`.

- [ ] **Step 5: Commit the sound-order change**

```bash
git add scripts/bot-cadence-behavior.test.mjs src/engine/state-machine.ts
git commit -m "Play exit bloop before return pan"
```

### Task 2: Raise CSS-Only Wobble To Very Strong

**Files:**
- Modify: `scripts/street-view-css-wiggle.test.mjs`
- Modify: `src/lib/config.ts`
- Modify: `src/components/VisualEffects.tsx`

- [ ] **Step 1: Replace subtle-motion assertions with strong computed targets**

In `scripts/street-view-css-wiggle.test.mjs`, replace the old yaw/pitch upper-bound assertions and add computed-style assertions:

```js
assert(
  Number.isFinite(yaw) && yaw >= 12 && yaw <= 12.2,
  "Default yaw input should produce very strong walking motion.",
);
assert(
  Number.isFinite(pitch) && pitch >= 1.7 && pitch <= 1.9,
  "Default pitch input should produce a visible vertical bob.",
);

const wanderY = Number.parseFloat(wanderStyle["--wander-float-y"]);
const stoppedY = Number.parseFloat(stoppedTeleportStyle["--wander-float-y"]);
const wanderRotate = Number.parseFloat(
  wanderStyle["--wander-float-rotate"],
);
const stoppedRotate = Number.parseFloat(
  stoppedTeleportStyle["--wander-float-rotate"],
);
const wanderDuration = Number.parseFloat(
  String(wanderStyle.animation).match(/wander-look-float\s+([0-9.]+)s/)?.[1] ?? "NaN",
);

assert(
  wanderX >= 45 && wanderX <= 47,
  `Walking wobble should be approximately 46px, received ${wanderX}px.`,
);
assert(
  stoppedX >= 27 && stoppedX <= 29,
  `Stopped wobble should be approximately 28px, received ${stoppedX}px.`,
);
assert(
  wanderY >= 17 && stoppedY >= 10,
  "Strong wobble should retain a proportional vertical bob.",
);
assert(
  wanderRotate >= 0.85 && stoppedRotate >= 0.5,
  "Strong wobble should retain visible local rotation.",
);
assert(
  wanderDuration >= 3.8 && wanderDuration <= 4.2,
  `Strong wobble should complete in roughly four seconds, received ${wanderDuration}s.`,
);
```

Keep the existing runtime side-effect poison checks, reduced-motion assertions, and representative viewport overscan checks.

- [ ] **Step 2: Run the wobble test and confirm failure**

Run: `npm run test:street-view-css-wiggle`

Expected: FAIL because current defaults compute about 4.56 px walking, 1.6 px stopped, and a 23.8-second cycle.

- [ ] **Step 3: Raise default motion inputs**

Set the defaults in `src/lib/config.ts` to:

```ts
WANDER_LOOK_SWAY_DEG: 12.1,
WANDER_LOOK_PITCH_SWAY_DEG: 1.8,
WANDER_LOOK_DRIFT: 2.5,
```

Update the nearby comments so they describe CSS translation/rotation intensity rather than implying a slight real POV yaw.

- [ ] **Step 4: Raise stopped intensity and allow a four-second cycle**

In `src/components/VisualEffects.tsx`, change:

```ts
const intensity = botState === BotState.WANDER ? 1 : 0.61;
```

and change the animation-duration clamp to:

```ts
const durationSec = Math.min(34, Math.max(4, 10 / drift));
```

Retain the current maximum amplitude caps and overscan formula:

```ts
const xPx = Math.min(54, sway * 3.8) * intensity;
const yPx = Math.min(28, pitchSway * 10) * intensity;
const rotateDeg = Math.min(1.05, sway * 0.075) * intensity;
const amplitudePadding =
  xPx * 0.00175 + yPx * 0.00175 + rotateDeg * 0.012;
const scale = 1 + Math.max(0.03, amplitudePadding);
```

- [ ] **Step 5: Run visual-motion verification**

Run: `npm run test:street-view-css-wiggle && npm run typecheck && npm run lint`

Expected: wobble test and typecheck PASS. Lint may report the existing `TtsSubtitles.tsx` exhaustive-deps warning but must report zero errors.

- [ ] **Step 6: Commit the strong wobble change**

```bash
git add scripts/street-view-css-wiggle.test.mjs src/lib/config.ts src/components/VisualEffects.tsx
git commit -m "Strengthen local Street View wobble"
```

### Task 3: Update Behavior Documentation And Verify

**Files:**
- Modify: `docs/how-the-bot-works.md`
- Modify: `docs/llm-handoff/README.md`

- [ ] **Step 1: Update the state-flow documentation**

In `docs/how-the-bot-works.md`, change the Return description to:

```text
After the one-second post-speech hold, play the exit bloop, pan back toward the wander heading, then resume walking when the pan completes.
```

Change the breathing paragraph to identify the strong defaults:

```text
The rendered Street View layer has a strong, continuous CSS-only wobble in every bot state: approximately 28 px while stopped and 46 px while walking on a roughly four-second irregular cycle. It remains entirely local and does not make per-frame setPov calls, request imagery, or change API or review polling cadence.
```

Make the corresponding updates in `docs/llm-handoff/README.md`, explicitly preserving the reduced-motion override and CSS-only constraint.

- [ ] **Step 2: Run focused and aggregate verification**

Run:

```bash
npm run test:cadence
npm run test:street-view-css-wiggle
npm run test:post-tts-hold
npm run typecheck
npm run lint
npm test
npm run build
git diff --check
```

Expected: all tests, typecheck, and build PASS. Lint may report the existing `TtsSubtitles.tsx` warning but must have zero errors. The local Piper runtime junctions already present in this worktree allow `test:piper-worker` to complete.

- [ ] **Step 3: Commit documentation**

```bash
git add docs/how-the-bot-works.md docs/llm-handoff/README.md
git commit -m "Document exit sound and strong wobble"
```

- [ ] **Step 4: Confirm the live development server hot-reloaded**

Run:

```powershell
Get-Content -Tail 40 .codex\dev-server.stdout.log
Get-Content -Tail 40 .codex\dev-server.stderr.log
```

Expected: the running Next.js development server reports successful recompilation with no new runtime error. The updated `/bot` remains available at `http://localhost:3000/bot`.
