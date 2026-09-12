export type PlanId = "free" | "pro";

export const TRIAL_DAYS = 7;
export const FREE_HISTORY_LIMIT = 3;
export const FREE_MAX_ROUNDS = 1;

export const PRICING = {
  monthly: { amount: 9.99, label: "$9.99 / month" },
  yearly: { amount: 59.99, label: "$59.99 / year", perMonth: 5.0, savings: "Save 50%" },
};

/**
 * Stripe Payment Links (no backend required to start selling). Set them in
 * Vercel → Project → Environment Variables. Until a real entitlement backend
 * exists, purchases are unlocked with a license key sent after checkout.
 */
export const CHECKOUT = {
  monthly: import.meta.env.VITE_STRIPE_MONTHLY_URL as string | undefined,
  yearly: import.meta.env.VITE_STRIPE_YEARLY_URL as string | undefined,
};

export const FEATURES: { name: string; free: string | boolean; pro: string | boolean }[] = [
  { name: "Live pose tracking & punch counter", free: true, pro: true },
  { name: "Hand speed (mph)", free: true, pro: true },
  { name: "Rounds per session", free: "1", pro: "Unlimited" },
  { name: "Session score & grade", free: true, pro: true },
  { name: "Full coaching critique", free: "Top issue only", pro: "Everything" },
  { name: "Combo detection (1-2, 1-2-3…)", free: false, pro: true },
  { name: "Drills", free: "2 of 6", pro: "All, plus new ones" },
  { name: "Session history", free: "Last 3", pro: "Unlimited" },
  { name: "Progress charts", free: false, pro: true },
  { name: "Voice coaching cues", free: false, pro: true },
  { name: "Video upload analysis", free: true, pro: true },
];

export interface BillingState {
  plan: PlanId;
  trialStartedAt: number | null;
  proSince: number | null;
  licenseKey: string | null;
}

export const initialBilling = (): BillingState => ({
  plan: "free",
  trialStartedAt: null,
  proSince: null,
  licenseKey: null,
});

export function trialDaysLeft(b: BillingState, now = Date.now()): number {
  if (!b.trialStartedAt) return 0;
  const end = b.trialStartedAt + TRIAL_DAYS * 86_400_000;
  return Math.max(0, Math.ceil((end - now) / 86_400_000));
}

export function isTrialActive(b: BillingState, now = Date.now()): boolean {
  return b.plan !== "pro" && trialDaysLeft(b, now) > 0;
}

export function isPro(b: BillingState, now = Date.now()): boolean {
  return b.plan === "pro" || isTrialActive(b, now);
}

/**
 * Keys are read from VITE_LICENSE_KEYS (comma separated). Anything shipped in
 * a client bundle is discoverable, so this is a launch-week stopgap — swap it
 * for a server-side check against Stripe once there's a backend.
 */
export function validateLicenseKey(key: string): boolean {
  const raw = (import.meta.env.VITE_LICENSE_KEYS as string | undefined) ?? "";
  const keys = raw.split(",").map((k) => k.trim().toUpperCase()).filter(Boolean);
  return keys.includes(key.trim().toUpperCase());
}
