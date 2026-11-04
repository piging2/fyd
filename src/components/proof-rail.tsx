"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * ProofRail: the "How we work" rules as a pinned proof rail (Wave 08,
 * transferred from the Vercel teardown: claim pinned left, evidence
 * cards scrolling right).
 *
 * Safety contract, same shape as Reveal: server markup shows every
 * claim as a plain static list, fully readable with no JS, with
 * reduced motion, and on small screens. The pinned active-claim state
 * is an enhancement added from JS only, after mount, only on lg
 * viewports with motion allowed. In enhanced mode the static list
 * keeps its layout box (visibility, not display), so the absolutely
 * positioned active claim overlays the reserved height and nothing
 * shifts when the active rule changes.
 */

const RULES = [
  {
    n: "01",
    title: "Activity is not output.",
    body: "Work counts when a verified artifact lands in the record.",
  },
  {
    n: "02",
    title: "Evidence outranks reports.",
    body: "If a summary and the disk disagree, the disk wins.",
  },
  {
    n: "03",
    title: "Finished means verified, not rendered.",
    body: "Every release passes decode, seam, and hash checks, and a human ear, before it ships.",
  },
] as const;

export function ProofRail() {
  const [enhanced, setEnhanced] = useState(false);
  const [active, setActive] = useState(0);
  const slotRefs = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    if (!window.matchMedia("(prefers-reduced-motion: no-preference)").matches) return;
    if (!window.matchMedia("(min-width: 1024px)").matches) return;
    setEnhanced(true);
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
  }, []);

  const activeRule = RULES[active];

  return (
    <div className="lg:grid lg:grid-cols-12 lg:gap-10">
      <div className="lg:sticky lg:top-24 lg:self-start lg:col-span-5">
        <p className="font-mono text-xs font-bold uppercase tracking-widest text-honey">/prove</p>
        <h2
          className="mt-4 text-3xl font-bold text-text-on-dark sm:text-4xl"
          style={{ lineHeight: "var(--leading-display)", letterSpacing: "var(--tracking-display)" }}
        >
          How we work
        </h2>
        <div className="relative mt-6">
          <ul className={cn("space-y-4", enhanced && "lg:invisible")} aria-hidden={enhanced || undefined}>
            {RULES.map((rule) => (
              <li key={rule.n}>
                <p className="font-mono text-xs font-bold text-honey">{rule.n}</p>
                <p className="mt-1 font-bold text-text-on-dark">{rule.title}</p>
                <p className="mt-1 text-sm text-text-on-dark/85">{rule.body}</p>
              </li>
            ))}
          </ul>
          {enhanced && (
            <div className="absolute inset-0 hidden lg:block" aria-hidden="true">
              <div key={activeRule.n} className="proof-claim-in">
                <p className="font-mono text-xs font-bold text-honey">{activeRule.n}</p>
                <p className="mt-1 text-xl font-bold text-text-on-dark">{activeRule.title}</p>
                <p className="mt-2 text-sm text-text-on-dark/85">{activeRule.body}</p>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="mt-8 flex flex-col gap-4 lg:col-span-7 lg:mt-0 lg:gap-[10vh]">
        {RULES.map((rule, i) => (
          <div
            key={rule.n}
            ref={(el) => {
              slotRefs.current[i] = el;
            }}
            data-proof-index={i}
            className="lg:flex lg:min-h-[46vh] lg:items-center"
          >
            <div
              className={cn(
                "w-full rounded-lg border bg-deep-2/60 p-5 transition-[border-color,opacity] duration-300 motion-reduce:transition-none",
                enhanced && i === active ? "border-honey" : "border-text-on-dark/15",
                enhanced && i !== active && "lg:opacity-60"
              )}
            >
              <p className="font-mono text-xs font-bold text-honey">{rule.n}</p>
              <h3 className="mt-2 font-bold text-text-on-dark">{rule.title}</h3>
              <p className="mt-2 text-sm text-text-on-dark/85">{rule.body}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
