import { SKELETON, LM } from "./pose";
import type { FrameMetrics } from "./types";

const ACCENT = "#ff3d1f";
const BONE = "rgba(255,255,255,0.9)";
const JOINT = "#3ddc84";
const VIS = 0.4; // only draw landmarks the model is reasonably sure of

export interface ContentRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Where the video's pixels sit inside its element box (object-fit: contain). */
export function contentRect(video: HTMLVideoElement): ContentRect {
  const vw = video.videoWidth || 16, vh = video.videoHeight || 9;
  const cw = video.clientWidth, ch = video.clientHeight;
  const s = Math.min(cw / vw, ch / vh);
  const w = vw * s, h = vh * s;
  return { x: (cw - w) / 2, y: (ch - h) / 2, w, h };
}

/**
 * Draws the skeleton, wrist trails, guard markers and head ring. Mirroring for
 * the front camera is done in CSS on the canvas element, so nothing here flips.
 */
export function drawOverlay(
  ctx: CanvasRenderingContext2D,
  m: FrameMetrics,
  canvasW: number,
  canvasH: number,
  r: ContentRect
) {
  ctx.clearRect(0, 0, canvasW, canvasH);
  const lm = m.landmarks;
  if (!lm) return;
  const X = (x: number) => r.x + x * r.w;
  const Y = (y: number) => r.y + y * r.h;
  // skip uncertain joints so the figure doesn't sprout flailing ghost limbs
  const seen = (i: number) => (lm[i].visibility ?? 1) >= VIS;

  // fading wrist trails — the "streak" behind each punch
  for (const trail of [m.wristTrail.left, m.wristTrail.right]) {
    for (let i = 1; i < trail.length; i++) {
      ctx.strokeStyle = ACCENT;
      ctx.globalAlpha = i / trail.length;
      ctx.lineWidth = 2 + (5 * i) / trail.length;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(X(trail[i - 1].x), Y(trail[i - 1].y));
      ctx.lineTo(X(trail[i].x), Y(trail[i].y));
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;

  ctx.strokeStyle = BONE;
  ctx.lineWidth = 2.5;
  for (const [a, b] of SKELETON) {
    if (!seen(a) || !seen(b)) continue;
    ctx.beginPath();
    ctx.moveTo(X(lm[a].x), Y(lm[a].y));
    ctx.lineTo(X(lm[b].x), Y(lm[b].y));
    ctx.stroke();
  }
  ctx.fillStyle = JOINT;
  for (const [a] of SKELETON) {
    if (!seen(a)) continue;
    ctx.beginPath();
    ctx.arc(X(lm[a].x), Y(lm[a].y), 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // wrists: green when in guard, orange when out
  for (const side of ["left", "right"] as const) {
    const idx = side === "left" ? LM.L_WRIST : LM.R_WRIST;
    if (!seen(idx)) continue;
    ctx.fillStyle = m.guardUp[side] ? JOINT : ACCENT;
    ctx.beginPath();
    ctx.arc(X(lm[idx].x), Y(lm[idx].y), 8, 0, Math.PI * 2);
    ctx.fill();
  }

  // head marker — a small ring centered on the nose landmark
  if (seen(LM.NOSE)) {
    const nose = lm[LM.NOSE];
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(X(nose.x), Y(nose.y), 6, 0, Math.PI * 2);
    ctx.stroke();
  }
}
