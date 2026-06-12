import { LM } from "./pose";
import type {
  FrameMetrics,
  Hand,
  Point,
  PunchEvent,
  PunchType,
  SessionStats,
} from "./types";

const SHOULDER_WIDTH_M = 0.41; // assumed adult biacromial width, sets the px→m scale
const MS_TO_MPH = 2.23694;
const PUNCH_START_SPEED = 3.0; // m/s — wrist speed that begins a punch
const PUNCH_MIN_PEAK_SPEED = 3.8; // m/s — required to count as a real punch
const PUNCH_MIN_EXTENSION = 0.28; // m — wrist must travel this far from shoulder
const TRAIL_LEN = 14;

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

function angleDeg(a: Point, vertex: Point, c: Point): number {
  const v1 = { x: a.x - vertex.x, y: a.y - vertex.y };
  const v2 = { x: c.x - vertex.x, y: c.y - vertex.y };
  const dot = v1.x * v2.x + v1.y * v2.y;
  const m = Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y);
  if (m === 0) return 0;
  return (Math.acos(Math.min(1, Math.max(-1, dot / m))) * 180) / Math.PI;
}

type PunchPhase = "GUARD" | "EXTENDING" | "RETRACTING";

interface HandTracker {
  phase: PunchPhase;
  speedMs: number; // smoothed
  prevPos: Point | null;
  prevExtension: number;
  shrinkingFrames: number;
  peakSpeed: number;
  peakElbowAngle: number;
  peakExtension: number;
  punchStartT: number;
  retractStartT: number;
  pendingPunch: PunchEvent | null;
  guardFrames: number;
  activeFrames: number;
  trail: Point[];
}

function newHandTracker(): HandTracker {
  return {
    phase: "GUARD",
    speedMs: 0,
    prevPos: null,
    prevExtension: 0,
    shrinkingFrames: 0,
    peakSpeed: 0,
    peakElbowAngle: 0,
    peakExtension: 0,
    punchStartT: 0,
    retractStartT: 0,
    pendingPunch: null,
    guardFrames: 0,
    activeFrames: 0,
    trail: [],
  };
}

export class BoxingAnalyzer {
  private smoothed: Point[] | null = null;
  private prevTime = -1;
  private startTime = -1;
  private hands: Record<Hand, HandTracker> = {
    LEFT: newHandTracker(),
    RIGHT: newHandTracker(),
  };
  private punches: PunchEvent[] = [];
  private maxSpeedMph = 0;
  private lastPunch: PunchEvent | null = null;
  private noseSamples: Point[] = [];
  private stanceRatios: number[] = [];
  private totalFrames = 0;

  /** Feed one frame of normalized landmarks. timeS is seconds. */
  update(raw: Point[] | null, timeS: number): FrameMetrics {
    if (this.startTime < 0) this.startTime = timeS;
    const t = timeS - this.startTime;

    if (!raw || raw.length < 33) {
      this.prevTime = t;
      return this.frameMetrics(t, null);
    }

    // EMA smoothing to suppress landmark jitter
    if (!this.smoothed) {
      this.smoothed = raw.map((p) => ({ x: p.x, y: p.y }));
    } else {
      const a = 0.55;
      for (let i = 0; i < raw.length; i++) {
        this.smoothed[i].x = a * raw[i].x + (1 - a) * this.smoothed[i].x;
        this.smoothed[i].y = a * raw[i].y + (1 - a) * this.smoothed[i].y;
      }
    }
    const lm = this.smoothed;
    const dt = this.prevTime >= 0 ? t - this.prevTime : 0;
    this.prevTime = t;
    this.totalFrames++;

    const shoulderW = dist(lm[LM.L_SHOULDER], lm[LM.R_SHOULDER]);
    const scale = SHOULDER_WIDTH_M / Math.max(shoulderW, 0.02); // meters per normalized unit

    this.noseSamples.push({ ...lm[LM.NOSE] });
    if (this.noseSamples.length > 300) this.noseSamples.shift();
    const ankleSpread = dist(lm[LM.L_ANKLE], lm[LM.R_ANKLE]);
    this.stanceRatios.push(ankleSpread / Math.max(shoulderW, 0.02));

    if (dt > 0 && dt < 0.5) {
      this.trackHand("LEFT", lm, scale, dt, t);
      this.trackHand("RIGHT", lm, scale, dt, t);
    }

    return this.frameMetrics(t, lm);
  }

