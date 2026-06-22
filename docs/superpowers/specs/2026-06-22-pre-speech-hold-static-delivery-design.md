# Pre-Speech Hold And Static Delivery Design

## Behavior

- After the business-facing camera pan completes, the bot remains in `DETECT` for 950 ms before entering `DELIVER` and starting TTS.
- During `DELIVER`, the existing CSS-only Street View wobble animation is paused. Pausing preserves the exact current transformed frame without snapping to center.
- When the bot enters `RETURN`, the animation resumes while the camera pans back toward the road.
- The existing two-second post-TTS hold, exit bloop ordering, counter celebration, and all Google/API constraints remain unchanged.

## Verification

Regression tests cover the 950 ms alignment hold, paused delivery animation, resumed turn animation, reduced motion, and unchanged local-only behavior. Update behavior docs, run full tests/build, verify `/bot`, then merge the feature branch into `main` while preserving existing local changes.
