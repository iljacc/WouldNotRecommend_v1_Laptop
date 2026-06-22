# TTS Lab Audio Mixer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent, per-sound mixing desk with live `/bot` updates and optional master compression to the existing `/tts-lab` page.

**Architecture:** The prepared-audio manifest becomes a stable descriptor registry that includes the pending bot-running, turning, and footstep assets. A pure settings module validates and persists decibel trims, a shared Web Audio graph applies per-channel/group/master/compressor routing, and a versioned `BroadcastChannel` synchronizes complete mix documents between `/tts-lab` and the live bot. Focused Voice Lab and Mixing Desk tabs share a mix-aware preview runtime without adding server persistence or Street View work.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Web Audio API, `localStorage`, `BroadcastChannel`, Vitest, Node asset-contract tests, Tailwind CSS 4.

---

## File Structure

**Create:**

- `src/lib/audio-mix-settings.ts` - schema, defaults, validation, migration, persistence, and message validation.
- `src/lib/audio-mix-sync.ts` - injectable `BroadcastChannel` synchronization and presence lifecycle.
- `src/engine/audio-mix-graph.ts` - Web Audio gain buses, compressor paths, ramps, and analysers.
- `src/engine/audio-tones.ts` - shared bleep/bloop buffer generation for bot and lab previews.
- `src/engine/audio-preview.ts` - exclusive file/cue/TTS audition playback for `/tts-lab`.
- `src/components/AudioMixer.tsx` - mixer presentation and controls.
- `src/components/AudioMixerChannel.tsx` - reusable individual channel row.
- `src/hooks/useAudioMixSettings.ts` - React ownership of persisted settings and mixer synchronization.
- `scripts/audio-mix-settings.test.ts` - pure schema/storage/message tests.
- `scripts/audio-mix-graph.test.ts` - graph parameter and routing tests with Web Audio fakes.
- `scripts/audio-mixer-ui.test.tsx` - static UI and reducer/interaction contract tests.

**Modify:**

- `scripts/prepare-audio-assets.cjs` - emit stable typed asset descriptors while preserving current bot-running/turning work.
- `scripts/audio-assets.test.mjs` - assert descriptor identity, categories, files, and compatibility exports.
- `src/lib/audio-assets.ts` - generated registry plus compatibility projections.
- `src/engine/audio-engine.ts` - route every live sound through the mix graph and consume synchronized updates.
- `src/engine/audio-shuffle.ts` - only if the pending bot-running plan has not already removed obsolete ambience shuffle usage; do not remove helpers still used by footsteps.
- `scripts/audio-runtime.test.ts` - assert all runtime sources use stable channel IDs and separate automation/user gains.
- `src/app/tts-lab/page.tsx` - add tabs and route TTS preview through the preview runtime.
- `package.json` - add focused mix test scripts to `npm test`.
- `docs/how-the-bot-works.md` - document mixer behavior and runtime routing.
- `docs/llm-handoff/README.md` - document route, registry, persistence, and synchronization ownership.

## Integration Precondition

The worktree currently contains uncommitted implementation from `docs/superpowers/plans/2026-06-22-bot-running-turn-audio.md`: `BOT_RUNNING_AUDIO_URL`, `TURNING_AUDIO_URL`, new prepared folders, and removal of the seven old ambient files. Preserve and finish that direction. Do not restore `AMBIENT_AUDIO_URLS`; model the bot-running loop as the `ambience` channel and the turn texture as a `cues` channel.

### Task 1: Generate A Stable Sound Registry

**Files:**
- Modify: `scripts/audio-assets.test.mjs`
- Modify: `scripts/prepare-audio-assets.cjs`
- Modify: `src/lib/audio-assets.ts`
- Test: `scripts/audio-assets.test.mjs`

- [ ] **Step 1: Extend the failing asset contract**

Replace URL-only assertions with descriptor assertions while retaining file-existence checks:

```js
assert.match(manifest, /export type PreparedAudioCategory =/);
assert.match(manifest, /export const PREPARED_AUDIO_ASSETS = \[/);
assert.match(manifest, /id: "ambience:bot-running"/);
assert.match(manifest, /id: "cues:turning"/);
assert.match(manifest, /category: "footsteps"/);
assert.match(manifest, /export const BOT_RUNNING_AUDIO_URL =/);
assert.match(manifest, /export const TURNING_AUDIO_URL =/);
assert.match(manifest, /export const FOOTSTEP_AUDIO_ASSETS =/);
```

