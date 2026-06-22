# Bot Running And Turn Audio Design

## Scope

Replace the rotating city ambience with one continuous bot-running loop and add a sample-based mechanical sound synchronized to both review camera turns. Keep footsteps, TTS, the entry bleep, and the exit bloop unchanged.

## Assets

- Source background: `audio/bot_running/UIData_Generic Robotics Medium Data Processing Constant 01_B00M_ONE_2.wav`.
- Source turn texture: `audio/turning_loop/UIData_Generic Robotics Medium Data Processing Constant 01_B00M_ONE.wav`.
- `npm run audio:prepare` converts the background to a compact browser loop and the turn texture to a 48 kHz browser-decodable asset under `public/audio/`.
- The generated asset manifest exposes one background URL, one turn-texture URL, and the existing footstep URLs.
- The seven old runtime ambience files and their shuffle/crossfade behavior are removed.

## Background Loop

The bot-running recording starts with the audio engine and loops continuously for the lifetime of the bot. Existing state gain changes remain smooth: the loop is quieter while processing and ducks beneath TTS, then returns after speech. It does not select a new recording after teleportation.

## Turn Playback

The turn texture is fetched and decoded once during audio-engine initialization. At the start of each camera pan, the engine creates a new buffer source and:

- chooses a random valid offset in the 13.96-second source loop;
- loops the source if the requested camera turn crosses the end of the buffer;
- applies a narrowly randomized base playback rate so the machine feels imperfect without changing character;
- applies a restrained rise-and-fall playback-rate envelope;
- applies a short gain attack, steady body, and gentle wind-down;
- stops playback at the exact requested pan duration.

The same source and treatment serve the inward and outward turns. Their different camera durations naturally produce different sound lengths.

## Turn Timing

Both configured review pans become 25% slower:

- Inward alignment: `2500 ms` to `3125 ms`.
- Return to road: `1200 ms` to `1500 ms`.
- The return-state guard timer increases proportionally from `1400 ms` to `1750 ms` so state completion cannot cut off the camera or audio.

The bot passes the actual pan duration to the audio engine when each turn begins. The inward sound starts after the existing entry bleep and immediately before the alignment pan. The outward sound starts with the return pan, after the existing exit bloop trigger.

## Failure Handling

Missing or undecodable audio logs a warning and leaves bot movement operational. A failed turn sound must never delay state transitions or camera motion.

## Verification

Automated tests cover the generated manifest, single-loop asset preparation, turn-variation bounds, duration scheduling, both bot trigger points, and the new camera timing defaults. Typecheck, lint, the full test suite, and production build remain required before integration.
