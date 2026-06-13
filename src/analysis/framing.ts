import { LM } from "./pose";
import type { Point } from "./types";

export interface FramingStatus {
  ok: boolean;
  message: string;
  advice?: string; // non-blocking suggestion; never affects `ok`
}

const MIN_VIS = 0.5;
const EDGE = 0.02; // normalized margin to the frame border
const MIN_SHOULDER_W = 0.08; // smaller than this and the boxer is too far to track

// Punches, guard and speed only need the head, shoulders and arms — so that's
// all framing requires. Hips/legs are never required (reclining, seated,
// wheelchair, tight rooms all work); when visible they just unlock footwork.

/** Is the boxer's upper body in frame and big enough to track? */
export function assessFraming(lm: Point[] | null): FramingStatus {
  if (!lm || lm.length < 33) {
    return { ok: false, message: "STEP INTO VIEW" };
  }
  const vis = (i: number) => (lm[i].visibility ?? 1) >= MIN_VIS;

  // need the head and at least one shoulder (a turned stance hides one side)
  const lS = vis(LM.L_SHOULDER);
  const rS = vis(LM.R_SHOULDER);
  if (!vis(LM.NOSE) || (!lS && !rS)) {
    return { ok: false, message: "STEP INTO VIEW — HEAD & SHOULDERS NOT VISIBLE" };
  }

  // too far away: shoulders too small to read wrist motion reliably
  const shoulderW =
    lS && rS
      ? Math.hypot(
          lm[LM.L_SHOULDER].x - lm[LM.R_SHOULDER].x,
          lm[LM.L_SHOULDER].y - lm[LM.R_SHOULDER].y
        )
      : MIN_SHOULDER_W; // one shoulder visible — can't measure width, allow it
  if (shoulderW < MIN_SHOULDER_W) {
    return { ok: false, message: "MOVE CLOSER TO THE CAMERA" };
  }

  // head shouldn't be cut off at the top, and shouldn't be off to one side
  const head = [LM.NOSE, LM.L_SHOULDER, LM.R_SHOULDER].filter(vis).map((i) => lm[i]);
  if (lm[LM.NOSE].y < EDGE) {
    return { ok: false, message: "TILT THE CAMERA DOWN — HEAD CUT OFF" };
  }
  if (head.some((p) => p.x < EDGE || p.x > 1 - EDGE)) {
    return { ok: false, message: "MOVE TO THE CENTER" };
  }

  // good to go; nudge (never block) toward footwork tracking if legs are out
  const legSeen =
    vis(LM.L_KNEE) || vis(LM.R_KNEE) || vis(LM.L_ANKLE) || vis(LM.R_ANKLE);
  return {
    ok: true,
    message: "IN FRAME",
    advice: legSeen ? undefined : "Step back to also track footwork (optional)",
  };
}
