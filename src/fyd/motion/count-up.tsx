/**
 * FYD motion primitive: count-up for VERIFIED numbers only.
 *
 * A proof strip numeral that eases from 0 to its target (~900ms) once,
 * when it enters the viewport. The honesty gate is structural:
 *
 * - `verified` is a required prop. When false, the number still renders
 *   as final text but NEVER animates: unverified numbers get no flair.
 * - The final value is always in the DOM as text, so screen readers and
 *   no-JS visitors read the real number, never the animation.
 * - prefers-reduced-motion renders the final value instantly.
 * - Figures use tabular-nums so columns do not jitter mid-count.
 *
 * Never use this for invented statistics. The component cannot verify a
 * number; the caller must only pass `verified: true` for numbers with a
 * provenance the site can stand behind.
 */
"use client";

import * as React from "react";
import { useReducedMotion } from "./reveal";

/** Steps-style easing for the count (corpus: ~900ms, steps easing). */
export function easeOutCubic(t: number): number {
  const p = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - p, 3);
}

/** Interpolated count value at progress t in [0, 1]. Pure and testable. */
export function countValueAt(start: number, end: number, progress: number): number {
  return start + (end - start) * easeOutCubic(progress);
}

/** Locale-grouped figure, e.g. 1250 -> "1,250", 4.9 with decimals=1. */
export function formatCount(value: number, decimals = 0): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export type CountUpMode = "animate" | "static";

/**
 * Pure honesty + motion gate. The count-up animation runs ONLY when the
 * number is verified AND the user has not asked for reduced motion.
 * Every other combination renders the final value as static text.
 */
export function resolveCountUpMode(args: { verified: boolean; reducedMotion: boolean }): CountUpMode {
  if (!args.verified) return "static";
  if (args.reducedMotion) return "static";
  return "animate";
}

export interface CountUpProps {
  /** Final verified number. Always rendered as text, animation or not. */
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  /** Animation length in ms. Defaults to 900. */
  durationMs?: number;
  /**
   * Honesty gate. The count-up animation runs ONLY when true.
   * Pass true only for numbers with real provenance (verified stats).
   */
  verified: boolean;
  /** Accessible label, e.g. "Projects completed". */
  label?: string;
  className?: string;
  id?: string;
}

export function CountUp({
  value,
  decimals = 0,
  prefix = "",
  suffix = "",
  durationMs = 900,
  verified,
  label,
  className,
  id,
}: CountUpProps): React.ReactElement {
  const ref = React.useRef<HTMLSpanElement | null>(null);
  const finalText = `${prefix}${formatCount(value, decimals)}${suffix}`;
  // Final value in the DOM from the first render: screen readers and
  // no-JS visitors read the real number, not the animation.
  const [display, setDisplay] = React.useState<string>(finalText);

  const reduced = useReducedMotion();

  React.useEffect(() => {
    if (resolveCountUpMode({ verified, reducedMotion: reduced }) === "static") return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (typeof requestAnimationFrame === "undefined") return;
    let raf = 0;
    let started = false;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !started) {
            started = true;
            io.disconnect(); // once semantics
            const t0 = performance.now();
            const tick = (now: number): void => {
              const p = Math.min(1, (now - t0) / durationMs);
              setDisplay(`${prefix}${formatCount(countValueAt(0, value, p), decimals)}${suffix}`);
              if (p < 1) {
                raf = requestAnimationFrame(tick);
              }
            };
            raf = requestAnimationFrame(tick);
          }
        }
      },
      { threshold: 0.5 }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [verified, reduced, value, decimals, prefix, suffix, durationMs]);

  return (
    <span
      ref={ref}
      id={id}
      className={["fyd-count-up", className].filter(Boolean).join(" ")}
      data-fyd-count-up=""
      data-verified={verified}
      aria-label={label ? `${label}: ${finalText}` : finalText}
    >
      {display}
    </span>
  );
}
