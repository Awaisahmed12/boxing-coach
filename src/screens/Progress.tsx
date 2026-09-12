import { LineChart } from "../components/Charts";
import { BottomNav, TopBar } from "../components/Nav";
import { ProGate } from "../components/Paywall";
import { navigate } from "../lib/router";
import { useStore } from "../state/store";

export function Progress() {
  const { sessions, profile } = useStore();
  const ordered = [...sessions].reverse().slice(-30);
  const label = (t: number) => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const series = (f: (s: (typeof sessions)[number]) => number) =>
    ordered.map((s) => ({ label: label(s.startedAt), value: f(s) }));

  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  const delta = first && last && ordered.length > 1 ? last.score.total - first.score.total : null;
  const since = profile.onboardedAt ? Math.floor((Date.now() - profile.onboardedAt) / 86_400_000) : 0;

  return (
    <div className="screen with-nav">
      <TopBar title="Progress" />
      {sessions.length < 2 ? (
        <div className="empty">
          <p className="muted">Progress charts appear once you've logged two sessions.</p>
          <button className="btn btn-primary" onClick={() => navigate("train")}>Train now</button>
        </div>
      ) : (
        <>
          <p className="muted">
            Day {since + 1} of your program · {sessions.length} sessions
            {delta !== null && (
              <>
                {" "}· score <strong className={delta >= 0 ? "good" : "bad"}>{delta >= 0 ? "+" : ""}{delta}</strong> since your first
              </>
            )}
          </p>
          <ProGate feature="Progress tracking">
            <h2>Session score</h2>
            <div className="card"><LineChart data={series((s) => s.score.total)} min={0} max={100} /></div>
            <h2>Top hand speed</h2>
            <div className="card"><LineChart data={series((s) => s.maxSpeedMph)} unit=" mph" min={0} /></div>
            <h2>Guard discipline</h2>
            <div className="card"><LineChart data={series((s) => ((s.guardUpRatio.left + s.guardUpRatio.right) / 2) * 100)} unit="%" min={0} max={100} /></div>
            <h2>Punches per minute</h2>
            <div className="card"><LineChart data={series((s) => s.punchesPerMin)} min={0} /></div>
            <h2>Hand return time</h2>
            <div className="card">
              <LineChart data={series((s) => s.avgRetractionMs ?? 0)} unit=" ms" min={0} />
              <div className="muted small">Lower is better.</div>
            </div>
          </ProGate>
        </>
      )}
      <BottomNav active="progress" />
    </div>
  );
}
