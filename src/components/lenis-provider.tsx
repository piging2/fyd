"use client";

import { useEffect, createContext, useContext, ReactNode, useState, useRef, useCallback } from "react";
import Lenis from "@studio-freight/lenis";
import { usePathname } from "next/navigation";

interface LenisContextValue {
  lenis: Lenis | null;
  /**
   * Suspend/resume smooth scrolling while a modal or dialog is open.
   * Refcounted: N locks require N unlocks before scrolling resumes.
   */
  setModalScrollLock: (locked: boolean) => void;
}

const LenisContext = createContext<LenisContextValue>({ lenis: null, setModalScrollLock: () => {} });

// Diagnostics are opt-in only: set NEXT_PUBLIC_LENIS_DEBUG=1 to enable.
const LENIS_DEBUG = process.env.NEXT_PUBLIC_LENIS_DEBUG === "1";
function dlog(...args: unknown[]): void {
  if (LENIS_DEBUG) console.log(...args);
}

/**
 * LenisProvider - Smooth scroll integration
 *
 * Provides premium smooth scroll experience across the site.
 * Respects prefers-reduced-motion for accessibility (including mid-session changes).
 * Excludes workbench routes and workbench preview mode from smooth scrolling.
 * Exposes the Lenis instance plus a modal scroll-lock for dialog coordination.
 *
 * Architectural boundary:
 * - isWorkbenchContext is true when pathname starts with /workbench OR workbench=true query param
 * - Lenis is only initialized when NOT in workbench context
 * - This ensures both Workbench UI and Workbench iframe preview have native scroll
 */
export function LenisProvider({ children }: { children: ReactNode }) {
  const [lenis, setLenis] = useState<Lenis | null>(null);
  const lenisRef = useRef<Lenis | null>(null);
  const lockCount = useRef(0);
  const pathname = usePathname();

  const setModalScrollLock = useCallback((locked: boolean) => {
    if (locked) {
      lockCount.current += 1;
      lenisRef.current?.stop();
    } else {
      lockCount.current = Math.max(0, lockCount.current - 1);
      if (lockCount.current === 0) lenisRef.current?.start();
    }
  }, []);

  useEffect(() => {
    // Authoritative workbench context check
    const isWorkbenchRoute = pathname.startsWith('/workbench');
    // Use window.location.search to avoid Suspense boundary requirement
    const isWorkbenchPreview = typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('workbench') === 'true';
    if (isWorkbenchRoute || isWorkbenchPreview) return;

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches) return; // native scroll when reduced motion is preferred

    const lenisInstance = new Lenis({
      lerp: 0.25, // Higher lerp = snappier feel (default 0.1)
      wheelMultiplier: 1.0, // Neutral multiplier to prevent touchpad stopping
      touchMultiplier: 1.0, // Neutral multiplier to prevent touchpad stopping
      duration: 0.8, // Reduced from 1.2 for snappier feel and less momentum interference
    });
    lenisRef.current = lenisInstance;
    setLenis(lenisInstance);
    dlog('[lenis] initialized');

    // React to mid-session reduced-motion changes while the page is open.
    const onMotionChange = (event: MediaQueryListEvent) => {
      if (event.matches) {
        dlog('[lenis] reduced motion enabled mid-session; stopping smooth scroll');
        lenisInstance.stop();
      } else if (lockCount.current === 0) {
        lenisInstance.start();
      }
    };
    media.addEventListener("change", onMotionChange);

    let frameId: number;
    function raf(time: number) {
      lenisInstance.raf(time);
      frameId = requestAnimationFrame(raf);
    }
    frameId = requestAnimationFrame(raf);

    return () => {
      media.removeEventListener("change", onMotionChange);
      cancelAnimationFrame(frameId);
      lenisInstance.destroy();
      lenisRef.current = null;
      lockCount.current = 0;
    };
  }, [pathname]);

  return (
    <LenisContext.Provider value={{ lenis, setModalScrollLock }}>
      {children}
    </LenisContext.Provider>
  );
}

/**
 * Hook to access Lenis instance for scroll synchronization
 */
export function useLenis() {
  return useContext(LenisContext);
}
