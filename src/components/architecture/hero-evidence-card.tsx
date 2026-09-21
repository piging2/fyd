"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { MaturityLabel } from "@/components/maturity-label";

/**
 * The living system hero card. It shows PING caught mid-work using real
 * captured evidence from PING's own commissioning run (2026-07-28), plus a
 * real live gateway probe (2026-09-16). Captured is labeled captured.
 * Live is labeled live. Nothing is presented as live that is not.
 */

const CAPTURED_STEPS = [
  {
    verb: "OBSERVED",
    title: "New lead submitted",
    detail: "Something happened. Recorded with timestamp and source.",
    meta: [
      ["event_type", "LEAD_CREATED"],
      ["event_id", "e9591d72…ce5864c5"],
      ["recorded", "2026-07-28T02:10:54Z"],
    ],
  },
  {
    verb: "RECORDED",
    title: "Canonical event stored",
    detail: "The event became the source of truth. 770 events in the run.",
    meta: [
      ["envelope", "canonical-event-envelope v1.0.0"],
      ["store", "append-only"],
    ],
  },
  {
    verb: "TASKED",
    title: "Mission created: LEAD_FOLLOWUP",
    detail: "The event triggered a mission, the objective to pursue.",
    meta: [
      ["mission_id", "51009ceae9ef316a"],
      ["priority", "3"],
    ],
  },
  {
    verb: "EXECUTED",
    title: "Workers ran",
    detail: "150 worker executions completed in the commissioning run.",
    meta: [
      ["executions", "150"],
      ["scenarios", "14"],
    ],
  },
];

export function HeroEvidenceCard() {
  const [active, setActive] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    if (reducedMotion) return;
    const t = setInterval(() => setActive((i) => (i + 1) % CAPTURED_STEPS.length), 2200);
    return () => clearInterval(t);
  }, [reducedMotion]);

  return (
    <div
      className="w-full rounded-xl border border-text-on-dark/15 bg-deep-2/70 p-6 sm:p-8"
      role="img"
      aria-label="Evidence card: a captured PING commissioning run showing an observed lead, a recorded canonical event, a created mission, and executed workers, with a live gateway status line."
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-text-on-dark/60">
          Evidence card
        </p>
        <div className="flex items-center gap-2">
          <MaturityLabel status="Built" />
          <span className="rounded border border-text-on-dark/20 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide text-text-on-dark/60">
            Captured 2026-07-28
          </span>
        </div>
      </div>

      <ol className="mt-6 space-y-4">
        {CAPTURED_STEPS.map((step, i) => (
          <li
            key={step.verb}
            className={cn(
              "rounded-lg border p-4 transition-all duration-500",
              i === active
                ? "border-honey/60 bg-honey/5"
                : "border-text-on-dark/10 bg-transparent opacity-70"
            )}
            aria-current={i === active ? "true" : undefined}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-honey">
                {step.verb}
              </p>
              {i === active && (
                <span className="font-mono text-[10px] uppercase tracking-wide text-text-on-dark/50">
                  replaying captured record
                </span>
              )}
            </div>
            <p className="mt-1 text-sm font-bold text-text-on-dark">{step.title}</p>
            <p className="mt-1 text-sm text-text-on-dark/70">{step.detail}</p>
            <dl className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
              {step.meta.map(([k, v]) => (
                <div key={k} className="flex gap-2 font-mono text-[11px]">
                  <dt className="text-text-on-dark/40">{k}</dt>
                  <dd className="break-all text-text-on-dark/80">{v}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ol>

      <p className="mt-4 text-xs text-text-on-dark/50">
        A captured record from PING&apos;s own commissioning run. Not live activity.
        Full lineage lives in the runtime, not on this page.
      </p>

      <div className="mt-4 border-t border-text-on-dark/10 pt-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
          </span>
          <p className="font-mono text-xs text-text-on-dark/80">
            ping-gateway: healthy · constitution 1.0.0 · auth enforced on reads
          </p>
          <span className="rounded border border-green-500/30 bg-green-500/10 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide text-green-400">
            Live · probed 2026-09-16
          </span>
        </div>
      </div>
    </div>
  );
}
