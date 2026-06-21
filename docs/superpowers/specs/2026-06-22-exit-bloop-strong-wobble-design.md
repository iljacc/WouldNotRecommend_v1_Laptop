# Exit Bloop And Strong Wobble Design

## Goal

Make the transition out of a spoken review read clearly in sound, and make the bot's embodied camera motion unmistakably visible without increasing Google Street View traffic.

## Return Sound Sequence

The existing one-second post-speech hold remains unchanged. When that hold completes, the bot enters `RETURN` and performs effects in this order:

1. Restore ambient audio.
2. Log the review and increment its counter.
3. Play the existing exit bloop.
4. Begin the pan back toward the saved road/wander heading.

The bloop is removed from `RETURN_COMPLETE`. That later transition only crossfades to the searching ambience and resumes walking after the return pan has completed.

## Strong Local Wobble

The existing CSS transform system remains the only source of breathing/wobble motion. Its target motion is approximately 28 px horizontally while stopped and 46 px while walking, with proportional vertical bob and rotation. The irregular keyframe path completes in roughly four seconds.

The animation remains active in every bot state and is stronger during `WANDER`. Scale overscan must continue covering the largest translations and rotations without revealing the fallback background.

The wobble must not call Google `setPov`, access Street View services, request imagery, add timers, or change review polling. `prefers-reduced-motion: reduce` continues disabling the wobble and its transform transition.

## Architecture

- `src/engine/state-machine.ts` moves `PLAY_BLOOP` from `RETURN_COMPLETE` into the `DELIVER_COMPLETE` effect list immediately before `PAN_TO_WANDER_HEADING`.
- `src/lib/config.ts` raises the default CSS motion inputs.
- `src/components/VisualEffects.tsx` maps those settings to the approved stopped/walking amplitudes and shorter cycle while preserving safe overscan.
- `src/app/globals.css` keeps the local irregular transform path and reduced-motion override.
- Existing behavior tests are extended to verify effect order, approximate computed amplitudes, cycle duration, overscan, and the absence of Google/network side effects.

## Verification

- Confirm the exit bloop plays before the return pan and is absent when walking resumes.
- Confirm computed motion is approximately 28 px stopped and 46 px walking with a roughly four-second cycle.
- Confirm overscan covers strong motion at landscape and portrait kiosk sizes.
- Confirm reduced motion still disables the CSS animation.
- Run focused cadence, CSS wobble, post-TTS hold, typecheck, lint, full tests, and production build.
- Update `docs/how-the-bot-works.md` and `docs/llm-handoff/README.md` with the revised sound timing and strong motion defaults.