Parse every emitted `url`, assert uniqueness, and assert the corresponding file exists under `public/`.

- [ ] **Step 2: Run the asset test and verify the new contract fails**

Run: `npm run test:audio-assets`

Expected: FAIL because `PREPARED_AUDIO_ASSETS` and `FOOTSTEP_AUDIO_ASSETS` are not generated yet.

- [ ] **Step 3: Add stable descriptor generation**

Add these generator concepts to `scripts/prepare-audio-assets.cjs`:

```js
function slug(value) {
  return value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function descriptor(id, label, category, url) {
  return { id, label, category, url };
}
```

Use fixed IDs `ambience:bot-running` and `cues:turning`. For each deduplicated footstep source, use `footsteps:${slug(source stem)}`; when two stems normalize to the same slug, append the first eight characters of the existing SHA-256 file hash. Emit source-derived labels before conversion renames the browser files.

Generate this public shape:

```ts
export type PreparedAudioCategory = "ambience" | "footsteps" | "cues";
export type PreparedAudioAsset = Readonly<{
  id: string;
  label: string;
  category: PreparedAudioCategory;
  url: string;
}>;

export const PREPARED_AUDIO_ASSETS = [
  { id: "ambience:bot-running", label: "Bot running", category: "ambience", url: "/audio/bot-running/bot-running.webm" },
  { id: "cues:turning", label: "Turning", category: "cues", url: "/audio/turning/turning-loop.wav" },
] as const satisfies readonly PreparedAudioAsset[];

export const BOT_RUNNING_AUDIO_URL = "/audio/bot-running/bot-running.webm";
export const TURNING_AUDIO_URL = "/audio/turning/turning-loop.wav";
export const FOOTSTEP_AUDIO_ASSETS = PREPARED_AUDIO_ASSETS.filter(
  (asset) => asset.category === "footsteps",
);
export const FOOTSTEP_AUDIO_URLS = FOOTSTEP_AUDIO_ASSETS.map((asset) => asset.url);
```

- [ ] **Step 4: Regenerate and verify assets**

Run: `npm run audio:prepare && npm run test:audio-assets`

Expected: preparation succeeds; the asset test passes with bot-running, turning, and twelve footstep descriptors.

- [ ] **Step 5: Commit the registry contract**

```bash
git add scripts/prepare-audio-assets.cjs scripts/audio-assets.test.mjs src/lib/audio-assets.ts public/audio/bot-running public/audio/turning public/audio/steps public/audio/ambient
git commit -m "Add stable prepared audio registry"
```

Do not stage `data/db/would-not-recommend.db`.

### Task 2: Define And Validate Mix Settings

