import { useState } from "react";
import { CHECKOUT, FEATURES, PRICING, TRIAL_DAYS, validateLicenseKey } from "../billing/plans";
import { TopBar } from "../components/Nav";
import { navigate } from "../lib/router";
import { useStore } from "../state/store";

export function Plans() {
  const { profile, pro, trialActive, trialDaysLeft, activatePro } = useStore();
  const [cycle, setCycle] = useState<"yearly" | "monthly">("yearly");
  const [key, setKey] = useState("");
  const [keyMsg, setKeyMsg] = useState<string | null>(null);
  const paid = profile.billing.plan === "pro";
  const link = CHECKOUT[cycle];

  const checkout = () => {
    if (link) window.open(link, "_blank", "noopener");
    else setKeyMsg("Checkout isn't wired up yet — set VITE_STRIPE_MONTHLY_URL / VITE_STRIPE_YEARLY_URL to your Stripe Payment Links.");
  };

  return (
    <div className="screen">
      <TopBar title="Plans" back="home" />

      {paid ? (
        <div className="card card-accent">
          <div className="price-name">You're on Pro</div>
          <p className="muted small">Thanks for backing the app. Everything is unlocked.</p>
        </div>
      ) : trialActive ? (
        <div className="card card-accent">
          <div className="price-name">Pro trial · {trialDaysLeft} day{trialDaysLeft === 1 ? "" : "s"} left</div>
          <p className="muted small">You have full Pro access right now. Upgrade to keep it when the trial ends.</p>
        </div>
      ) : (
        <div className="card">
          <div className="price-name">Free plan</div>
          <p className="muted small">1 round per session, top coaching note only, last 3 sessions.</p>
        </div>
      )}

      {!paid && (
        <>
          <div className="seg cycle">
            <button className={cycle === "yearly" ? "on" : ""} onClick={() => setCycle("yearly")}>
              Yearly <span className="badge">{PRICING.yearly.savings}</span>
            </button>
            <button className={cycle === "monthly" ? "on" : ""} onClick={() => setCycle("monthly")}>Monthly</button>
          </div>

          <div className="card card-accent price-hero">
            <div className="price-name">Pro</div>
            <div className="price-amt num">
              ${cycle === "yearly" ? PRICING.yearly.perMonth.toFixed(2) : PRICING.monthly.amount.toFixed(2)}
              <span>/mo</span>
            </div>
            <div className="muted small">
              {cycle === "yearly" ? `${PRICING.yearly.label}, billed once` : "Cancel anytime"}
            </div>
            <button className="btn btn-primary btn-lg" onClick={checkout}>
              {trialActive ? "Keep Pro" : `Upgrade to Pro`}
            </button>
            {!profile.billing.trialStartedAt && (
              <div className="muted small center">Includes a {TRIAL_DAYS}-day free trial</div>
            )}
          </div>
        </>
      )}

      <h2>What you get</h2>
      <div className="card">
        <table className="feature-table">
          <thead>
            <tr><th></th><th>Free</th><th className="pro-col">Pro</th></tr>
          </thead>
          <tbody>
            {FEATURES.map((f) => (
              <tr key={f.name}>
                <td>{f.name}</td>
                <td>{f.free === true ? "✓" : f.free === false ? "—" : f.free}</td>
                <td className="pro-col">{f.pro === true ? "✓" : f.pro === false ? "—" : f.pro}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!paid && (
        <>
          <h2>Have a license key?</h2>
          <div className="card">
            <p className="muted small">Sent to your email after checkout.</p>
            <div className="key-row">
              <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="BC-XXXX-XXXX-XXXX" />
              <button
                className="btn btn-ghost"
                onClick={() => {
                  if (validateLicenseKey(key)) {
                    activatePro(key.trim().toUpperCase());
                    setKeyMsg("Pro activated. Enjoy.");
                    setTimeout(() => navigate("home"), 800);
                  } else setKeyMsg("That key didn't match. Check for typos or reply to your receipt email.");
                }}
              >
                Redeem
              </button>
            </div>
            {keyMsg && <p className="small" style={{ marginTop: 8 }}>{keyMsg}</p>}
          </div>
        </>
      )}

      <h2>FAQ</h2>
      <div className="faq">
        <details>
          <summary>Is my video uploaded anywhere?</summary>
          <p>No. Pose tracking runs on your phone in the browser. Only the session stats (numbers) are stored, and only on your device.</p>
        </details>
        <details>
          <summary>How accurate is the tracking?</summary>
          <p>Good enough to catch the habits that matter: dropped hands, short punches, lazy returns, a static head. Speeds are estimates from wrist tracking, consistent session to session, so trends are what to watch.</p>
        </details>
        <details>
          <summary>What happens when my trial ends?</summary>
          <p>You drop to the free plan automatically. Nothing is charged. Your sessions stay on your device — Pro shows them all again.</p>
        </details>
        <details>
          <summary>Can I cancel?</summary>
          <p>Anytime, from the receipt email's manage link. You keep Pro until the end of the period you paid for.</p>
        </details>
      </div>
      {pro && !paid && (
        <p className="muted small center">Pro is currently unlocked by {trialActive ? "your trial" : "a license key"}.</p>
      )}
    </div>
  );
}
