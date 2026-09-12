import type { Stance } from "../analysis/types";
import { TopBar } from "../components/Nav";
import { navigate } from "../lib/router";
import { useStore, type Level } from "../state/store";

function Toggle({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <button className="toggle-row" onClick={() => onChange(!on)}>
      <div>
        <div>{label}</div>
        {hint && <div className="muted small">{hint}</div>}
      </div>
      <span className={`toggle ${on ? "on" : ""}`} aria-checked={on} role="switch" />
    </button>
  );
}

export function Settings() {
  const { profile, updateProfile, updateSettings, pro, trialActive, trialDaysLeft, resetAll } = useStore();
  const { settings } = profile;
  return (
    <div className="screen">
      <TopBar title="Settings" back="home" />

      <h2>Boxer</h2>
      <div className="card">
        <label className="field">
          <span>Name</span>
          <input value={profile.name} onChange={(e) => updateProfile({ name: e.target.value })} />
        </label>
        <div className="field">
          <span>Stance</span>
          <div className="seg">
            {(["orthodox", "southpaw"] as Stance[]).map((s) => (
              <button key={s} className={profile.stance === s ? "on" : ""} onClick={() => updateProfile({ stance: s })}>
                {s[0].toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span>Level</span>
          <div className="seg">
            {(["beginner", "intermediate", "advanced"] as Level[]).map((l) => (
              <button key={l} className={profile.level === l ? "on" : ""} onClick={() => updateProfile({ level: l })}>
                {l[0].toUpperCase() + l.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <h2>Camera & coaching</h2>
      <div className="card">
        <div className="field">
          <span>Camera</span>
          <div className="seg">
            <button className={settings.camera === "user" ? "on" : ""} onClick={() => updateSettings({ camera: "user" })}>Front</button>
            <button className={settings.camera === "environment" ? "on" : ""} onClick={() => updateSettings({ camera: "environment" })}>Back</button>
          </div>
          <div className="muted small">Front lets you see the HUD while you train. Back is sharper if someone else is filming.</div>
        </div>
        <Toggle on={settings.mirror} onChange={(v) => updateSettings({ mirror: v })} label="Mirror front camera" hint="Like a gym mirror" />
        <Toggle on={settings.sound} onChange={(v) => updateSettings({ sound: v })} label="Bell & beeps" hint="Round start/end, 10-second warning" />
        <Toggle
          on={settings.voice}
          onChange={(v) => updateSettings({ voice: v })}
          label={`Voice cues${pro ? "" : " (Pro)"}`}
          hint='"Hands up", "stay busy" — spoken during rounds'
        />
      </div>

      <h2>Plan</h2>
      <div className="card">
        <div className="toggle-row static">
          <div>
            <div>{profile.billing.plan === "pro" ? "Pro" : trialActive ? `Pro trial · ${trialDaysLeft}d left` : "Free"}</div>
            <div className="muted small">{pro ? "All features unlocked" : "Limited to 1 round, top note, last 3 sessions"}</div>
          </div>
          <button className="btn btn-ghost" onClick={() => navigate("plans")}>{pro && !trialActive ? "Manage" : "Upgrade"}</button>
        </div>
      </div>

      <h2>Data</h2>
      <div className="card">
        <p className="muted small">Everything is stored in this browser only. Clearing site data or switching devices starts fresh.</p>
        <button
          className="link danger"
          onClick={() => {
            if (confirm("Delete your profile and every session on this device?")) {
              resetAll();
              navigate("");
            }
          }}
        >
          Reset all data
        </button>
      </div>
    </div>
  );
}
