# Generative Review Cues Design

## Goal

Replace the fixed entry bleep and exit bloop with a paired generative cue. Each
review becomes one musical episode: the entry cue asks an unresolved question,
the spoken review occupies the middle, and the exit cue answers it. Across a
kiosk session, successive episodes form an experimental composition rather than
repeating a conventional notification sound.

## Musical System

The cue generator maintains one session-local harmonic state. Its state graph
contains a small fixed vocabulary of pitch-class structures built from clusters,
fourths, tritones, open fifths, and asymmetric interval sets. Weighted Markov
transitions favor nearby structures with parsimonious voice leading, while rare
edges permit sharper changes. The graph does not follow a functional pop chord
progression and does not select unrelated pitches independently.

When detection begins, the generator advances through the graph and creates an
entry voicing that remains harmonically open. The resulting episode is retained
until delivery ends. The exit cue uses that same episode and chooses one of its
weighted responses: partial convergence, registral inversion, common-tone
resolution, or a deliberately unresolved continuation. This makes entry and
exit recognizable as a pair without forcing every review into a cadence.

The Markov state persists for the life of `AudioEngine` and resets when the bot
session is recreated. No state is persisted to SQLite or local storage.

## Controlled Variation

Every episode receives a seeded parameter profile with a nominal variation
amount of 25 percent. Variation applies within bounded musical ranges to:

- oscillator blend and filter color;
- chord inversion and octave placement;
- individual voice level and envelope length;
- note onset microtiming and mechanical pulse spacing;
- presence, density, and color of the mechanical layer.

Pitch remains quantized to the selected harmonic structure. Master cue level and
maximum duration do not vary by the full amount, preventing unexpectedly loud or
long cues. Immediate repetition of the same transition and voicing is avoided
where alternatives exist.

## Sound Construction

The cues are synthesized with Web Audio and routed through the existing SFX path
to the shared master output. Each chord combines a restrained tonal body with a
short filtered transient. A light mechanical layer adds one to three synthetic
click, relay, or resonant-metal impulses in irregular groupings derived from 3,
5, or 7 subdivisions. It supports the harmonic gesture rather than becoming a
continuous beat.

Entry cues remain compact enough to precede the existing camera pan. Exit cues
begin at the existing return transition and may decay underneath the first part
of the pan. Neither cue changes state-machine timing, TTS timing, ambient
ducking, Street View behavior, or review cadence.

## Architecture

A pure `generative-cue` module owns the state graph, weighted selection, voicing,
and bounded random parameter generation. It accepts an injectable random source
so graph behavior and variation bounds can be tested deterministically.

`AudioEngine` owns synthesis and playback. On entry it requests and stores a new
episode; on exit it consumes the matching response. Existing `playBleep()` and
`playBloop()` calls remain the integration boundary, keeping the state machine
and bot orchestration unchanged. If an exit arrives without a stored episode,
the generator creates a valid standalone response. If Web Audio is unavailable,
the bot continues visually as it does today.

The fixed generated `AudioBuffer` fields and single-tone generator are removed.
All scheduled oscillators and nodes disconnect after their envelopes finish, and
`destroy()` cancels any still-active cue sources.

## Listening Surface

Add a small development-only cue audition route that initializes Web Audio after
a click and exposes three actions: play entry, play matching exit, and play a
complete succession of several episodes. It displays the current harmonic state
and transition name as diagnostic text, without adding controls to the kiosk
experience.

## Configuration And Documentation

Stable synthesis values, the 25 percent variation amount, cue duration bounds,
and cue level live under `AUDIO` in `src/lib/config.ts`. The state graph remains
inside the pure cue module because it is musical structure rather than an admin
setting. `docs/how-the-bot-works.md` and `docs/llm-handoff/README.md` describe the
paired session-level composition and the audition route.

## Verification

Focused deterministic tests verify:

- every graph transition targets a valid state and weighted selection is valid;
- entry and exit use the same episode identity;
- pitch material belongs to the selected structures;
- randomized parameters remain within their 25 percent bounds;
- immediate transition/voicing repetition is suppressed when possible;
- a missing entry still yields a valid exit response;
- the existing state-machine effect order remains unchanged.

Run the focused tests, typecheck, lint, and production build. Finally, use the
audition route in the browser to confirm repeated episodes vary audibly, paired
responses remain legible, output stays controlled, and no console errors or
stuck audio nodes appear.
