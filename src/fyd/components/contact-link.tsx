/**
 * FYD contact link: the generic contact affordance for generated sites.
 *
 * Nolan's first-line directive: phone numbers and emails on generated FYD
 * sites must link to FYD, not be dead text. A ContactMethod therefore never
 * renders as a top-level tel:/mailto: anchor. It renders as an FYD
 * affordance (the value itself, as a disclosure toggle) that opens the FYD
 * contact flow: an evidence-backed surface showing the value, a compact
 * provenance line with progressive disclosure (tap to expand the full
 * evidence lineage), and the real Call / Send email action INSIDE the
 * flow. No tel:/mailto: href exists outside a contact flow on the
 * generated surface.
 *
 * Seam decision (CONTACT lane, 2026-09-22): the flow is an inline
 * <details>/<summary> disclosure, not a JS popover/sheet and not a
 * redirect into Ask FYD. It works on generated /build sites in every
 * serving mode (including static HTML export), needs no hydration, has
 * no motion (reduced-motion safe by construction), and matches the
 * existing evidence chrome (WhyThis is already details-based). The
 * native disclosure marker is kept: it is the platform's honest "this
 * opens" signal.
 *
 * Generic: zero customer-specific JSX. Reusable from the Hero, the
 * Contact section, service cards, and the object Card/Node lane
 * (CapabilityActions). The caller renders nothing when the method is
 * null: no method, no affordance, no output.
 */

import type {
  ClaimEvidence,
  ContactMethod,
  ContactMethodKind,
} from "../object/object-projection";
import type { FYDThemeTokens } from "../sitespec/types";
import { EvidenceStateLabel } from "../ui/evidence-state";

/** Action verb per method kind. Generic, never business-specific. */
const ACTION_VERB: Record<ContactMethodKind, string> = {
  phone: "Call",
  email: "Send email",
};

/** Distinct source references named in the evidence lineage. */
function sourceRefs(evidence: ClaimEvidence): string[] {
  const refs: string[] = [];
  for (const s of evidence.steps ?? []) {
    const detail = s.detail.trim();
    if (s.step.toLowerCase() === "source" && detail && !refs.includes(detail)) {
      refs.push(detail);
    }
  }
  return refs;
}

/**
 * Compact one-line provenance, e.g. "Verified from example.com · 2 sources".
 * The count is honest: distinct Source steps in the lineage. No em dashes;
 * the "·" separator matches existing surface copy.
 */
export function compactProvenanceLine(evidence: ClaimEvidence): string {
  const receipt = (evidence.receipt ?? "").trim() || "the business";
  const n = sourceRefs(evidence).length;
  const count = n > 0 ? ` · ${n} source${n === 1 ? "" : "s"}` : "";
  switch (evidence.state) {
    case "observed":
      return `Verified from ${receipt}${count}`;
    case "inferred":
      return `Inferred from ${receipt}${count}`;
    case "unverified":
      return `Unverified · claimed by ${receipt}${count}`;
    case "withheld":
      return `Hidden by owner${count}`;
    case "unavailable":
      return `Source unavailable${count}`;
    default:
      return `No evidence either way${count}`;
  }
}

/**
 * MAKE EVIDENCE BEAUTIFUL: progressive disclosure for provenance.
 *
 * Claim line -> compact "Verified from business website · N sources" ->
 * tap expands the full evidence lineage. Trust without clutter. When the
 * lineage is empty there is nothing to expand, so the compact line
 * renders as plain text rather than a dead toggle.
 */
export function ProvenanceLine({
  evidence,
  theme,
}: {
  evidence: ClaimEvidence;
  /** Optional theme tokens; neutral zinc when omitted (object lane). */
  theme?: FYDThemeTokens;
}) {
  const line = compactProvenanceLine(evidence);
  const steps = evidence.steps ?? [];
  const ink = theme?.ink;
  if (steps.length === 0) {
    return (
      <p
        className="flex flex-wrap items-center gap-2 text-xs"
        style={ink ? { color: ink, opacity: 0.75 } : undefined}
      >
        <EvidenceStateLabel
          state={evidence.state}
          receipt={evidence.receipt}
          asOf={evidence.asOf}
        />
        <span>{line}</span>
      </p>
    );
  }
  return (
    <details className="text-xs" style={ink ? { color: ink } : undefined}>
      <summary className="cursor-pointer underline decoration-dotted underline-offset-2">
        <EvidenceStateLabel
          state={evidence.state}
          receipt={evidence.receipt}
          asOf={evidence.asOf}
        />{" "}
        {line}
      </summary>
      <ol className="mt-2 list-none space-y-1.5 rounded border border-zinc-200 bg-zinc-50 p-3">
        {steps.map((s, i) => (
          <li key={i} className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-zinc-500">{s.step}:</span>
            <span className="break-all text-zinc-700">{s.detail}</span>
            {s.state && <EvidenceStateLabel state={s.state} />}
          </li>
        ))}
        {evidence.asOf && (
          <li className="text-zinc-500">Observed {evidence.asOf}.</li>
        )}
      </ol>
    </details>
  );
}

/**
 * The FYD contact flow: the evidence-backed contact surface.
 *
 * Shows the value (the claim line), the compact provenance line (tap to
 * expand the full lineage), and the real action INSIDE: the tel:/mailto:
 * button. This is the only place the method's actionUri becomes an href.
 */
export function ContactFlow({
  method,
  theme,
}: {
  method: ContactMethod;
  theme?: FYDThemeTokens;
}) {
  return (
    <div
      data-fyd-contact-flow={method.kind}
      className="mt-3 rounded-lg border border-zinc-200 bg-white p-4"
    >
      <p
        className="text-lg font-semibold"
        style={theme ? { color: theme.ink } : undefined}
      >
        {method.value}
      </p>
      <div className="mt-2">
        <ProvenanceLine evidence={method.evidence} theme={theme} />
      </div>
      <a
        href={method.actionUri}
        className="mt-3 inline-flex min-h-[44px] items-center rounded px-6 py-3 font-semibold"
        style={
          theme
            ? {
                background: theme.accent,
                color: theme.accentForeground,
                borderRadius: theme.radius === "full" ? 9999 : 8,
              }
            : undefined
        }
      >
        {ACTION_VERB[method.kind]}
      </a>
    </div>
  );
}

/**
 * The FYD contact affordance. The value itself is the toggle: clicking it
 * opens the FYD contact flow inline instead of jumping to a dialer or
 * mail client. Two variants:
 * - "row": inline underlined value, for the Contact section.
 * - "button": primary action button, for the Hero.
 */
export function FydContactLink({
  method,
  theme,
  variant = "row",
}: {
  /**
   * A verified ContactMethod. Never null here: the caller renders nothing
   * when contactMethodFor returns null (unverifiable or unsafe value).
   */
  method: ContactMethod;
  theme: FYDThemeTokens;
  variant?: "row" | "button";
}) {
  return (
    <details data-fyd-contact={method.kind} className="fyd-contact">
      {variant === "button" ? (
        <summary
          className="inline-block cursor-pointer rounded px-6 py-3 font-semibold"
          style={{
            background: theme.accent,
            color: theme.accentForeground,
            borderRadius: theme.radius === "full" ? 9999 : 8,
          }}
        >
          {ACTION_VERB[method.kind]} {method.value}
        </summary>
      ) : (
        <summary
          className="inline-block min-h-[44px] cursor-pointer py-2 underline"
          style={{ color: theme.ink }}
        >
          {method.value}
        </summary>
      )}
      <ContactFlow method={method} theme={theme} />
    </details>
  );
}
