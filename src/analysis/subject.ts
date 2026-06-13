import { LM } from "./pose";
import type { Point } from "./types";

// Picks the boxer out of however many people the model detects, and stays
// locked onto them so someone walking past can't hijack the tracking.

const LOCK_RADIUS = 0.25; // normalized torso-center jump that still counts as "same person"

function torsoCenter(lm: Point[]): Point {
  return {
    x:
      (lm[LM.L_SHOULDER].x + lm[LM.R_SHOULDER].x + lm[LM.L_HIP].x + lm[LM.R_HIP].x) /
      4,
    y:
      (lm[LM.L_SHOULDER].y + lm[LM.R_SHOULDER].y + lm[LM.L_HIP].y + lm[LM.R_HIP].y) /
      4,
  };
}

function torsoSize(lm: Point[]): number {
  const sw = Math.hypot(
    lm[LM.L_SHOULDER].x - lm[LM.R_SHOULDER].x,
    lm[LM.L_SHOULDER].y - lm[LM.R_SHOULDER].y
  );
  const th = Math.hypot(
    (lm[LM.L_SHOULDER].x + lm[LM.R_SHOULDER].x) / 2 -
      (lm[LM.L_HIP].x + lm[LM.R_HIP].x) / 2,
    (lm[LM.L_SHOULDER].y + lm[LM.R_SHOULDER].y) / 2 -
      (lm[LM.L_HIP].y + lm[LM.R_HIP].y) / 2
  );
  return Math.max(sw, th);
}

export class SubjectSelector {
  private prev: Point | null = null;

  /** Choose the boxer from all detected poses, or null if none are usable. */
  pick(poses: Point[][]): Point[] | null {
    let best: Point[] | null = null;
    let bestScore = -Infinity;
    for (const lm of poses) {
      if (!lm || lm.length < 33) continue;
      const c = torsoCenter(lm);
      const size = torsoSize(lm);
      // closer to frame center scores higher (people walk past at the edges)
      const central = 1 - Math.min(1, Math.hypot(c.x - 0.5, c.y - 0.5) / 0.7);
      // once locked, strongly prefer the pose nearest last frame's subject
      let continuity = 0;
      if (this.prev) {
        const d = Math.hypot(c.x - this.prev.x, c.y - this.prev.y);
        continuity = 1 - Math.min(1, d / LOCK_RADIUS);
      }
      const score = size * 1.2 + central * 0.5 + continuity * 2.0;
      if (score > bestScore) {
        bestScore = score;
        best = lm;
      }
    }
    if (best) this.prev = torsoCenter(best);
    return best;
  }

  reset() {
    this.prev = null;
  }
}
