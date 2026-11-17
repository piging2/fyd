"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { prefersReducedMotion } from "@/motion/motionTokens";

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
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    // The server has no window and renders false. Read the real preference
    // only after mount so a reduced-motion client hydrates with the same
    // first render as the server, then takes the reduced branch.
    setReducedMotion(prefersReducedMotion());
  }, []);

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
