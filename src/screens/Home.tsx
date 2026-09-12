import { BottomNav, TopBar } from "../components/Nav";
import { UpsellBanner } from "../components/Paywall";
import { navigate } from "../lib/router";
import { useStore } from "../state/store";
import { DRILLS } from "../training/drills";

function weekStart(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

function streakDays(dates: number[]): number {
  const days = new Set(dates.map((t) => new Date(t).toDateString()));
  let streak = 0;
  const d = new Date();
  for (;;) {
    if (!days.has(d.toDateString())) {
      if (streak === 0) d.setDate(d.getDate() - 1); // today not trained yet — allow yesterday to start streak
      else break;
      if (!days.has(d.toDateString())) break;
    }
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

export function Home() {
  const { profile, sessions, pro } = useStore();
  const thisWeek = sessions.filter((s) => s.startedAt >= weekStart());
  const avgScore = sessions.length
    ? Math.round(sessions.slice(0, 10).reduce((a, s) => a + s.score.total, 0) / Math.min(sessions.length, 10))
    : null;
  const best = sessions.reduce((m, s) => Math.max(m, s.maxSpeedMph), 0);
  const streak = streakDays(sessions.map((s) => s.startedAt));
  const last = sessions[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Morning" : hour < 18 ? "Afternoon" : "Evening";

  return (
    <div className="screen with-nav">
      <TopBar />
      <h1 className="greeting">
        {greeting}, {profile.name || "Champ"}.
      </h1>
      <p className="muted">
        {thisWeek.length === 0
          ? "No rounds yet this week. Let's fix that."
          : `${thisWeek.length} session${thisWeek.length === 1 ? "" : "s"} this week${streak > 1 ? ` · ${streak}-day streak 🔥` : ""}.`}
      </p>

      <button className="btn btn-primary btn-lg hero-cta" onClick={() => navigate("train")}>
        <span>Start training</span>
        <span className="hero-sub">{pro ? "3 rounds · Shadowboxing" : "1 round · Shadowboxing"}</span>
      </button>

      <div className="tiles">
        <div className="tile">
          <div className="tile-k">Avg score</div>
          <div className="tile-v num">{avgScore ?? "—"}</div>
        </div>
        <div className="tile">
          <div className="tile-k">Best speed</div>
          <div className="tile-v num">{best ? `${best.toFixed(0)}` : "—"}<span className="tile-unit">mph</span></div>
        </div>
        <div className="tile">
          <div className="tile-k">Sessions</div>
          <div className="tile-v num">{sessions.length}</div>
        </div>
      </div>

      <UpsellBanner text="Pro unlocks every drill, unlimited rounds and full critiques." />

      {last && (
        <>
          <div className="section-head">
            <h2>Last session</h2>
            <button className="link" onClick={() => navigate("history")}>All →</button>
          </div>
          <button className="card session-row" onClick={() => navigate(`session/${last.id}`)}>
            <div>
              <div className="session-title">{DRILLS.find((d) => d.id === last.drillId)?.name ?? "Session"}</div>
              <div className="muted small">
                {new Date(last.startedAt).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} ·{" "}
                {last.punchCount} punches · {last.maxSpeedMph.toFixed(0)} mph
              </div>
              {last.critiques[0] && <div className="session-fix">→ {last.critiques[0].title}</div>}
            </div>
            <div className={`score-chip ${last.score.total >= 78 ? "good" : last.score.total >= 55 ? "warn" : "bad"}`}>
              <span className="num">{last.score.total}</span>
              <small>{last.score.grade}</small>
            </div>
          </button>
        </>
      )}

      <div className="section-head">
        <h2>Drills</h2>
      </div>
      <div className="drill-list">
        {DRILLS.map((d) => {
          const locked = d.pro && !pro;
          return (
            <button
              key={d.id}
              className={`card drill-row ${locked ? "locked" : ""}`}
              onClick={() => navigate(locked ? "plans" : `train?drill=${d.id}`)}
            >
              <div>
                <div className="session-title">
                  {d.name} {locked && <span className="lock">PRO</span>}
                </div>
                <div className="muted small">{d.tagline}</div>
              </div>
              <div className="muted small num">
                {d.rounds}×{Math.round(d.roundLengthS / 60) || d.roundLengthS + "s"}
                {d.roundLengthS >= 60 ? "m" : ""}
              </div>
            </button>
          );
        })}
      </div>

      <BottomNav active="home" />
    </div>
  );
}
