export interface Point {
  x: number;
  y: number;
  visibility?: number; // MediaPipe per-landmark confidence, 0..1
}

export type Hand = "LEFT" | "RIGHT";
export type Stance = "orthodox" | "southpaw";

/** Mechanical shape of a punch, as the tracker sees it */
export type PunchShape = "STRAIGHT" | "HOOK" | "UPPERCUT";

/** Boxing punch numbering: 1 jab, 2 cross, 3 lead hook, 4 rear hook, 5 lead uppercut, 6 rear uppercut */
export type PunchType =
  | "JAB"
  | "CROSS"
  | "LEAD_HOOK"
  | "REAR_HOOK"
  | "LEAD_UPPERCUT"
  | "REAR_UPPERCUT";

export const PUNCH_NUMBER: Record<PunchType, number> = {
  JAB: 1,
  CROSS: 2,
  LEAD_HOOK: 3,
  REAR_HOOK: 4,
  LEAD_UPPERCUT: 5,
  REAR_UPPERCUT: 6,
};

export const PUNCH_LABEL: Record<PunchType, string> = {
  JAB: "Jab",
  CROSS: "Cross",
  LEAD_HOOK: "Lead hook",
  REAR_HOOK: "Rear hook",
  LEAD_UPPERCUT: "Lead uppercut",
  REAR_UPPERCUT: "Rear uppercut",
};

export function namepunch(shape: PunchShape, hand: Hand, stance: Stance): PunchType {
  const lead = (stance === "orthodox" ? "LEFT" : "RIGHT") === hand;
  switch (shape) {
    case "STRAIGHT":
      return lead ? "JAB" : "CROSS";
    case "HOOK":
      return lead ? "LEAD_HOOK" : "REAR_HOOK";
    case "UPPERCUT":
      return lead ? "LEAD_UPPERCUT" : "REAR_UPPERCUT";
  }
}

export const isStraight = (t: PunchType) => t === "JAB" || t === "CROSS";

export type DefenseMove = "SLIP" | "DUCK" | "ROLL";
export type FootworkMove = "PIVOT" | "STEP";
export type MoveType = PunchType | DefenseMove | FootworkMove;

export interface MoveEvent {
  time: number; // seconds into session
  type: MoveType;
  hand?: Hand; // set for punches
}

export interface MoveCounts {
  slips: number;
  ducks: number;
  rolls: number;
  pivots: number;
  steps: number;
}

export const emptyMoveCounts = (): MoveCounts => ({ slips: 0, ducks: 0, rolls: 0, pivots: 0, steps: 0 });

export interface PunchEvent {
  time: number; // seconds into session
  round: number;
  hand: Hand;
  type: PunchType;
  speedMph: number;
  peakElbowAngle: number; // degrees at full extension
  extensionM: number; // wrist-to-shoulder reach in meters
  retractionMs: number | null; // filled in once the hand returns to guard
}

export interface FrameMetrics {
  time: number;
  landmarks: Point[] | null;
  wristTrail: { left: Point[]; right: Point[] };
  speedMph: { left: number; right: number };
  maxSpeedMph: number;
  elbowAngle: { left: number; right: number };
  kneeAngle: { left: number; right: number };
  torsoTiltDeg: number;
  guardUp: { left: boolean; right: boolean };
  punchCount: number;
  lastPunch: PunchEvent | null;
  lastCombo: string | null;
  moveCounts: MoveCounts;
  lastMove: MoveEvent | null;
  /** share of recent non-punching frames with the hand in guard, both hands */
  recentGuardRatio: number;
  secondsSinceLastPunch: number;
}

export interface SessionStats {
  durationS: number;
  activeS: number; // seconds of round time (rest excluded)
  punches: PunchEvent[];
  guardUpRatio: { left: number; right: number };
  headMovement: number; // avg normalized std-dev of nose position
  stanceWidthRatio: number; // ankle spread / shoulder width (median)
  maxSpeedMph: number;
  moveCounts: MoveCounts;
  combos: Record<string, number>;
}

export type Severity = "good" | "warn" | "bad";

export interface Critique {
  severity: Severity;
  title: string;
  detail: string;
}

export interface ScoreBreakdown {
  total: number;
  grade: string;
  guard: number;
  technique: number;
  output: number;
  recovery: number;
  movement: number;
}

export interface SessionRecord {
  id: string;
  startedAt: number;
  source: "live" | "upload";
  drillId: string;
  rounds: number;
  roundLengthS: number;
  activeS: number;
  score: ScoreBreakdown;
  punchCount: number;
  byType: Partial<Record<PunchType, number>>;
  maxSpeedMph: number;
  avgSpeedMph: number;
  punchesPerMin: number;
  guardUpRatio: { left: number; right: number };
  avgExtensionDeg: number | null;
  avgRetractionMs: number | null;
  headMovement: number;
  stanceWidthRatio: number;
  moveCounts: MoveCounts;
  combos: Record<string, number>;
  critiques: Critique[];
}
