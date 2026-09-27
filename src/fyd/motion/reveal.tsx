/**
 * FYD motion primitive: scroll reveal.
 *
 * IntersectionObserver-driven, rung 1 of the reveal ladder: the observer
 * adds the visible flag once (unobserve on first trigger, never replays),
 * CSS transitions do the rest. No raw scroll listeners, no scroll hijack,
 * no preloaders, no auto-rotating carousels.
 *
 * No-JS safety: the hidden states in motion.css apply only under the
 * `.fyd-js` class, which `ensureMotionJs()` adds to <html> on mount.
 * Without JS the content renders in its final state.
 *
 * Reduced motion: the component skips the observer entirely and marks
 * content visible immediately; motion.css also force-collapses every
 * reveal under `prefers-reduced-motion: reduce`.
 *
 * The observer wiring lives in the pure, exported `observeOnce` helper
 * so the once-semantics and cleanup contract are unit-testable without
 * a browser.
 */
"use client";

import * as React from "react";

export type RevealVariant = "rise" | "clip" | "fade";

/** Stagger step in ms (corpus: 80ms). */
export const REVEAL_STAGGER_MS = 80;
/** Stagger index cap (corpus: last item never waits past ~480ms). */
export const REVEAL_STAGGER_CAP = 6;

export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Capped stagger delay: min(index, 6) * 80ms.
 * Pure and SSR-safe, so the generator can compute the same delay
 * deterministically outside React.
 */
export function revealDelayMs(index: number): number {
  const i = Number.isFinite(index) ? Math.max(0, Math.floor(index)) : 0;
  return Math.min(i, REVEAL_STAGGER_CAP) * REVEAL_STAGGER_MS;
}

/** True when the OS/browser asks for reduced motion. SSR-safe (false). */
export function prefersReducedMotionNow(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/**
 * Idempotent `.fyd-js` gate on <html>. motion.css keeps all hidden
 * reveal states behind this class so no-JS visitors see final content.
 */
export function ensureMotionJs(): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.add("fyd-js");
}

/** Reactive reduced-motion flag; follows live OS setting changes. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState<boolean>(prefersReducedMotionNow);
  React.useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const mq = window.matchMedia(REDUCED_MOTION_QUERY);
    const onChange = (): void => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

export interface OnceObserverOptions {
  threshold?: number;
  rootMargin?: string;
}

/** Cleanup for observeOnce: disconnects the underlying observer. */
export type OnceObserverCleanup = () => void;

/**
 * Observe a target until it first intersects, then fire `onVisible` once
 * and stop observing that target (unobserve: the reveal never replays).
 * Returns a cleanup that disconnects the observer; the component calls
 * it on unmount, which is the observer-cleanup contract.
 *
 * When IntersectionObserver is unavailable the callback fires
 * immediately: content must appear, never hide.
 */
export function observeOnce(
  target: Element,
  onVisible: () => void,
  options: OnceObserverOptions = {}
): OnceObserverCleanup {
  if (typeof IntersectionObserver === "undefined") {
    onVisible();
    return () => {};
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          onVisible();
          io.unobserve(entry.target);
        }
      }
    },
    {
      threshold: options.threshold ?? 0.15,
      rootMargin: options.rootMargin ?? "0px 0px -12% 0px",
    }
  );
  io.observe(target);
  return () => {
    io.disconnect();
  };
}

/**
 * Whether the reveal path needs an observer at all. Reduced motion
 * renders content visible immediately; so does a missing observer.
 */
export function revealNeedsObserver(reducedMotion: boolean): boolean {
  return !reducedMotion && typeof IntersectionObserver !== "undefined";
}

export interface RevealProps {
  /** Visual entrance: rise (translate+fade), clip (curtain wipe), fade. */
  variant?: RevealVariant;
  /** Sibling position for the stagger ladder; capped at 6 by revealDelayMs. */
  index?: number;
  /** Wrapper element. Defaults to div. */
  as?: React.ElementType;
  className?: string;
  id?: string;
  /** IO trigger band. Defaults follow the corpus: 0.15 / -12% bottom. */
  threshold?: number;
  rootMargin?: string;
  children: React.ReactNode;
}

export function Reveal({
  variant = "rise",
  index = 0,
  as,
  className,
  id,
  threshold = 0.15,
  rootMargin = "0px 0px -12% 0px",
  children,
}: RevealProps): React.ReactElement {
  const ref = React.useRef<HTMLElement | null>(null);
  const reduced = useReducedMotion();
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    ensureMotionJs();
    if (!revealNeedsObserver(reduced)) {
      setVisible(true);
      return;
    }
    const el = ref.current;
    if (!el) {
      setVisible(true);
      return;
    }
    // observeOnce returns the disconnect cleanup: React runs it on unmount.
    return observeOnce(el, () => setVisible(true), { threshold, rootMargin });
  }, [reduced, threshold, rootMargin]);

  const Tag = (as ?? "div") as "div";
  return (
    <Tag
      ref={ref as React.Ref<HTMLDivElement>}
      id={id}
      className={className}
      data-fyd-reveal=""
      data-fyd-reveal-variant={variant}
      data-visible={visible}
      style={{ "--fyd-reveal-delay": `${revealDelayMs(index)}ms` } as React.CSSProperties}
    >
      {children}
    </Tag>
  );
}