**Files:**
- Create: `src/lib/audio-mix-settings.ts`
- Create: `scripts/audio-mix-settings.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write failing defaults, validation, and reconciliation tests**

Create tests for these exact cases:

```ts
expect(createDefaultAudioMix().compressor.enabled).toBe(false);
expect(createDefaultAudioMix().groups.ambience.trimDb).toBe(0);
expect(validateAudioMix({ version: 1, master: { trimDb: 99 } }).master.trimDb).toBe(6);
expect(validateAudioMix({ version: 1, master: { trimDb: -99 } }).master.trimDb).toBe(-60);
expect(resolveChannel(mix, "new:file")).toEqual({ trimDb: 0, muted: false });
expect(Object.keys(reconcileAudioMix(mix, ["known:file"]).channels)).toEqual(["known:file"]);
expect(decibelsToMixGain(-60, false)).toBe(0);
expect(decibelsToMixGain(0, false)).toBe(1);
expect(decibelsToMixGain(6, true)).toBe(0);
```

Also test malformed JSON, missing fields, unknown schema versions, compressor range clamping, and reset removing `would-not-recommend.audio-mix.v1`.

- [ ] **Step 2: Add and run the focused test command**

Add:

```json
"test:audio-mix": "vitest run scripts/audio-mix-settings.test.ts scripts/audio-mix-graph.test.ts scripts/audio-mixer-ui.test.tsx"
```

Temporarily point it only at the settings test until the later test files exist. Run `npm run test:audio-mix`.

Expected: FAIL because the settings module does not exist.

- [ ] **Step 3: Implement the versioned settings model**

Export these types and constants:

```ts
export const AUDIO_MIX_STORAGE_KEY = "would-not-recommend.audio-mix.v1";
export const AUDIO_MIX_CHANNEL = "would-not-recommend.audio-mix.v1";
export type AudioMixGroupId = "ambience" | "footsteps" | "tts" | "cues";
export type ChannelMix = { trimDb: number; muted: boolean };
export type CompressorMix = {
  enabled: boolean;
  thresholdDb: number;
  ratio: number;
  attackSec: number;
  releaseSec: number;
  makeupDb: number;
};
export type AudioMixSettings = {
  version: 1;
  master: ChannelMix;
  groups: Record<AudioMixGroupId, ChannelMix>;
  channels: Record<string, ChannelMix>;
  compressor: CompressorMix;
};
```

Defaults are `0 dB`, unmuted, and compressor `{ enabled: false, thresholdDb: -18, ratio: 3, attackSec: 0.03, releaseSec: 0.25, makeupDb: 0 }`. Export `createDefaultAudioMix`, `validateAudioMix`, `loadAudioMix`, `saveAudioMix`, `resetAudioMix`, `reconcileAudioMix`, `resolveChannel`, `decibelsToMixGain`, `updateChannel`, `updateGroup`, and `updateCompressor`. The three update helpers return new validated documents without mutating their inputs. Inject a minimal `Storage` argument into persistence functions so Node tests do not need a DOM.

- [ ] **Step 4: Run the settings tests**

Run: `npm run test:audio-mix`

Expected: PASS for `scripts/audio-mix-settings.test.ts`.

- [ ] **Step 5: Commit settings**

```bash
git add src/lib/audio-mix-settings.ts scripts/audio-mix-settings.test.ts package.json
git commit -m "Add persistent audio mix settings"
```

### Task 3: Build The Shared Web Audio Mix Graph

**Files:**
- Create: `src/engine/audio-mix-graph.ts`
- Create: `scripts/audio-mix-graph.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write a fake-context routing test**

Use small fake `GainNode`, `DynamicsCompressorNode`, and `AnalyserNode` objects that record `connect`, `setTargetAtTime`, and compressor assignments. Assert:

```ts
const graph = new AudioMixGraph(fakeContext, fakeDestination, defaults);
expect(graph.inputFor("tts:voice", "tts")).toBe(graph.inputFor("tts:voice", "tts"));
expect(graph.inputFor("cues:bleep", "cues")).not.toBe(graph.inputFor("cues:bloop", "cues"));
graph.apply({ ...defaults, compressor: { ...defaults.compressor, enabled: true } });
expect(fakeCompressor.threshold.value).toBe(-18);
expect(fakeCompressor.ratio.value).toBe(3);
expect(graph.getReductionDb()).toBe(fakeCompressor.reduction);
graph.destroy();
expect(allCreatedNodes.every((node) => node.disconnected)).toBe(true);
```

Add a test proving user trims affect dedicated gains while a separate automation input can still fade without overwriting them.

- [ ] **Step 2: Run the graph test and verify failure**

Run: `vitest run scripts/audio-mix-graph.test.ts`

Expected: FAIL because `AudioMixGraph` does not exist.

- [ ] **Step 3: Implement the graph**

Expose:

```ts
export class AudioMixGraph {
  constructor(context: BaseAudioContext, destination: AudioNode, initial: AudioMixSettings);
  inputFor(channelId: string, groupId: AudioMixGroupId): GainNode;
  automationInputFor(channelId: string, groupId: AudioMixGroupId): GainNode;
  apply(settings: AudioMixSettings): void;
  getOutputAnalyser(): AnalyserNode;
  getReductionDb(): number;
  destroy(): void;
}
```

For each channel, connect `automationGain -> channelTrimGain -> groupGain`. Connect groups to master. Connect master in parallel to a dry gain and `DynamicsCompressorNode -> compressor makeup gain -> wet gain`; connect both paths to one analyser and destination. On bypass changes, ramp dry/wet over 30 ms so the inactive path reaches zero and both paths never remain at unity. Apply makeup only on the wet path. Use `setTargetAtTime` with a 15 ms constant for live trim changes.

- [ ] **Step 4: Run graph and settings tests**

Run: `npm run test:audio-mix`

Expected: both existing mix tests pass.

- [ ] **Step 5: Commit the graph**

