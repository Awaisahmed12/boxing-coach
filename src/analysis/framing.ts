import { LM } from "./pose";
import type { Point } from "./types";

export interface FramingStatus {
  ok: boolean;
  message: string;
}

// core joints must be confidently tracked; wrists/elbows are excluded so a
// bladed stance or a glove near the face doesn't flap the readiness state
const CORE = [LM.NOSE, LM.L_SHOULDER, LM.R_SHOULDER, LM.L_HIP, LM.R_HIP];
const LEGS = [LM.L_KNEE, LM.R_KNEE, LM.L_ANKLE, LM.R_ANKLE];
const MIN_VIS = 0.5;
const EDGE = 0.025; // normalized margin to the frame border
const MIN_TORSO = 0.12; // smaller than this and the pose model gets unreliable

/** Judge whether the boxer is fully and usefully in frame. Raw landmarks. */
export function assessFraming(lm: Point[] | null): FramingStatus {
  if (!lm || lm.length < 33) {
    return { ok: false, message: "STEP INTO VIEW" };
  }
  const visible = (i: number) => (lm[i].visibility ?? 1) >= MIN_VIS;
  if (!CORE.every(visible)) {
    return { ok: false, message: "FACE THE CAMERA" };
  }
  if (!LEGS.every(visible)) {
    return { ok: false, message: "STEP BACK — FEET MUST BE IN VIEW" };
  }
  const pts = [...CORE, ...LEGS].map((i) => lm[i]);
  if (pts.some((p) => p.y < EDGE || p.y > 1 - EDGE)) {
    return { ok: false, message: "STEP BACK — YOU'RE CUT OFF" };
  }
  if (pts.some((p) => p.x < EDGE || p.x > 1 - EDGE)) {
    return { ok: false, message: "MOVE TO THE CENTER" };
  }
  const torso = Math.hypot(
    (lm[LM.L_SHOULDER].x + lm[LM.R_SHOULDER].x) / 2 -
      (lm[LM.L_HIP].x + lm[LM.R_HIP].x) / 2,
    (lm[LM.L_SHOULDER].y + lm[LM.R_SHOULDER].y) / 2 -
      (lm[LM.L_HIP].y + lm[LM.R_HIP].y) / 2
  );
  if (torso < MIN_TORSO) {
    return { ok: false, message: "MOVE CLOSER TO THE CAMERA" };
  }
  return { ok: true, message: "IN FRAME" };
}
