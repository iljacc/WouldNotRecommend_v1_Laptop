# Would Not Recommend — Full Design Specification

**Date:** 2026-04-13
**Status:** Draft — open decisions marked with `[OPEN]`

---

## 1. Core Concept

**Would Not Recommend** is a gallery installation. A single TV screen with speakers. On screen, a bot wanders Google Street View autonomously. It moves through real streets, real cities, real landscapes. When it detects a nearby business, it stops, turns toward it, inspects it, and reads a real 1-star review of that place aloud in a flat, monotone text-to-speech voice. Then it lingers. Then it walks away. Then it finds the next one.

The bot does not write the reviews. It channels real human dissatisfaction. It is a vessel for complaint — a wandering critic that borrows other people's disappointment and delivers it with deadpan sincerity to an empty street.

The audience watches passively. There is no interaction. The bot does not acknowledge the audience. It speaks to no one. It simply walks, stops, reads, and moves on. Perpetually.

### 1.1 What This Is

An artwork. A character piece. A system that produces atmosphere, comedy, and melancholy through rhythm, voice, and the absurd dedication of a machine to a pointless task.

### 1.2 What This Is Not

- Not a tech demo or AI showcase
- Not a screensaver
- Not a product or prototype for a product
- Not a game with goals or win conditions
- Not a social media content generator

### 1.3 Tone

All layers of the piece — visual, audio, voice, data — should cohere into a single register: **clinical, ambient, quietly absurd.** The visuals are systematic and data-like. The audio is ambient and atmospheric. The voice is flat and monotone. The content (real 1-star reviews) provides the comedy and humanity. The layers match and reinforce each other. There is no ironic contrast between them — they are one unified mood.

**Example of the intended experience:** A person walks into the gallery. On the TV, a Street View scene — a strip mall somewhere in the American Midwest. Small data elements glow faintly in the corners: coordinates ticking, a city name, the word "Searching." A quiet ambient hum fills the room. The view drifts forward slowly. Then the bot notices something. The word changes to "Processing." A soft bleep sounds. The view turns toward a pizza restaurant. Pauses. A flat voice says: "Worst pizza I've ever had. The crust was like cardboard and the waiter rolled his eyes at me. Never coming back." A soft bloop. The word changes back to "Searching." The ambient shifts. The bot turns away and keeps walking. The person watches for five more minutes. They hear three more reviews. One is devastating. One is petty. One is oddly poetic. The bot never reacts to any of them. It just keeps walking.

---

## 2. The Bot

### 2.1 Identity

The bot has no name. It has no backstory — only a condition: it is compelled to find businesses and read their worst reviews. It does not explain why. It does not question its purpose. It simply does this, endlessly.

It does not know it is inside Google Street View. It experiences the world as real — streets are streets, buildings are buildings, skies are skies. It has no awareness of its digital infrastructure. It does not know it has an audience.

### 2.2 Personality (V1)

In V1, the bot's personality is not authored through its own words. It is expressed entirely through:

- **Its movement** — how it approaches places (drawn, not rushed), how it lingers (judging, not savoring), how it departs (resigned, not dramatic)
- **Its choice of material** — 1-star reviews only. It seeks out the worst. It has no interest in praise.
- **Its delivery** — flat, monotone, regardless of how absurd or emotional the review content is. It reads "This place ruined my birthday" with the same tone as "Parking was fine."
- **Its persistence** — it never stops, never gives up, never seems satisfied, never finds what it's looking for (because it isn't looking for anything — it's just processing)

The comedy is structural: a monotone voice reading petty human complaints while staring at the actual place. The sadness is also structural: it will do this forever and it doesn't know why.

### 2.3 Voice

- **Delivery:** Text-to-speech. Flat, monotone, low affect. Not robotic — just tired. Like a bored bureaucrat reading case files at 4 PM on a Friday.
- **Content:** Verbatim 1-star reviews. No paraphrasing. No commentary. No editorializing. The bot reads exactly what the reviewer wrote.
- **Between reviews:** Silent. The bot does not speak in its own voice in V1.

**Example TTS deliveries** (imagine these in a flat, uninflected voice):

> "Waited forty minutes for a table. The hostess didn't even apologize. My steak was cold. My wife's salad had a hair in it. We will not be returning."

> "One star is generous. The bathroom smelled like a barn and the music was so loud I couldn't hear myself think."

> "Absolutely disgusting. I found a bandaid in my soup. When I told the manager he just shrugged."

> "Meh. Nothing special. Overpriced for what you get."

> "DO NOT COME HERE. They charged me twice and when I called to complain nobody picked up the phone."

The range of human complaint — from the furious to the defeated to the oddly specific — is the content. The bot flattens all of it into the same monotone. That flattening is the artistic gesture.

### 2.4 Future Voice (Post-V1)

`[OPEN]` In future versions, the bot may develop its own voice — mutterings, observations, complaints of its own between reviews. This is not V1 scope but the architecture should not prevent it.

---

## 3. Behavior System

### 3.1 State Machine

The bot cycles through these states:

```
WANDER → DETECT → APPROACH → INSPECT → DELIVER → LINGER → DEPART → WANDER
```

Each state has a defined character, duration, and set of actions.

### 3.2 WANDER

**What happens:** The bot moves through Street View. It advances along roads, turns at intersections, drifts through neighborhoods. It is searching — not for anything specific, but for the next business with a 1-star review.

**Movement character:** Steady, unhurried, resigned. Not fast, not sluggish. A walking pace. The bot does not look around frantically — it moves forward with a kind of dull purpose.

**Duration:** Variable. Could be 10 seconds in a dense commercial area, could be several minutes on a rural highway.

