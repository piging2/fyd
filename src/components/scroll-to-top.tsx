"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * ScrollToTop - Resets scroll position to top on route transitions.
 * Ensures users always land at the top of each page, avoiding
 * the issue where scroll position is preserved across navigations.
 *
 * DIAGNOSTIC: Instrumented to track scroll state changes relative to Lenis
 */
export function ScrollToTop() {
  const pathname = usePathname();

  useEffect(() => {
    // DIAGNOSTIC: Precise scroll state before route reset
    const beforeResetState = {
      pathname,
      windowScrollY: window.scrollY,
      documentScrollingElementScrollTop: document.scrollingElement?.scrollTop,
      documentElementScrollTop: document.documentElement.scrollTop,
      bodyScrollTop: document.body.scrollTop,
      historyScrollRestoration: history.scrollRestoration,
      timestamp: performance.now(),
    };
    console.log('[SCROLLTOTOP_DIAGNOSTIC] BEFORE_ROUTE_RESET', beforeResetState);

    // Native scroll to top
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });

    // DIAGNOSTIC: Capture next frame after reset
    requestAnimationFrame(() => {
      const afterResetState = {
        pathname,
        windowScrollY: window.scrollY,
        documentScrollingElementScrollTop: document.scrollingElement?.scrollTop,
        documentElementScrollTop: document.documentElement.scrollTop,
        bodyScrollTop: document.body.scrollTop,
        timestamp: performance.now(),
      };
      console.log('[SCROLLTOTOP_DIAGNOSTIC] AFTER_ROUTE_RESET_FRAME_1', afterResetState);

      // Capture 2nd frame after reset
      requestAnimationFrame(() => {
        const afterResetState2 = {
          pathname,
          windowScrollY: window.scrollY,
          documentScrollingElementScrollTop: document.scrollingElement?.scrollTop,
          documentElementScrollTop: document.documentElement.scrollTop,
          bodyScrollTop: document.body.scrollTop,
          timestamp: performance.now(),
        };
        console.log('[SCROLLTOTOP_DIAGNOSTIC] AFTER_ROUTE_RESET_FRAME_2', afterResetState2);
      });
    });
  }, [pathname]);

  return null;
}
