import { LM } from "./pose";
import type {
  FrameMetrics,
  Hand,
  Point,
  PunchEvent,
  PunchType,
  SessionStats,
} from "./types";

const SHOULDER_WIDTH_M = 0.41; // assumed adult biacromial width
const TORSO_LENGTH_M = 0.52; // assumed shoulder-midpoint to hip-midpoint length
const MS_TO_MPH = 2.23694;
// punch gates run on wrist speed RELATIVE to the shoulder, so footwork,
// slips and walking toward the camera can't trigger them. Thresholds are on
// smoothed values, which the EMA chain attenuates to roughly 0.6x of true
// speed — these correspond to ~3.0/3.7 m/s true relative wrist speed.
const PUNCH_START_SPEED = 1.8; // m/s — smoothed relative speed that begins a punch
const PUNCH_MIN_PEAK_SPEED = 2.2; // m/s — smoothed relative peak required to count
const PUNCH_MIN_EXT_GAIN = 0.12; // m — reach gained vs where the punch began
const PUNCH_MIN_PATH_M = 0.18; // m — wrist travel; lets hooks/uppercuts count
// alternative gate: a slightly slower punch with unmistakable extension gain
// still counts — recovers light jabs filmed at the recommended 45° angle
const PUNCH_ALT_PEAK_SPEED = 1.9; // m/s
const PUNCH_ALT_EXT_GAIN = 0.15; // m — far beyond what jitter can fake
const PUNCH_STALL_DROP_M = 0.05; // m — extension fallback from peak that ends a punch
const PUNCH_REFRACTORY_S = 0.15; // s — per-hand lockout measured from punch peak
const SPEED_GLITCH_MS = 12; // m/s — instantaneous readings above this are tracking glitches
const JITTER_DEADBAND_N = 0.0025; // normalized units of per-frame landmark noise
const TRACK_GAP_RESET_S = 0.5; // s — losing the pose this long resets motion state
const MIN_VISIBILITY = 0.5; // below this the landmark is hallucinated, not seen
const GUARD_ENTER_CHIN_M = 0.42; // wrist must come within this of the chin to enter guard
const GUARD_STAY_CHIN_M = 0.5; // and may drift out to this before guard is lost
const GUARD_ENTER_DROP_M = 0.1; // wrist may sit this far below the shoulder line
const GUARD_STAY_DROP_M = 0.16;
const GUARD_ENTER_EXT_M = 0.45; // arm compactness: long guard passes, a punch doesn't
const GUARD_STAY_EXT_M = 0.52;
const GUARD_DEBOUNCE_FRAMES = 2;
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
  speedMs: number; // smoothed absolute wrist speed (what the UI shows)
  relSpeedMs: number; // smoothed shoulder-relative wrist speed (what gates punches)
  prevPos: Point | null;
  prevRel: Point | null;
  prevExtension: number;
  shrinkingFrames: number;
  extendStreak: number; // consecutive frames of growing extension
  fastFrames: number; // consecutive frames above PUNCH_START_SPEED
  streakBaseExt: number; // reach when the current extension streak began
  punchBaseExt: number; // reach when the current punch began
  pathLen: number; // wrist travel during the current punch, meters
  stepBuf: number[]; // last few relative steps, to seed pathLen at punch entry
  chinHist: number[]; // recent wrist-to-nose distances, for punch direction
  peakSpeed: number;
  peakInstSpeed: number; // peak un-smoothed wrist speed during the punch
  peakRelSpeed: number;
  peakElbowAngle: number;
  peakExtension: number;
  peakExtT: number; // when peak extension happened — the punch's true landing time
  punchStartT: number;
  retractStartT: number;
  lastPunchT: number;
  pendingPunch: PunchEvent | null;
  guardUp: boolean;
  guardFlipFrames: number;
  guardFrames: number;
  activeFrames: number;
  trail: Point[];
}