**Audio:** Ambient layer A (searching ambient). Quiet, continuous.

**UI mode indicator:** `Searching`

**Example:** The bot moves down a residential street in Osaka. Houses, fences, parked bicycles. No businesses nearby. The coordinates tick. The ambient hums. The bot advances steadily, panning slightly at a corner, choosing a direction, continuing. Thirty seconds of this. The audience watches the world go by.

### 3.3 DETECT

**What happens:** The bot's system identifies a nearby business that has at least one 1-star review. The bot begins gravitating toward it. This is a transition state — brief.

**Movement character:** The bot's direction shifts. It's no longer drifting — it has a target. But it doesn't snap to the business. It curves toward it naturally, like someone who noticed something across the street.

**Duration:** 2–4 seconds.

**Audio:** Ambient begins crossfading from layer A (searching) to layer B (processing). The transition is gradual, not abrupt.

**Example:** The bot is walking down a main road in suburban Ohio. A strip mall appears ahead on the right. The bot's path, which was following the road, starts angling toward the parking lot. Something has been detected.

### 3.4 APPROACH

**What happens:** The bot moves toward the detected business. Getting closer. The movement becomes more deliberate.

**Duration:** 3–8 seconds, depending on how far the business is from the bot's current position.

**Audio:** Crossfade continues. By the end of APPROACH, the audio is fully on ambient layer B (processing ambient).

**Sound effect:** A soft **bleep** sounds at the moment the bot commits to the approach — the mode transition from Searching to Processing. This is the moment the UI changes.

**UI mode indicator:** Changes to `Processing` at the bleep.

**Example:** The bot turns into the strip mall parking lot. The view shows a pizza restaurant, a nail salon, a check-cashing place. The bot is heading toward the pizza restaurant. A soft electronic tone — *bleep*. The UI says "Processing."

### 3.5 INSPECT

**What happens:** The bot stops moving. It pans slowly toward the business — turning its view to face it directly. It looks at the place. A beat of silence. The bot is... evaluating? Preparing? Just looking.

**Movement character:** No forward movement. Slow, deliberate pan. The camera rotation speed should feel like someone slowly turning their head to look at something.

**Duration:** 4–8 seconds. The pan itself takes 2–4 seconds. Then a pause of 2–4 seconds of stillness — the bot facing the business, not moving, not speaking.

**Audio:** Ambient layer B, low. The quiet before the voice.

**Example:** The bot has stopped in front of the pizza restaurant. The view slowly rotates until the restaurant's facade is centered on screen. The sign reads "Tony's Famous Pizza." The bot stares at it. Two seconds of silence. Three. The ambient hums quietly.

### 3.6 DELIVER

**What happens:** The bot reads a 1-star review of the business via TTS. Verbatim. No introduction, no context, no "this place has received the following review." It just starts reading.

**Movement character:** The bot is still. No panning. No movement. The camera holds on the business while the voice speaks.

**Duration:** The length of the TTS playback. Varies with review length — typically 5–20 seconds.

**Audio:** Ambient layer B drops to very low — present but not competing with the voice. TTS is the dominant audio.

**Example:** The bot is facing Tony's Famous Pizza. The flat voice begins: "Ordered a large pepperoni for delivery. Took an hour and a half. When it arrived the box was upside down and the pizza was stuck to the lid. Called to complain and they hung up on me. One star is too many." The voice stops.

### 3.7 LINGER

**What happens:** The bot remains still after the review. A beat of silence. The bot is staring at the place it just reviewed. It doesn't react. It doesn't nod or sigh or comment. It just... holds.

**Movement character:** Still. No forward movement. A very subtle slow zoom or drift — the camera pushes in slightly over the linger period. Not dramatic. 2–3% zoom over the duration. The effect is: the bot is staring. Holding judgment.

**Duration:** 2–5 seconds of post-review stillness.

**Audio:** Ambient layer B. The voice is gone. Just the ambient and the image.

**Example:** The voice has stopped. Tony's Famous Pizza fills the screen. The view drifts in very slightly — barely perceptible. The bot is looking at this place. Two seconds. Three. Then —

### 3.8 DEPART

**What happens:** The bot turns away from the business and begins moving again. Resuming its walk.

**Movement character:** The bot pans away from the business (the slow zoom/drift resets) and starts advancing in a new direction. Not dramatic. Just... done with this place.

**Duration:** 2–4 seconds to turn and start moving.

**Audio:** Ambient begins crossfading from layer B (processing) back to layer A (searching).

**Sound effect:** A soft **bloop** sounds at the moment of departure — the mode transition from Processing back to Searching. This is the companion to the arrival bleep.

**UI mode indicator:** Changes back to `Searching` at the bloop.

**Example:** The bot turns away from Tony's Famous Pizza. A soft electronic tone — *bloop*. The view rotates back to the road. The UI says "Searching." The bot starts walking. The ambient shifts. It's looking for the next one.

### 3.9 Timing and Rhythm

**Cooldown:** After a DEPART, there is a **minimum 10-second cooldown** before the next DETECT can trigger. Even if the bot passes businesses during this window, it ignores them. This prevents the bot from becoming a review-reading machine gun in dense commercial areas.

**Natural pacing example in a dense area:**
1. Bot reads a review at a restaurant (DELIVER: 12 seconds)
2. Bot lingers, departs (*bloop*), starts walking (8 seconds)
3. 10-second cooldown — bot walks past a hair salon, a bank, a dry cleaner. Ignores them.
4. Cooldown expires. Bot detects a gas station ahead. *Bleep*. Approaches.
5. Total time between reviews: ~30–40 seconds including the cooldown, walking, and approach.

