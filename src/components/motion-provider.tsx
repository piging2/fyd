"use client";

import { createContext, useContext, useEffect, ReactNode } from "react";
import { useVisualEffects } from "@/components/effects-provider";

/**
 * Motion Context
 * 
 * Provides global motion configuration and reduced motion state
 * to all components in the application.
 */
interface MotionContextType {
  prefersReducedMotion: boolean;
  isMotionEnabled: boolean;
}

const MotionContext = createContext<MotionContextType>({
  prefersReducedMotion: false,
  isMotionEnabled: true,
});

/**
 * MotionProvider - Global animation configuration provider
 * 
 * Handles:
 * - Reduced motion detection
 * - Global animation enable/disable
 * - Consistent animation behavior across the app
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  const { resolved } = useVisualEffects();
  // Precedence, decided 2026-11-17: an explicit visitor choice governs
  // every preference-consuming layer on its own. The OS signal governs
  // only in system mode, where resolved already encodes it, because
  // EffectsProvider subscribes to the OS media query and is the single
  // preference authority. This provider previously ORed in its own
  // mount-only OS read for that mode; the read never updated, so an OS
  // change from reduced to normal left this layer stuck in reduced
  // motion until reload (reproduced live 2026-11-18). Deriving from
  // resolved alone keeps the first render identical to the server's
  // (resolved starts at "full") and follows every later transition.
  const reducedMotion = resolved !== "full";

  useEffect(() => {
    // Add reduced-motion class to document for CSS fallbacks
    if (reducedMotion) {
      document.documentElement.classList.add("reduced-motion");
    } else {
      document.documentElement.classList.remove("reduced-motion");
    }
  }, [reducedMotion]);

  return (
    <MotionContext.Provider
      value={{
        prefersReducedMotion: reducedMotion,
        isMotionEnabled: !reducedMotion,
      }}
    >
      {children}
    </MotionContext.Provider>
  );
}

/**
 * useMotion - Hook to access motion context
 * 
 * Usage:
 * const { prefersReducedMotion, isMotionEnabled } = useMotion();
 */
export function useMotion() {
  const context = useContext(MotionContext);
  if (!context) {
    throw new Error("useMotion must be used within MotionProvider");
  }
  return context;
}
