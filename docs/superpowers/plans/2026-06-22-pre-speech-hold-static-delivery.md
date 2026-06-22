# Pre-Speech Hold And Static Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hold 950 ms after the business pan before TTS and freeze the exact CSS wobble frame throughout spoken delivery.

**Architecture:** Keep pre-speech timing in the existing `ALIGN_HOLD_MS` setting. `getStreetViewEffectStyle` keeps the shared animation but returns `animationPlayState: "paused"` only for `DELIVER`, so the current transform frame freezes and resumes in `RETURN`.

**Tech Stack:** Next.js 15, React 19, TypeScript, CSS animations, Node behavior tests.

---

### Task 1: Add Failing Timing And Delivery-Freeze Tests

**Files:** `scripts/bot-cadence-behavior.test.mjs`, `scripts/street-view-css-wiggle.test.mjs`

- [ ] Assert `ALIGN_HOLD_MS === 950` and retain pan-then-hold-then-`DETECT_COMPLETE` ordering.
- [ ] Assert `DELIVER.animationPlayState === "paused"`, while `DETECT`, `RETURN`, and `WANDER` are `"running"` and keep nonzero wobble.
- [ ] Run focused tests and confirm failures on `450` and missing play state.

### Task 2: Implement And Document

**Files:** `src/lib/config.ts`, `src/components/VisualEffects.tsx`, `docs/how-the-bot-works.md`, `docs/llm-handoff/README.md`

- [ ] Set `ALIGN_HOLD_MS: 950`.
- [ ] Add `animationPlayState: botState === BotState.DELIVER ? "paused" : "running"` without changing motion amplitudes, duration, or reduced-motion handling.
- [ ] Document the 950 ms hold, static delivery frame, and resumed return wobble.
- [ ] Run focused tests, full `npm test`, build, and `git diff --check`; commit.

### Task 3: Merge Into Main

- [ ] Preserve the healthy local worktree database separately from Git history.
- [ ] Merge `codex/bot-review-flow` into `main` with autostash so existing tracked and untracked local work survives.
- [ ] Reapply local changes, verify the merged main test suite/build, and keep runtime database files uncommitted.