**Natural pacing example in a sparse area:**
1. Bot finishes a review at a roadside diner.
2. Bot departs. Walks along a rural highway.
3. No businesses for 3 minutes. The bot just walks. Ambient hums. Coordinates tick.
4. A small town appears. The bot detects a motel. *Bleep*.

**The silence between reviews is as important as the reviews themselves.** The wandering state is not filler — it is the experience. The audience watches the world go by. The rhythm of long silence punctuated by a flat voice reading a complaint is the rhythm of the piece.

### 3.10 Teleportation

**When it triggers:** `[OPEN: exact criteria to be designed]` Likely conditions:
- The bot has been wandering for an extended period without finding a reviewable business
- The bot reaches a dead end (no further Street View coverage)
- The bot gets stuck in a loop (revisiting the same streets)

**What it looks like:** A **smooth fade**. The current scene fades to black over ~0.5–1 second. A brief hold on black (~0.5 second). The new scene fades in over ~0.5–1 second. Total transition: ~1.5–2.5 seconds.

The fade should feel like the bot blinked and opened its eyes somewhere completely different. Not dramatic. Not glitchy. Just — gone, and now here.

**What it sounds like:** Audio fades with the visual. A brief moment of silence on the black screen. Then the searching ambient fades in with the new scene.

**Where it goes:** `[OPEN: teleport destination strategy]` The new location should be meaningfully different from the current one — different country, different climate, different density. Not a random coordinate — a curated or weighted selection from a pool of starting points.

**Example:** The bot has been walking along a highway in Nevada for four minutes. Nothing but desert and road. The image begins to fade. Black screen for half a second. Then: a wet street in Seoul. Neon signs. Parked scooters. The ambient fades in. The coordinates have jumped. The city name reads "Seoul, South Korea." The bot starts walking as if nothing happened.

### 3.11 Stuck / Loop Detection

`[OPEN: full design needed]`

The bot must survive unattended operation for hours. It will encounter:
- Dead-end streets with no forward path
- Areas with no Street View coverage
- Loops where it circles the same block
- API failures or timeouts

Detection and recovery strategy must be designed. Likely approach: if the bot has not successfully completed a review cycle in N minutes, or if its coordinates have not changed significantly in N seconds, trigger a teleport. Exact thresholds to be determined through testing.

---

## 4. Review System

### 4.1 Data Source

**Google Places API** (Nearby Search + Place Details).

The bot queries for businesses near its current GPS coordinates. It filters for places that have at least one 1-star review. It selects one review and reads it.

### 4.2 Query Logic

1. Bot's current coordinates are sent to Google Places Nearby Search API
2. Results are filtered: must have at least one review with a 1-star rating
3. The nearest qualifying business is selected
4. A 1-star review is selected from that business's reviews
5. The review text is sent to TTS

**Example API flow:**
- Bot is at `40.7580° N, 73.9855° W` (Times Square, New York)
- Nearby Search returns 47 businesses within radius
- 31 of them have at least one 1-star review
- Nearest qualifying business: "Olive Garden Times Square" (82 meters away)
- 1-star review selected: "Two hour wait. Breadsticks were stale. The waiter forgot our drinks. This is not Italy."
- Bot approaches, inspects, reads.

### 4.3 Review Selection Within a Business

When a business has multiple 1-star reviews, the selection method is `[OPEN]`:
- **Random** — simplest, unpredictable
- **Shortest** — punchier, funnier, better for pacing
- **Most recent** — freshest complaints
- Likely: random for V1, with length filtering (see 4.4)

### 4.4 Review Filtering

Not all 1-star reviews are equal. Filters:

- **Minimum length:** Reviews under ~20 characters are often just "Bad" or "Terrible." These are too short to be interesting as spoken content. Skip them.
  - Example skipped: "Bad." / "Meh" / "0/10"
  - Example kept: "The soup was cold and the waitress was rude."

- **Maximum length:** Reviews over ~500 characters become monologues. The bot standing still for 60+ seconds reading a wall of text breaks the rhythm. Skip or truncate.
  - Example skipped: A 2000-character essay about a bad hotel experience
  - Example kept: A 200-character focused complaint

- **Language:** V1 is English only. Reviews in other languages are skipped.
  - `[OPEN: future versions may translate, read phonetically, or support multiple TTS languages]`

- **No repeats:** A review that has been read in this session is never read again. Tracked by review ID or text hash.

### 4.5 Google Places API Constraints

- **Cost:** Places API charges per request. Query frequency must be conservative to keep costs low. The bot should NOT scan every second — query only when the bot has moved a meaningful distance from its last query point (e.g., every 50–100 meters of movement, or every 30–60 seconds, whichever is longer). Implement a query cache: if the bot is still in the same area, reuse previous results. `[OPEN: exact query interval and distance threshold to be tuned — goal is minimal API spend]`

- **Rate limits:** Default quota is sufficient for a single installation. Not a concern unless running multiple instances.

- **Terms of Service:** Google Places API is confirmed usable. Review content can be fetched and read via TTS.

- **Coverage:** Not all businesses have 1-star reviews. Not all locations have businesses. The review system must gracefully handle "nothing to review here" (the bot keeps wandering).

---

## 5. UI System

### 5.1 Principle

The screen is a window, not an interface. Street View fills the entire screen edge to edge. UI elements are small, quiet, peripheral — they exist to give the audience just enough data to understand that something is alive and operating, without explaining what it is or how it works.

The visual register of the UI is **clinical and data-like**. Monospace type. Ticking numbers. A pulsing dot. This is a system that is scanning and processing. The UI communicates machine, not personality.

### 5.2 Layout

All UI elements are positioned in the lower portion of the screen. The upper area is always uninterrupted Street View.

