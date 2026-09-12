import { weightsFor } from "../analysis/score";
import { emptyMoveCounts, PUNCH_LABEL, type PunchType } from "../analysis/types";
import { BarChart } from "../components/Charts";
import { TopBar } from "../components/Nav";
import { ProGate, UpsellBanner } from "../components/Paywall";
import { ScoreRing } from "../components/ScoreRing";
import { navigate } from "../lib/router";
import { useStore } from "../state/store";
import { drillById } from "../training/drills";

const COMPONENTS = [
  ["guard", "Guard", "Hands home between punches"],
  ["technique", "Technique", "Elbow extension on straights"],
  ["output", "Output", "Punches per minute vs drill target"],
  ["recovery", "Recovery", "Speed of return to guard"],
  ["movement", "Movement", "Head off the centerline"],
] as const;

export function Summary({ id }: { id: string }) {
  const { sessions, pro, deleteSession } = useStore();
  const s = sessions.find((x) => x.id === id);
  if (!s) {
    return (
      <div className="screen">
        <TopBar title="Session" back="history" />
        <p className="muted">That session isn't available{pro ? "" : " — the free plan keeps your last 3 sessions"}.</p>
      </div>
    );
  }
  const drill = drillById(s.drillId);
  const w = weightsFor(drill);
  const punchData = (Object.keys(PUNCH_LABEL) as PunchType[])
    .map((t) => ({ label: PUNCH_LABEL[t], value: s.byType[t] ?? 0 }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value);
  const combos = Object.entries(s.combos ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const mc = s.moveCounts ?? emptyMoveCounts(); // sessions saved before defense tracking
  const [top, ...rest] = s.critiques;

  return (
    <div className="screen">
      <TopBar title="Session report" back="history" />

      <div className="summary-head">
        <ScoreRing score={s.score.total} grade={s.score.grade} />
        <div>
          <div className="session-title">{drill.name}</div>
          <div className="muted small">
            {new Date(s.startedAt).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
          </div>
          <div className="muted small">
            {s.source === "upload" ? "Uploaded video" : `${s.rounds} × ${Math.round(s.roundLengthS / 60)} min`} ·{" "}
            {Math.round(s.activeS / 60)}m {Math.round(s.activeS % 60)}s of work
          </div>
        </div>
      </div>

      <div className="tiles">
        <div className="tile"><div className="tile-k">Punches</div><div className="tile-v num">{s.punchCount}</div></div>
        <div className="tile"><div className="tile-k">Per min</div><div className="tile-v num">{s.punchesPerMin.toFixed(0)}</div></div>
        <div className="tile"><div className="tile-k">Top speed</div><div className="tile-v num">{s.maxSpeedMph.toFixed(0)}<span className="tile-unit">mph</span></div></div>
        <div className="tile"><div className="tile-k">Guard</div><div className="tile-v num">{Math.round(((s.guardUpRatio.left + s.guardUpRatio.right) / 2) * 100)}<span className="tile-unit">%</span></div></div>
      </div>

      <h2>Score breakdown</h2>
      <div className="card">
        {COMPONENTS.map(([key, name, hint]) => (
          <div key={key} className="breakdown-row">
            <div className="breakdown-label">
              <strong>{name}</strong>
              <span className="muted small">{hint}</span>
            </div>
            <div className="bar-track">
              <div className="bar-fill" style={{ width: `${(s.score[key] / w[key]) * 100}%` }} />
            </div>
            <div className="num breakdown-pts">{s.score[key]}<span className="muted">/{w[key]}</span></div>
          </div>
        ))}
      </div>

      <h2>Coach's notes</h2>
      {top ? (
        <div className={`critique ${top.severity}`}>
          <strong>{top.severity === "bad" ? "✕" : top.severity === "warn" ? "!" : "✓"} {top.title}</strong>
          <p>{top.detail}</p>
        </div>
      ) : (
        <p className="muted">Not enough punches to critique. Try a longer round.</p>
      )}
      {rest.length > 0 && (
        <ProGate feature={`The full breakdown (${rest.length} more notes)`}>
          {rest.map((c, i) => (
            <div key={i} className={`critique ${c.severity}`}>
              <strong>{c.severity === "bad" ? "✕" : c.severity === "warn" ? "!" : "✓"} {c.title}</strong>
              <p>{c.detail}</p>
            </div>
          ))}
        </ProGate>
      )}

      {punchData.length > 0 && (
        <>
          <h2>Punch mix</h2>
          <div className="card">
            <BarChart data={punchData} />
            <div className="muted small" style={{ marginTop: 8 }}>
              Avg speed {s.avgSpeedMph.toFixed(0)} mph
              {s.avgExtensionDeg !== null && ` · straights ${Math.round(s.avgExtensionDeg)}° extension`}
              {s.avgRetractionMs !== null && ` · ${Math.round(s.avgRetractionMs)}ms return`}
            </div>
          </div>
        </>
      )}

      <h2>Defense &amp; footwork</h2>
      <div className="card">
        <div className="move-grid">
          {(
            [
              ["Slips", mc.slips],
              ["Ducks", mc.ducks],
              ["Rolls", mc.rolls],
              ["Steps", mc.steps],
              ["Pivots", mc.pivots],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="move">
              <span className="num move-n">{v}</span>
              <span className="muted small">{k}</span>
            </div>
          ))}
        </div>
      </div>

      <h2>Combinations</h2>
      <ProGate feature="Combo detection" compact>
        <div className="card">
          {combos.length === 0 ? (
            <p className="muted small">No combinations registered. Throw punches within half a second of each other.</p>
          ) : (
            <div className="combo-grid">
              {combos.map(([k, n]) => (
                <div key={k} className="combo">
                  <span className="num combo-key">{k}</span>
                  <span className="muted small">×{n}</span>
                </div>
              ))}
            </div>
          )}
          <p className="muted small">1 jab · 2 cross · 3 lead hook · 4 rear hook · 5 lead uppercut · 6 rear uppercut</p>
        </div>
      </ProGate>

      <UpsellBanner text="Go Pro to see every note and track your progress over time." />

      <div className="start-buttons">
        <button className="btn btn-primary btn-lg" onClick={() => navigate(`train?drill=${s.drillId}`)}>
          Train again
        </button>
        <button className="btn btn-ghost" onClick={() => navigate("home")}>Home</button>
        <button
          className="link danger"
          onClick={() => {
            if (confirm("Delete this session?")) {
              deleteSession(s.id);
              navigate("history");
            }
          }}
        >
          Delete session
        </button>
      </div>
    </div>
  );
}
