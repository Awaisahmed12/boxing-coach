export interface Point {
  x: number;
  y: number;
  visibility?: number; // MediaPipe per-landmark confidence, 0..1
}

export type Hand = "LEFT" | "RIGHT";

export type PunchType = "STRAIGHT" | "HOOK" | "UPPERCUT";

export interface PunchEvent {
  time: number; // seconds into session
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
}

export interface SessionStats {
  durationS: number;
  punches: PunchEvent[];
  guardUpRatio: { left: number; right: number };
  headMovement: number; // avg normalized std-dev of nose position
  stanceWidthRatio: number; // ankle spread / shoulder width (median)
  maxSpeedMph: number;
}

export type Severity = "good" | "warn" | "bad";

export interface Critique {
  severity: Severity;
  title: string;
  detail: string;
}