```
┌──────────────────────────────────────────────────────┐
│                                                      │
│                                                      │
│                                                      │
│             Street View Panorama                     │
│             (full screen, edge to edge)              │
│                                                      │
│                                                      │
│                                                      │
│                                                      │
│  [●]                                       [coords]  │
│  [mode]                                 [city/loc]   │
│  [counter]                             [timestamp]   │
└──────────────────────────────────────────────────────┘
```

`[OPEN: exact positioning to be finalized during prototyping. Left/right grouping above is a starting point. Elements may move.]`

### 5.3 Pulsing Dot

A small dot. Always visible. Pulses with the bot's state.

- **Searching:** Slow, calm pulse. Inhale, exhale. ~2-second cycle. The bot is idle, scanning.
- **Processing:** Pulse quickens or holds steady. ~1-second cycle or continuous glow. The bot is engaged.
- **Teleporting:** Dot fades with the screen. Returns with the new scene.

No label. No tooltip. It is the bot's heartbeat. The audience may not consciously register it, but it communicates liveness.

- Size: small. ~6–10px diameter. `[OPEN: exact size during prototyping]`
- Color: `[OPEN]` — white is the safe choice. Could be subtly tinted (warm when processing, cool when searching) to cohere with the color grading. Must not be distracting.

**Example:** The dot pulses slowly as the bot walks. When the bot detects a business and the bleep sounds, the dot's rhythm shifts — faster, or it holds bright. When the review ends and the bloop sounds, the dot returns to its slow pulse.

### 5.4 Coordinates

Latitude and longitude. Ticking as the bot moves.

- Monospace typeface
- Small — readable from gallery distance (~2–3 meters from a TV) but not prominent
- No label. No "LAT:" or "LNG:" prefix. Just the numbers.
- Format example: `48.8566° N, 2.3522° E` `[OPEN: exact format — decimal degrees with direction, or raw decimal, or DMS]`
- Updates smoothly as the bot moves — the numbers tick, they don't jump

**Example:** The coordinates read `34.0522° N, 118.2437° W`. The bot is walking. The last two decimal places of each number tick steadily. After a teleport, both numbers change completely — `35.6762° N, 139.6503° E`. The jump is visible. The audience understands: the bot just traveled very far.

### 5.5 Current City + Location

The name of the place the bot is currently in. Derived from reverse geocoding of current coordinates.

- Plain text, small
- Updates when the bot enters a new area — not every frame, just when the locality changes
- `[OPEN: specificity level — city + country? neighborhood? street?]`

**Format examples:**
- `Paris, France`
- `Shibuya, Tokyo, Japan`
- `Rural Route 4, Nebraska, USA`
- `Unknown` (when geocoding fails or returns no result)

**Example:** The bot is walking through a residential area. The location reads `Nakano, Tokyo, Japan`. The bot teleports. The screen fades. When it returns, the location reads `Reykjavik, Iceland`. The contrast is immediate and disorienting.

### 5.6 Mode Indicator

Displays the bot's current operational mode.

Two values:
- **`Searching`** — the bot is wandering, looking for something to review
- **`Processing`** — the bot has found a business and is in the inspect/deliver/linger cycle

The transition between modes is marked by the bleep/bloop sound effects (see Audio section). The text changes at the same moment as the sound.

- Plain text, small
- `[OPEN: casing — lowercase `searching` / `processing`, Title Case `Searching` / `Processing`, or ALL CAPS `SEARCHING` / `PROCESSING`? Casing affects the feel. Lowercase is quiet. Title case is neutral. All caps is more data-terminal.]`

**Example:** The UI reads `Searching`. The bot walks for 45 seconds. Then — *bleep* — the UI changes to `Processing`. The bot stops, pans toward a laundromat, reads a review. Fifteen seconds later — *bloop* — the UI changes back to `Searching`. The bot walks on.

### 5.7 Session Counter

A number. How many reviews the bot has read this session. Increments by 1 after each DELIVER state completes.

- Just the number. No label.
- `[OPEN: bare number (e.g., `17`) or with a minimal prefix/suffix? Lean toward bare. The audience figures out what it counts. Or doesn't.]`

**Example:** A visitor walks into the gallery. The counter reads `47`. They watch for ten minutes. The bot reads two reviews. The counter now reads `49`. The visitor understands: this has been going on for a while. Forty-nine complaints and counting.

### 5.8 Timestamp

Real clock time or elapsed session time. `[OPEN: which is stronger?]`

- **Real time** (e.g., `14:32:07`): Reinforces that this is live, happening right now. The bot is out there, right now, reading a bad review of a restaurant in Portugal.
- **Elapsed time** (e.g., `03:22:07`): Reinforces duration. This has been going on for three hours. The bot has been doing this for three hours.

Both are valid. Elapsed time is more poignant for a gallery setting — the number grows all day.

- Monospace. Small. Updates every second.

**Example (elapsed):** A visitor arrives at 2 PM. The timestamp reads `04:17:33`. The installation started at ~10 AM. The bot has been walking and reading reviews for over four hours. The visitor watches for five minutes. The timestamp reads `04:22:33`. The bot has read one review in that time. It's been doing this all day.

### 5.9 Typography

`[OPEN: specific typeface to be selected during prototyping]`

Direction:
- **Monospace for everything.** Coordinates, timestamp, counter, mode, and city/location are all rendered in the same monospace typeface. This reinforces the data-crawler aesthetic: the entire UI looks like a terminal readout. The bot is a system, not a personality.
- Weight: light or regular. Nothing bold. These elements do not demand attention.
- Size: small. Readable from 2–3 meters but not dominant. The Street View image is always the primary visual.
- Color: white or very light gray. Moderate opacity (60–80%). Visible against most Street View backgrounds but not bright. Should not compete with the image.
- `[OPEN: do the UI elements need a subtle dark backdrop/shadow for legibility against bright Street View scenes? A very faint dark gradient at the bottom of the screen could help without being visible as a design element.]`