function newHandTracker(): HandTracker {
  return {
    phase: "GUARD",
    speedMs: 0,
    relSpeedMs: 0,
    prevPos: null,
    prevRel: null,
    prevExtension: Number.POSITIVE_INFINITY,
    shrinkingFrames: 0,
    extendStreak: 0,
    fastFrames: 0,
    streakBaseExt: 0,
    punchBaseExt: 0,
    pathLen: 0,
    stepBuf: [],
    chinHist: [],
    peakSpeed: 0,
    peakInstSpeed: 0,
    peakRelSpeed: 0,
    peakElbowAngle: 0,
    peakExtension: 0,
    peakExtT: 0,
    punchStartT: 0,
    retractStartT: 0,
    lastPunchT: -1,
    pendingPunch: null,
    // benefit of the doubt: a hand we haven't (yet) seen counts as guarding,
    // matching stats(), so an occluded rear hand doesn't read HALF all round
    guardUp: true,
    guardFlipFrames: 0,
    guardFrames: 0,
    activeFrames: 0,
    trail: [],
  };
}

export class BoxingAnalyzer {
  private smoothed: Point[] | null = null;
  private prevTime = -1;
  private startTime = -1;
  private lastSeenT = -1;
  private scaleSm = 0; // slow EMA — stable denominator for speeds
  private scaleFast = 0; // fast EMA — tracks approach/retreat for length thresholds
  private aspect = 1;
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

  /**
   * Feed one frame of normalized landmarks. timeS is the video's media time
   * in seconds; aspect is videoWidth/videoHeight, needed because normalized
   * x is in image-width units and y in image-height units.
   */
  update(raw: Point[] | null, timeS: number, aspect = 1): FrameMetrics {
    if (this.startTime < 0) this.startTime = timeS;
    const t = timeS - this.startTime;

    if (!raw || raw.length < 33) {
      // don't advance prevTime: dt must span back to the last real sample so
      // displacement across a short dropout isn't divided by one frame
      return this.frameMetrics(t, null);
    }

    // EMA smoothing to suppress landmark jitter, in isotropic units (x scaled
    // by aspect); after losing the pose for a while — or if the video aspect
    // changes (device rotation) — snap instead of smoothing across the gap
    const gap = this.lastSeenT >= 0 && t - this.lastSeenT > TRACK_GAP_RESET_S;
    const aspectChanged =
      this.smoothed !== null && Math.abs(aspect - this.aspect) > 0.001;
    this.aspect = aspect;
    if (!this.smoothed || gap || aspectChanged) {
      this.smoothed = raw.map((p) => ({
        x: p.x * aspect,
        y: p.y,
        visibility: p.visibility,
      }));
      this.resetMotion();
      if (aspectChanged) {
        this.scaleSm = 0;
        this.scaleFast = 0;
      }
    } else {
      const a = 0.55;
      for (let i = 0; i < raw.length; i++) {
        // a single NaN coordinate would poison the EMA permanently
        if (!Number.isFinite(raw[i].x) || !Number.isFinite(raw[i].y)) continue;
        this.smoothed[i].x = a * raw[i].x * aspect + (1 - a) * this.smoothed[i].x;
        this.smoothed[i].y = a * raw[i].y + (1 - a) * this.smoothed[i].y;
        this.smoothed[i].visibility = raw[i].visibility;
      }
    }
    this.lastSeenT = t;
    const lm = this.smoothed;
    const dt = this.prevTime >= 0 ? t - this.prevTime : 0;
    this.prevTime = t;
    this.totalFrames++;

    const shoulderW = dist(lm[LM.L_SHOULDER], lm[LM.R_SHOULDER]);
    const torsoLen = this.torsoLen(lm);
    // px→m scale: a bladed stance foreshortens the shoulders, a crouch the
    // torso — take whichever estimate implies the smaller scale, and smooth
    // it so body rotation doesn't modulate speeds and thresholds
    const instScale = Math.min(
      SHOULDER_WIDTH_M / Math.max(shoulderW, 0.02),
      TORSO_LENGTH_M / Math.max(torsoLen, 0.02)
    );
    this.scaleSm = this.scaleSm > 0 ? 0.9 * this.scaleSm + 0.1 * instScale : instScale;
    this.scaleFast =
      this.scaleFast > 0 ? 0.6 * this.scaleFast + 0.4 * instScale : instScale;

    this.noseSamples.push({ x: lm[LM.NOSE].x / aspect, y: lm[LM.NOSE].y });
    if (this.noseSamples.length > 300) this.noseSamples.shift();
    const ankleSpread = dist(lm[LM.L_ANKLE], lm[LM.R_ANKLE]);
    this.stanceRatios.push(ankleSpread / Math.max(shoulderW, 0.02));

    if (dt > 0 && dt < 0.5) {
      this.trackHand("LEFT", lm, dt, t);
      this.trackHand("RIGHT", lm, dt, t);
    }

    return this.frameMetrics(t, lm);
  }

