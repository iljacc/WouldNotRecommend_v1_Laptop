# TTS Lab Audio Mixer Design

## Summary

Add a live audio mixing desk to the existing `/tts-lab` route. The page will use two focused tabs: **Voice Lab** for the current TTS tools and **Mixing Desk** for installation-wide audio control. The mixer discovers prepared audio assets from a generated registry, exposes per-file and group trims, provides master control and optional master-bus compression, persists settings in the kiosk browser profile, and immediately updates an open `/bot` tab through `BroadcastChannel`.

The feature remains an installation utility. It does not introduce accounts, remote administration, a generic media library, or server-persisted preferences.

## Goals

- Mix every prepared ambience and footstep file independently.
- Mix TTS and generated entry/exit cues independently.
- Provide group controls for ambience, footsteps, TTS, and cues.
- Provide master volume, mute, metering, and optional compression.
- Make newly prepared files appear without hand-editing the mixer UI.
- Apply changes to an already-running `/bot` tab immediately.
- Persist the mix in `localStorage` and provide a project-default reset.
- Preserve existing state-dependent ambience ducking, crossfades, footstep variation, and kiosk behavior.

## Non-Goals

- Uploading audio through the browser.
- Scanning arbitrary filesystem locations at runtime.
- Persisting mix settings to SQLite or synchronizing them between machines.
- Adding per-channel compressors, equalizers, sends, automation, or recording.
- Replacing the existing source-audio preparation workflow.

## User Experience

### Page Layout

`/tts-lab` keeps its existing dark, monospace installation-tool styling. A page-level tab control switches between:

- **Voice Lab:** the current review sample, voice, speed, subtitle timing, synthesis, and preview controls.
- **Mixing Desk:** a full-width mixer designed to remain readable as the asset count grows.

Switching tabs does not discard current Voice Lab input or mixer state.

### Connection Status

The Mixing Desk header shows whether an open `/bot` tab has replied recently. The desk sends a presence ping when opened and periodically while visible; `/bot` replies over the same channel. This is informational only. Mix edits always save locally even when no bot is connected.

### Mixer Controls

The master section contains:

- master trim and mute;
- a reset-to-project-defaults action with confirmation;
- an output level meter;
- a master compressor panel.

The compressor panel contains:

- enabled/bypassed toggle;
- threshold;
- ratio;
- attack;
- release;
- makeup gain;
- read-only gain-reduction metering.

The compressor defaults to bypassed.

Below the master section are collapsible groups for ambience, footsteps, TTS, and cues. Each group has a trim and mute control. Prepared file groups contain one row per asset with:

- a human-readable label;
- an individual trim;
- mute;
- audition/stop.

TTS is represented as one logical channel. The generated entry bleep and exit bloop are separate cue channels even though they are created in Web Audio rather than loaded from files.

Only one file audition plays at a time. Auditions use the current individual, group, master, and compressor settings. A failed audition reports an inline row error and leaves the rest of the mixer operational.

## Asset Discovery

`npm run audio:prepare` remains the supported ingestion step. The preparation script will generate a typed registry rather than only URL arrays. Each prepared asset record contains:

- stable ID;
- category;
- display label;
- browser URL.

Stable IDs derive from category plus normalized source identity, with deterministic collision disambiguation. They do not depend on array position, so adding a file earlier in sort order does not attach an existing saved trim to a different sound. Renaming a source file intentionally creates a new identity and therefore starts at the default trim.

The existing ambience and footstep URL exports may remain as compatibility projections of the registry while runtime code migrates to asset descriptors. Generated cues and TTS have fixed logical IDs in the mix schema.

Adding a supported source file and rerunning `npm run audio:prepare` is sufficient to make it appear in the Mixing Desk and the bot runtime.

## Settings Model

A client-safe audio mix settings module owns:

- the schema and schema version;
- project defaults;
- validation, clamping, and migration;
- `localStorage` read/write/reset;
- reconciliation against the current asset registry;
- `BroadcastChannel` message types.

Controls use decibel trims. User trims are layered over existing project behavior rather than replacing it:

- all trims default to `0 dB`;
- muted channels resolve to silence;
- ambience state levels and speech ducking still apply;
- crossfade deck envelopes still run from silent to their active level;
- randomized footstep gain remains in addition to the saved file trim;
- existing base TTS and cue gains remain the project reference levels.

The supported user trim range is `-60 dB` through `+6 dB`, with `-60 dB` treated as effectively silent. Compressor values are constrained to Web Audio-safe UI ranges before storage or application. The settings document stores overrides by stable ID rather than writing every default.