**Example typeface candidates:** `IBM Plex Mono`, `JetBrains Mono`, `Space Mono`, `Roboto Mono`, `Fira Code`. All are clean, legible monospace faces. Selection depends on the exact feel during prototyping — more technical, more literary, more neutral.

---

## 6. Visual Effects

### 6.1 Processing Level: 3 out of 10

Street View should look like Street View. The bot sees the real world. The image should feel real and unmanipulated. Visual effects are subtle enough that the audience is not sure they're happening.

If someone says "cool shader effect," the effect is too strong. Dial it back.

### 6.2 Color Grading — State-Linked

Barely perceptible shifts in color temperature tied to the bot's state. Applied via Three.js shader.

| State | Color Treatment | Example |
|---|---|---|
| **Searching** | Neutral. Minimal processing. Street View as-is, or very slightly cool (blue tint). | The world looks normal. Maybe slightly muted. |
| **Detect / Approach** | A barely perceptible warmth entering. | The image shifts 2–3% warmer. The audience doesn't notice consciously. |
| **Inspect** | Slightly warmer. The bot is paying attention. | A subtle golden cast. Very slight. |
| **Deliver** | Neutral or very slightly desaturated. The voice is the focus. | The world fades back half a step. The image is not the point right now. |
| **Linger** | Hold. Stillness in the color. | Same as deliver. Holding. |
| **Depart** | Gradual return to neutral/cool. | The warmth drains out. Back to searching. |

Transition speed: gradual. Over 2–4 seconds. Never abrupt.

**The test:** Show the installation to someone for 5 minutes and ask them if the color changes. If they say "I think so? I'm not sure" — that's correct. If they say "yes, it goes warm when it stops" — it's too strong.

### 6.3 Slow Zoom / Drift — LINGER State

After the review is read (DELIVER ends, LINGER begins), the camera subtly zooms in or drifts over 2–5 seconds. Very slight: 2–3% zoom. The bot is staring. Holding its gaze at the place it just reviewed.

The zoom resets on DEPART — the camera pulls back to normal framing as the bot turns away.

**Example:** The voice finishes reading a review of a gas station. Silence. The gas station fills the frame. The view pushes in very slightly — the gas station gets imperceptibly closer. Two seconds. Three. Then the bot turns away, the zoom releases, and it starts walking.

### 6.4 Teleport Transition

A smooth fade through black.

**Sequence:**
1. Current scene begins fading to black (~0.5–1 second)
2. Screen holds on black (~0.5 second)
3. New scene fades in (~0.5–1 second)

Total: ~1.5–2.5 seconds. `[OPEN: exact timing to be tuned during prototyping]`

Not a glitch. Not a hard cut. Not a wipe or dissolve between scenes. A fade to black and back. The bot closed its eyes and opened them somewhere else.

**Example:** The bot has been walking a desert highway for four minutes. The image fades to black. Half a second of darkness. Then: a rainy street in Lisbon. Cobblestones. Tram tracks. The ambient fades in. The coordinates have jumped from `36.7° N, 115.1° W` to `38.7° N, 9.1° W`. The city reads `Lisbon, Portugal`. The bot starts walking as if nothing happened.

### 6.5 What Is NOT Applied

Explicitly excluded:
- No film grain or scan lines
- No vignette
- No chromatic aberration
- No bloom or glow
- No noise
- No CRT or analog emulation
- No heavy post-processing of any kind

The world should look real. The bot sees reality. We don't filter reality for it.

---

## 7. Audio System

### 7.1 Architecture

The audio system has four layers that are mixed together:

```
Layer 1: Ambient A (searching)     ──┐
Layer 2: Ambient B (processing)    ──┤── Mixer ── Output
Layer 3: TTS voice                 ──┤
Layer 4: Sound effects (bleep/bloop)──┘
```

Only one ambient layer is active at a time. Transitions between them are smooth crossfades. TTS and sound effects play over the active ambient.

Engine: Web Audio API for mixing, crossfading, and generative synthesis. Must also support loading and playing audio files (samples, loops) so that ambient textures can be swapped, tested, and varied.

### 7.2 Ambient A — Searching State

The sound of the bot wandering. This plays during WANDER state — the majority of the runtime.

Character: `[OPEN — to be designed and prototyped]`

Direction: a continuous, low ambient texture. Not silence. Not music. Something between a hum and an atmosphere. The sound of a system idly operating. Of a machine that is scanning but hasn't found anything yet.

**Possible directions to prototype:**
- A low synthetic drone with very slow modulation — like the hum of a server room heard from far away
- A processed field recording of ambient city noise, abstracted to the point of unrecognizability — just texture, no identifiable sounds
- A generative pad that evolves very slowly — tonal but not melodic

The ambient should be quiet enough that the gallery is not "loud" but present enough that the room is not silent. A visitor should be able to have a conversation but be aware that sound is happening.

### 7.3 Ambient B — Processing State

The sound of the bot engaged with a place. This plays during DETECT, APPROACH, INSPECT, DELIVER, and LINGER.

Character: `[OPEN — to be designed and prototyped]`

Direction: different from Ambient A but in the same register. Not a dramatic shift — a textural change. Like the same room, but something has changed. The air is slightly different.

**Possible directions to prototype:**
- The same drone/hum as Ambient A but pitched slightly differently or with a different harmonic
- A more focused, narrower sound — less diffuse, more centered. The bot's attention has narrowed.
- A subtle tonal element that wasn't present in A — a faint note or resonance that signals "something is happening"