  private trackHand(hand: Hand, lm: Point[], scale: number, dt: number, t: number) {
    const h = this.hands[hand];
    const wrist = lm[hand === "LEFT" ? LM.L_WRIST : LM.R_WRIST];
    const elbow = lm[hand === "LEFT" ? LM.L_ELBOW : LM.R_ELBOW];
    const shoulder = lm[hand === "LEFT" ? LM.L_SHOULDER : LM.R_SHOULDER];

    h.trail.push({ ...wrist });
    if (h.trail.length > TRAIL_LEN) h.trail.shift();

    if (h.prevPos) {
      const inst = (dist(wrist, h.prevPos) * scale) / dt;
      h.speedMs = 0.5 * inst + 0.5 * h.speedMs;
    }
    h.prevPos = { ...wrist };

    const extension = dist(wrist, shoulder) * scale;
    const elbowAngle = angleDeg(shoulder, elbow, wrist);
    const extending = extension > h.prevExtension;
    h.shrinkingFrames = extending ? 0 : h.shrinkingFrames + 1;
    h.prevExtension = extension;

    const mph = h.speedMs * MS_TO_MPH;
    if (mph > this.maxSpeedMph) this.maxSpeedMph = mph;

    switch (h.phase) {
      case "GUARD": {
        // guard discipline is only judged while the hand is not punching
        if (this.isGuardUp(hand, lm)) h.guardFrames++;
        h.activeFrames++;
        if (h.speedMs > PUNCH_START_SPEED && extending) {
          h.phase = "EXTENDING";
          h.punchStartT = t;
          h.peakSpeed = h.speedMs;
          h.peakElbowAngle = elbowAngle;
          h.peakExtension = extension;
        }
        break;
      }
      case "EXTENDING": {
        h.peakSpeed = Math.max(h.peakSpeed, h.speedMs);
        h.peakElbowAngle = Math.max(h.peakElbowAngle, elbowAngle);
        h.peakExtension = Math.max(h.peakExtension, extension);
        const stalled = h.shrinkingFrames >= 2 || h.speedMs < 1.0;
        if (stalled) {
          if (
            h.peakSpeed > PUNCH_MIN_PEAK_SPEED &&
            h.peakExtension > PUNCH_MIN_EXTENSION
          ) {
            const punch: PunchEvent = {
              time: t,
              hand,
              type: this.classify(hand, lm, h.peakElbowAngle),
              speedMph: h.peakSpeed * MS_TO_MPH,
              peakElbowAngle: h.peakElbowAngle,
              extensionM: h.peakExtension,
              retractionMs: null,
            };
            this.punches.push(punch);
            this.lastPunch = punch;
            h.pendingPunch = punch;
            h.retractStartT = t;
            h.phase = "RETRACTING";
          } else {
            h.phase = "GUARD"; // too weak/short to count — likely a feint or noise
          }
        } else if (t - h.punchStartT > 0.8) {
          h.phase = "GUARD"; // not a punch, just sustained arm movement
        }
        break;
      }
      case "RETRACTING": {
        const backInGuard = extension < 0.26 || this.isGuardUp(hand, lm);
        if (backInGuard) {
          if (h.pendingPunch) {
            h.pendingPunch.retractionMs = (t - h.retractStartT) * 1000;
            h.pendingPunch = null;
          }
          h.phase = "GUARD";
        } else if (t - h.retractStartT > 1.5) {
          h.pendingPunch = null;
          h.phase = "GUARD";
        }
        break;
      }
    }
  }

  private classify(hand: Hand, lm: Point[], peakElbowAngle: number): PunchType {
    const wrist = lm[hand === "LEFT" ? LM.L_WRIST : LM.R_WRIST];
    const shoulder = lm[hand === "LEFT" ? LM.L_SHOULDER : LM.R_SHOULDER];
    // y grows downward in image space: a wrist rising from below with a bent
    // arm reads as an uppercut, a bent arm on a level path as a hook
    if (peakElbowAngle < 120) {
      return wrist.y > shoulder.y ? "UPPERCUT" : "HOOK";
    }
    return peakElbowAngle >= 150 ? "STRAIGHT" : "HOOK";
  }