  private resetMotion() {
    for (const h of [this.hands.LEFT, this.hands.RIGHT]) {
      h.prevPos = null;
      h.prevRel = null;
      h.speedMs = 0;
      h.relSpeedMs = 0;
      h.shrinkingFrames = 0;
      h.extendStreak = 0;
      h.fastFrames = 0;
      h.prevExtension = Number.POSITIVE_INFINITY;
      h.pathLen = 0;
      h.stepBuf = [];
      h.chinHist = [];
      h.phase = "GUARD";
      h.pendingPunch = null;
      h.guardFlipFrames = 0;
      h.trail = [];
    }
  }

  // occluded or hallucinated landmarks: freeze the hand rather than feed
  // garbage through the punch and guard logic (guard state is held as-is)
  private freezeHand(h: HandTracker) {
    h.prevPos = null;
    h.prevRel = null;
    h.speedMs = 0;
    h.relSpeedMs = 0;
    h.fastFrames = 0;
    h.extendStreak = 0;
    h.shrinkingFrames = 0;
    h.prevExtension = Number.POSITIVE_INFINITY;
    h.stepBuf = [];
    h.chinHist = [];
    h.guardFlipFrames = 0;
    if (h.phase !== "GUARD") {
      h.phase = "GUARD";
      h.pendingPunch = null;
    }
  }

