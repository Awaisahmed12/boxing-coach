import { LM } from "./pose";
import type { Point } from "./types";

export interface FramingStatus {
  ok: boolean;
  message: string;
}

const MIN_VIS = 0.5;
const EDGE = 0.02; // normalized margin to the frame border
const MIN_TORSO = 0.1; // smaller than this and the pose model gets unreliable

// All tracking (punches, guard, speed) needs only the upper body, so framing
// only checks that: head, both shoulders, both hips, and the arms. Legs are
// never required — feet drift out of frame constantly and don't matter.
const UPPER = [
  LM.NOSE,
  LM.L_SHOULDER,
  LM.R_SHOULDER,
  LM.L_ELBOW,
  LM.R_ELBOW,
  LM.L_WRIST,
  LM.R_WRIST,
  LM.L_HIP,
  LM.R_HIP,
];

/** Is the boxer's upper body in frame and well enough placed to track? */
export function assessFraming(lm: Point[] | null): FramingStatus {
  if (!lm || lm.length < 33) {
    return { ok: false, message: "STEP INTO VIEW" };
  }
  const vis = (i: number) => (lm[i].visibility ?? 1) >= MIN_VIS;

  // core = head + torso. Need most of it, and at least one of each pair so a
  // bladed/turned stance (one side hidden) still passes.
  const core = [LM.NOSE, LM.L_SHOULDER, LM.R_SHOULDER, LM.L_HIP, LM.R_HIP];
  const coreSeen = core.filter(vis).length;
  const shoulder = vis(LM.L_SHOULDER) || vis(LM.R_SHOULDER);
  const hip = vis(LM.L_HIP) || vis(LM.R_HIP);
  if (coreSeen < 3 || !shoulder || !hip) {
    return { ok: false, message: "STEP INTO VIEW — UPPER BODY NOT VISIBLE" };
  }

  // size: too close and the upper body overflows the frame and tracking breaks
  const torso = Math.hypot(
    (lm[LM.L_SHOULDER].x + lm[LM.R_SHOULDER].x) / 2 -
      (lm[LM.L_HIP].x + lm[LM.R_HIP].x) / 2,
    (lm[LM.L_SHOULDER].y + lm[LM.R_SHOULDER].y) / 2 -
      (lm[LM.L_HIP].y + lm[LM.R_HIP].y) / 2
  );
  if (torso < MIN_TORSO) {
    return { ok: false, message: "MOVE CLOSER TO THE CAMERA" };
  }

  // the head and torso shouldn't be jammed against an edge (arms can leave —
  // a thrown punch reaches the border and that's fine)
  const edgePts = core.filter(vis).map((i) => lm[i]);
  if (edgePts.some((p) => p.y < EDGE)) {
    return { ok: false, message: "TILT THE CAMERA DOWN — HEAD CUT OFF" };
  }
  if (edgePts.some((p) => p.x < EDGE || p.x > 1 - EDGE)) {
    return { ok: false, message: "MOVE TO THE CENTER" };
  }

  return { ok: true, message: "IN FRAME" };
}