During DELIVER (TTS playing), Ambient B drops to very low — present but not competing with the voice. The voice is always the primary audio during a review.

### 7.4 Crossfade Between Ambients

The transition between Ambient A and Ambient B is a smooth crossfade over 3–5 seconds.

**A → B (Searching → Processing):**
- Triggered at DETECT state
- By the end of APPROACH, the crossfade is complete
- Ambient A has faded out, Ambient B is fully present

**B → A (Processing → Searching):**
- Triggered at DEPART state
- By the time the bot is fully walking again, Ambient A has returned
- Ambient B has faded out

**There are no hard audio cuts anywhere in the system.** Every transition is a crossfade or fade. The audio world is continuous.

### 7.5 Sound Effects — Bleep and Bloop

Two distinct sound effects mark the transitions between modes.

**Bleep (entering Processing):**
- Plays at the moment of DETECT → APPROACH transition
- A soft, short electronic tone. Clean. Not aggressive. Not an alert. More like... a register. A data point logged.
- Think: the sound a medical monitor makes when something is noted. Or the sound of a scanner acknowledging a barcode. Functional, not dramatic.
- Duration: ~0.3–0.5 seconds
- `[OPEN: exact sound design — pitch, timbre, envelope. To be prototyped.]`

**Bloop (exiting Processing):**
- Plays at the moment of LINGER → DEPART transition
- A soft, short electronic tone. Companion to the bleep but distinct — slightly lower pitch, or slightly different timbre, or a descending contour vs. the bleep's ascending contour.
- Same register as the bleep: functional, clean, quiet.
- Duration: ~0.3–0.5 seconds
- `[OPEN: exact sound design. To be prototyped.]`

**The bleep and bloop are the only non-ambient, non-voice sounds in the piece.** They are the punctuation of the rhythm. *Bleep* — the bot has found something. Review plays. *Bloop* — the bot is done. Moving on.

**Example pairing:**
- Bleep: a soft ascending two-note tone. Like `do-mi` but very short, synthetic, quiet.
- Bloop: a soft descending two-note tone. Like `mi-do`. Same timbre. The mirror of the bleep.

### 7.6 TTS

- **V1 engine: Web Speech API.** Free, built into the browser. Voice quality is limited but sufficient for prototyping and early exhibition. The monotone, slightly robotic quality may actually serve the piece — the bot is a machine reading human complaints.
- **Future upgrade path:** The TTS system should be architected so the engine is swappable. ElevenLabs API can be plugged in later for higher quality voices without changing the rest of the system. The interface is: text in → audio out.
- Voice character: flat, monotone, low affect. Not robotic — just uninterested. The voice should sound like it could be a human who doesn't care, not like a machine that can't care.
- Speed: normal or slightly slow. Not rushed. The bot is in no hurry.
- `[OPEN: voice gender, pitch, specific Web Speech API voice — to be selected during prototyping by testing available voices against actual review text]`

### 7.7 Audio File Support

The audio system must support loading audio files (WAV, MP3, OGG) as alternatives or supplements to generative synthesis. This allows:
- Swapping ambient textures without changing code
- Testing different moods by dropping in different audio files
- Introducing variety across long sessions (rotate between ambient files)
- Using authored sound effects for bleep/bloop instead of synthesized ones

Files should be loadable from a local directory. The crossfade and mixing system works the same regardless of whether the source is generative or file-based.

### 7.8 Teleport Audio

During a teleport fade:
1. All audio (ambient + any residual TTS) fades out with the visual fade (~0.5–1 second)
2. Silence during the black screen hold (~0.5 second)
3. Ambient A (searching) fades in with the new scene (~0.5–1 second)

The bot resumes in Searching mode at the new location. The ambient returns as if the bot just woke up somewhere new.

---

## 8. Screenshot and Memory System

### 8.1 Screenshots

The bot captures a screenshot at each reviewed location.

- **When:** During INSPECT state, after the bot has panned to face the business. The screenshot shows what the bot sees when it reads the review.
- **Format:** `[OPEN: PNG (lossless, larger) or JPEG (smaller, lossy)]`
- **Naming:** `[OPEN]` — suggested: `{session_id}_{timestamp}_{counter}.{ext}` e.g., `ses_20260413_143207_017.png`
- **Storage:** Local filesystem in a designated screenshots directory

**Example:** The bot is facing a laundromat in Chicago. It's about to read a review. A screenshot is captured: the Street View image of the laundromat, exactly as displayed on screen (minus UI overlay). Saved as `ses_20260413_143207_017.png`.

### 8.2 Review Log

Every review read is logged with metadata.

**Log entry schema:**
```json
{
  "session_id": "ses_20260413",
  "entry_number": 17,
  "timestamp": "2026-04-13T14:32:07Z",
  "coordinates": {
    "lat": 41.8781,
    "lng": -87.6298
  },
  "city": "Chicago, Illinois, USA",
  "business_name": "Sparkle Clean Laundromat",
  "business_type": "laundromat",
  "review_text": "Machines eat your quarters and half of them don't work. The owner sits in the corner watching TV and ignores everyone. Bring your own detergent because theirs is watered down.",
  "review_rating": 1,
  "review_language": "en",
  "tts_duration_seconds": 14.2,
  "screenshot_filename": "ses_20260413_143207_017.png"
}
```

- Storage: SQLite database (lightweight, single-file, no server needed). `[OPEN: or JSON Lines file for simplicity?]`
- No review is repeated within a session (tracked by review text hash or source review ID)
- The log persists after the session ends — it is a permanent record

