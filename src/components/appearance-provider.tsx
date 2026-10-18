"use client";
import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type ReactNode,
} from "react";
import {
  APPEARANCE_STORAGE_KEY,
  DEFAULT_APPEARANCE,
  appearanceVariables,
  parseAppearance,
  type Appearance,
} from "@/lib/appearance";

type AppearanceContextValue = {
  appearance: Appearance;
  setAppearance: (settings: Appearance) => void;
  resetAppearance: () => void;
};
const AppearanceContext = createContext<AppearanceContextValue | null>(null);

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [appearance, setCurrent] = useState<Appearance>(DEFAULT_APPEARANCE);
  useEffect(() => {
    const sync = () => {
      try {
        const raw = window.localStorage.getItem(APPEARANCE_STORAGE_KEY);
        setCurrent(raw ? parseAppearance(JSON.parse(raw)) : DEFAULT_APPEARANCE);
      } catch {
        setCurrent(DEFAULT_APPEARANCE);
      }
    };
    sync();
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  const setAppearance = useCallback((settings: Appearance) => {
    const safe = parseAppearance(settings);
    setCurrent(safe);
    try {
      window.localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(safe));
    } catch {
      // Device privacy settings may forbid local storage; still allow preview.
    }
  }, []);
  const resetAppearance = useCallback(() => setAppearance(DEFAULT_APPEARANCE), [setAppearance]);
  const value = useMemo(() => ({ appearance, setAppearance, resetAppearance }), [
    appearance, setAppearance, resetAppearance,
  ]);
  return (
    <AppearanceContext.Provider value={value}>
      {children}
    </AppearanceContext.Provider>
  );
}
export function useAppearance() {
  const ctx = useContext(AppearanceContext);
  if (!ctx) throw new Error("AppearanceProvider missing");
  return ctx;
}
export function useAppearanceVariables() {
  const { appearance } = useAppearance();
  return useMemo(() => appearanceVariables(appearance), [appearance]);
}