```bash
git add src/engine/audio-mix-graph.ts scripts/audio-mix-graph.test.ts package.json
git commit -m "Add shared compressed audio mix graph"
```

### Task 4: Synchronize The Mixer And Live Bot

**Files:**
- Create: `src/lib/audio-mix-sync.ts`
- Modify: `scripts/audio-mix-settings.test.ts`

- [ ] **Step 1: Write failing message and presence tests**

Test these validated messages:

```ts
type AudioMixMessage =
  | { type: "mix-update"; settings: AudioMixSettings }
  | { type: "presence-ping"; requestId: string }
  | { type: "presence-response"; requestId: string; role: "bot"; version: 1 };
```

With an injected fake channel factory, assert that a mixer ping causes the bot peer to post a matching response, a valid update invokes `onMix`, malformed updates are ignored, `close()` removes listeners, and `BroadcastChannel` absence reports `liveAvailable: false` without throwing.

- [ ] **Step 2: Run and verify failure**

Run: `vitest run scripts/audio-mix-settings.test.ts`

Expected: FAIL because `createAudioMixSync` does not exist.

- [ ] **Step 3: Implement injectable synchronization**

Export:

```ts
export function createAudioMixSync(options: {
  role: "mixer" | "bot";
  onMix?: (settings: AudioMixSettings) => void;
  onPresence?: (connected: boolean) => void;
  channelFactory?: (name: string) => BroadcastChannel;
}): {
  liveAvailable: boolean;
  publish(settings: AudioMixSettings): void;
  ping(): void;
  close(): void;
};
```

Validate every incoming mix through `validateAudioMix`. Mixer presence expires after five seconds without a matching response. Only the visible Mixing Desk schedules a ping interval; the sync primitive itself owns no interval.

- [ ] **Step 4: Run focused tests and commit**

Run: `npm run test:audio-mix`

Expected: all current mix tests pass.

```bash
git add src/lib/audio-mix-sync.ts scripts/audio-mix-settings.test.ts
git commit -m "Add live audio mix synchronization"
```

### Task 5: Route Every Bot Sound Through The Mix

**Files:**
- Modify: `src/engine/audio-engine.ts`
- Modify: `scripts/audio-runtime.test.ts`
- Modify: `src/engine/turn-audio.ts` only if it exists after completing the pending turn-audio plan

- [ ] **Step 1: Add failing runtime routing assertions**

Extend `scripts/audio-runtime.test.ts` to require stable IDs and graph ownership:

```ts
expect(engine).toContain("new AudioMixGraph");
expect(engine).toContain('inputFor("ambience:bot-running", "ambience")');
expect(engine).toContain('inputFor("cues:turning", "cues")');
expect(engine).toContain('inputFor("tts:voice", "tts")');
expect(engine).toContain('inputFor("cues:bleep", "cues")');
expect(engine).toContain('inputFor("cues:bloop", "cues")');
expect(engine).toContain("FOOTSTEP_AUDIO_ASSETS");
expect(engine).toContain("createAudioMixSync");
```

Assert that `fadeToSilence`, ambient state ramps, turn envelopes, and crossfades (if any remain) target automation nodes rather than `master`, group, or channel trim nodes.

- [ ] **Step 2: Run the runtime tests and verify failure**

Run: `npm run test:audio-runtime`

Expected: FAIL because the live engine does not yet create the mix graph.

- [ ] **Step 3: Integrate registry-aware buffers and the mix graph**

During `AudioEngine.init()`:

```ts
const storedMix = loadAudioMix(window.localStorage);
this.mixGraph = new AudioMixGraph(this.ctx, this.ctx.destination, storedMix);
this.mixSync = createAudioMixSync({
  role: "bot",
  onMix: (settings) => this.mixGraph?.apply(settings),
});
```

Route bot-running, turning, TTS, bleep, and bloop through their exact IDs. Change footstep buffers from `AudioBuffer[]` to `{ asset: PreparedAudioAsset; buffer: AudioBuffer }[]`, keep the shuffle bag over these records, and route each selected record through `inputFor(asset.id, "footsteps")`. Keep randomized playback-rate and gain in the automation path before the stable trim.

Keep master fade automation on a dedicated pre-mix gain. Do not write into the mixer master trim when teleport or lifecycle fades run.

- [ ] **Step 4: Close synchronization and graph resources**

In `destroy()`, stop sources first, then call `mixSync.close()` and `mixGraph.destroy()`, and finally close the context. Null all owned references so repeated start/stop does not retain a channel listener.