### 8.3 Persistent Statistics Database

Tracks cumulative data across all sessions. Persists across restarts.

**Statistics tracked:**
| Metric | Description | Example |
|---|---|---|
| Total sessions | Number of times the installation has been started | `23` |
| Total runtime | Cumulative time the bot has been active | `187:42:33` |
| Total distance roamed | Approximate distance traveled in km (calculated from coordinate changes) | `4,217 km` |
| Total locations scanned | Number of businesses detected (including those skipped due to no 1-star reviews) | `12,847` |
| Total reviews read | Number of reviews delivered via TTS | `1,043` |
| Total screenshots captured | Number of screenshots saved | `1,043` |
| Countries visited | Set of unique countries the bot has been in | `["USA", "Japan", "France", ...]` |
| Total teleports | Number of teleportation events | `89` |

Storage: SQLite (same database as review log). Updated in real time.

This data is not displayed on the main screen in V1. It is infrastructure — available for a future second screen, web dashboard, printed report, or exhibition text.

**Example exhibition text using this data:** "Over the past three weeks, the bot has walked 4,217 kilometers across 31 countries and read 1,043 one-star reviews aloud. It has not found anything it likes."

### 8.4 Memory Across Sessions

- **V1:** Session-scoped memory only. When the installation restarts, the bot does not remember where it's been. It may re-review businesses from previous sessions.
- **Future:** Persistent memory. The bot avoids re-reviewing places. Its territory expands over time. The archive grows. `[OPEN: post-V1 feature]`

---

## 9. Exhibition Format

### 9.1 Hardware

- One TV screen (size `[OPEN]`)
- Speakers (stereo minimum, positioned near the screen)
- One computer running the bot (local machine — laptop or mini PC behind/near the screen)
- Network connection (for Google APIs)
- `[OPEN]` Second screen — deferred, not V1. Potential use: review log, statistics, archive visualization.

### 9.2 Runtime

- The installation runs **perpetually** during exhibition hours
- Can be turned off between shows (overnight, between exhibition days)
- On startup, the bot begins a new session immediately — no configuration, no setup screen
- No browser chrome, no cursor, no system UI — full kiosk mode
- Graceful recovery from API failures, network interruptions, Street View coverage gaps
- Automatic stuck/loop detection and recovery via teleport (see 3.11)

### 9.3 Screen Adaptation

- Layout is **adaptive** — not tied to a specific resolution or aspect ratio
- Street View panorama fills whatever screen is connected
- UI elements position themselves relative to screen edges
- Must look correct on both 1080p and 4K TVs, and on any aspect ratio from 16:9 to ultrawide

### 9.4 Gallery Context

- The title "Would Not Recommend" appears on the gallery placard next to the screen, not on screen
- No explanatory text on screen. The work explains itself through observation, or doesn't.
- The audio should be present but not overwhelming — a visitor can stand and listen, or pass by and catch a fragment
- The piece rewards both brief encounters (hear one review, get the gist) and extended viewing (the rhythm, the accumulation, the silence between reviews)

---

## 10. Technical Architecture

### 10.1 Stack

| Layer | Technology |
|---|---|
| Framework | Next.js (React, TypeScript) |
| Styling | Tailwind CSS |
| Street View | Google Street View JavaScript API |
| Shaders / Visual Effects | Three.js |
| TTS | Web Speech API (V1). Swappable to ElevenLabs later. |
| Audio Engine | Web Audio API |
| Places Data | Google Places API (Nearby Search + Place Details) |
| Geocoding | Google Geocoding API (reverse geocoding for city/location display) |
| Database | SQLite (review log + persistent statistics) |
| Screenshots | Local filesystem |
| Deployment | Local machine for gallery installation |

### 10.2 Component Architecture

```
┌──────────────────────────────────────────────────────────┐
│                      Application                          │
├────────────┬────────────┬────────────┬───────────────────┤
│ Street     │ Behavior   │ Review     │ Audio             │
│ View       │ Engine     │ System     │ System            │
│ Module     │            │            │                   │
│            │ - State    │ - Places   │ - TTS engine      │
│ - Render   │   machine  │   API      │ - Ambient A       │
│ - Pan      │ - Timers   │ - Review   │ - Ambient B       │
│ - Move     │ - Cooldown │   filter   │ - Crossfader      │
│ - Teleport │ - Stuck    │ - Review   │ - SFX (bleep/     │
│ - Coords   │   detect   │   select   │   bloop)          │
│            │ - Teleport │ - Dedup    │ - File loader     │
│            │   trigger  │            │ - Master mixer    │
├────────────┴────────────┴────────────┴───────────────────┤
│                     UI Layer                              │
│  - Pulsing dot          - Mode indicator                  │
│  - Coordinates          - Session counter                 │
│  - City/location        - Timestamp                       │
│  - Kiosk mode (strip Google UI, hide browser chrome)      │
├────────────┬─────────────────────────────────────────────┤
│ Visual FX  │  Memory / Storage                            │
│ (Three.js) │                                              │
│            │  - Screenshot capture                        │
│ - Color    │  - Review log (SQLite)                       │
│   grading  │  - Statistics DB (SQLite)                    │
│ - Zoom/    │  - Session management                        │
│   drift    │  - Deduplication index                       │
│ - Fade     │                                              │
│   (tele-   │                                              │
│   port)    │                                              │
└────────────┴─────────────────────────────────────────────┘
```

### 10.3 Key Technical Risks