On load, missing or malformed fields fall back independently to defaults. Unknown saved asset IDs are ignored. Newly discovered IDs receive default settings. Reset removes the stored override document and broadcasts the newly resolved defaults.

## Live Synchronization

The mixer and bot share a named, versioned `BroadcastChannel`. Messages are discriminated and validated. Required messages are:

- mixer presence ping;
- bot presence response;
- complete resolved mix update;
- optional request for the bot to resend its currently applied schema version/status.

The Mixing Desk writes validated settings to `localStorage` before broadcasting. `/bot` reads stored settings when its audio runtime initializes and applies later complete mix updates atomically. Complete documents are preferred over patches so dropped or reordered messages cannot leave the bot with a partially updated mix.

If `BroadcastChannel` is unavailable, local persistence and lab auditioning still work. `/bot` applies the saved mix on its next load. The UI reports that live updates are unavailable.

## Audio Graph

Shared audio-graph helpers separate settings application from bot orchestration. The logical routing is:

```text
sound source -> per-sound gain -> group gain -> master gain
            -> dry/compressed output paths -> makeup/output -> destination
```

Specific runtime behavior:

- Each ambient deck keeps a crossfade envelope gain and gains a distinct per-asset trim stage before the ambience group bus.
- Each decoded footstep buffer retains its asset ID. Playback passes through the asset trim before the footsteps group bus.
- TTS passes through the TTS channel and group controls.
- Bleep and bloop pass through their own cue controls and the shared cues group.
- Existing bot fade operations must not overwrite saved mix trims; automation and user trims live on separate gain nodes.

The `DynamicsCompressorNode` remains available in the graph. A dry path and compressed path use short opposing gain ramps for click-resistant bypass switching; they must never both remain at full gain. Makeup gain is applied only to the compressed path so enabling bypass returns to the uncompressed reference level.

Settings changes use short parameter ramps where appropriate to avoid clicks. Initial settings are applied before playback begins.

The Voice Lab TTS preview is moved from a raw `HTMLAudioElement` output to the shared mix-aware preview graph. This makes its playback representative of the configured TTS, master, and compressor settings.

## Metering And Performance

Meters use `AnalyserNode` data and animation frames only while the Mixing Desk tab is visible. Metering stops when the tab is hidden or the component unmounts. It must not create Google Maps calls, Street View POV changes, extra review polling, or persistent per-frame work on `/bot`.

The live bot applies audio parameters without rendering mixer meters. Compressor reduction is shown in the lab from its local preview graph; connection status does not imply remote meter streaming from `/bot`.

## Error Handling

- Invalid stored settings are clamped or replaced field-by-field with defaults.
- Unsupported schema versions fall back to defaults rather than preventing bot startup.
- Invalid channel messages are ignored.
- A failed asset fetch or decode marks that audition row as unavailable without rejecting the whole page.
- Existing bot audio load failures retain their current best-effort behavior.
- AudioContext suspension is handled through user-initiated audition/play actions.
- Reset requires confirmation and is immediately persisted and broadcast.

## Testing

Focused automated coverage will include:

- deterministic, stable asset IDs and generated registry contents;
- settings defaults, range validation, serialization, migration, and registry reconciliation;
- decibel-to-gain behavior, mute behavior, and compressor parameter mapping;
- complete BroadcastChannel message validation and presence exchange;
- AudioEngine routing ownership for ambience, footsteps, TTS, bleep, and bloop;
- separation of automation gains from saved user trims;
- reset-to-default behavior;
- tab switching and key mixer interactions;
- audition exclusivity and failure reporting;
- meter lifecycle cleanup.

Verification will run the focused tests followed by:

```bash
npm run typecheck
npm run lint
npm run build
```

Behavior documentation will be updated in `docs/how-the-bot-works.md` and `docs/llm-handoff/README.md` when the feature is implemented.

## Success Criteria

- Every currently prepared ambience and footstep file appears on the Mixing Desk.
- A newly added and prepared file appears automatically with a default `0 dB` trim.
- Individual, group, and master changes are audible in lab auditions and an already-running `/bot` tab.
- Saved settings survive reloads in the same browser profile.
- Reset restores project defaults and immediately updates `/bot`.
- Compression can be enabled, tuned, metered, and bypassed without disrupting playback.
- Existing ambience crossfades, ducking, footsteps, cues, and TTS cadence continue to work.
