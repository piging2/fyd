"use client";

import { useEffect, createContext, useContext, ReactNode, useState } from "react";
import Lenis from "@studio-freight/lenis";
import { usePathname } from "next/navigation";

interface LenisContextValue {
  lenis: Lenis | null;
}

const LenisContext = createContext<LenisContextValue>({ lenis: null });

/**
 * LenisProvider - Smooth scroll integration
 * 
 * Provides premium smooth scroll experience across the site.
 * Respects prefers-reduced-motion for accessibility.
 * Excludes workbench routes and workbench preview mode from smooth scrolling.
 * Exposes Lenis instance for Framer Motion scroll synchronization.
 * 
 * Architectural boundary:
 * - isWorkbenchContext is true when pathname starts with /workbench OR workbench=true query param
 * - Lenis is only initialized when NOT in workbench context
 * - This ensures both Workbench UI and Workbench iframe preview have native scroll
 */
export function LenisProvider({ children }: { children: ReactNode }) {
  const [lenis, setLenis] = useState<Lenis | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    // Authoritative workbench context check
    // True when: pathname starts with /workbench OR workbench=true query param
    const isWorkbenchRoute = pathname.startsWith('/workbench');
    // Use window.location.search to avoid Suspense boundary requirement
    const isWorkbenchPreview = typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('workbench') === 'true';
    const isWorkbenchContext = isWorkbenchRoute || isWorkbenchPreview;

    // Disable Lenis for workbench context (both UI and iframe preview)
    if (isWorkbenchContext) {
      console.log('[LENIS_DIAGNOSTIC] Disabled for workbench context', { pathname, isWorkbenchRoute, isWorkbenchPreview });
      return;
    }

    // Check if user prefers reduced motion
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    if (prefersReducedMotion) {
      console.log('[LENIS_DIAGNOSTIC] Disabled for reduced motion preference');
      return;
    }

    // Diagnostic: detect duplicate mounts (historical regression detection)
    console.count('[LENIS_DIAGNOSTIC] LenisProvider mounted');

    // Initialize Lenis with conservative settings to prevent touchpad interference
    const lenisInstance = new Lenis({
      lerp: 0.25, // Higher lerp = snappier feel (default 0.1)
      wheelMultiplier: 1.0, // Neutral multiplier to prevent touchpad stopping
      touchMultiplier: 1.0, // Neutral multiplier to prevent touchpad stopping
      duration: 0.8, // Reduced from 1.2 for snappier feel and less momentum interference
    });

    setLenis(lenisInstance);

    // DIAGNOSTIC: Log initial scroll state at Lenis initialization
    const initialScrollState = {
      pathname,
      windowScrollY: window.scrollY,
      documentScrollingElementScrollTop: document.scrollingElement?.scrollTop,
      documentElementScrollTop: document.documentElement.scrollTop,
      bodyScrollTop: document.body.scrollTop,
      historyScrollRestoration: history.scrollRestoration,
      lenisScroll: lenisInstance.scroll,
      lenisActualScroll: lenisInstance.actualScroll,
      lenisLimit: lenisInstance.limit,
      lenisIsScrolling: lenisInstance.isScrolling,
      timestamp: performance.now(),
    };
    console.log('[LENIS_DIAGNOSTIC] INITIAL_SCROLL_STATE', initialScrollState);

    // DIAGNOSTIC: Track first wheel/touch event to Lenis
    let firstWheelEvent: any = null;
    let firstTouchEvent: any = null;
    let firstLenisScrollEvent: any = null;
    const onWheel = (e: WheelEvent) => {
      if (!firstWheelEvent) {
        firstWheelEvent = {
          deltaY: e.deltaY,
          deltaX: e.deltaX,
          deltaMode: e.deltaMode,
          timestamp: performance.now(),
          lenisScroll: lenisInstance.scroll,
          lenisActualScroll: lenisInstance.actualScroll,
          lenisLimit: lenisInstance.limit,
          windowScrollY: window.scrollY,
        };
        console.log('[LENIS_DIAGNOSTIC] FIRST_WHEEL_EVENT', firstWheelEvent);
      }
    };
    const onTouchStart = (e: TouchEvent) => {
      if (!firstTouchEvent) {
        firstTouchEvent = {
          touches: e.touches.length,
          timestamp: performance.now(),
          lenisScroll: lenisInstance.scroll,
          lenisActualScroll: lenisInstance.actualScroll,
          lenisLimit: lenisInstance.limit,
          windowScrollY: window.scrollY,
        };
        console.log('[LENIS_DIAGNOSTIC] FIRST_TOUCH_EVENT', firstTouchEvent);
      }
    };

    // DIAGNOSTIC: Track first Lenis scroll event
    lenisInstance.on('scroll', (e: { velocity?: number; direction?: number } | undefined) => {
      if (!firstLenisScrollEvent) {
        firstLenisScrollEvent = {
          lenisScroll: lenisInstance.scroll,
          lenisActualScroll: lenisInstance.actualScroll,
          lenisLimit: lenisInstance.limit,
          lenisVelocity: e?.velocity,
          lenisDirection: e?.direction,
          lenisProgress: lenisInstance.progress,
          timestamp: performance.now(),
        };
        console.log('[LENIS_DIAGNOSTIC] FIRST_LENIS_SCROLL_EVENT', firstLenisScrollEvent);
      }
    });

    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('touchstart', onTouchStart, { passive: true });

    // DIAGNOSTIC: Track route transition scroll state
    const onRouteChange = () => {
      const beforeResetState = {
        pathname,
        windowScrollY: window.scrollY,
        documentScrollingElementScrollTop: document.scrollingElement?.scrollTop,
        documentElementScrollTop: document.documentElement.scrollTop,
        bodyScrollTop: document.body.scrollTop,
        lenisScroll: lenisInstance.scroll,
        lenisActualScroll: lenisInstance.actualScroll,
        lenisLimit: lenisInstance.limit,
        lenisIsScrolling: lenisInstance.isScrolling,
        timestamp: performance.now(),
      };
      console.log('[LENIS_DIAGNOSTIC] ROUTE_CHANGE_BEFORE_RESET', beforeResetState);

      // Capture next frame after reset
      requestAnimationFrame(() => {
        const afterResetState = {
          pathname,
          windowScrollY: window.scrollY,
          documentScrollingElementScrollTop: document.scrollingElement?.scrollTop,
          documentElementScrollTop: document.documentElement.scrollTop,
          bodyScrollTop: document.body.scrollTop,
          lenisScroll: lenisInstance.scroll,
          lenisActualScroll: lenisInstance.actualScroll,
          lenisLimit: lenisInstance.limit,
          lenisIsScrolling: lenisInstance.isScrolling,
          timestamp: performance.now(),
        };
        console.log('[LENIS_DIAGNOSTIC] ROUTE_CHANGE_AFTER_RESET_FRAME_1', afterResetState);

        // Capture 2nd frame after reset
        requestAnimationFrame(() => {
          const afterResetState2 = {
            pathname,
            windowScrollY: window.scrollY,
            documentScrollingElementScrollTop: document.scrollingElement?.scrollTop,
            documentElementScrollTop: document.documentElement.scrollTop,
            bodyScrollTop: document.body.scrollTop,
            lenisScroll: lenisInstance.scroll,
            lenisActualScroll: lenisInstance.actualScroll,
            lenisLimit: lenisInstance.limit,
            lenisIsScrolling: lenisInstance.isScrolling,
            timestamp: performance.now(),
          };
          console.log('[LENIS_DIAGNOSTIC] ROUTE_CHANGE_AFTER_RESET_FRAME_2', afterResetState2);
        });
      });
    };

    // Listen for pathname changes to detect route transitions
    window.addEventListener('popstate', onRouteChange);

    // Animation loop with proper cancellation and loop leak detection
    let frameId: number;
    let frameCount = 0;
    function raf(time: number) {
      lenisInstance.raf(time);
      frameCount++;
      if (frameCount % 60 === 0) {
        console.count('[LENIS_DIAGNOSTIC] Lenis RAF loop');
      }
      frameId = requestAnimationFrame(raf);
    }

    frameId = requestAnimationFrame(raf);

    // Cleanup with diagnostic logging
    return () => {
      console.log('[LENIS_DIAGNOSTIC] LenisProvider cleanup: cancelling RAF and destroying instance');
      if (firstWheelEvent) {
        console.log('[LENIS_DIAGNOSTIC] Session summary - wheel events observed');
      }
      if (firstTouchEvent) {
        console.log('[LENIS_DIAGNOSTIC] Session summary - touch events observed');
      }
      if (firstLenisScrollEvent) {
        console.log('[LENIS_DIAGNOSTIC] Session summary - Lenis scroll events observed');
      }
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('popstate', onRouteChange);
      cancelAnimationFrame(frameId);
      lenisInstance.destroy();
    };
  }, [pathname]);

  return (
    <LenisContext.Provider value={{ lenis }}>
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
