import type { Drill } from "../training/drills";
import type { ScoreBreakdown, SessionStats } from "./types";
import { isStraight } from "./types";

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const ramp = (v: number, lo: number, hi: number) => clamp01((v - lo) / (hi - lo));

export function grade(total: number): string {
  if (total >= 90) return "A+";
  if (total >= 85) return "A";
  if (total >= 78) return "B+";
  if (total >= 70) return "B";
  if (total >= 62) return "C+";
  if (total >= 55) return "C";
  if (total >= 40) return "D";
  return "F";
}

export interface Weights {
  guard: number;
  technique: number;
  output: number;
  recovery: number;
  movement: number;
}

/** Max points per component; shifts with the drill's focus. */
export function weightsFor(drill: Drill): Weights {
  const weights: Weights = { guard: 30, technique: 25, output: 20, recovery: 15, movement: 10 };
  switch (drill.focus) {
    case "guard":
      Object.assign(weights, { guard: 50, technique: 15, output: 10, recovery: 15, movement: 10 });
      break;
    case "output":
      Object.assign(weights, { guard: 20, technique: 15, output: 45, recovery: 10, movement: 10 });
      break;
    case "combos":
      Object.assign(weights, { guard: 25, technique: 25, output: 20, recovery: 25, movement: 5 });
      break;
    case "movement":
      Object.assign(weights, { guard: 25, technique: 15, output: 15, recovery: 10, movement: 35 });
      break;
    case "technique":
      Object.assign(weights, { guard: 25, technique: 45, output: 10, recovery: 15, movement: 5 });
      break;
  }
  return weights;
}

/** Session score out of 100. Each component ramps between "clearly bad" and "clearly good". */
export function scoreSession(stats: SessionStats, drill: Drill): ScoreBreakdown {
  const weights = weightsFor(drill);
  const minutes = Math.max(stats.activeS / 60, 0.25);
  const guardAvg = (stats.guardUpRatio.left + stats.guardUpRatio.right) / 2;
  const guard = ramp(guardAvg, 0.35, 0.9);

  const straights = stats.punches.filter((p) => isStraight(p.type));
  const technique = straights.length
    ? ramp(straights.reduce((s, p) => s + p.peakElbowAngle, 0) / straights.length, 135, 168)
    : 0.5;

  const output = ramp(stats.punches.length / minutes, 0, drill.targetPpm);

  const rets = stats.punches.map((p) => p.retractionMs).filter((r): r is number => r !== null);
  const recovery = rets.length
    ? 1 - ramp(rets.reduce((s, r) => s + r, 0) / rets.length, 220, 550)
    : 0.5;

  // movement credits either recognized defensive moves (slip/duck/roll per
  // minute) or plain off-centerline head travel, whichever reads higher
  const mc = stats.moveCounts;
  const defensePerMin = (mc.slips + mc.ducks + mc.rolls) / minutes;
  const movement = Math.max(ramp(defensePerMin, 0, 8), ramp(stats.headMovement, 0.01, 0.04));

  const parts = {
    guard: Math.round(guard * weights.guard),
    technique: Math.round(technique * weights.technique),
    output: Math.round(output * weights.output),
    recovery: Math.round(recovery * weights.recovery),
    movement: Math.round(movement * weights.movement),
  };
  const total = parts.guard + parts.technique + parts.output + parts.recovery + parts.movement;
  return { total, grade: grade(total), ...parts };
}
