# Boxing Coach 🥊

A boxing coach that watches every punch you throw. Prop up your phone (or
upload a recorded session), shadowbox, and get scored on guard, extension,
speed, recovery and movement — round by round, with specific fixes.

Everything runs **on-device in the browser** (MediaPipe pose tracking via
WebAssembly). No video ever leaves the phone; only session stats are stored,
and only locally.

## Product

- **Train** — pick a drill, set rounds / round length / rest, start with the
  camera or analyze a video. The bell rings automatically once you're in
  frame; 10-second warning, rest timer, spoken cues ("hands up", "stay busy"),
  live HUD with speed, punch count, guard and defensive moves, skeleton +
  wrist-trail overlay and combo pop-ups.
- **Session report** — 0–100 score with grade, breakdown (guard / technique /
  output / recovery / movement), coach's notes ranked by severity, punch mix,
  defense & footwork counts, detected combinations (1-2, 1-1-2, 1-2-3 …).
- **History & Progress** — every session saved, charts for score, hand speed,
  guard %, punches/min and hand-return time over time.
- **Drills** — Shadowboxing, 1-2 Drill (free); Guard Discipline, Combination
  Builder, Slip & Move, Speed Round (Pro). Each shifts the scoring weights.
- **Monetization** — 7-day Pro trial on signup (no card), then Free vs Pro.
  Free: 1 round/session, top coaching note only, last 3 sessions, 2 drills.
  Pro ($9.99/mo or $59.99/yr): everything.

## How the tracking works

- MediaPipe Pose Landmarker (full model, up to 3 poses) with a subject lock
  that keeps tracking the boxer if someone walks past. Framing only needs
  head + shoulders, so seated / close-up / tight rooms all work.
- Landmarks are smoothed in isotropic units (a One Euro filter for the drawn
  skeleton, an EMA for detection). Pixel→meter scale comes from shoulder
  width (and torso length when hips are visible), smoothed so body rotation
  doesn't modulate speeds.
- Each hand runs a GUARD → EXTENDING → RETRACTING state machine on
  shoulder-relative wrist motion. A punch counts when the arm works through a
  real range of motion (elbow swing or elbow travel) **and** the wrist reaches
  out a real distance — no speed requirement, so slow practice punches
  register. Speed is read from raw positions with a depth (foreshortening)
  correction and a 3-frame median to kill spikes.
- Shape (straight / hook / uppercut) comes from elbow angle and path; the
  boxer's stance turns that into jab / cross / lead hook / rear uppercut …
  Combos are runs of punches ≤ 0.75 s apart, in punch-number notation.
- Guard uses hysteresis + debounce (tighter to enter than to keep) so it
  doesn't flicker, and is judged only while the hand isn't punching.
- Head defense (slip / duck / roll) is measured relative to the hips so
  footwork doesn't read as a slip; steps and pivots come from the ankles.
- Scoring (`src/analysis/score.ts`) ramps each component between "clearly
  bad" and "clearly good" values; drills reweight the components.

## Running it

```bash
npm install     # also copies the MediaPipe WASM runtime into public/
npm run dev
```

Camera access needs HTTPS or localhost. `npm run build` produces a static
`dist/` — deploy anywhere (Vercel config included). Add `?debug` to the URL
for an on-screen camera / fps / pose readout.

### Environment variables (optional)

| Variable | Purpose |
|---|---|
| `VITE_STRIPE_MONTHLY_URL` | Stripe Payment Link for the monthly plan |
| `VITE_STRIPE_YEARLY_URL` | Stripe Payment Link for the yearly plan |
| `VITE_LICENSE_KEYS` | Comma-separated keys that unlock Pro (launch stopgap until there's a backend) |

## Filming tips

Phone anywhere with your head and shoulders in view; side-on or 45° reads
punches and slips best. Step back to include your feet if you want footwork
tracked. Decent light, plain background.

## Stack

React 18 · TypeScript · Vite · `@mediapipe/tasks-vision` · Vercel Analytics.
No backend, no external runtime dependencies — the pose model and WASM are
served with the app.
