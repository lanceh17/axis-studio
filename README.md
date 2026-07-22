# AXIS // THE BOOTH

A complete visual redesign of the AXIS Studio producer app. Same engine, same JS, brand-new world.

**Concept:** You're sitting in the producer's control room. Through the glass, you can see **AXIS** in the booth — at the desk, behind the mic, wearing the headphones. The chat is your session log. The library is your tape rack on the left wall. The deck on the right is the outboard gear. The whole bottom is the analog mixing console.

---

## What's new

### Visual identity — "The Booth"
- **Warm/cool studio lighting** — amber key light from the upper-left, teal rim light from the upper-right, against deep charcoal walls
- **Analog gear palette** — teal DAW accent, amber LEDs, brushed-metal faceplates, walnut wood
- **Typography** — Bebas Neue for display, Inter for UI, JetBrains Mono for technical readouts
- **Authentic textures** — brushed metal via repeating gradients, wood grain hints, screw details on rack modules, scan-line overlay on the booth

### The Centerpiece — The Booth
- A stylized SVG illustration of a producer at the workstation:
  - Hoodie, cap, headphones around the neck
  - Behind a desk with an audio interface, MIDI pad, and laptop showing a DAW with waveforms
  - Microphone on a boom arm with pop filter
  - Studio monitors flanking, acoustic foam on the left wall, a vinyl record and an "808 CULT" poster
- **LIVE indicator + clock** HUD in the top-right of the booth, just like a real recording session
- **Status cycler** under the header: *"listening back to the take"* → *"layering drums"* → *"sketching the piano"* → *"riding the mix bus"* → *"cooking something heavy"*
- **Breathing animation** on the booth — the lighting subtly pulses like a real room
- **Speaking glow** — when the producer is typing, the booth warms up

### The Chat — Session Log
- The chat is the "session log" of your session with the producer
- Producer messages feel like **creative direction** (left, dark with purple avatar)
- Your messages feel like **requests** (right, teal with your initial)
- The typing indicator triggers a pulse on the producer's avatar in the header
- Quick-prompt chips and file upload as before

### The Outboard Gear Rack (Top Bar)
- Each "module" has a brushed-metal faceplate with corner screws
- BPM, MOOD (with mini VU), GENRE, and NOW IN THE BOOTH as separate rack units
- Right side: Producer multi-select, Model select, MINIMAX LED, Settings

### The Mixing Console (Bottom)
- Brushed-metal console surface with horizontal grain texture
- Channel strips for KICK / SNARE / 808 / HATS / MAST with proper analog faders
- Fader caps with white center line, tick marks on the fader track
- M/S buttons that light teal when active
- Channel VU meters
- Transport (replay, play, stop, download)
- Analog-feel progress bar, volume slider with amber thumb
- BPM / KEY / TRKS readouts

### The Library (Left) and Deck (Right)
- Library: tracks get a left "spine" indicator that glows teal when playing
- Deck: oscilloscope with CRT-style grid overlay, vinyl placeholder with amber glow
- Quick Cook: sectioned form with mono font for that DAW patch-bay feel

---

## Files

```
axis-booth/
├── index.html          ← restructured HTML (same IDs, new structure)
├── css/style.css       ← complete new theme
├── js/app.bundle.js    ← original JS, untouched
├── assets/
│   └── producer.svg    ← the producer illustration
└── README.md
```

## How it works with the existing JS

Every ID and class the JS bundle touches is preserved. The HTML keeps the same `#app`, `#chatStream`, `#libList`, `#visualizer`, `.channel-strip`, `.lib-item`, etc. The CSS is a complete re-skin — the JS doesn't know anything changed.

The only HTML changes are:
1. Added a `.booth-stage` wrapper containing the producer SVG and a REC overlay (the SVG is pure decoration, no JS hooks)
2. Renamed the chat header from "AXIS" generic to a proper booth header (AXIS PRO badge, status line)
3. Added a `.booth-overlay` with `#boothClock`, `#recLed`, `#recLabel` — these are powered by the inline script in `index.html`, not the bundle

## Run it

```bash
cd axis-booth
python3 -m http.server 8000
# open http://localhost:8000
```

## Theme name

**AXIS // THE BOOTH** — feel free to rename. The CSS uses `--bg-*` and `--accent` style tokens if you want to swap palettes.
