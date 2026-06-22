# Installation Audio Design

## Goal

Replace the bot's generated ambient drones with the supplied city field recordings and add varied two-foot sounds for each successful Street View movement. The audio should feel continuous, react to teleports, remain quietly present beneath spoken reviews, and avoid obvious short-loop repetition.

## Source And Delivery Assets

Original masters remain unchanged under:

- `audio/ambient/`
- `audio/steps/`

A repeatable preparation script generates browser assets under `public/audio/`. It will:

- omit the exact duplicate `593833__klankbeeld__calm-city-ambience-02-200316_0124 (1).wav`;
- create lowercase, URL-safe output names and a deterministic manifest;
- convert the seven unique ambient recordings to 48 kHz stereo Opus for efficient streaming;
- convert the twelve step-pair recordings to 48 kHz WAV for reliable Web Audio decoding;
- level-match recordings within each category while preserving their internal dynamics; and
- fail clearly when FFmpeg is unavailable or an expected source cannot be decoded.

The source masters are not fetched by the browser. Only generated assets in `public/audio/` ship with the application.

## Playback Architecture

`AudioEngine` remains the single owner of browser audio. It keeps the current master output, TTS routing, sound effects, and ambient ducking, but replaces generated ambience with a hybrid playback system:

- Two `HTMLAudioElement` ambient decks stream long recordings.
- Each deck is connected to the existing Web Audio graph through a `MediaElementAudioSourceNode` and its own gain node.
- The twelve short step pairs are fetched, decoded into `AudioBuffer`s, and played through a dedicated footsteps gain bus.
- Ambient, footsteps, TTS, and existing interface sounds all feed the shared master gain.

This avoids decoding all long field recordings into memory while retaining accurate, low-latency footstep playback.

## Ambient Sequence

Ambient recordings use a shuffle bag. Every unique recording plays once before the bag is rebuilt, and the first entry in a new bag cannot equal the recording that just played.

At startup, the first shuffled recording fades in. During ordinary playback, the next deck starts at the beginning of a new recording shortly before the active recording ends. The two decks crossfade for eight seconds. The outgoing deck is then paused and reset.

If playback metadata or duration is unavailable, the engine waits for the recording's `ended` event and performs a short fallback transition instead of stopping permanently.

## Teleport Behavior

A teleport transition takes precedence over an ordinary end-of-track transition:

1. When teleport fade-out begins, the active ambience fades down with the visual transition.
2. If Street View resolves and changes to a destination, the next shuffled recording starts from its beginning while silent.
3. The new recording fades in with the visual fade-in.
4. If no walkable destination resolves, the current recording resumes and the shuffle position does not advance.

Normal teleports use the configured visual fade durations. Imagery-recovery teleports currently use very short visual fades; their ambient transition will use a minimum one-second fade on each side to avoid an audible cut.

Repeated or overlapping transition requests are serialized. A teleport cancels an armed natural crossfade and becomes the sole owner of the two ambient decks until it finishes.

## Speech Ducking

Ambient playback continues beneath spoken reviews. The ambient bus ramps to the existing delivery level when speech begins and returns smoothly after speech ends. Deck crossfades and teleport transitions operate below that bus, so ducking does not lose track of either deck's intended mix.

Footsteps do not play during review delivery because they are triggered only by confirmed Street View movement while the bot is in `WANDER`.

## Footstep Behavior

Every successful Street View step triggers one supplied clip containing a complete left/right pair. All twelve asphalt and tile clips share one shuffle pool.

For each playback:

- avoid replaying a clip until the current shuffle bag is exhausted;
- prevent the same clip at the boundary between bags;
- vary playback rate uniformly from `0.975` to `1.025`;
- vary gain uniformly by approximately `-1.5 dB` to `+1.5 dB`; and
- allow overlapping decay if another confirmed movement occurs unexpectedly soon.

The bot uses `StreetViewController.onSuccessfulStep`, not the walking timer, so failed, blocked, cancelled, and teleport movements remain silent.

## Configuration

Defaults live in `src/lib/config.ts`. Existing timing and audio settings remain the authority for master level, ambient speech ducking, and teleport visual duration. New focused defaults cover:

- natural ambient crossfade duration;
- minimum imagery-recovery ambient fade;
- footstep gain;
- footstep playback-rate variation; and
- footstep gain variation.

The first implementation does not add an admin interface. These settings can be promoted into the existing admin override system later if installation tuning shows that live controls are necessary.

## Failure Handling

Audio must never stop bot navigation:

- Failure to load one ambient file removes it from the current shuffle and advances to another.
- If no ambient recording loads, the engine logs a warning and continues without ambience.
- Failure to load a step file removes only that clip from the pool.
- If all step files fail, successful movement continues silently.
- Browser autoplay suspension is handled by the existing `AudioContext.resume()` startup path.
- `destroy()` cancels timers, event listeners, sources, pending fades, and media playback.

Failures should be visible in the browser console with the asset URL and category, without repeatedly logging the same failed asset.

## Verification

Automated tests will cover deterministic shuffle behavior, no immediate repeats, step variation bounds, duplicate omission, and the distinction between successful steps and timer attempts. Static tests will confirm that teleport success advances ambience while teleport failure retains it.

Repository verification runs:

```bash
npm run typecheck
npm run lint
npm run build
```

A browser smoke test will confirm:

- ambience starts after kiosk audio initialization;
- a natural track boundary crossfades without silence;
- spoken reviews duck but do not mute ambience;
- each confirmed movement produces one varied two-step clip;
- normal and imagery-recovery teleports transition to the next shuffled ambience; and
- stopping or destroying the bot leaves no audio playing.

## Documentation

Implementation updates `docs/how-the-bot-works.md` and `docs/llm-handoff/README.md` with asset locations, runtime behavior, and the preparation command.
