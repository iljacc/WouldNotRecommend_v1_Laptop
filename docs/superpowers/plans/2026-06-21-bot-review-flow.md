# Bot Review Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make review delivery feel more embodied with an entry bleep, a gentler 2.5-second turn, continuous local breathing motion, a red/yellow complaint indicator, and the existing one-second post-speech pause.

**Architecture:** Keep sequencing in the state machine and bot engine, POV animation in `StreetViewController`, and presentation effects in `VisualEffects`, `HUD`, and global CSS. Extend the existing source-assertion tests so the new behavior is verified without adding dependencies or changing Google Street View request behavior.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS 4, Google Maps JavaScript API, Node assertion scripts.

---

### Task 1: Entry Bleep And Natural Business Pan

**Files:**
- Modify: `scripts/bot-cadence-behavior.test.mjs`
- Modify: `src/engine/state-machine.ts`
- Modify: `src/lib/config.ts`
- Modify: `src/engine/street-view-controller.ts`

- [ ] **Step 1: Write failing sequencing and pan assertions**

Add assertions to `scripts/bot-cadence-behavior.test.mjs` that require a 2,500 ms alignment and verify the `BUSINESS_DETECTED` effect order:

```js
assert.equal(
  numericConst("ALIGN_PAN_MS"),
  2500,
  "the business-facing turn should take 2.5 seconds",
);

const detectedEffects = businessDetectedBlock[0];
assert.match(
  detectedEffects,
  /STOP_WALKING[\s\S]*PLAY_BLEEP[\s\S]*CROSSFADE_TO_B[\s\S]*PAN_TO_BUSINESS/,
  "review detection should stop, bleep, crossfade, then begin the business pan",
);

assert.match(
  controller,
  /function easeInOutSine[\s\S]*panToHeading[\s\S]*easeInOutSine/,
  "scripted review pans should use gentle sine easing",
);
```

- [ ] **Step 2: Run the cadence test and verify failure**

Run: `npm run test:cadence`

Expected: FAIL because `ALIGN_PAN_MS` is 1,350, `PLAY_BLEEP` is absent from the detection transition, and `panToHeading` uses quint easing.

- [ ] **Step 3: Implement the entry bleep and gentle pan**

In `src/engine/state-machine.ts`, make the detection effects execute in this order:

```ts
effects: [
  { type: "STOP_WALKING" },
  { type: "PLAY_BLEEP" },
  { type: "CROSSFADE_TO_B" },
  { type: "PAN_TO_BUSINESS", bearingDeg: event.business.bearing },
],
```

In `src/lib/config.ts`, set:

```ts
ALIGN_PAN_MS: 2_500,
```

In `src/engine/street-view-controller.ts`, add the gentle easing function and use it for `panToHeading`:

```ts
function easeInOutSine(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return -(Math.cos(Math.PI * x) - 1) / 2;
}

return this.runHeadingMotion(fromHeading, targetHeading, durationMs, easeInOutSine);
```

Keep `easeInOutQuint` for linked Street View step blending.

- [ ] **Step 4: Run the cadence and detect-timeout tests**

Run: `npm run test:cadence && npm run test:detect-timeout`

Expected: both commands PASS. The 6,000 ms detection cap remains longer than the 2,500 ms pan plus 450 ms hold.

- [ ] **Step 5: Commit the sequencing change**

```bash
git add scripts/bot-cadence-behavior.test.mjs src/engine/state-machine.ts src/lib/config.ts src/engine/street-view-controller.ts
git commit -m "Refine review detection transition"
```

### Task 2: Continuous CSS-Only Breathing Motion

**Files:**
- Modify: `scripts/street-view-css-wiggle.test.mjs`
- Modify: `src/components/VisualEffects.tsx`
- Modify: `src/app/bot/page.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Write failing breathing-motion assertions**

Extend `scripts/street-view-css-wiggle.test.mjs` to read the bot page and require continuous, state-sensitive local animation:

```js
const page = readFileSync(join(root, "src/app/bot/page.tsx"), "utf8");

assert.doesNotMatch(
  effects,
  /botState === BotState\.WANDER\s*&&\s*teleportPhase === "none"/,
  "breathing motion should not be limited to wandering",
);
assert.match(
  effects,
  /botState === BotState\.WANDER\s*\?\s*1\s*:\s*0\.[0-9]+/,
  "walking should use stronger breathing amplitude than stopped states",
);
assert.match(
  page,
  /street-view-breathing/,
  "the Street View wrapper should expose a reduced-motion CSS hook",
);
assert.match(
  css,
  /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*\.street-view-breathing/,
  "reduced-motion preferences should suppress breathing",
);
```

Keep the existing assertion that `VisualEffects.tsx` contains no `setPov` call.

- [ ] **Step 2: Run the CSS wiggle test and verify failure**

Run: `npm run test:street-view-css-wiggle`

Expected: FAIL because floating is currently limited to `WANDER` with no reduced-motion hook.

- [ ] **Step 3: Make breathing continuous with state-dependent intensity**

In `src/components/VisualEffects.tsx`, enable the animation whenever its setting is enabled and scale translation/rotation amplitudes by state:

```ts
const floatEnabled = Boolean(streetView?.wanderLookFloatEnabled);
const intensity = botState === BotState.WANDER ? 1 : 0.35;
const xPx = Math.min(54, sway * 3.8) * intensity;
const yPx = Math.min(28, pitchSway * 10) * intensity;
const rotateDeg = Math.min(1.05, sway * 0.075) * intensity;
```

Continue using the existing `wander-look-float` keyframes and CSS custom properties. Do not add timers, `setPov`, panorama calls, or fetches.

In `src/app/bot/page.tsx`, add the CSS hook to the transformed Street View wrapper:

```tsx
className="street-view-breathing absolute inset-0 z-[1] h-full w-full"
```

In `src/app/globals.css`, suppress the local transform animation for reduced motion:

```css
@media (prefers-reduced-motion: reduce) {
  .street-view-breathing {
    animation: none !important;
    transform: scale(1) !important;
  }
}
```

- [ ] **Step 4: Run the CSS wiggle test**

Run: `npm run test:street-view-css-wiggle`

Expected: PASS, including the no-`setPov` assertion.

- [ ] **Step 5: Commit the breathing change**

```bash
git add scripts/street-view-css-wiggle.test.mjs src/components/VisualEffects.tsx src/app/bot/page.tsx src/app/globals.css
git commit -m "Keep Street View breathing motion active"
```

### Task 3: Red And Yellow Complaint Indicator

**Files:**
- Modify: `scripts/bot-cadence-behavior.test.mjs`
- Modify: `src/components/HUD.tsx`
- Modify: `src/components/ModeIndicator.tsx`
- Modify: `src/components/ModePulseGlyph.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Write failing complaint-indicator assertions**

