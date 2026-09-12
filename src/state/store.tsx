import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { SessionRecord, Stance } from "../analysis/types";
import {
  FREE_HISTORY_LIMIT,
  initialBilling,
  isPro,
  isTrialActive,
  trialDaysLeft,
  type BillingState,
} from "../billing/plans";

export type Level = "beginner" | "intermediate" | "advanced";

export interface Settings {
  voice: boolean;
  mirror: boolean;
  camera: "user" | "environment";
  sound: boolean;
}

export interface Profile {
  name: string;
  stance: Stance;
  level: Level;
  onboardedAt: number | null;
  settings: Settings;
  billing: BillingState;
}

const PROFILE_KEY = "bc.v1.profile";
const SESSIONS_KEY = "bc.v1.sessions";

const defaultProfile = (): Profile => ({
  name: "",
  stance: "orthodox",
  level: "beginner",
  onboardedAt: null,
  settings: { voice: true, mirror: true, camera: "user", sound: true },
  billing: initialBilling(),
});

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...JSON.parse(raw) } as T;
  } catch {
    return fallback;
  }
}

function loadSessions(): SessionRecord[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    return raw ? (JSON.parse(raw) as SessionRecord[]) : [];
  } catch {
    return [];
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable (private mode) — app still works for this visit */
  }
}

interface Store {
  profile: Profile;
  sessions: SessionRecord[];
  pro: boolean;
  trialActive: boolean;
  trialDaysLeft: number;
  updateProfile: (patch: Partial<Profile>) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  completeOnboarding: (p: { name: string; stance: Stance; level: Level }) => void;
  addSession: (s: SessionRecord) => void;
  deleteSession: (id: string) => void;
  activatePro: (licenseKey: string | null) => void;
  resetAll: () => void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile>(() => load(PROFILE_KEY, defaultProfile()));
  const [sessions, setSessions] = useState<SessionRecord[]>(loadSessions);

  useEffect(() => save(PROFILE_KEY, profile), [profile]);
  useEffect(() => save(SESSIONS_KEY, sessions), [sessions]);

  const updateProfile = useCallback((patch: Partial<Profile>) => {
    setProfile((p) => ({ ...p, ...patch }));
  }, []);
  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setProfile((p) => ({ ...p, settings: { ...p.settings, ...patch } }));
  }, []);
  const completeOnboarding = useCallback((p: { name: string; stance: Stance; level: Level }) => {
    setProfile((prev) => ({
      ...prev,
      ...p,
      onboardedAt: Date.now(),
      billing: {
        ...prev.billing,
        trialStartedAt: prev.billing.trialStartedAt ?? Date.now(),
      },
    }));
  }, []);
  const addSession = useCallback((s: SessionRecord) => {
    setSessions((list) => [s, ...list]);
  }, []);
  const deleteSession = useCallback((id: string) => {
    setSessions((list) => list.filter((s) => s.id !== id));
  }, []);
  const activatePro = useCallback((licenseKey: string | null) => {
    setProfile((p) => ({
      ...p,
      billing: { ...p.billing, plan: "pro", proSince: Date.now(), licenseKey },
    }));
  }, []);
  const resetAll = useCallback(() => {
    setProfile(defaultProfile());
    setSessions([]);
  }, []);

  const value = useMemo<Store>(() => {
    const pro = isPro(profile.billing);
    return {
      profile,
      // free tier only keeps the most recent few sessions
      sessions: pro ? sessions : sessions.slice(0, FREE_HISTORY_LIMIT),
      pro,
      trialActive: isTrialActive(profile.billing),
      trialDaysLeft: trialDaysLeft(profile.billing),
      updateProfile,
      updateSettings,
      completeOnboarding,
      addSession,
      deleteSession,
      activatePro,
      resetAll,
    };
  }, [profile, sessions, updateProfile, updateSettings, completeOnboarding, addSession, deleteSession, activatePro, resetAll]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside StoreProvider");
  return s;
}
