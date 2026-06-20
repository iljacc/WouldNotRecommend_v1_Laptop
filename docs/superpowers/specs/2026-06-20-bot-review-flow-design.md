# Bot Review Flow Design

## Goal

Make review discovery and delivery feel more embodied and deliberate without increasing Google Street View imagery requests or local review polling.

## Behavior

When the bot finds a qualifying review, it stops walking and plays the existing intro bleep before moving the camera. It then turns toward the business over 2.5 seconds with gentle acceleration and deceleration, followed by the existing short alignment hold before speech begins.

While the review is spoken, the entire Processing indicator, including its text and animated glyph, flashes between its normal yellow and red. Other processing phases retain their current presentation.

After speech ends, the bot remains stopped for one second. It then pans back toward its wander heading, plays the existing exit sound, and resumes walking. The current one-second post-TTS hold is retained rather than duplicated.

## Local Breathing Motion

The rendered Street View layer has a continuous, subtle breathing drift in every bot state. The motion is quieter while the bot is stopped, aligning, speaking, returning, or teleporting, and slightly stronger while it is wandering.

This effect is implemented only with CSS transforms on the rendered Street View container. A small scale overscan prevents transformed edges from becoming visible. The breathing effect must not call `setPov`, alter panorama navigation, request additional Street View imagery, or change review query cadence.

## Architecture

- `src/engine/state-machine.ts` emits the existing bleep effect on the transition from `WANDER` to `DETECT`, before the business pan effect.
- `src/lib/config.ts` changes the business alignment pan duration to 2,500 ms.
- `src/engine/street-view-controller.ts` uses a softer easing curve for the business-facing pan while preserving the existing controlled heading animation path.
- The bot page or Street View wrapper applies state-aware CSS classes for quiet breathing and stronger wandering motion.
- The mode indicator receives enough state information to apply the red/yellow complaint animation only during `DELIVER`.
- Existing settings hooks remain the source of runtime timing values. No new global state is introduced.

## Failure And Accessibility Behavior

If audio is unavailable, the transition and camera pan continue normally. CSS animation does not participate in bot state timing, so missing animation support cannot stall the flow. Reduced-motion preferences should suppress or greatly reduce the breathing and flashing animations without changing bot behavior.

## Verification

- Verify the state-machine effect order is stop, bleep, crossfade, then business pan.
- Verify the business-facing pan uses the 2.5-second configured duration and completes before the alignment hold and speech.
- Verify breathing is present in all states, is stronger only during wandering, and does not produce per-frame Google `setPov` calls.
- Verify the complete Processing indicator flashes yellow/red only during `DELIVER`.
- Verify the existing one-second post-TTS hold occurs once before the return pan.
- Run `npm run typecheck`, `npm run lint`, and `npm run build` after implementation.
- Update `docs/how-the-bot-works.md` and `docs/llm-handoff/README.md` with the changed installation behavior.