Extend `scripts/bot-cadence-behavior.test.mjs` to read the HUD and mode components:

```js
const hud = readFileSync(join(root, "src/components/HUD.tsx"), "utf8");
const modeIndicator = readFileSync(
  join(root, "src/components/ModeIndicator.tsx"),
  "utf8",
);
const modeGlyph = readFileSync(
  join(root, "src/components/ModePulseGlyph.tsx"),
  "utf8",
);
const globalCss = readFileSync(join(root, "src/app/globals.css"), "utf8");

assert.match(
  hud,
  /botState === BotState\.DELIVER[\s\S]*processing-complaint-flash/,
  "the complete HUD processing group should flash only during review delivery",
);
assert.match(modeIndicator, /text-yellow-400/, "Processing should use yellow normally");
assert.match(modeIndicator, /text-current/, "DELIVER should inherit the flashing group color");
assert.match(modeGlyph, /text-current/, "the DELIVER glyph should inherit the flashing group color");
assert.match(
  globalCss,
  /@keyframes\s+processing-complaint-flash[\s\S]*#facc15[\s\S]*#ef4444/,
  "complaint animation should alternate yellow and red",
);
```

- [ ] **Step 2: Run the cadence test and verify failure**

Run: `npm run test:cadence`

Expected: FAIL because no delivery-only complaint class or red/yellow animation exists.

- [ ] **Step 3: Apply one complaint state to text and glyph**

In `src/components/HUD.tsx`, apply the animation to the group only during `DELIVER`:

```tsx
<div
  className={`flex items-center gap-2.5 ${
    botState === BotState.DELIVER ? "processing-complaint-flash" : ""
  }`}
>
```

In `ModeIndicator.tsx`, accept `state: BotState`, use yellow for ordinary Processing, and use `text-current` for active delivery. Pass `state={botState}` from `HUD.tsx`.

In `ModePulseGlyph.tsx`, use `text-current` when `state === BotState.DELIVER`; keep existing white, search, and teleport colors in other states.

In `src/app/globals.css`, add:

```css
@keyframes processing-complaint-flash {
  0%,
  100% {
    color: #facc15;
  }
  50% {
    color: #ef4444;
  }
}

.processing-complaint-flash {
  animation: processing-complaint-flash 850ms ease-in-out infinite;
}

@media (prefers-reduced-motion: reduce) {
  .processing-complaint-flash {
    animation: none;
    color: #ef4444;
  }
}
```

- [ ] **Step 4: Run cadence, typecheck, and lint**

Run: `npm run test:cadence && npm run typecheck && npm run lint`

Expected: all commands PASS.

- [ ] **Step 5: Commit the complaint indicator**

```bash
git add scripts/bot-cadence-behavior.test.mjs src/components/HUD.tsx src/components/ModeIndicator.tsx src/components/ModePulseGlyph.tsx src/app/globals.css
git commit -m "Flash processing indicator during complaints"
```

### Task 4: Documentation And Full Verification

**Files:**
- Modify: `docs/how-the-bot-works.md`
- Modify: `docs/llm-handoff/README.md`

- [ ] **Step 1: Update installation behavior documentation**

In `docs/how-the-bot-works.md`, document this order:

```text
Detect: stop, play the entry bleep, turn toward the business over 2.5 seconds, then hold briefly.
Deliver: speak while the full Processing indicator flashes yellow/red.
Return: hold for one second after speech, pan back, play the exit sound, and walk.
```

Also state that local breathing motion remains active in every state, becomes slightly stronger while walking, and never drives Google `setPov` updates.

Mirror the same behavioral constraints in `docs/llm-handoff/README.md` so future work preserves the sound order and CSS-only animation.

- [ ] **Step 2: Verify the one-second hold remains singular**

Run: `npm run test:post-tts-hold`

Expected: PASS with `POST_TTS_HOLD_MS` equal to 1,000 and one wait before `DELIVER_COMPLETE`.

- [ ] **Step 3: Run the complete test suite**

Run: `npm test`

Expected: PASS with no failed assertion, TypeScript error, or lint error.

- [ ] **Step 4: Build the production app**

Run: `npm run build`

Expected: Next.js production build completes successfully.

- [ ] **Step 5: Review the final diff without disturbing unrelated work**

Run: `git diff --check && git status --short`

Expected: no whitespace errors. Confirm only files from this plan are staged or committed; preserve the pre-existing local database and Windows installation changes.

- [ ] **Step 6: Commit documentation**

```bash
git add docs/how-the-bot-works.md docs/llm-handoff/README.md
git commit -m "Document refined bot review flow"
```
