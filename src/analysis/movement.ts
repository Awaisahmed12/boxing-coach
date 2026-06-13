import { LM } from "./pose";
import type { MoveCounts, MoveEvent, Point } from "./types";

const MIN_VIS = 0.5;

// Head defense is measured relative to the hips, so footwork and walking
// don't read as slips — only bending at the waist/knees does.
const ONSET_X_M = 0.16; // lateral head travel that reads as a slip
const ONSET_Y_M = 0.2; // drop that reads as a duck / level change
const RETURN_X_M = 0.06;
const RETURN_Y_M = 0.08;
const LEAVE_CENTER_M = 0.05;
const MIN_ONSET_S = 0.06; // faster than this (1-2 frames) is tracking noise, not a slip
const MAX_ONSET_S = 0.5; // slower than this is a posture change, not a maneuver
const MAX_MANEUVER_S = 1.2; // longer than this means they settled in a new stance
const DEFENSE_REFRACTORY_S = 0.4;

const STEP_SPEED_MS = 0.3; // ankle-midpoint speed that counts as moving
const STEP_DIST_M = 0.08; // minimum travel for a burst to count as a step
const STEP_REFRACTORY_S = 0.35;

const PIVOT_ANGLE_DEG = 25; // stance-line rotation that counts as a pivot
const PIVOT_MAX_DRIFT_M = 0.12; // feet must stay roughly planted
const PIVOT_WINDOW_S = 1.0;
const PIVOT_REFRACTORY_S = 0.8;
const MIN_ANKLE_SEP_M = 0.15; // below this projection the stance angle is unreliable

/**
 * Recognizes defensive head movement (slip / duck / roll) and footwork
 * (step / pivot) from the same smoothed isotropic landmarks the punch
 * tracker uses. One move event max per frame.
 */
export class MovementTracker {
  counts: MoveCounts = { slips: 0, ducks: 0, rolls: 0, pivots: 0, steps: 0 };

  // head defense
  private baseX = 0;
  private baseY = 0;
  private hasBase = false;
  private displaced = false;
  private leftCenterT = -1;
  private displacedT = 0;
  private peakDx = 0;
  private peakDy = 0;
  private lastDefenseT = -1;

  // footwork
  private prevMid: Point | null = null;
  private stepping = false;
  private stepDist = 0;
  private lastStepT = -1;
  private angleHist: { t: number; deg: number; mid: Point }[] = [];
  private lastPivotT = -1;

  update(lm: Point[], scale: number, dt: number, t: number): MoveEvent | null {
    return (
      this.updateDefense(lm, scale, dt, t) ??
      this.updateFootwork(lm, scale, dt, t)
    );
  }

