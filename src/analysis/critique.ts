import type { Critique, SessionStats } from "./types";

/** Turn accumulated session stats into coaching feedback, worst problems first. */
export function buildCritiques(stats: SessionStats): Critique[] {
  const out: Critique[] = [];
  const { punches, guardUpRatio, durationS } = stats;
  const minutes = Math.max(durationS / 60, 1 / 60);

  // --- Guard discipline ---
  for (const side of ["left", "right"] as const) {
    const ratio = guardUpRatio[side];
    const label = side === "left" ? "LEFT" : "RIGHT";
    if (ratio < 0.55) {
      out.push({
        severity: "bad",
        title: `${label} hand is down`,
        detail: `Your ${side} hand was in guard only ${Math.round(
          ratio * 100
        )}% of the time when not punching. Keep it glued to your cheek — every drop is a free counter for your opponent.`,
      });
    } else if (ratio < 0.8) {
      out.push({
        severity: "warn",
        title: `${label} guard drifts`,
        detail: `${Math.round(
          (1 - ratio) * 100
        )}% of the time your ${side} hand drifted below your chin. Recheck it every time you reset.`,
      });
    }
  }
  if (guardUpRatio.left >= 0.8 && guardUpRatio.right >= 0.8) {
    out.push({
      severity: "good",
      title: "Solid guard",
      detail: "Both hands stayed home when you weren't punching. Keep that habit under fatigue.",
    });
  }

  // --- Punch mechanics ---
  const straights = punches.filter((p) => p.type === "STRAIGHT");
  if (straights.length >= 3) {
    const avgExt =
      straights.reduce((s, p) => s + p.peakElbowAngle, 0) / straights.length;
    if (avgExt < 158) {
      out.push({
        severity: "warn",
        title: "Punches falling short",
        detail: `Your straight punches averaged ${Math.round(
          avgExt
        )}° at the elbow (aim for 165°+). Turn the shoulder over and snap the arm out fully — you're leaving reach on the table.`,
      });
    } else {
      out.push({
        severity: "good",
        title: "Full extension",
        detail: `Straight punches averaged ${Math.round(
          avgExt
        )}° of elbow extension — good snap and reach.`,
      });
    }
  }

  const retractions = punches
    .map((p) => p.retractionMs)
    .filter((r): r is number => r !== null);
  if (retractions.length >= 3) {
    const avgRet = retractions.reduce((s, r) => s + r, 0) / retractions.length;
    if (avgRet > 450) {
      out.push({
        severity: "bad",
        title: "Slow hand return",
        detail: `On average it took ${Math.round(
          avgRet
        )}ms to bring your hand back after punching. Snap it back on the same line — lazy returns get countered.`,
      });
    } else if (avgRet > 300) {
      out.push({
        severity: "warn",
        title: "Bring it back faster",
        detail: `Hands return to guard in ~${Math.round(
          avgRet
        )}ms. Think "touch and recoil" — the punch isn't over until the hand is back.`,
      });
    }
  }

  // --- Output & variety ---
  if (durationS > 20) {
    const perMin = punches.length / minutes;
    if (perMin < 8) {
      out.push({
        severity: "warn",
        title: "Low output",
        detail: `Only ${punches.length} punches in ${Math.round(
          durationS
        )}s (${perMin.toFixed(1)}/min). Stay busy — even light touch jabs keep your rhythm and your opponent honest.`,
      });
    }
    const left = punches.filter((p) => p.hand === "LEFT").length;
    const right = punches.length - left;
    if (punches.length >= 10) {
      const skew = Math.max(left, right) / punches.length;
      if (skew > 0.8) {
        const lazy = left > right ? "right" : "left";
        out.push({
          severity: "warn",
          title: `Neglected ${lazy} hand`,
          detail: `${Math.round(
            skew * 100
          )}% of your punches came from one side. Double up with the ${lazy} — predictable boxers get timed.`,
        });
      }
      const hooks = punches.filter((p) => p.type !== "STRAIGHT").length;
      if (hooks === 0) {
        out.push({
          severity: "warn",
          title: "All straight punches",
          detail:
            "No hooks or uppercuts detected. Mix in shots from different angles so your combinations are harder to read.",
        });
      }
    }
  }

  // --- Movement ---
  if (durationS > 20 && stats.headMovement < 0.012) {
    out.push({
      severity: "warn",
      title: "Static head",
      detail:
        "Your head barely moved off the centerline. Slip or change levels after you punch — don't be a stationary target.",
    });
  }
  if (stats.stanceWidthRatio > 0 && durationS > 10) {
    if (stats.stanceWidthRatio < 0.8) {
      out.push({
        severity: "warn",
        title: "Stance too narrow",
        detail:
          "Your feet are closer than shoulder width. Widen the base for balance and power transfer from the ground up.",
      });
    } else if (stats.stanceWidthRatio > 2.3) {
      out.push({
        severity: "warn",
        title: "Stance too wide",
        detail:
          "Your feet are very spread out, which kills mobility. Bring them in so you can step and pivot freely.",
      });
    }
  }

  if (stats.maxSpeedMph > 0 && punches.length > 0) {
    out.push({
      severity: "good",
      title: "Hand speed",
      detail: `Fastest hand recorded at ${stats.maxSpeedMph.toFixed(
        0
      )} mph across ${punches.length} punches.`,
    });
  }

  const order = { bad: 0, warn: 1, good: 2 };
  out.sort((a, b) => order[a.severity] - order[b.severity]);
  return out;
}
