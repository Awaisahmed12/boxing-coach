import type { ReactNode } from "react";
import { navigate } from "../lib/router";
import { useStore } from "../state/store";

/** Wraps Pro-only content; free users see a blurred preview with an unlock CTA. */
export function ProGate({
  children,
  feature,
  compact,
}: {
  children: ReactNode;
  feature: string;
  compact?: boolean;
}) {
  const { pro } = useStore();
  if (pro) return <>{children}</>;
  return (
    <div className={`gate ${compact ? "gate-compact" : ""}`}>
      <div className="gate-blur" aria-hidden>
        {children}
      </div>
      <div className="gate-overlay">
        <div className="gate-lock">🔒</div>
        <div className="gate-title">{feature} is a Pro feature</div>
        <button className="btn btn-primary" onClick={() => navigate("plans")}>
          Unlock Pro
        </button>
      </div>
    </div>
  );
}

export function UpsellBanner({ text }: { text: string }) {
  const { pro, trialActive, trialDaysLeft } = useStore();
  if (pro && !trialActive) return null;
  return (
    <button className="upsell" onClick={() => navigate("plans")}>
      <span>
        {trialActive ? `${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left in your Pro trial. ` : ""}
        {text}
      </span>
      <span className="upsell-cta">See plans →</span>
    </button>
  );
}
