import type { Drill } from "../training/drills";
import type { Critique, SessionStats, Stance } from "./types";
import { isStraight } from "./types";

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** Turn session stats into coaching feedback, most important first. */
export function buildCritiques(stats: SessionStats, drill: Drill, stance: Stance): Critique[] {
  const out: Critique[] = [];
  const { punches, guardUpRatio, activeS } = stats;
  const minutes = Math.max(activeS / 60, 1 / 60);
  const leadSide = stance === "orthodox" ? "left" : "right";
  const role = (side: "left" | "right") => (side === leadSide ? "Lead" : "Rear");
  const sideName = (side: "left" | "right") => `${role(side).toLowerCase()} (${side})`;

  // --- Guard discipline ---
  for (const side of ["left", "right"] as const) {
    const r = guardUpRatio[side];
    if (r < 0.5) {
      out.push({
        severity: "bad",
        title: `${role(side)} hand is down`,
        detail: `Your ${sideName(side)} hand was in guard only ${pct(r)} of the time between punches. Park it on your cheek — a dropped ${role(side).toLowerCase()} hand is the most common way to get caught.`,
      });
    } else if (r < 0.78) {
      out.push({
        severity: "warn",
        title: `${role(side)} guard drifts`,
        detail: `${pct(1 - r)} of the time your ${sideName(side)} hand sat below your chin. Reset it consciously after every punch until it's automatic.`,
      });
    }
  }
  if (guardUpRatio.left >= 0.78 && guardUpRatio.right >= 0.78) {
    out.push({
      severity: "good",
      title: "Solid guard",
      detail: `Both hands stayed home ${pct(Math.min(guardUpRatio.left, guardUpRatio.right))}+ of the time. Keep that discipline as fatigue sets in.`,
    });
  }

  // --- Straight punch mechanics ---
  const jabs = punches.filter((p) => p.type === "JAB");
  const crosses = punches.filter((p) => p.type === "CROSS");
  for (const [name, list] of [["jab", jabs], ["cross", crosses]] as const) {
    if (list.length < 3) continue;
    const avg = list.reduce((s, p) => s + p.peakElbowAngle, 0) / list.length;
    const Name = name === "jab" ? "Jab" : "Cross";
    if (avg < 155) {
      out.push({
        severity: "warn",
        title: `${Name} isn't extending`,
        detail: `Your ${name} averaged ${Math.round(avg)}° at the elbow (target 165°+). ${
          name === "cross"
            ? "Pivot the rear foot and turn the hip through — the arm follows."
            : "Snap the shoulder forward and turn the fist over at the end."
        }`,
      });
    } else {
      out.push({
        severity: "good",
        title: `${Name} extension`,
        detail: `${Math.round(avg)}° average elbow extension on the ${name} — good reach and snap.`,
      });
    }
  }

  // --- Recovery ---
  const rets = punches.map((p) => p.retractionMs).filter((r): r is number => r !== null);
  if (rets.length >= 3) {
    const avg = rets.reduce((s, r) => s + r, 0) / rets.length;
    if (avg > 450) {
      out.push({
        severity: "bad",
        title: "Slow hand return",
        detail: `Hands took ${Math.round(avg)}ms on average to come back after a punch. The punch isn't finished until the hand is back on your face — snap it back on the same line.`,
      });
    } else if (avg > 300) {
      out.push({
        severity: "warn",
        title: "Bring it back faster",
        detail: `~${Math.round(avg)}ms average return. Think "touch and recoil" rather than push.`,
      });
    } else {
      out.push({
        severity: "good",
        title: "Sharp recovery",
        detail: `Hands back in guard in ~${Math.round(avg)}ms. That's what keeps you safe after you commit.`,
      });
    }
  }

  // --- Output & balance ---
  const ppm = punches.length / minutes;
  if (activeS > 30 && ppm < drill.targetPpm * 0.4) {
    out.push({
      severity: "warn",
      title: "Low output",
      detail: `${punches.length} punches in ${Math.round(activeS)}s of work (${ppm.toFixed(0)}/min). Stay busy — light touch jabs keep your rhythm and your opponent honest.`,
    });
  }
  if (punches.length >= 10) {
    const left = punches.filter((p) => p.hand === "LEFT").length;
    const skew = Math.max(left, punches.length - left) / punches.length;
    if (skew > 0.8) {
      const lazy = left > punches.length - left ? "right" : "left";
      out.push({
        severity: "warn",
        title: `Neglected ${lazy} hand`,
        detail: `${pct(skew)} of your punches came from one side. Double up with the ${lazy} — one-sided boxers get timed.`,
      });
    }
    const bent = punches.filter((p) => !isStraight(p.type)).length;
    if (bent === 0 && drill.focus !== "combos") {
      out.push({
        severity: "warn",
        title: "All straight punches",
        detail: "No hooks or uppercuts detected. Mix in shots from different angles so your combinations are harder to read.",
      });
    }
  }

  // --- Combinations ---
  if (drill.targetCombo) {
    const hits = stats.combos[drill.targetCombo] ?? 0;
    out.push({
      severity: hits >= minutes * 6 ? "good" : hits > 0 ? "warn" : "bad",
      title: `${hits} clean ${drill.targetCombo}s`,
      detail:
        hits === 0
          ? `No ${drill.targetCombo} combinations registered. Throw the punches within about half a second of each other so they read as one combination.`
          : `You landed the ${drill.targetCombo} ${hits} times (${(hits / minutes).toFixed(1)}/min). ${
              hits >= minutes * 6 ? "Good flow." : "Aim for 6+ per minute with a full return to guard after each."
            }`,
    });
  }

  // --- Defense & footwork ---
  const mc = stats.moveCounts;
  const defense = mc.slips + mc.ducks + mc.rolls;
  if (activeS > 20 && punches.length >= 10) {
    if (defense === 0) {
      out.push({
        severity: drill.focus === "movement" ? "bad" : "warn",
        title: "All offense, no defense",
        detail: `${punches.length} punches without a single slip, duck or roll. Work a defensive move after every combination — punch and don't be there.`,
      });
    } else if (defense < punches.length / 6) {
      out.push({
        severity: "warn",
        title: "Defense lags your offense",
        detail: `${defense} defensive moves against ${punches.length} punches. Build the habit: combo, then slip or change levels before you reset.`,
      });
    } else {
      out.push({
        severity: "good",
        title: "Defense woven in",
        detail: `${mc.slips} slips, ${mc.ducks} ducks and ${mc.rolls} rolls alongside ${punches.length} punches — offense and defense are connected.`,
      });
    }
  }
  if (activeS > 30) {
    const stepsPerMin = mc.steps / minutes;
    if (mc.pivots === 0 && stepsPerMin < 4) {
      out.push({
        severity: "warn",
        title: "Stuck in the mud",
        detail:
          "Barely any steps and no pivots detected. Move your feet — step off at an angle or pivot out after you punch instead of standing in range.",
      });
    } else if (mc.pivots >= 2 && stepsPerMin >= 6) {
      out.push({
        severity: "good",
        title: "Active feet",
        detail: `${mc.steps} steps and ${mc.pivots} pivots — you're moving, not posing. Keep changing angles.`,
      });
    }
  }
  if (activeS > 20 && stats.headMovement < 0.012 && defense === 0) {
    out.push({
      severity: "warn",
      title: "Static head",
      detail: "Your head barely left the centerline. Slip, roll or change levels after you punch — don't be a stationary target.",
    });
  }
  if (stats.stanceWidthRatio > 0 && activeS > 15) {
    if (stats.stanceWidthRatio < 0.8) {
      out.push({
        severity: "warn",
        title: "Stance too narrow",
        detail: "Your feet are inside shoulder width. Widen the base so power can travel from the floor and you can't be pushed off balance.",
      });
    } else if (stats.stanceWidthRatio > 2.3) {
      out.push({
        severity: "warn",
        title: "Stance too wide",
        detail: "Very wide base — that kills mobility. Bring the feet in so you can step and pivot freely.",
      });
    }
  }

  if (stats.maxSpeedMph > 0 && punches.length > 0) {
    out.push({
      severity: "good",
      title: "Hand speed",
      detail: `Peak hand speed ${stats.maxSpeedMph.toFixed(0)} mph across ${punches.length} punches.`,
    });
  }

  const order = { bad: 0, warn: 1, good: 2 };
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
}