  private updateDefense(
    lm: Point[],
    scale: number,
    dt: number,
    t: number
  ): MoveEvent | null {
    const nose = lm[LM.NOSE];
    const lHip = lm[LM.L_HIP];
    const rHip = lm[LM.R_HIP];
    const hipSeen =
      (lHip.visibility ?? 1) >= MIN_VIS || (rHip.visibility ?? 1) >= MIN_VIS;
    if ((nose.visibility ?? 1) < MIN_VIS || !hipSeen) return null;

    const relX = nose.x - (lHip.x + rHip.x) / 2;
    const relY = nose.y - (lHip.y + rHip.y) / 2;
    if (!this.hasBase) {
      this.baseX = relX;
      this.baseY = relY;
      this.hasBase = true;
      return null;
    }
    const dx = (relX - this.baseX) * scale;
    const dyDown = Math.max(0, (relY - this.baseY) * scale); // rising isn't defense

    if (!this.displaced) {
      const out = Math.abs(dx) > LEAVE_CENTER_M || dyDown > LEAVE_CENTER_M * 1.5;
      if (!out) {
        this.leftCenterT = -1;
        // slowly re-anchor to the current stance while at rest
        const a = Math.min(1, dt);
        this.baseX += a * (relX - this.baseX);
        this.baseY += a * (relY - this.baseY);
      } else if (this.leftCenterT < 0) {
        this.leftCenterT = t;
      }
      if (Math.abs(dx) > ONSET_X_M || dyDown > ONSET_Y_M) {
        const elapsed = this.leftCenterT >= 0 ? t - this.leftCenterT : Infinity;
        // a real slip takes a few frames — too fast is a tracking pop, too
        // slow is just settling into a new stance
        const quick = elapsed >= MIN_ONSET_S && elapsed < MAX_ONSET_S;
        if (quick && t - this.lastDefenseT > DEFENSE_REFRACTORY_S) {
          this.displaced = true;
          this.displacedT = t;
          this.peakDx = Math.abs(dx);
          this.peakDy = dyDown;
        } else {
          // drifted there slowly — that's a new stance, not a maneuver
          this.baseX = relX;
          this.baseY = relY;
          this.leftCenterT = -1;
        }
      }
      return null;
    }

    this.peakDx = Math.max(this.peakDx, Math.abs(dx));
    this.peakDy = Math.max(this.peakDy, dyDown);
    if (Math.abs(dx) < RETURN_X_M && dyDown < RETURN_Y_M) {
      this.displaced = false;
      this.lastDefenseT = t;
      this.leftCenterT = -1;
      const type =
        this.peakDy > ONSET_Y_M && this.peakDx > ONSET_X_M
          ? "ROLL"
          : this.peakDy > ONSET_Y_M
            ? "DUCK"
            : "SLIP";
      if (type === "ROLL") this.counts.rolls++;
      else if (type === "DUCK") this.counts.ducks++;
      else this.counts.slips++;
      return { time: t, type };
    }
    if (t - this.displacedT > MAX_MANEUVER_S) {
      // never came back — they settled into a new position
      this.displaced = false;
      this.baseX = relX;
      this.baseY = relY;
      this.leftCenterT = -1;
    }
    return null;
  }

  private updateFootwork(
    lm: Point[],
    scale: number,
    dt: number,
    t: number
  ): MoveEvent | null {
    const lA = lm[LM.L_ANKLE];
    const rA = lm[LM.R_ANKLE];
    if ((lA.visibility ?? 1) < MIN_VIS || (rA.visibility ?? 1) < MIN_VIS) {
      this.prevMid = null;
      this.angleHist = [];
      return null;
    }
    const mid = { x: (lA.x + rA.x) / 2, y: (lA.y + rA.y) / 2 };
    let move: MoveEvent | null = null;

    // steps: bursts of ankle-midpoint travel
    if (this.prevMid && dt > 0) {
      const v =
        (Math.hypot(mid.x - this.prevMid.x, mid.y - this.prevMid.y) * scale) / dt;
      if (v > STEP_SPEED_MS) {
        if (!this.stepping) {
          this.stepping = true;
          this.stepDist = 0;
        }
        this.stepDist += v * dt;
      } else if (this.stepping) {
        this.stepping = false;
        if (this.stepDist > STEP_DIST_M && t - this.lastStepT > STEP_REFRACTORY_S) {
          this.lastStepT = t;
          this.counts.steps++;
          move = { time: t, type: "STEP" };
        }
      }
    }
    this.prevMid = mid;

    // pivots: the stance line rotates while the feet stay planted
    const sep = Math.hypot(rA.x - lA.x, rA.y - lA.y) * scale;
    if (sep > MIN_ANKLE_SEP_M) {
      const deg = (Math.atan2(rA.y - lA.y, rA.x - lA.x) * 180) / Math.PI;
      this.angleHist.push({ t, deg, mid });
      while (this.angleHist.length && t - this.angleHist[0].t > PIVOT_WINDOW_S) {
        this.angleHist.shift();
      }
      const first = this.angleHist[0];
      if (first && t - this.lastPivotT > PIVOT_REFRACTORY_S) {
        let dAng = Math.abs(deg - first.deg);
        if (dAng > 180) dAng = 360 - dAng;
        const drift =
          Math.hypot(mid.x - first.mid.x, mid.y - first.mid.y) * scale;
        if (dAng > PIVOT_ANGLE_DEG && drift < PIVOT_MAX_DRIFT_M) {
          this.lastPivotT = t;
          this.angleHist = [];
          this.counts.pivots++;
          move = move ?? { time: t, type: "PIVOT" };
        }
      }
    } else {
      this.angleHist = [];
    }
    return move;
  }
}
