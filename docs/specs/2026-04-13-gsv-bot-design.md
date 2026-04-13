# GSV Bot — Design Spec

**Date:** 2026-04-13
**Status:** Draft — open decisions marked with `[OPEN]`
**Title:** Would Not Recommend

---

## 1. Core Concept

A gallery installation. A single screen. A bot wanders Google Street View autonomously. When it detects a nearby business, it stops, turns toward it, and reads a real 1-star review of that place aloud in a flat, monotone text-to-speech voice. Then it lingers, and walks away.

The bot does not write the reviews. It channels real human dissatisfaction. It is a vessel for complaint — a wandering critic that borrows other people's disappointment and delivers it with deadpan sincerity to an empty street.

The audience watches passively. There is no interaction. The bot does not acknowledge the audience. It speaks to no one. It simply walks, stops, reads, and moves on.

**What this is:** An artwork. A character piece. A system that produces atmosphere, comedy, and melancholy through rhythm and voice.

**What this is not:** A tech demo. A screensaver. A product. An AI showcase.

---

## 2. The Bot

### 2.1 Identity

The bot has no name yet `[OPEN]`. It has no backstory yet — only a condition: it is compelled to find businesses and read their worst reviews. It does not explain why. It does not question its purpose. It simply does this, endlessly.

It does not know it is inside Google Street View. It experiences the world as real — streets are streets, buildings are buildings, skies are skies. It has no awareness of its digital infrastructure.

### 2.2 Voice

- **Register:** Flat, monotone, deadpan. A bored bureaucrat. A tired reader. `[OPEN: subject to change — may evolve to something more expressive later]`
- **Delivery:** TTS. The bot reads reviews verbatim. No paraphrasing, no commentary (V1).
- **Between reviews:** Silent (V1). `[OPEN: the bot may eventually speak in its own voice between reviews — mutterings, observations, complaints. This is a future layer, not V1.]`

### 2.3 Personality (emergent, not authored in V1)

In V1, the bot's personality is expressed entirely through:
- Its movement (how it approaches, lingers, departs)
- Its choice of reviews (1-star only — it seeks out the worst)
- Its delivery (flat, serious, regardless of how absurd the review content is)
- Its persistence (it never stops, never gives up, never seems satisfied)

The comedy is structural: a monotone voice reading "The fries were cold and the manager looked at me weird" while staring at a strip mall in rural Ohio. The sadness is also structural: it will do this forever.

---

## 3. Behavior System

### 3.1 Movement States

The bot cycles through these states:

```
WANDER → DETECT → APPROACH → INSPECT → DELIVER → LINGER → DEPART → WANDER
```

| State | Description | Duration |
|---|---|---|
| **WANDER** | Bot moves through Street View. Advances along roads. Drifts. No particular urgency. | Variable — until a business is detected |
| **DETECT** | Bot senses a nearby business with a 1-star review. Begins gravitating toward it. | Brief — transition state |
| **APPROACH** | Bot moves toward the business. Not a straight line — it arrives naturally, like someone who noticed something. | 3–8 seconds |
| **INSPECT** | Bot stops. Pans slowly toward the business. Looks at it. A beat of silence. | 4–8 seconds |
| **DELIVER** | Bot reads the 1-star review via TTS. Screen may show subtitle text `[OPEN]`. | Duration of TTS playback |
| **LINGER** | Bot holds position after finishing the review. A beat of judgment. Silence. | 2–5 seconds |
| **DEPART** | Bot turns away and begins moving. Resuming its walk. | 2–4 seconds |
| **WANDER** | Returns to wandering. | Until next detection |

### 3.2 Movement Character

- Movement should feel authored, not procedural
- The bot does not move like a cursor. It moves like someone walking — with inertia, slight hesitations, imperfect panning
- Panning speed is slow and deliberate during INSPECT
- Advancing speed is moderate — not urgent, not sluggish. A steady, resigned walk

### 3.3 Timing and Rhythm

