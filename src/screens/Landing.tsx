import { navigate } from "../lib/router";
import { PRICING, TRIAL_DAYS } from "../billing/plans";

export function Landing() {
  return (
    <div className="landing">
      <div className="landing-hero">
        <div className="brand brand-lg">
          BOXING<span>COACH</span>
        </div>
        <h1>
          A boxing coach that watches <em>every punch</em> you throw.
        </h1>
        <p className="lede">
          Prop up your phone, shadowbox, and get scored on guard, extension, speed,
          recovery and movement — round by round. No wearables, no gym, no video ever
          leaves your phone.
        </p>
        <button className="btn btn-primary btn-lg" onClick={() => navigate("onboarding")}>
          Start your {TRIAL_DAYS}-day free trial
        </button>
        <div className="muted small">No card required · Works on iPhone & Android</div>
      </div>

      <div className="hud-demo" aria-hidden>
        <div className="hud-demo-stage">
          <div className="hud-demo-tag">TRACKING · ROUND 2</div>
          <svg viewBox="0 0 200 260" className="hud-demo-skel">
            <polyline points="70,90 100,80 130,90" />
            <polyline points="70,90 55,120 40,110" />
            <polyline points="130,90 155,120 168,96" />
            <polyline points="70,90 80,150 120,150 130,90" />
            <polyline points="80,150 75,210 70,250" />
            <polyline points="120,150 130,210 140,250" />
            <circle cx="100" cy="60" r="14" />
            <circle cx="40" cy="110" r="6" className="fist" />
            <circle cx="168" cy="96" r="6" className="fist" />
          </svg>
        </div>
        <div className="hud-demo-cards">
          <div className="hud-card"><div className="hud-k">HAND SPEED</div><div className="hud-v num">21 MPH</div></div>
          <div className="hud-card"><div className="hud-k">PUNCHES</div><div className="hud-v num">47</div></div>
          <div className="hud-card"><div className="hud-k">GUARD</div><div className="hud-v num good">UP</div></div>
          <div className="hud-card"><div className="hud-k">LAST</div><div className="hud-v num">1-2</div></div>
        </div>
      </div>

      <section className="landing-section">
        <h2>How it works</h2>
        <ol className="steps">
          <li><strong>Prop your phone up</strong> so your whole body is in frame. Side or 45° angle works best.</li>
          <li><strong>Pick a drill and hit start.</strong> The bell rings, the coach starts tracking your hands, head and feet 30 times a second.</li>
          <li><strong>Get your report.</strong> A score out of 100, punch-by-punch stats, and specific fixes: "rear hand drops after the cross", "jab averaging 148° — extend".</li>
        </ol>
      </section>

      <section className="landing-section">
        <h2>What gets measured</h2>
        <div className="feature-grid">
          <div><strong>Guard discipline</strong><span>Is the non-punching hand on your cheek?</span></div>
          <div><strong>Punch speed</strong><span>Wrist speed in mph, per hand, per punch</span></div>
          <div><strong>Extension</strong><span>Elbow angle at impact on jabs and crosses</span></div>
          <div><strong>Recovery</strong><span>Milliseconds to get the hand back home</span></div>
          <div><strong>Combos</strong><span>1-2, 1-1-2, 1-2-3 — detected and counted</span></div>
          <div><strong>Head movement</strong><span>Are you a stationary target?</span></div>
        </div>
      </section>

      <section className="landing-section">
        <h2>Pricing</h2>
        <div className="price-cards">
          <div className="card">
            <div className="price-name">Free</div>
            <div className="price-amt num">$0</div>
            <ul className="plain">
              <li>1 round per session</li>
              <li>Live tracking & score</li>
              <li>Top coaching fix</li>
              <li>2 drills</li>
            </ul>
          </div>
          <div className="card card-accent">
            <div className="price-name">Pro</div>
            <div className="price-amt num">${PRICING.yearly.perMonth.toFixed(0)}<span>/mo</span></div>
            <div className="muted small">billed yearly · or {PRICING.monthly.label}</div>
            <ul className="plain">
              <li>Unlimited rounds</li>
              <li>Full critique, every session</li>
              <li>All drills + combo detection</li>
              <li>Progress charts & history</li>
              <li>Voice coaching cues</li>
            </ul>
          </div>
        </div>
        <button className="btn btn-primary btn-lg" onClick={() => navigate("onboarding")}>
          Try Pro free for {TRIAL_DAYS} days
        </button>
      </section>

      <footer className="landing-footer muted small">
        Analysis runs entirely on your device. Nothing is uploaded.
      </footer>
    </div>
  );
}
