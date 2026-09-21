/**
 * Lane B: shared rendering chrome for the Card and Node projections.
 *
 * Every visible claim gets its evidence mark from the EXISTING machinery
 * (EvidenceStateLabel + WhyThis in src/fyd/ui). A claim whose basis is
 * "unknown" renders its label with an Unknown mark and NEVER its value.
 * A "withheld" claim renders "Hidden by owner". Sections render ONLY from
 * real projection data: empty arrays and nulls omit, never invent.
 *
 * Actions render ONLY from projection.capabilities: a phone number exposes
 * Call only when the call capability exists. Mirrors ObjectCircle's
 * capability gating (follow/like have no static affordance on these
 * surfaces, exactly as in the existing Circle primitive).
 */

import * as React from "react";
import { ExternalLink, Mail, MessageCircleQuestion, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { EvidenceStateLabel } from "../ui/evidence-state";
import { WhyThis } from "../ui/why-this";
import type {
  ClaimEvidence,
  Fact,
  ObjectCapability,
  RelatedRef,
} from "./object-projection";

/** Inline evidence mark: state label (with receipt/asOf hover) plus the
 *  WhyThis drill-down when the projection carries lineage steps. Renders
 *  nothing for a missing evidence object; callers never pass one. */
export function EvidenceMark({
  claim,
  evidence,
}: {
  /** The visible claim this mark explains, e.g. the phone number shown. */
  claim: string;
  evidence: ClaimEvidence;
}) {
  const steps = evidence.steps ?? [];
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <EvidenceStateLabel
        state={evidence.state}
        receipt={evidence.receipt}
        asOf={evidence.asOf}
      />
      {steps.length > 0 && (
        <WhyThis claim={claim} steps={steps} className="inline-block" />
      )}
    </span>
  );
}

/**
 * One factual claim row. The value renders ONLY when the basis is real
 * (state !== "unknown"). Unknown claims render label + Unknown mark so the
 * absence of evidence is visible, never silent and never faked.
 */
export function FactRow({ fact }: { fact: Fact }) {
  const hasValue = fact.evidence.state !== "unknown" && fact.value.length > 0;
  const withheld = fact.evidence.state === "withheld";
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 py-1">
      <dt className="shrink-0 text-xs font-semibold uppercase tracking-wide text-stone-500">
        {fact.label}
      </dt>
      <dd className="min-w-0 flex-1 text-sm text-stone-900">
        {hasValue ? (
          fact.value
        ) : withheld ? (
          <span className="italic text-stone-400">Hidden by owner</span>
        ) : (
          <span className="italic text-stone-400">No evidence</span>
        )}
      </dd>
      <EvidenceMark claim={hasValue ? fact.value : fact.label} evidence={fact.evidence} />
    </div>
  );
}

/** One real related object. Never rendered from invented data. */
export function RelatedRow({ related }: { related: RelatedRef }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-1 py-1">
      <span className="min-w-0 flex-1 text-sm text-stone-900">
        <span className="font-medium">{related.name}</span>
        <span className="text-stone-500">
          {" "}
          · {related.kindLabel} · {related.relation}
        </span>
      </span>
      <EvidenceMark claim={related.name} evidence={related.evidence} />
    </li>
  );
}

const BTN =
  "inline-flex min-h-[44px] items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600";
const QUIET_BTN = cn(BTN, "border border-stone-300 bg-white text-stone-800 hover:bg-stone-100");

function CapabilityAction({
  cap,
  nodeHref,
}: {
  cap: ObjectCapability;
  nodeHref: string;
}) {
  switch (cap.kind) {
    case "view":
      return (
        <a href={nodeHref} className={cn(BTN, "bg-amber-600 text-white hover:bg-amber-700")}>
          View
        </a>
      );
    case "ask":
      return (
        <a href={nodeHref + "#ask"} className={QUIET_BTN}>
          <MessageCircleQuestion className="h-4 w-4" aria-hidden="true" />
          Ask
        </a>
      );
    case "call":
      return (
        <a href={cap.href} className={QUIET_BTN}>
          <Phone className="h-4 w-4" aria-hidden="true" />
          {cap.label}
        </a>
      );
    case "email":
      return (
        <a href={cap.href} className={QUIET_BTN}>
          <Mail className="h-4 w-4" aria-hidden="true" />
          {cap.label}
        </a>
      );
    case "website":
      return (
        <a href={cap.href} target="_blank" rel="noreferrer" className={QUIET_BTN}>
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          {cap.label}
        </a>
      );
    default:
      // follow/like: no static affordance on these surfaces, exactly as in
      // the existing Circle primitive. Never a dead button.
      return null;
  }
}

/** Action row derived ONLY from projection.capabilities. No fake buttons. */
export function CapabilityActions({
  capabilities,
  nodeHref,
  className,
}: {
  capabilities: ObjectCapability[];
  nodeHref: string;
  className?: string;
}) {
  if (capabilities.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {capabilities.map((cap, i) => (
        <CapabilityAction key={cap.kind + ":" + i} cap={cap} nodeHref={nodeHref} />
      ))}
    </div>
  );
}

/** Compact initials mark: the same fallback the Circle primitive uses when
 *  no authorized logo exists. */
export function InitialsMark({ name, size }: { name: string; size: "sm" | "lg" }) {
  const parts = name.trim().split(/\s+/);
  const mark =
    ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")).toUpperCase();
  const dims = size === "sm" ? "h-10 w-10 text-sm" : "h-16 w-16 text-xl";
  return (
    <span
      aria-hidden="true"
      className={cn(
        dims,
        "flex shrink-0 items-center justify-center rounded-full bg-amber-100 font-bold text-amber-900",
      )}
    >
      {mark}
    </span>
  );
}