  private trackHand(hand: Hand, lm: Point[], dt: number, t: number) {
    const h = this.hands[hand];
    const wrist = lm[hand === "LEFT" ? LM.L_WRIST : LM.R_WRIST];
    const elbow = lm[hand === "LEFT" ? LM.L_ELBOW : LM.R_ELBOW];
    const shoulder = lm[hand === "LEFT" ? LM.L_SHOULDER : LM.R_SHOULDER];

    const vis = Math.min(wrist.visibility ?? 1, elbow.visibility ?? 1);
    if (vis < MIN_VISIBILITY) {
      this.freezeHand(h);
      return;
    }

    h.trail.push({ x: wrist.x / this.aspect, y: wrist.y });
    if (h.trail.length > TRAIL_LEN) h.trail.shift();

    const deadband = JITTER_DEADBAND_N * this.scaleSm;
    const rel = { x: wrist.x - shoulder.x, y: wrist.y - shoulder.y };
    let relStepM = 0;
    let absInstSpeed = 0;
    if (h.prevPos && h.prevRel) {
      const absInst =
        Math.max(0, dist(wrist, h.prevPos) * this.scaleSm - deadband) / dt;
      if (absInst < SPEED_GLITCH_MS) {
        h.speedMs = 0.5 * absInst + 0.5 * h.speedMs;
        absInstSpeed = absInst;
      }
      relStepM = Math.max(0, dist(rel, h.prevRel) * this.scaleSm - deadband);
      const relInst = relStepM / dt;
      if (relInst < SPEED_GLITCH_MS) {
        h.relSpeedMs = 0.5 * relInst + 0.5 * h.relSpeedMs;
      } else {
        relStepM = 0;
      }
    }
    h.prevPos = { x: wrist.x, y: wrist.y };
    h.prevRel = rel;
    h.fastFrames = h.relSpeedMs > PUNCH_START_SPEED ? h.fastFrames + 1 : 0;
    h.stepBuf.push(relStepM);
    if (h.stepBuf.length > 3) h.stepBuf.shift();

    const extension = dist(wrist, shoulder) * this.scaleFast;
    const elbowAngle = angleDeg(shoulder, elbow, wrist);
    if (extension > h.prevExtension) {
      if (h.extendStreak === 0) h.streakBaseExt = h.prevExtension;
      h.extendStreak++;
      h.shrinkingFrames = 0;
    } else {
      h.extendStreak = 0;
      h.shrinkingFrames++;
    }
    h.prevExtension = extension;

    const chinDist = dist(wrist, lm[LM.NOSE]) * this.scaleFast;
    // a punch arc travels away from the head; a retraction returns to it
    const leaving = h.chinHist.length >= 2 && chinDist > h.chinHist[0];
    h.chinHist.push(chinDist);
    if (h.chinHist.length > 2) h.chinHist.shift();

    // guard state only changes while the hand isn't punching
    if (h.phase === "GUARD") {
      this.updateGuard(h, chinDist, wrist, shoulder, extension);
    }

    const startReady =
      h.relSpeedMs > PUNCH_START_SPEED && t - h.lastPunchT > PUNCH_REFRACTORY_S;
    const outward = h.extendStreak >= 2;
    // hooks sweep at near-constant wrist-shoulder radius, so they never build
    // an extension streak — sustained relative speed that is neither pulling
    // inward nor returning toward the head is the arc signature
    const arcing = h.fastFrames >= 2 && h.shrinkingFrames < 2 && leaving;

    switch (h.phase) {
      case "GUARD": {
        // guard discipline is only judged while the hand is not punching
        if (h.guardUp) h.guardFrames++;
        h.activeFrames++;
        if (startReady && (outward || arcing)) {
          this.beginPunch(h, extension, elbowAngle, t);
        }
        break;
      }
      case "EXTENDING": {
        h.peakSpeed = Math.max(h.peakSpeed, h.speedMs);
        h.peakInstSpeed = Math.max(h.peakInstSpeed, absInstSpeed);
        h.peakRelSpeed = Math.max(h.peakRelSpeed, h.relSpeedMs);
        h.peakElbowAngle = Math.max(h.peakElbowAngle, elbowAngle);
        if (extension > h.peakExtension) {
          h.peakExtension = extension;
          h.peakExtT = t;
        }
        h.pathLen += relStepM;
        const stalled =
          h.shrinkingFrames >= 3 ||
          h.relSpeedMs < 1.0 ||
          extension < h.peakExtension - PUNCH_STALL_DROP_M;
        if (stalled) {
          const extGain = h.peakExtension - h.punchBaseExt;
          const counts =
            (h.peakRelSpeed > PUNCH_MIN_PEAK_SPEED &&
              (extGain > PUNCH_MIN_EXT_GAIN || h.pathLen > PUNCH_MIN_PATH_M)) ||
            (h.peakRelSpeed > PUNCH_ALT_PEAK_SPEED &&
              extGain > PUNCH_ALT_EXT_GAIN);
          if (counts) {
            const punch: PunchEvent = {
              time: h.peakExtT,
              hand,
              type: this.classify(hand, lm, h.peakElbowAngle),
              // the double-EMA peak underestimates a snap by ~40%; the
              // glitch-capped instantaneous peak is closer to true hand speed
              speedMph: Math.max(h.peakSpeed, h.peakInstSpeed) * MS_TO_MPH,
              peakElbowAngle: h.peakElbowAngle,
              extensionM: h.peakExtension,
              retractionMs: null,
            };
            this.punches.push(punch);
            this.lastPunch = punch;
            this.maxSpeedMph = Math.max(this.maxSpeedMph, punch.speedMph);
            h.pendingPunch = punch;
            // measure retraction (and the next punch's refractory) from the
            // moment the punch landed, not from when the stall was detected
            h.retractStartT = h.peakExtT;
            h.lastPunchT = h.peakExtT;
            h.stepBuf = []; // the next punch seeds only from its own frames
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
        if (startReady && (outward || arcing)) {
          // next punch of a fast combo — close out the old one and restart
          if (h.pendingPunch) {
            h.pendingPunch.retractionMs = (t - h.retractStartT) * 1000;
            h.pendingPunch = null;
          }
          this.beginPunch(h, extension, elbowAngle, t);
          break;
        }
        const backInGuard = extension < h.punchBaseExt + 0.05;
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

  private beginPunch(h: HandTracker, extension: number, elbowAngle: number, t: number) {
    h.phase = "EXTENDING";
    h.punchStartT = t;
    const base = h.extendStreak > 0 ? h.streakBaseExt : extension;
    h.punchBaseExt = Math.max(base, extension - 0.3); // cap stale streak bases
    h.peakSpeed = h.speedMs;
    h.peakInstSpeed = 0;
    h.peakRelSpeed = h.relSpeedMs;
    h.peakElbowAngle = elbowAngle;
    h.peakExtension = extension;
    h.peakExtT = t;
    // the frames that armed the entry are part of the punch, but capped so a
    // single tracking spike can't pre-pay the whole path gate
    h.pathLen = Math.min(
      h.stepBuf.reduce((s, v) => s + v, 0),
      PUNCH_MIN_PATH_M / 2
    );
    // a punch is by definition not guard
    h.guardUp = false;
    h.guardFlipFrames = 0;
  }

  // hysteresis + debounce: tighter thresholds to enter guard than to keep it,
  // and two consecutive frames of disagreement to flip — kills the flicker
  // between UP/HALF/DOWN that raw per-frame thresholds produce
  private updateGuard(
    h: HandTracker,
    chinDist: number,
    wrist: Point,
    shoulder: Point,
    extensionM: number
  ) {
    const drop = (wrist.y - shoulder.y) * this.scaleFast; // positive = below shoulder line
    const inGuard = h.guardUp
      ? chinDist < GUARD_STAY_CHIN_M &&
        drop < GUARD_STAY_DROP_M &&
        extensionM < GUARD_STAY_EXT_M
      : chinDist < GUARD_ENTER_CHIN_M &&
        drop < GUARD_ENTER_DROP_M &&
        extensionM < GUARD_ENTER_EXT_M;
    if (inGuard !== h.guardUp) {
      h.guardFlipFrames++;
      if (h.guardFlipFrames >= GUARD_DEBOUNCE_FRAMES) {
        h.guardUp = inGuard;
        h.guardFlipFrames = 0;
      }
    } else {
      h.guardFlipFrames = 0;
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

  private torsoLen(lm: Point[]): number {
    const shoulderMid = {
      x: (lm[LM.L_SHOULDER].x + lm[LM.R_SHOULDER].x) / 2,
      y: (lm[LM.L_SHOULDER].y + lm[LM.R_SHOULDER].y) / 2,
    };
    const hipMid = {
      x: (lm[LM.L_HIP].x + lm[LM.R_HIP].x) / 2,
      y: (lm[LM.L_HIP].y + lm[LM.R_HIP].y) / 2,
    };
    return dist(shoulderMid, hipMid);
  }

  private frameMetrics(t: number, lm: Point[] | null): FrameMetrics {
    const L = this.hands.LEFT;
    const R = this.hands.RIGHT;
    return {
      time: t,
      // landmarks and trails go back to width-normalized x for the canvas
      landmarks: lm ? lm.map((p) => ({ x: p.x / this.aspect, y: p.y })) : null,
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
      guardUp: { left: L.guardUp, right: R.guardUp },
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