  isGuardUp(hand: Hand, lm: Point[]): boolean {
    const wrist = lm[hand === "LEFT" ? LM.L_WRIST : LM.R_WRIST];
    const shoulder = lm[hand === "LEFT" ? LM.L_SHOULDER : LM.R_SHOULDER];
    const nose = lm[LM.NOSE];
    const shoulderW = dist(lm[LM.L_SHOULDER], lm[LM.R_SHOULDER]);
    // hand at or above shoulder line and within ~1.5 shoulder-widths of the chin
    return (
      wrist.y < shoulder.y + 0.25 * shoulderW &&
      dist(wrist, nose) < 1.5 * shoulderW
    );
  }

  private frameMetrics(t: number, lm: Point[] | null): FrameMetrics {
    const L = this.hands.LEFT;
    const R = this.hands.RIGHT;
    return {
      time: t,
      landmarks: lm,
      wristTrail: { left: [...L.trail], right: [...R.trail] },
      speedMph: { left: L.speedMs * MS_TO_MPH, right: R.speedMs * MS_TO_MPH },
      maxSpeedMph: this.maxSpeedMph,
      elbowAngle: lm
        ? {
            left: angleDeg(lm[LM.L_SHOULDER], lm[LM.L_ELBOW], lm[LM.L_WRIST]),
            right: angleDeg(lm[LM.R_SHOULDER], lm[LM.R_ELBOW], lm[LM.R_WRIST]),
          }
        : { left: 0, right: 0 },
      kneeAngle: lm
        ? {
            left: angleDeg(lm[LM.L_HIP], lm[LM.L_KNEE], lm[LM.L_ANKLE]),
            right: angleDeg(lm[LM.R_HIP], lm[LM.R_KNEE], lm[LM.R_ANKLE]),
          }
        : { left: 0, right: 0 },
      torsoTiltDeg: lm ? this.torsoTilt(lm) : 0,
      guardUp: lm
        ? { left: this.isGuardUp("LEFT", lm), right: this.isGuardUp("RIGHT", lm) }
        : { left: false, right: false },
      punchCount: this.punches.length,
      lastPunch: this.lastPunch,
    };
  }

  private torsoTilt(lm: Point[]): number {
    const shoulderMid = {
      x: (lm[LM.L_SHOULDER].x + lm[LM.R_SHOULDER].x) / 2,
      y: (lm[LM.L_SHOULDER].y + lm[LM.R_SHOULDER].y) / 2,
    };
    const hipMid = {
      x: (lm[LM.L_HIP].x + lm[LM.R_HIP].x) / 2,
      y: (lm[LM.L_HIP].y + lm[LM.R_HIP].y) / 2,
    };
    const dx = shoulderMid.x - hipMid.x;
    const dy = hipMid.y - shoulderMid.y; // positive when upright
    return (Math.atan2(dx, dy) * 180) / Math.PI;
  }

  stats(): SessionStats {
    const guardRatio = (h: HandTracker) =>
      h.activeFrames > 0 ? h.guardFrames / h.activeFrames : 1;
    let headMovement = 0;
    if (this.noseSamples.length > 10) {
      const mx =
        this.noseSamples.reduce((s, p) => s + p.x, 0) / this.noseSamples.length;
      const my =
        this.noseSamples.reduce((s, p) => s + p.y, 0) / this.noseSamples.length;
      headMovement = Math.sqrt(
        this.noseSamples.reduce(
          (s, p) => s + (p.x - mx) ** 2 + (p.y - my) ** 2,
          0
        ) / this.noseSamples.length
      );
    }
    const sorted = [...this.stanceRatios].sort((a, b) => a - b);
    const stanceWidthRatio = sorted.length
      ? sorted[Math.floor(sorted.length / 2)]
      : 0;
    return {
      durationS: Math.max(this.prevTime, 0),
      punches: [...this.punches],
      guardUpRatio: {
        left: guardRatio(this.hands.LEFT),
        right: guardRatio(this.hands.RIGHT),
      },
      headMovement,
      stanceWidthRatio,
      maxSpeedMph: this.maxSpeedMph,
    };
  }

  hasData(): boolean {
    return this.totalFrames > 30;
  }
}
