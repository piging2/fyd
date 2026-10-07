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
 * FYD SHELL INVARIANT (item 3): shell-level fragment router.
 *
 * #ask (and every generated section id) must survive direct navigation,
 * reload, back, and forward. One coordinated code path serves clicks,
 * hashchange, and popstate; Lenis owns the motion when active so its
 * internal scroll state never desynchronizes (no snap-back), otherwise
 * native scrollIntoView applies with the item-1 shell scroll-padding.
 */

export type FragmentAction =
  | { kind: "scroll-to-target"; id: string }
  | { kind: "restore-previous" }
  | { kind: "ignore" };

/**
 * Pure: what should a fragment navigation do? Never invents a position:
 * an empty hash restores the pre-fragment position, a missing target
 * leaves scroll alone.
 */
export function resolveFragmentAction(hash: string): FragmentAction {
  if (!hash) return { kind: "restore-previous" };
  if (hash === "#") return { kind: "ignore" };
  const id = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!id) return { kind: "ignore" };
  return { kind: "scroll-to-target", id };
}

export interface FragmentScrollDeps {
  getElementById: (id: string) => { scrollIntoView(options?: ScrollIntoViewOptions): void } | null;
  /** Lenis-coordinated scroll; when present it owns the motion. */
  lenisScrollTo?: (target: HTMLElement, opts?: { offset?: number; immediate?: boolean }) => void;
  chromeTopPx: () => number;
  reducedMotion: () => boolean;
  onMissingTarget?: (id: string) => void;
}

/**
 * Coordinated fragment scroll. Testable with stub deps; the component
 * below wires the real document + Lenis.
 */
export function performFragmentScroll(
  id: string,
  deps: FragmentScrollDeps,
): "lenis" | "native" | "missing-target" {
  const el = deps.getElementById(id);
  if (!el) {
    deps.onMissingTarget?.(id);
    return "missing-target";
  }
  const chromeTop = Math.max(0, deps.chromeTopPx() || 0);
  const immediate = deps.reducedMotion();
  if (deps.lenisScrollTo) {
    deps.lenisScrollTo(el as HTMLElement, { offset: -chromeTop, immediate });
    return "lenis";
  }
  el.scrollIntoView({ behavior: immediate ? "auto" : "smooth", block: "start" });
  return "native";
}

function readChromeTopPx(): number {
  if (typeof document === "undefined") return 0;
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--fyd-chrome-top");
  const n = parseFloat(raw);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

/**
 * HashRouter: mounted once inside the LenisProvider so fragment scrolls
 * stay coordinated with Lenis.
 *
 * - Direct navigation / reload with a hash: scroll to the target after
 *   hydration settles; never reset to top.
 * - hashchange / popstate (back, forward, in-page): coordinated scroll to
 *   the new fragment; an empty hash restores the pre-fragment position.
 * - In-page anchor clicks (a[href^="#"]): intercepted and routed through
 *   the same path via pushState, so no native jump fights Lenis.
 * - history.scrollRestoration is "manual" while mounted so the browser
 *   never double-handles a fragment traversal.
 */
function HashRouter() {
  const { lenis } = useLenis();
  const lenisRef = useRef(lenis);
  lenisRef.current = lenis;
  const preFragmentY = useRef<number | null>(null);
  const previousHash = useRef<string>("");

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;

    const deps = (): FragmentScrollDeps => ({
      getElementById: (id) => document.getElementById(id),
      lenisScrollTo: lenisRef.current
        ? (target, opts) => lenisRef.current?.scrollTo(target, opts)
        : undefined,
      chromeTopPx: readChromeTopPx,
      reducedMotion: () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    });

    const restorePrevious = () => {
      const y = preFragmentY.current ?? 0;
      const l = lenisRef.current;
      if (l) l.scrollTo(y, { immediate: true });
      else window.scrollTo({ top: y, behavior: "auto" });
    };

    const applyHash = (hash: string) => {
      const action = resolveFragmentAction(hash);
      if (action.kind === "ignore") return;
      if (action.kind === "restore-previous") {
        restorePrevious();
        return;
      }
      performFragmentScroll(action.id, deps());
    };

    const noteFragmentEntry = (hash: string) => {
      // Record the pre-fragment position only when leaving a bare URL.
      if (!previousHash.current) preFragmentY.current = window.scrollY;
      previousHash.current = hash;
    };

    // Direct navigation / reload: the browser may have jumped natively
    // before hydration; re-settle through the coordinated path. Never reset
    // to top here (ScrollToTop skips when a hash is present).
    const initialHash = window.location.hash;
    previousHash.current = initialHash;
    if (initialHash) {
      preFragmentY.current = 0;
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (window.location.hash === initialHash) applyHash(initialHash);
        }),
      );
    }

    const onHashChange = () => {
      const hash = window.location.hash;
      noteFragmentEntry(hash);
      applyHash(hash);
    };
    const onPopState = () => {
      const hash = window.location.hash;
      noteFragmentEntry(hash);
      applyHash(hash);
    };
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target as Element | null;
      const anchor = target?.closest?.("a[href^='#']") as HTMLAnchorElement | null;
      if (!anchor) return;
      if (anchor.target && anchor.target !== "_self") return;
      const href = anchor.getAttribute("href");
      if (!href || !href.startsWith("#")) return;
      const action = resolveFragmentAction(href);
      if (action.kind === "ignore") return;
      event.preventDefault();
      // pushState: no native jump, no hashchange; one coordinated path.
      window.history.pushState(null, "", href);
      noteFragmentEntry(href);
      applyHash(href);
    };

    const prevRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    window.addEventListener("hashchange", onHashChange);
    window.addEventListener("popstate", onPopState);
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("hashchange", onHashChange);
      window.removeEventListener("popstate", onPopState);
      document.removeEventListener("click", onClick);
      window.history.scrollRestoration = prevRestoration;
    };
  }, []);

  return null;
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
      <HashRouter />
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
