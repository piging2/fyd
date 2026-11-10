"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const RULES = [
  {
    n: "1",
    title: "Activity is not output.",
    body: "Work counts when a verified artifact lands in the record.",
  },
  {
    n: "2",
    title: "Evidence outranks reports.",
    body: "If a summary and the disk disagree, the disk wins.",
  },
  {
    n: "3",
    title: "Finished means verified, not rendered.",
    body: "Every release passes decode, seam, and hash checks, and a human ear, before it ships.",
  },
] as const;

export function ProofRail() {
  const [canPin, setCanPin] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [active, setActive] = useState(0);
  const slotRefs = useRef<Array<HTMLLIElement | null>>([]);
  const enhanced = canPin && !showAll;
  // The media query reserves the desktop layout before hydration.
  const pinLayout = !showAll;

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const viewport = window.matchMedia("(min-width: 1024px)");
    const motion = window.matchMedia("(prefers-reduced-motion: no-preference)");
    const update = () => setCanPin(viewport.matches && motion.matches);
    update();
    viewport.addEventListener("change", update);
    motion.addEventListener("change", update);
    return () => {
      viewport.removeEventListener("change", update);
      motion.removeEventListener("change", update);
    };
  }, []);

  useEffect(() => {
    if (!enhanced) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActive(Number(entry.target.getAttribute("data-proof-index") ?? 0));
          }
        }
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 }
    );
    for (const el of slotRefs.current) {
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, [enhanced]);

  const activeRule = RULES[active];

  return (
    <div className={cn(pinLayout && "motion-safe:lg:grid motion-safe:lg:grid-cols-12 motion-safe:lg:gap-10")}>
      <div className={cn(pinLayout && "motion-safe:lg:sticky motion-safe:lg:top-24 motion-safe:lg:self-start motion-safe:lg:col-span-5")}>
        <p className="font-mono text-xs font-bold uppercase tracking-widest text-honey">/prove</p>
        <h2
          className="mt-4 text-3xl font-bold text-text-on-dark sm:text-4xl"
          style={{ lineHeight: "var(--leading-display)", letterSpacing: "var(--tracking-display)" }}
        >
          How we work
        </h2>
        {canPin && (
          <button
            type="button"
            onClick={() => setShowAll((value) => !value)}
            className="mt-2 min-h-11 rounded text-sm font-semibold text-honey underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4"
          >
            {showAll ? "Follow claims as you scroll" : "Show all claims"}
          </button>
        )}
        <div className="relative">
          {enhanced && (
            <div className="mt-6 hidden lg:block" aria-hidden="true">
              <div key={activeRule.n} className="proof-claim-in">
                <p className="font-mono text-xs font-bold text-honey">{activeRule.n}</p>
                <p className="mt-1 text-xl font-bold text-text-on-dark">{activeRule.title}</p>
                <p className="mt-2 text-sm text-text-on-dark/85">{activeRule.body}</p>
              </div>
            </div>
          )}
        </div>
      </div>
      <ol className={cn("mt-6 grid gap-4", "md:grid-cols-3", pinLayout && "motion-safe:lg:col-span-7 motion-safe:lg:mt-0 motion-safe:lg:grid-cols-1 motion-safe:lg:gap-[10vh]")}>
        {RULES.map((rule, i) => (
          <li
            key={rule.n}
            ref={(el) => {
              slotRefs.current[i] = el;
            }}
            data-proof-index={i}
            className={cn(pinLayout && "motion-safe:lg:flex motion-safe:lg:min-h-[46vh] motion-safe:lg:items-center")}
          >
            <div
              className={cn(
                "h-full w-full rounded-lg border bg-deep-2/60 p-5 transition-[border-color,opacity] duration-300 motion-reduce:transition-none",
                enhanced && i === active ? "border-honey" : "border-text-on-dark/15"
              )}
            >
              <p className="font-mono text-xs font-bold text-honey" aria-hidden="true">{rule.n}</p>
              <h3 className="mt-2 font-bold text-text-on-dark">{rule.title}</h3>
              <p className="mt-2 text-sm text-text-on-dark/85">{rule.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
