Hi, I’m Awais (@Awaisahmed12), a software engineer.
How to reach me - ahmedawais672@gmail.com

---

# Boxing Coach 🥊

A browser-based boxing technique analyzer. Film yourself live with your phone
camera or upload a recorded session, and get pose-tracked metrics plus
coaching critiques — punch by punch.

All analysis runs **on your device** in the browser (MediaPipe pose tracking
via WebAssembly). No video ever leaves your phone or laptop.

## What it tracks

- **Hand speed** — live and session-max punch speed in mph, per hand
- **Punch detection** — counts punches and classifies them as straight,
  hook, or uppercut, with speed and elbow extension for each
- **Guard discipline** — whether each hand stays at chin height when you're
  not punching
- **Joint angles** — elbow, knee, and torso tilt, updated every frame
- **Skeleton overlay** — pose skeleton with orange wrist trails drawn over
  your video, like a broadcast telestrator

## The critiques

After (and during) a session, a rule-based coach reviews your stats and tells
you things like:

- "Your right hand was in guard only 48% of the time — keep it glued to your cheek"
- "Straight punches averaged 152° at the elbow — turn the shoulder over and extend"
- "Slow hand return (520ms avg) — snap it back on the same line"
- "All straight punches — mix in hooks and uppercuts"
- "Static head — slip or change levels after you punch"

## Running it

```bash
npm install
npm run dev
```

Open the printed URL on your phone or laptop. For live filming on a phone the
page must be served over HTTPS (or localhost) for camera access.

```bash
npm run build   # production build in dist/
```

## Filming tips

- Film from the side or at a 45° angle
- Keep your **full body** in frame, feet included
- Good lighting and a plain background improve tracking accuracy

## Tech

- React + TypeScript + Vite
- [MediaPipe Pose Landmarker](https://developers.google.com/mediapipe/solutions/vision/pose_landmarker)
  (lite model, GPU-delegated, loaded at runtime)
- Punch detection is a per-hand state machine over smoothed wrist velocity,
  reach, and elbow angle; speeds are scaled to meters using shoulder width
