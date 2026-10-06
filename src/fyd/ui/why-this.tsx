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
  dataAttributes,
}: {
  /** The visible claim this explains, e.g. the phone number shown. */
  claim: string;
  /** Lineage from the claim back to the source. Nearest first. */
  steps: EvidenceStep[];
  className?: string;
  /**
   * Non-visible verification metadata carried on the disclosure element
   * (PROD-5/PROD-6, 2026-09-27): raw provenance values (digests,
   * timestamps, record refs) stay in the DOM for verification without
   * entering visible text. Keys must be data-* attributes.
   */
  dataAttributes?: Record<string, string>;
}) {
  if (steps.length === 0) return null;
  return (
    <details
      className={"text-xs text-zinc-600 " + (className ?? "")}
      {...dataAttributes}
    >
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

/**
 * Plain-language evidence steps for a site photo (hero or gallery).
 *
 * PROD-5/PROD-6 (2026-09-27): the visible caption is the photo's human
 * description (media.alt, rendered by the caller); this builds ONLY the
 * "Why this?" disclosure steps, in language a non-technical business
 * owner understands. No rights-basis/digest/timestamp jargon in visible
 * text: the raw technical values (digest, observedAt, full source URL)
 * travel in non-visible data-media-* attributes on the photo's figure,
 * never in the steps. The rights basis stays in the disclosure because
 * it is the human-readable permission sentence, relabeled plainly.
 */
export function mediaWhyThisSteps(media: {
  sourceUrl?: string | null;
  rightsBasis?: string | null;
}): EvidenceStep[] {
  const steps: EvidenceStep[] = [];
  if (media.sourceUrl) {
    steps.push({
      step: "Photo source",
      detail: media.sourceUrl,
      state: "observed",
    });
  }
  if (media.rightsBasis) {
    // Policy inference, not an observation: classifyRights is a URL
    // heuristic with no authorization evidence (QA-TRUTH F-002).
    steps.push({
      step: "Why we can show this photo",
      detail: media.rightsBasis,
      state: "inferred",
    });
  }
  return steps;
}
