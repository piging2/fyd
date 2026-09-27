"use client";

/**
 * Why this: contextual drill-down from any visible claim to its evidence.
 *
 * Harvested pattern: X-48 (graph to context flow) and the drill-down
 * breadcrumb (section 14), reduced to the customer surface. Trust
 * infrastructure, not chrome: a quiet inline control that expands to the
 * claim's lineage (value -> object field -> claim -> evidence ->
 * observation -> source). Never plastered; one per claim that needs it.
 *
 * The component takes the lineage as props. It never invents a lineage:
 * callers pass what the evidence layer returned, or they do not render it.
 */

import { EvidenceStateLabel, type EvidenceState } from "./evidence-state";
import type { RenderViewerKind } from "../sitespec/render-projection";

export interface EvidenceStep {
  /** e.g. "Object field", "Evidence", "Observation", "Source". */
  step: string;
  /** The value or reference at this step. */
  detail: string;
  state?: EvidenceState;
}

export function WhyThis({
  claim,
  steps,
  className,
  viewerKind,
}: {
  /** The visible claim this explains, e.g. the phone number shown. */
  claim: string;
  /** Lineage from the claim back to the source. Nearest first. */
  steps: EvidenceStep[];
  className?: string;
  /**
   * LANE-8: when "visitor", the per-claim evidence drill-down is suppressed
   * (the quiet Source affordance carries provenance instead). Absent
   * preserves the previous render for debug/developer surfaces.
   */
  viewerKind?: RenderViewerKind;
}) {
  if (viewerKind === "visitor") return null;
  if (steps.length === 0) return null;
  return (
    <details className={"text-xs text-zinc-600 " + (className ?? "")}>
      <summary className="cursor-pointer underline decoration-dotted underline-offset-2">
        Why this?
      </summary>
      <div className="mt-2 rounded border border-zinc-200 bg-zinc-50 p-3">
        <p className="font-medium text-zinc-800">{claim}</p>
        <ol className="mt-2 list-none space-y-1.5">
          {steps.map((s, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-zinc-500">{s.step}:</span>
              <span className="break-all">{s.detail}</span>
              {s.state && <EvidenceStateLabel state={s.state} />}
            </li>
          ))}
        </ol>
      </div>
    </details>
  );
}
