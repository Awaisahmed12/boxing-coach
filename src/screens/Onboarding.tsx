import { useState } from "react";
import type { Stance } from "../analysis/types";
import { TRIAL_DAYS } from "../billing/plans";
import { navigate } from "../lib/router";
import { useStore, type Level } from "../state/store";

export function Onboarding() {
  const { completeOnboarding } = useStore();
  const [name, setName] = useState("");
  const [stance, setStance] = useState<Stance>("orthodox");
  const [level, setLevel] = useState<Level>("beginner");

  return (
    <div className="screen narrow">
      <div className="brand" style={{ marginBottom: 24 }}>
        BOXING<span>COACH</span>
      </div>
      <h1>Set up your corner</h1>
      <p className="muted">Takes 20 seconds. The coach uses this to name your punches correctly.</p>

      <label className="field">
        <span>What should the coach call you?</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoFocus />
      </label>

      <div className="field">
        <span>Stance</span>
        <div className="choice-row">
          <button className={`choice ${stance === "orthodox" ? "on" : ""}`} onClick={() => setStance("orthodox")}>
            <strong>Orthodox</strong>
            <span>Left foot forward · left jab</span>
          </button>
          <button className={`choice ${stance === "southpaw" ? "on" : ""}`} onClick={() => setStance("southpaw")}>
            <strong>Southpaw</strong>
            <span>Right foot forward · right jab</span>
          </button>
        </div>
      </div>

      <div className="field">
        <span>Experience</span>
        <div className="choice-row">
          {(["beginner", "intermediate", "advanced"] as Level[]).map((l) => (
            <button key={l} className={`choice ${level === l ? "on" : ""}`} onClick={() => setLevel(l)}>
              <strong>{l[0].toUpperCase() + l.slice(1)}</strong>
              <span>{l === "beginner" ? "< 1 year" : l === "intermediate" ? "1–3 years" : "3+ years / compete"}</span>
            </button>
          ))}
        </div>
      </div>

      <button
        className="btn btn-primary btn-lg"
        onClick={() => {
          completeOnboarding({ name: name.trim() || "Champ", stance, level });
          navigate("home");
        }}
      >
        Start {TRIAL_DAYS}-day Pro trial →
      </button>
      <p className="muted small center">Full Pro access, no card. Drops to the free plan automatically after.</p>
    </div>
  );
}