- **Minimum interval between reviews:** 10 seconds after a DEPART before the next DETECT can trigger
- **In dense areas (many businesses):** The bot does NOT read every review. The 10-second cooldown ensures it walks past most of them. It should feel like it's choosing, not processing a queue
- **In sparse areas (no businesses):** The bot wanders silently. This silence is intentional. The absence of reviews creates contrast and pacing
- **Teleportation:** When the bot has been wandering without finding a reviewable business for an extended period `[OPEN: how long?]`, or when it reaches a dead end, it teleports to a new location. Teleportation is a **smooth fade** — current scene fades through black, new scene fades in. Duration ~1–2 seconds `[OPEN: exact timing]`. Audio fades with the visual. The new location may start with a beat of silence before elevator music resumes.

### 3.4 Scene Selection and Geographic Bias

- The bot should have geographic and environmental biases `[OPEN: specific biases undefined]`
- Movement is **not random**. The bot gravitates toward businesses (mode C: drawn toward them, with drift as fallback)
- The bot should not revisit the same location or repeat the same review within a session
- Starting locations and teleport destinations should be curated or weighted — not purely random coordinates `[OPEN: weighting strategy]`

---

## 4. Review System

### 4.1 Data Source

- **Primary:** Google Places API (Nearby Search + Place Details)
- The bot queries for businesses near its current coordinates
- Filters for places that have at least one 1-star review
- Selects one 1-star review from the available set

### 4.2 Review Selection Logic

- When multiple 1-star reviews exist for a business, selection method is `[OPEN]`:
  - Random
  - Shortest (punchier, funnier)
  - Most recent
  - Most absurd (requires some filtering/scoring — complex)
- Reviews already read in this session are excluded (no repeats)
- Reviews that are too short (< 10 characters) or too long (> 500 characters) may be filtered `[OPEN: thresholds]`

### 4.3 Review Display

**Decision: TTS only (Option A).** No text on screen. No business name. No subtitles. The voice is disembodied. The screen shows only Street View. This is the stark, atmospheric choice — the audience must listen.

UI elements beyond the Street View panorama are `[OPEN]` — to be designed in a separate UI brainstorm. The screen is not necessarily bare; other non-text elements may exist. But review content is voice-only.

### 4.4 API Constraints

- Google Places API has usage costs and rate limits
- Review text access may be restricted — need to verify ToS compliance for public art installation
- Fallback strategy if API is unavailable: `[OPEN]` — cached dataset? Offline mode?
- Consider pre-caching reviews for locations along planned routes

---

## 5. Audio System

### 5.1 TTS

- Engine: `[OPEN]` — Web Speech API (free, limited voices), Google Cloud TTS (better quality, costs money), ElevenLabs (best quality, highest cost), or similar
- Voice character: flat, monotone, low affect. Not robotic — just tired
- Language: English for V1. Reviews in other languages are `[OPEN]` — skip, translate, or read phonetically?

### 5.2 Ambient / Generative Sound

- Between reviews, the installation is not silent — there is a low generative ambient layer
- The audio has two primary registers that alternate:
  - **WANDER:** Elevator music. Light, ambient, slightly absurd, institutional. The bot is on hold with reality. Not literal muzak — but that register. The gap between the mundane music and the endless wandering produces comedy. `[OPEN: exact character, source, and whether it varies across sessions]`
  - **DETECT/APPROACH:** Elevator music crossfades to low ambient over 3–5 seconds. Something shifts.
  - **INSPECT:** Low ambient or near-silence. The bot is looking.
  - **DELIVER:** Low ambient underneath TTS voice. Voice is primary.
  - **LINGER:** A beat of stillness.
  - **DEPART:** Ambient crossfades back to elevator music over 3–5 seconds.
- All transitions are smooth crossfades. No hard cuts.
- Audio engine: Web Audio API for generative synthesis
- Should also support loading audio files (samples, field recordings, sound effects)
- Transitions between sources should be smooth (crossfade, not hard cuts)

### 5.3 Sound Effects

