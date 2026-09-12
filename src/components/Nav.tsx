import { navigate, type Route } from "../lib/router";
import { useStore } from "../state/store";

const TABS: { name: Route["name"]; label: string; icon: string }[] = [
  { name: "home", label: "Home", icon: "⌂" },
  { name: "train", label: "Train", icon: "◉" },
  { name: "history", label: "History", icon: "≡" },
  { name: "progress", label: "Progress", icon: "↗" },
];

export function TopBar({ title, back }: { title?: string; back?: string }) {
  const { pro, trialActive, trialDaysLeft } = useStore();
  return (
    <div className="topbar">
      {back ? (
        <button className="icon-btn" onClick={() => navigate(back)} aria-label="Back">
          ←
        </button>
      ) : (
        <div className="brand" onClick={() => navigate("home")}>
          BOXING<span>COACH</span>
        </div>
      )}
      {title && <div className="topbar-title">{title}</div>}
      <div className="topbar-right">
        {pro ? (
          <button className={`pill ${trialActive ? "pill-trial" : "pill-pro"}`} onClick={() => navigate("plans")}>
            {trialActive ? `TRIAL · ${trialDaysLeft}d` : "PRO"}
          </button>
        ) : (
          <button className="pill pill-upgrade" onClick={() => navigate("plans")}>
            UPGRADE
          </button>
        )}
        <button className="icon-btn" onClick={() => navigate("settings")} aria-label="Settings">
          ⚙
        </button>
      </div>
    </div>
  );
}

export function BottomNav({ active }: { active: Route["name"] }) {
  return (
    <nav className="bottomnav">
      {TABS.map((t) => (
        <button
          key={t.name}
          className={active === t.name ? "active" : ""}
          onClick={() => navigate(t.name)}
        >
          <span className="nav-icon">{t.icon}</span>
          {t.label}
        </button>
      ))}
    </nav>
  );
}
