"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useLenis } from "./lenis-provider";

/**
 * Pure decision: should this pathname change reset scroll to top?
 *
 * - Same pathname (hash-only navigation): never reset. The HashRouter in
 *   the Lenis provider owns fragment scroll.
 * - Any fragment present: never reset. A deep link (#ask) must survive
 *   direct navigation, reload, back, and forward.
 * - Back/forward (popstate): restore, never reset.
 * - Otherwise: a fresh push to a bare path resets to top.
 */
export function shouldResetScroll(args: {
  pathnameChanged: boolean;
  hash: string;
  isPopstate: boolean;
}): boolean {
  if (!args.pathnameChanged) return false;
  if (args.hash) return false;
  if (args.isPopstate) return false;
  return true;
}

/**
 * ScrollToTop: resets scroll to top on genuine route transitions only.
 *
 * Hash- and history-aware (item 3). Deep links, back, and forward are owned
 * by the HashRouter; this component never slams them to top, and it emits
 * no diagnostic logging in production.
 */
export function ScrollToTop() {
  const pathname = usePathname();
  const { lenis } = useLenis();
  const lastPathnameRef = useRef<string | null>(null);
  const popstateRef = useRef(false);
  const lenisRef = useRef(lenis);
  lenisRef.current = lenis;

  useEffect(() => {
    const onPopState = () => {
      // Only cross-page traversals suppress the reset. Hash-only popstate
      // entries are fragment navigations owned by the HashRouter.
      if (
        lastPathnameRef.current !== null &&
        window.location.pathname !== lastPathnameRef.current
      ) {
        popstateRef.current = true;
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    const prev = lastPathnameRef.current;
    lastPathnameRef.current = pathname;
    const isPopstate = popstateRef.current;
    popstateRef.current = false;
    if (
      shouldResetScroll({
        pathnameChanged: prev !== null && prev !== pathname,
        hash: window.location.hash,
        isPopstate,
      })
    ) {
      // Coordinated with Lenis when it owns scroll; never fight it.
      const l = lenisRef.current;
      if (l) l.scrollTo(0, { immediate: true });
      else window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    }
  }, [pathname]);

  return null;
}
