# Motion, Rainbow, And Counter Sparkle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebalance and slow the CSS wobble, preserve it smoothly through turns, add a second post-TTS stillness second, replace complaint flashing with a pastel rainbow, and celebrate review-count increments with sparkles plus shimmer.

**Architecture:** `VisualEffects` computes independent horizontal, vertical, and rotation profiles while registered CSS custom properties interpolate state changes without restarting the shared animation. The HUD keys `ReviewStatsChip` from the immediate session review count so decorative CSS animations remount exactly once per increment without timers or database changes.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS 4, CSS keyframes, Vitest, Node behavior assertions.

---

### Task 1: Rebalance Continuous Motion

**Files:** `scripts/street-view-css-wiggle.test.mjs`, `src/lib/config.ts`, `src/components/VisualEffects.tsx`, `src/app/globals.css`

- [ ] Add failing runtime assertions for WANDER x/y/rotation `68.97/9/0.908`, non-WANDER `14.02/5.49/0.277`, eight-second animation, identical DETECT/DELIVER/RETURN profiles, registered custom properties, profile transitions, reduced motion, inverse-corner overscan, and zero side effects.
- [ ] Run `npm run test:street-view-css-wiggle` and confirm failure.
- [ ] Set drift to `1.25`; compute WANDER intensities `1.5/0.5/1` and non-WANDER intensities `0.305/0.305/0.305`; raise horizontal cap to cover 68.97 px.
- [ ] Register length/angle/number custom properties and transition them while retaining the same `wander-look-float` animation through every state.
- [ ] Run focused test, typecheck, and lint; commit `Rebalance continuous Street View motion`.

### Task 2: Extend Stillness And Add Rainbow Processing

**Files:** `scripts/post-tts-hold-behavior.test.mjs`, `scripts/bot-cadence-behavior.test.mjs`, `scripts/mode-indicator-behavior.test.tsx`, `src/lib/config.ts`, `src/components/HUD.tsx`, `src/app/globals.css`

- [ ] Change failing hold assertion from `1000` to `2000` and rainbow assertions to a delivery-only `processing-rainbow-cycle` with six pastel colors on a one-second loop and stable lavender reduced-motion behavior.
- [ ] Run `npm run test:post-tts-hold` and `npm run test:cadence`; confirm failure.
- [ ] Set `POST_TTS_HOLD_MS: 2_000`, rename the delivery class/keyframes, preserve text/glyph color inheritance, and disable rainbow plus glyph pulse for reduced motion.
- [ ] Run focused tests, typecheck, and lint; commit `Extend review hold and add rainbow processing`.

### Task 3: Celebrate Review Counter Updates

**Files:** `scripts/mode-indicator-behavior.test.tsx`, `src/app/bot/page.tsx`, `src/components/HUD.tsx`, `src/components/ReviewStatsChip.tsx`, `src/app/globals.css`

- [ ] Add failing render assertions that HUD keys the chip from `reviewCount`, passes a celebration flag only after the first increment, renders six `aria-hidden` pastel sparkles and a clipped shimmer, and disables them under reduced motion.
- [ ] Run `npm run test:cadence` and confirm failure.
- [ ] Pass `uiState.reviewCount` through HUD, key the chip by count, and add CSS-only 900 ms sparkle/shimmer markup and animations without timers or data changes.
- [ ] Run cadence, typecheck, and lint; commit `Celebrate review counter increments`.

### Task 4: Documentation And Verification

**Files:** `docs/how-the-bot-works.md`, `docs/llm-handoff/README.md`

- [ ] Document exact motion profiles, eight-second cycle, turn continuity, two-second hold, pastel rainbow, counter celebration, reduced motion, and local-only constraints.
- [ ] Run `npm test`, `npm run build`, and `git diff --check`.
- [ ] Restart the dev server and verify `http://localhost:3000/bot` returns HTTP 200.
- [ ] Commit `Document refined motion and celebration flow`.