- [ ] **Step 5: Run runtime, settings, and graph tests**

Run: `npm run test:audio-runtime && npm run test:audio-mix && npm run typecheck`

Expected: all commands pass.

- [ ] **Step 6: Commit runtime routing**

```bash
git add src/engine/audio-engine.ts src/engine/turn-audio.ts scripts/audio-runtime.test.ts
git commit -m "Apply live mix settings to bot audio"
```

Omit `src/engine/turn-audio.ts` from `git add` if it was not changed.

### Task 6: Add Mix-Aware Preview And Metering

**Files:**
- Create: `src/engine/audio-preview.ts`
- Modify: `scripts/audio-mix-graph.test.ts`

- [ ] **Step 1: Write failing exclusive-preview tests**

Use a fake context and fetch implementation to assert that starting asset B stops asset A, failed fetches reject with an asset-specific error, TTS buffers use `tts:voice`, cue generation uses `cues:bleep` or `cues:bloop`, and `destroy()` stops playback and closes the context.

- [ ] **Step 2: Run and verify failure**

Run: `vitest run scripts/audio-mix-graph.test.ts`

Expected: FAIL because `AudioPreview` does not exist.

- [ ] **Step 3: Implement the preview owner**

Expose:

```ts
export class AudioPreview {
  async init(settings: AudioMixSettings): Promise<void>;
  apply(settings: AudioMixSettings): void;
  playAsset(asset: PreparedAudioAsset): Promise<void>;
  playTts(buffer: AudioBuffer): Promise<void>;
  playCue(id: "cues:bleep" | "cues:bloop"): Promise<void>;
  stop(): void;
  getAnalyser(): AnalyserNode | null;
  getReductionDb(): number;
  destroy(): void;
}
```

Create one `AudioContext` lazily after a user play/audition action. Decode and cache prepared assets by stable ID. Reuse a shared exported `createToneBuffer` helper extracted from `AudioEngine` for bleep/bloop. Keep only one active preview source and one active TTS source.

- [ ] **Step 4: Run focused tests and commit**

Run: `npm run test:audio-mix`

Expected: all mix tests pass.

```bash
git add src/engine/audio-preview.ts src/engine/audio-tones.ts src/engine/audio-engine.ts scripts/audio-mix-graph.test.ts
git commit -m "Add mix-aware audio previews"
```

### Task 7: Build The Mixing Desk UI And TTS Tabs

**Files:**
- Create: `src/hooks/useAudioMixSettings.ts`
- Create: `src/components/AudioMixer.tsx`
- Create: `src/components/AudioMixerChannel.tsx`
- Create: `scripts/audio-mixer-ui.test.tsx`
- Modify: `src/app/tts-lab/page.tsx`
- Modify: `package.json`

- [ ] **Step 1: Write failing UI contract tests**

Render `AudioMixerChannel` to static markup and assert it has an accessible range input, mute button, and audition button. Source-check the page for `Voice Lab` and `Mixing Desk` tabs. Test an exported pure update helper:

```ts
expect(updateChannel(defaults, "footsteps:stone", { trimDb: -8 }).channels["footsteps:stone"].trimDb).toBe(-8);
expect(updateGroup(defaults, "tts", { muted: true }).groups.tts.muted).toBe(true);
expect(updateCompressor(defaults, { enabled: true }).compressor.enabled).toBe(true);
```

Assert `AudioMixer` renders master, compressor, ambience, footsteps, TTS, cues, reset, live-status text, and every registry asset label.

- [ ] **Step 2: Run and verify failure**

Run: `npm run test:audio-mix`

Expected: FAIL because the mixer components and test file do not exist.

- [ ] **Step 3: Implement the settings hook**

`useAudioMixSettings` must:

```ts
type UseAudioMixSettingsResult = {
  settings: AudioMixSettings;
  connected: boolean;
  liveAvailable: boolean;
  setSettings: (next: AudioMixSettings) => void;
  reset: () => void;
  ping: () => void;
};
```

Initialize from `loadAudioMix(window.localStorage)`, reconcile against `PREPARED_AUDIO_ASSETS` plus `tts:voice`, `cues:bleep`, and `cues:bloop`, save before publishing each complete update, and close the sync peer on unmount.

- [ ] **Step 4: Implement channel and mixer components**

