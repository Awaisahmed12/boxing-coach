import { SKELETON, LM } from "./pose";
import type { FrameMetrics } from "./types";

const ACCENT = "#ff4d00";
const BONE = "#ffffff";
const JOINT = "#00e676";
const VIS = 0.4; // only draw landmarks the model is reasonably sure of

export function drawOverlay(
  ctx: CanvasRenderingContext2D,
  m: FrameMetrics,
  w: number,
  h: number
) {
  ctx.clearRect(0, 0, w, h);
  const lm = m.landmarks;
  if (!lm) return;
  // skip uncertain joints so the figure doesn't sprout flailing ghost limbs
  const seen = (i: number) => (lm[i].visibility ?? 1) >= VIS;

  // fading wrist trails — the "streak" behind each punch
  for (const trail of [m.wristTrail.left, m.wristTrail.right]) {
    for (let i = 1; i < trail.length; i++) {
      ctx.strokeStyle = ACCENT;
      ctx.globalAlpha = i / trail.length;
      ctx.lineWidth = 2 + (4 * i) / trail.length;
      ctx.beginPath();
      ctx.moveTo(trail[i - 1].x * w, trail[i - 1].y * h);
      ctx.lineTo(trail[i].x * w, trail[i].y * h);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;

  ctx.strokeStyle = BONE;
  ctx.lineWidth = 2;
  for (const [a, b] of SKELETON) {
    if (!seen(a) || !seen(b)) continue;
    ctx.beginPath();
    ctx.moveTo(lm[a].x * w, lm[a].y * h);
    ctx.lineTo(lm[b].x * w, lm[b].y * h);
    ctx.stroke();
  }

  for (const [a] of SKELETON) {
    if (!seen(a)) continue;
    ctx.fillStyle = JOINT;
    ctx.beginPath();
    ctx.arc(lm[a].x * w, lm[a].y * h, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // wrists: green when in guard, orange when out
  for (const side of ["left", "right"] as const) {
    const idx = side === "left" ? LM.L_WRIST : LM.R_WRIST;
    if (!seen(idx)) continue;
    ctx.fillStyle = m.guardUp[side] ? JOINT : ACCENT;
    ctx.beginPath();
    ctx.arc(lm[idx].x * w, lm[idx].y * h, 7, 0, Math.PI * 2);
    ctx.fill();
  }

  // head marker
  if (seen(LM.NOSE)) {
    ctx.fillStyle = ACCENT;
    const nose = lm[LM.NOSE];
    ctx.beginPath();
    ctx.moveTo(nose.x * w, nose.y * h - 26);
    ctx.lineTo(nose.x * w - 8, nose.y * h - 40);
    ctx.lineTo(nose.x * w + 8, nose.y * h - 40);
    ctx.closePath();
    ctx.fill();
  }
}
