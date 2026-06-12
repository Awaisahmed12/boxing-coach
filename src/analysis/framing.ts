import { LM } from "./pose";
import type { Point } from "./types";

export interface FramingStatus {
  ok: boolean;
  message: string;
}

const MIN_VIS = 0.5;
const EDGE = 0.025; // normalized margin to the frame border
const MIN_TORSO = 0.12; // smaller than this and the pose model gets unreliable

// Orientation-agnostic on purpose: a boxer working a bag is side-on, back
// turned, pivoting, constantly rotating — so never require the face or any
// particular side to be visible. One trackable shoulder + hip proves the
// torso; one knee + ankle proves full height.
const TORSO = [LM.L_SHOULDER, LM.R_SHOULDER, LM.L_HIP, LM.R_HIP];
const LEGS = [LM.L_KNEE, LM.R_KNEE, LM.L_ANKLE, LM.R_ANKLE];

/** Judge whether the boxer is fully and usefully in frame. Raw landmarks. */
export function assessFraming(lm: Point[] | null): FramingStatus {
  if (!lm || lm.length < 33) {
    return { ok: false, message: "STEP INTO VIEW" };
  }
  const vis = (i: number) => (lm[i].visibility ?? 1) >= MIN_VIS;
  const shoulderSeen = vis(LM.L_SHOULDER) || vis(LM.R_SHOULDER);
  const hipSeen = vis(LM.L_HIP) || vis(LM.R_HIP);
  if (!shoulderSeen || !hipSeen) {
    return { ok: false, message: "CAN'T SEE YOU CLEARLY — CHECK LIGHT & DISTANCE" };
  }
  const kneeSeen = vis(LM.L_KNEE) || vis(LM.R_KNEE);
  const ankleSeen = vis(LM.L_ANKLE) || vis(LM.R_ANKLE);
  if (!kneeSeen || !ankleSeen) {
    return { ok: false, message: "STEP BACK — FULL BODY IN VIEW" };
  }
  // bounds are judged only on confidently-seen joints; estimated positions
  // of occluded ones can be garbage
  const seen = [...TORSO, ...LEGS].filter(vis).map((i) => lm[i]);
  if (seen.some((p) => p.y < EDGE || p.y > 1 - EDGE)) {
    return { ok: false, message: "STEP BACK — YOU'RE CUT OFF" };
  }
  if (seen.some((p) => p.x < EDGE || p.x > 1 - EDGE)) {
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
