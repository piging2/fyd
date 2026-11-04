"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface RevealProps {
  children: ReactNode;
  className?: string;
  /** Stagger offset in ms, applied as the --reveal-delay custom property. */
  delay?: number;
}

/**
 * Reveal: fade plus rise when the element scrolls into view.
 *
 * Safety contract: server markup is never hidden. The hidden state
 * (reveal-armed) is added from JS only, after mount, and only when the
 * user allows motion, IntersectionObserver exists, and the element is
 * not already inside the viewport. Without JS, with reduced motion, or
 * without IO, the content is simply visible. The CSS forces the visible
 * state under prefers-reduced-motion as a backstop.
 *
 * Transform and opacity only: no layout shift.
 */
export function Reveal({ children, className, delay = 0 }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (typeof IntersectionObserver === "undefined") return;
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) return;
    el.classList.add("reveal-armed");
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            el.classList.add("reveal-in");
            io.disconnect();
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const style = delay
    ? ({ "--reveal-delay": `${delay}ms` } as CSSProperties)
    : undefined;

  return (
    <div ref={ref} className={cn("min-w-0", className)} style={style}>
      {children}
    </div>
  );
}
