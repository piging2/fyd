"use client";

import * as React from "react";

/**
 * Visual effects preference.
 *
 * Levels:
 * - full:    all motion, including ambient/continuous effects
 *            (shimmer, background drift, auto-cycling cards, smooth scroll)
 * - reduced: one-shot transitions only; no ambient shimmer, drift, or auto-cycle
 * - off:     no animation or transition at all
 *
 * Default "system" resolves from the OS prefers-reduced-motion setting.
 * Persisted to localStorage ("ping-effects") — same convention as ThemeProvider.
 * Sets effects-full | effects-reduced | effects-off on documentElement so plain
 * CSS keyframe animations can be gated without JS in every component.
 */
export type EffectsPreference = "full" | "reduced" | "off" | "system";
export type ResolvedEffects = "full" | "reduced" | "off";

const STORAGE_KEY = "ping-effects";

interface EffectsContextValue {
  preference: EffectsPreference;
  resolved: ResolvedEffects;
  setPreference: (p: EffectsPreference) => void;
}

const EffectsContext = React.createContext<EffectsContextValue>({
  preference: "system",
  resolved: "full",
  setPreference: () => null,
});

function resolveSystem(): ResolvedEffects {
  if (typeof window === "undefined") return "full";
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "reduced"
    : "full";
}

function resolvePreference(p: EffectsPreference): ResolvedEffects {
  return p === "system" ? resolveSystem() : p;
}

function readStored(): EffectsPreference {
  if (typeof window === "undefined") return "system";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "full" || stored === "reduced" || stored === "off"
    ? stored
    : "system";
}

export function EffectsProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] =
    React.useState<EffectsPreference>(readStored);
  const [resolved, setResolved] = React.useState<ResolvedEffects>("full");

  // Re-resolve when the preference changes, and follow the OS setting
  // live while the user has not picked an explicit level.
  React.useEffect(() => {
    setResolved(resolvePreference(preference));
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => {
      if (preference === "system") setResolved(resolveSystem());
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [preference]);

  // Document class drives the CSS kill-switches in globals.css.
  React.useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("effects-full", "effects-reduced", "effects-off");
    root.classList.add(`effects-${resolved}`);
  }, [resolved]);

  const setPreference = React.useCallback((p: EffectsPreference) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, p);
    } catch {
      // Private mode etc: the preference applies for this session only.
    }
    setPreferenceState(p);
  }, []);

  return (
    <EffectsContext.Provider value={{ preference, resolved, setPreference }}>
      {children}
    </EffectsContext.Provider>
  );
}

export function useVisualEffects() {
  const ctx = React.useContext(EffectsContext);
  if (!ctx) {
    throw new Error("useVisualEffects must be used within EffectsProvider");
  }
  return ctx;
}