| Risk | Severity | Mitigation |
|---|---|---|
| ~~Google Places API ToS~~ | ~~Resolved~~ | ~~Confirmed usable.~~ |
| API costs accumulate over continuous multi-hour operation | High | Estimate costs. Implement query caching. Reduce query frequency where possible. |
| Street View coverage gaps cause bot to get stuck | High | Stuck detection + teleport recovery. Pre-validate teleport destinations for Street View coverage. |
| TTS quality (Web Speech API) may not match desired tone | Medium | Start with Web Speech API. Upgrade path to ElevenLabs exists. TTS interface is swappable. |
| Continuous browser-based rendering may have memory leaks over long sessions | Medium | Profile memory usage. Implement periodic soft refresh if needed. |
| Google Street View JS API may show branding/UI that can't be fully hidden | Medium | Test API customization options. May need CSS overrides or Three.js rendering approach. |

---

## 11. Open Decisions Summary

### Decided

| ID | Decision | Resolution |
|---|---|---|
| O1 | Project title | "Would Not Recommend" |
| O2 | Review display | TTS only. No text on screen. |
| O10 | Persistent memory | Stats DB persists. Review memory is session-scoped for V1. |
| O11 | Screen resolution | Adaptive. No fixed ratio. |
| O12 | Session length | Perpetual during exhibition hours. |
| O15 | UI elements | Pulsing dot, coordinates, city/location, mode (Searching/Processing), session counter, timestamp. |

### Open

| ID | Decision | Priority | Notes |
|---|---|---|---|
| ~~O3~~ | ~~TTS engine selection~~ | — | **Decided:** Web Speech API for V1. ElevenLabs upgrade path later. |
| O4 | Bot name and deeper identity | Medium | V1 works without this |
| O5 | Geographic biases for scene selection | Medium | Not random, but biases undefined |
| O6 | Teleport trigger timing | Medium | How long before teleporting |
| O7 | Review selection within a business | Low | Random vs. shortest vs. recent |
| O8 | Non-English reviews | Low | Skip for V1 |
| O9 | Second screen | Low | Deferred from V1 |
| O13 | Teleport sound design | Low | Fade with visual, silence, fade in |
| ~~O14~~ | ~~Google Places ToS~~ | — | **Decided:** API works, confirmed usable. Optimize query frequency to minimize cost. |
| O16 | Loop/stuck detection criteria | **High** | Thresholds and recovery logic |
| U1 | Exact UI element positioning | Medium | Prototype and adjust |
| U2 | Pulsing dot color | Low | White vs. state-tinted |
| U3 | Coordinate display format | Low | Decimal degrees, DMS, etc. |
| U4 | City/location specificity | Medium | City level vs. neighborhood |
| U5 | Mode indicator casing | Low | lowercase, Title, CAPS |
| U6 | Counter — bare number or labeled | Low | Lean bare |
| U7 | Timestamp — real time or elapsed | Medium | Lean elapsed |
| U8 | Typography — unified monospace | Medium | Lean yes |
| U9 | Color treatment during teleport | Low | Test during prototyping |
| U10 | Teleport fade duration | Low | Test 1.5–2.5 seconds |
| U11 | Ambient sound character/source | **High** | Defines the mood |
| U12 | Ambient variety vs. single loop | Medium | Trade-off: fatigue vs. monotony |
| U13 | Kiosk mode implementation | Medium | Stripping Google UI |

---

## 12. V1 Definition

### 12.1 The Minimum Experience That Is Art

A person walks into the gallery. On a TV screen, a Street View scene — a street somewhere in the world. Small monospace data glows faintly in the corners: coordinates ticking, a city name, the word `Searching`, a number. A quiet ambient sound fills the room. The view drifts forward slowly along the street.

The bot notices something. A soft *bleep*. The word changes to `Processing`. The number increments. The view turns toward a restaurant. Pauses. Looks at it. A flat, tired voice says: "Waited forty minutes for a table. The hostess didn't even apologize. My steak was cold. My wife's salad had a hair in it. We will not be returning." A soft *bloop*. The word changes back to `Searching`. The ambient shifts. The bot turns away and keeps walking.

The person watches for five minutes. They hear two more reviews. One is devastating. One is petty. The bot never reacts to any of them. It just keeps walking. The coordinates tick. The counter goes up.

That is V1.

### 12.2 V1 Scope

**In scope:**
- Street View rendering and autonomous navigation
- Behavior state machine (WANDER → DETECT → APPROACH → INSPECT → DELIVER → LINGER → DEPART)
- 10-second cooldown between reviews
- Google Places API integration (nearby businesses + 1-star reviews)
- Review filtering (length, language, deduplication)
- TTS playback of reviews (flat, monotone)
- Two ambient audio layers with smooth crossfade
- Bleep/bloop sound effects on mode transitions
- Audio file loading support
- Subtle color grading tied to bot state (Three.js)
- Slow zoom/drift during LINGER
- Smooth fade transition on teleport
- UI: pulsing dot, coordinates, city/location, mode indicator, session counter, timestamp
- Monospace typography, clinical data aesthetic
- Screenshot capture at each reviewed location
- Review log with full metadata (SQLite)
- Persistent statistics database across sessions
- Adaptive layout
- Kiosk mode (no browser chrome, no cursor)
- Basic stuck detection and teleport recovery

**Out of scope for V1:**
- Bot's own voice / commentary between reviews
- Second screen
- Audience interaction
- Bot name / deeper backstory
- Archive visualization or public-facing log
- Multi-language TTS
- Custom geographic route planning
- Music or scored audio
- Heavy visual effects or post-processing

---

## 13. Reference and Precedent

`[TO BE FILLED]` — Art references, technical precedents, and works that inform this project's tone and approach. To be collected during development. Should include works that deal with: automated wandering, found text, deadpan delivery, surveillance infrastructure as medium, review culture, and the comedy and sadness of complaint.
