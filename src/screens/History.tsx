import { FREE_HISTORY_LIMIT } from "../billing/plans";
import { BottomNav, TopBar } from "../components/Nav";
import { UpsellBanner } from "../components/Paywall";
import { navigate } from "../lib/router";
import { useStore } from "../state/store";
import { drillById } from "../training/drills";

export function History() {
  const { sessions, pro } = useStore();
  return (
    <div className="screen with-nav">
      <TopBar title="History" />
      {sessions.length === 0 ? (
        <div className="empty">
          <p className="muted">No sessions yet.</p>
          <button className="btn btn-primary" onClick={() => navigate("train")}>Start your first round</button>
        </div>
      ) : (
        <div className="drill-list">
          {sessions.map((s) => (
            <button key={s.id} className="card session-row" onClick={() => navigate(`session/${s.id}`)}>
              <div>
                <div className="session-title">{drillById(s.drillId).name}</div>
                <div className="muted small">
                  {new Date(s.startedAt).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} ·{" "}
                  {s.punchCount} punches · {s.maxSpeedMph.toFixed(0)} mph
                </div>
                {s.critiques[0] && <div className="session-fix">→ {s.critiques[0].title}</div>}
              </div>
              <div className={`score-chip ${s.score.total >= 78 ? "good" : s.score.total >= 55 ? "warn" : "bad"}`}>
                <span className="num">{s.score.total}</span>
                <small>{s.score.grade}</small>
              </div>
            </button>
          ))}
        </div>
      )}
      {!pro && sessions.length >= FREE_HISTORY_LIMIT && (
        <UpsellBanner text={`The free plan keeps your last ${FREE_HISTORY_LIMIT} sessions. Pro keeps everything.`} />
      )}
      <BottomNav active="history" />
    </div>
  );
}
