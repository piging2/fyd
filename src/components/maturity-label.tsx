"use client";

import { cn } from "@/lib/utils";

export type Maturity = "Live" | "Built" | "Experimental" | "Direction" | "Unproven";

const STYLES: Record<Maturity, string> = {
  Live: "bg-green-500/10 text-green-700 border-green-500/30",
  Built: "bg-sky-500/10 text-sky-700 border-sky-500/30",
  Experimental: "bg-violet-500/10 text-violet-700 border-violet-500/30",
  Direction: "bg-surface-muted text-text-muted border-border-soft",
  Unproven: "bg-amber-500/10 text-amber-700 border-amber-500/30",
};

const HINTS: Record<Maturity, string> = {
  Live: "Running now, verified this week",
  Built: "Real code, not evidenced live right now",
  Experimental: "Built but dormant or thin, do not treat as production",
  Direction: "Planned, no build evidence yet",
  Unproven: "Claimed without evidence, do not ship as fact",
};

/** Structural maturity label. Every capability on the page carries one. */
export function MaturityLabel({ status, className }: { status: Maturity; className?: string }) {
  return (
    <span
      title={HINTS[status]}
      className={cn(
        "inline-block rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        STYLES[status],
        className
      )}
    >
      {status}
    </span>
  );
}
