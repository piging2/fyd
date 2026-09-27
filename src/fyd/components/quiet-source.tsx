/**
 * LANE-8: the quiet per-claim Source affordance for the visitor projection.
 *
 * Replaces the ClaimBadge pill ("Site record" / "Website statement" /
 * "Demo addition" / "Feed item" / "Mixed sources") and the per-claim
 * "Why this?" drill-down on the visitor page: one quiet "Source"
 * disclosure per claim with source, observed date, and direct/derived
 * status (progressive disclosure, not a pill on every card). All labels
 * come from the projection module's customer-language mappings; nothing
 * here invents copy or leaks ingestion vocabulary.
 */

import type { PingObject } from "@/lib/ping/types";
import {
  observedMonthYear,
  sourceLabelFor,
  supportLineFor,
} from "../sitespec/render-projection";

function distinctSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

export function QuietSource({ objects }: { objects: PingObject[] }) {
  if (objects.length === 0) return null;
  const labels = distinctSorted(objects.map(sourceLabelFor));
  const whens = distinctSorted(
    objects
      .map((o) => observedMonthYear(o.provenance?.derivedAt))
      .filter((w) => w !== "date unknown"),
  );
  // Direct/derived status for every object (the work order requires it in
  // the affordance, single or multi claim).
  const supports = distinctSorted(objects.map(supportLineFor));
  return (
    <details className="fyd-quiet-source mt-2 text-xs text-accent">
      <summary className="cursor-pointer underline decoration-dotted underline-offset-2">
        Source
      </summary>
      <div className="mt-1 space-y-0.5">
        <p>Source: {labels.join("; ")}</p>
        {whens.length > 0 ? <p>Observed: {whens.join("; ")}</p> : null}
        {supports.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
    </details>
  );
}
