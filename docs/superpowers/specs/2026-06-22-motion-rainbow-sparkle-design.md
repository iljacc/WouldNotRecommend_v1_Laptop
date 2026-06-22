# Motion, Rainbow, And Counter Sparkle Design

## Behavior

- Walking wobble uses approximately 69 px horizontal and 9 px vertical offset, retains the current walking rotation, and completes its irregular cycle in eight seconds.
- Stationary, reading, detect-turn, and return-turn states use approximately 14 px horizontal and 5.5 px vertical offset, half the current stationary rotation, and the same eight-second cycle.
- The wobble animation remains active through every state. Typed CSS custom properties interpolate profile changes so turns do not produce a hard visual cut.
- Post-TTS stillness increases from one second to two seconds total. The exit bloop then starts as the return pan begins.
- During `DELIVER`, the complete Processing indicator cycles smoothly through pastel rainbow colors once per second. Reduced motion uses one stable pastel color and no glyph pulse.
- A session review-count increment triggers four to six pastel sparkles and a diagonal shimmer around the review counter for about 900 ms. Decorative effects are `aria-hidden` and do not alter database refresh behavior.

## Constraints

Street View motion remains a CSS transform on the rendered layer. It must not add `setPov`, Google service calls, imagery requests, browser animation timers, or review polling. Overscan must contain all viewport corners across every keyframe, profile, and supported kiosk orientation. Reduced motion disables Street View wobble, profile transitions, rainbow animation, shimmer, and sparkle movement.

## Verification

Tests cover exact motion profiles, eight-second duration, turn-state persistence, inverse-corner overscan, two-second post-TTS hold, pastel rainbow styling, one-shot counter decoration, reduced motion, and local-only Street View behavior. Update both behavior documents, run the full test suite and production build, then restart and verify `/bot`.