- Teleportation may have a distinct sound `[OPEN: what kind?]`
- Panning/movement may have subtle spatial audio cues `[OPEN]`
- No music. No score. The sonic world is ambient and generative, not composed.

---

## 6. Screenshot and Memory System

### 6.1 Screenshots

- The bot captures a screenshot at each reviewed location
- Screenshot is taken during INSPECT state (the bot is facing the business)
- Saved to local storage with metadata
- Screenshot format: PNG or JPEG `[OPEN]`

### 6.2 Review Log

- Every review read is logged with:
  - Timestamp
  - GPS coordinates
  - Business name
  - Review text
  - Screenshot filename
  - Session ID
- The log is stored as JSON (or in a database `[OPEN]`)
- No review is repeated within a session
- The log is a potential future artwork layer (second screen, web archive, printed book)

### 6.3 Memory Across Sessions

- `[OPEN]` — Does the bot remember across sessions? Does it avoid re-reviewing places from previous sessions? For V1, session-scoped memory is sufficient. Persistent memory is a future feature.

---

## 7. Exhibition Format

### 7.1 Hardware

- Single screen (projected or monitor) `[OPEN: size/resolution]`
- Speakers (stereo minimum)
- Server running the bot (local machine or remote server with gallery display as client)
- `[OPEN]` Second screen for review log / diary / archive — deferred, not V1

### 7.2 Runtime

- The installation runs **perpetually** during exhibition hours. Can be turned off between shows.
- No browser chrome, no cursor, no system UI visible — full kiosk mode
- The bot starts automatically and runs without intervention
- Graceful recovery from API failures, network issues, dead ends
- **Loop/stuck detection:** The bot may get stuck in dead-end streets, coverage gaps, or repetitive loops. Needs automated detection and recovery. `[OPEN: detection criteria, recovery strategy, and timing thresholds to be designed]`
- **Persistent statistics database:** Track across all sessions:
  - Total distance roamed
  - Total locations scanned
  - Total reviews read aloud
  - Total screenshots captured
  - Session start/end times
  - Countries/regions visited
  - This data persists across restarts and accumulates over the exhibition's lifetime

### 7.3 Aspect Ratio and Resolution

- **Adaptive.** No fixed aspect ratio or resolution. The Street View panorama fills whatever screen is available; any UI elements overlay it responsively. Target hardware is a TV screen, but the layout should not assume specific dimensions.

---

## 8. Technical Architecture

### 8.1 Stack

| Layer | Technology |
|---|---|
| Framework | Next.js (React, TypeScript) |
| Styling | Tailwind CSS |
| Street View | Google Street View JavaScript API |
| Shaders / Effects | Three.js |
| TTS | `[OPEN]` — Web Speech API / Google Cloud TTS / ElevenLabs |
| Audio Engine | Web Audio API |
| Places Data | Google Places API |
| Storage | Local filesystem (screenshots) + SQLite (review log + persistent stats) |
| Deployment | Local server for gallery installation |

### 8.2 Component Architecture (high-level)

```
┌─────────────────────────────────────────────────┐
│                   Application                    │
├──────────┬──────────┬──────────┬────────────────┤
│ Street   │ Behavior │ Review   │ Audio          │
│ View     │ Engine   │ System   │ System         │
│ Module   │          │          │                │
│          │ - State  │ - Places │ - TTS          │
│ - Render │   machine│   API    │ - Ambient      │
│ - Pan    │ - Timer  │ - Review │   generator    │
│ - Move   │ - Scene  │   select │ - File player  │
│ - Coords │   detect │ - Log    │ - Mixer        │
├──────────┴──────────┴──────────┴────────────────┤
│                  UI Layer                        │
│  - Subtitle display                              │
│  - Visual effects / shaders                      │
│  - Kiosk mode                                    │
├─────────────────────────────────────────────────┤
│              Memory / Storage                    │
│  - Screenshot capture                            │
│  - Review log (JSON/SQLite)                      │
│  - Session management                            │
└─────────────────────────────────────────────────┘
```

### 8.3 Key Technical Risks

