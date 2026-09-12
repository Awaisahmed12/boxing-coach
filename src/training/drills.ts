export type Focus = "free" | "guard" | "output" | "technique" | "combos" | "movement";

export interface Drill {
  id: string;
  name: string;
  tagline: string;
  description: string;
  focus: Focus;
  pro: boolean;
  rounds: number;
  roundLengthS: number;
  restS: number;
  /** punches per minute considered "full marks" for the output score */
  targetPpm: number;
  /** combo the drill is built around, in punch-number notation */
  targetCombo?: string;
  cue: string;
}

export const DRILLS: Drill[] = [
  {
    id: "shadow",
    name: "Shadowboxing",
    tagline: "Free rounds, full analysis",
    description:
      "Move, punch and defend like you're in the ring. The coach scores everything — guard, extension, output, recovery and head movement.",
    focus: "free",
    pro: false,
    rounds: 3,
    roundLengthS: 180,
    restS: 60,
    targetPpm: 30,
    cue: "Stay loose. Punch, move, reset.",
  },
  {
    id: "one-two",
    name: "1-2 Drill",
    tagline: "Jab, cross, home",
    description:
      "Throw the 1-2 on repeat. Scored on cross extension, how fast your hands snap back, and how many clean 1-2s you land per round.",
    focus: "combos",
    pro: false,
    rounds: 3,
    roundLengthS: 120,
    restS: 45,
    targetPpm: 40,
    targetCombo: "1-2",
    cue: "Jab, cross. Turn the back foot on the 2.",
  },
  {
    id: "guard",
    name: "Guard Discipline",
    tagline: "Hands stay home",
    description:
      "Light punching, heavy focus on defense. The score weights guard position 2x — every drop of the non-punching hand costs you.",
    focus: "guard",
    pro: true,
    rounds: 3,
    roundLengthS: 120,
    restS: 45,
    targetPpm: 20,
    cue: "Non-punching hand glued to the cheek.",
  },
  {
    id: "combos",
    name: "Combination Builder",
    tagline: "1-1-2, 1-2-3, 1-2-3-2",
    description:
      "Chain three and four-punch combinations. Tracks which combos you land, how fast you flow between punches, and whether you return to guard after the last shot.",
    focus: "combos",
    pro: true,
    rounds: 4,
    roundLengthS: 120,
    restS: 45,
    targetPpm: 45,
    targetCombo: "1-2-3",
    cue: "Flow, don't force. Guard up after the last punch.",
  },
  {
    id: "slip",
    name: "Slip & Move",
    tagline: "Get off the centerline",
    description:
      "Punch, then move your head. Scored heavily on head movement and staying active — stationary targets lose points.",
    focus: "movement",
    pro: true,
    rounds: 3,
    roundLengthS: 120,
    restS: 45,
    targetPpm: 25,
    cue: "Every punch ends with a slip or a level change.",
  },
  {
    id: "speed",
    name: "Speed Round",
    tagline: "60 seconds, all out",
    description:
      "Maximum output for one minute. Measures peak hand speed and total punches. Great as a finisher.",
    focus: "output",
    pro: true,
    rounds: 1,
    roundLengthS: 60,
    restS: 0,
    targetPpm: 90,
    cue: "Fast hands. Don't sacrifice the guard.",
  },
];

export const drillById = (id: string): Drill =>
  DRILLS.find((d) => d.id === id) ?? DRILLS[0];