Use range inputs with `min={-60}`, `max={6}`, `step={0.5}` and visible dB values. Group registry assets by category. Add fixed logical rows for TTS, bleep, and bloop. Keep turning under cues and bot-running under ambience. Use collapsible `<details>` groups so later files scale without widening the page.

The compressor panel uses these ranges:

```ts
thresholdDb: -60..0 step 1
ratio: 1..20 step 0.5
attackSec: 0..1 step 0.01
releaseSec: 0..1 step 0.01
makeupDb: -12..12 step 0.5
```

Show output and reduction meters only from the local preview analyser. Start the animation-frame loop only when the Mixing Desk tab is selected; cancel it on tab switch and unmount.

- [ ] **Step 5: Refactor `/tts-lab` into focused tabs**

Preserve all current Voice Lab state. Add a page-level union state:

```ts
const [activeTab, setActiveTab] = useState<"voice" | "mixer">("voice");
```

Move raw TTS playback through `AudioPreview.playTts(decodedBuffer)` so it follows TTS, master, and compressor settings. Continue using the synthesized blob only as input to `decodeAudioData`; revoke its object URL or remove object URLs entirely if decoding directly from `arrayBuffer()`.

- [ ] **Step 6: Add presence and reset behavior**

While `activeTab === "mixer"`, call `ping()` immediately and every two seconds. Display `Live /bot connected`, `Waiting for /bot`, or `Live updates unavailable`. Use `window.confirm("Reset the entire audio mix to project defaults?")` before reset. Reset preview and publish defaults immediately.

- [ ] **Step 7: Run UI, type, and lint verification**

Run: `npm run test:audio-mix && npm run typecheck && npm run lint`

Expected: all commands pass; no unhandled timer, AudioContext, or hook cleanup warnings are introduced.

- [ ] **Step 8: Commit the lab UI**

```bash
git add src/hooks/useAudioMixSettings.ts src/components/AudioMixer.tsx src/components/AudioMixerChannel.tsx src/app/tts-lab/page.tsx scripts/audio-mixer-ui.test.tsx package.json
git commit -m "Add live mixing desk to TTS lab"
```

### Task 8: Document And Verify The Complete Installation Flow

**Files:**
- Modify: `docs/how-the-bot-works.md`
- Modify: `docs/llm-handoff/README.md`
- Modify: `package.json`

- [ ] **Step 1: Update behavior documentation**

Document:

- `/tts-lab` Voice Lab and Mixing Desk tabs;
- `audio:prepare` as the discovery step;
- stable per-file IDs and automatic defaulting for new assets;
- browser-profile-only persistence;
- immediate same-origin `BroadcastChannel` updates;
- the four group buses and individual channels;
- master compressor parameters and default bypass;
- reset behavior;
- absence of remote/multi-device synchronization;
- no added Street View or review polling work.

- [ ] **Step 2: Put all focused tests in the default suite**

Ensure `npm test` includes `npm run test:audio-mix` after `test:audio-runtime` and before unrelated runtime suites.

- [ ] **Step 3: Run focused verification**

Run:

```bash
npm run test:audio-assets
npm run test:audio-runtime
npm run test:audio-mix
npm run typecheck
npm run lint
```

Expected: all commands exit zero.

- [ ] **Step 4: Run production verification**

Run: `npm run build`

Expected: Next.js production build completes and includes `/tts-lab` and `/bot` without browser-global server-render errors.

- [ ] **Step 5: Perform browser smoke testing**

Run `npm run dev`, open `/bot` and `/tts-lab` in the same browser profile, and verify:

1. Mixing Desk reports the bot connected.
2. Muting bot-running silences only the background loop immediately.
3. Footstep group and one individual footstep trim affect later successful steps.
4. TTS trim affects Voice Lab preview and the next bot review.
5. Bleep, bloop, and turning controls affect their respective cues.
6. Compressor enable and parameter changes are audible in previews without clicks.
7. Reloading both tabs retains the mix.
8. Reset restores project defaults in both tabs.
9. Closing `/bot` changes presence status without losing settings.

- [ ] **Step 6: Check the final diff and commit docs**

Run: `git diff --check && git status --short`

Expected: no whitespace errors; `data/db/would-not-recommend.db` remains unstaged.

```bash
git add docs/how-the-bot-works.md docs/llm-handoff/README.md package.json
git commit -m "Document TTS lab audio mixer"
```