1. **Google Places API review access:** ToS may restrict displaying reviews outside Google properties. Must verify. If blocked, need an alternative data source.
2. **Street View coverage gaps:** Not all coordinates have Street View. Need fallback logic.
3. **API costs:** Places API + Street View API at continuous usage over hours/days. Need to estimate and budget.
4. **TTS quality vs. cost:** Free TTS (Web Speech API) may sound too robotic. Paid TTS adds recurring cost.
5. **Performance:** Continuous Street View rendering + audio generation + API calls. Must profile.

---

## 9. Open Decisions Summary

| ID | Decision | Options | Priority | Status |
|---|---|---|---|---|
| ~~O1~~ | ~~Project title~~ | ~~"Would Not Recommend"~~ | — | **Decided** |
| ~~O2~~ | ~~Review display~~ | ~~TTS only (A)~~ | — | **Decided** |
| O3 | TTS engine | Web Speech / Google Cloud / ElevenLabs | **High** | Open |
| O4 | Bot name and deeper identity | — | Medium | Open |
| O5 | Geographic biases | — | Medium | Open |
| O6 | Teleport trigger timing | — | Medium | Open |
| O7 | Review selection within a business | Random / shortest / recent | Low | Open |
| O8 | Non-English reviews | Skip / translate / read phonetically | Low | Open |
| O9 | Second screen content | Deferred | Low (V1) | Open |
| ~~O10~~ | ~~Persistent memory across sessions~~ | ~~Stats DB persists; review memory is session-scoped for V1~~ | — | **Decided** |
| ~~O11~~ | ~~Screen resolution / aspect ratio~~ | ~~Adaptive, no fixed ratio~~ | — | **Decided** |
| ~~O12~~ | ~~Session length~~ | ~~Perpetual during exhibition hours~~ | — | **Decided** |
| O13 | Teleport sound design | — | Low | Open |
| O14 | Google Places ToS compliance | Must verify | **High** | Open |
| ~~O15~~ | ~~UI elements beyond Street View~~ | ~~See ui-design.md: pulsing dot, coordinates, city/location, mode (Searching/Processing), session counter, timestamp~~ | — | **Decided** |
| O16 | Loop/stuck detection and recovery | Detection criteria, recovery strategy, timing | **High** | Open |
| O12 | Session length (perpetual vs. defined) | — | Medium |
| O13 | Teleport sound design | — | Low |
| O14 | Google Places ToS compliance | Must verify | **High** |

---

## 10. V1 Definition

**V1 is the minimum experience that is art, not demo.**

A person walks into the gallery. On the screen, a Street View scene. The view is moving slowly, wandering. Ambient sound hums quietly from the speakers. The bot notices a business. It turns. Pauses. Looks at it. A flat, monotone voice reads: *"Worst pizza I've ever had. The crust was like cardboard and the waiter rolled his eyes at me. Never coming back."* A beat of silence. The bot turns away. Walks on. The ambient hum returns.

The person watches for three minutes. They hear two more reviews. One is devastating. One is absurd. The bot never reacts. It just keeps walking.

That is V1.

### V1 Scope

**In scope:**
- Street View rendering and navigation
- Behavior state machine (wander → detect → approach → inspect → deliver → linger → depart)
- Google Places API integration for nearby businesses and 1-star reviews
- TTS playback of reviews
- Generative ambient sound layer with state-based transitions
- Audio file playback support with smooth transitions
- Screenshot capture at reviewed locations
- Review log (JSON, session-scoped, no repeats)
- Kiosk mode (no browser chrome)
- 10-second cooldown between reviews

**Out of scope for V1:**
- Bot's own voice / commentary between reviews
- Second screen
- Persistent memory across sessions
- Audience interaction
- Bot backstory / deeper identity
- Archive visualization
- Multi-language support
- Custom geographic route planning

---

## 11. Reference and Precedent

`[TO BE FILLED]` — Art references, technical precedents, and works that inform this project's tone and approach. Should include works that deal with: automated wandering, found text, deadpan delivery, surveillance infrastructure as medium, and the comedy of complaint.
