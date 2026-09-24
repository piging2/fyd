/**
 * Object hover/tap affordance for the FYD customer surface.
 *
 * On CANONICAL objects only (services, products, people, locations:
 * things a viewer can open), hovering or tapping shows a small FYD mark
 * that opens a preview: one-line identity, an evidence line, and the
 * valid actions (Ask FYD, View details). Subtle, not noisy.
 *
 * Never on every noun: content objects (posts, articles) and the
 * business itself get no affordance.
 *
 * G4: the preview renders the capability authority's answer, it does not
 * decide. "ask" resolves to the Ask FYD deep-link; "open" resolves to the
 * View details link. If the authority ever revokes one, the affordance
 * follows.
 *
 * Seam: native <details>/<summary> disclosure like the contact flow and
 * WhyThis. Works in static HTML, no hydration, no JS state, no motion,
 * native keyboard/screen-reader semantics.
 */

import type { PingObject } from "@/lib/ping/types";
import type { FYDThemeTokens } from "../sitespec/types";
import { capabilityOptionsForSchema, schemaRole } from "../sitespec/schemas";

/**
 * Canonical object roles that carry the FYD mark affordance. Kept as a
 * data list so the eligibility rule is inspectable and testable.
 */
export const AFFORDANCE_ROLES: readonly string[] = [
  "service",
  "product",
  "person",
  "location",
];

/** True when the object's schema role is a canonical affordance type. */
export function affordanceEligible(o: PingObject): boolean {
  const role = schemaRole(o.schema);
  return role !== null && AFFORDANCE_ROLES.includes(role);
}

/**
 * One-line evidence basis for the preview, from the object's own
 * provenance. Names the claim source honestly; never invents one.
 */
export function affordanceEvidenceLine(o: PingObject): string {
  if (o.provenance?.kind === "overlay-authored") return "Demo addition";
  const claimKind =
    typeof o.fields["claimKind"] === "string" ? o.fields["claimKind"] : "";
  if (claimKind === "feed_item") return "Feed item";
  if (claimKind === "website_statement") return "From the business website";
  return "Site record";
}

/**
 * The FYD mark: the quiet circle motif, gold ring on purple. Inline SVG
 * so it needs no asset fetch and renders in static HTML.
 */
function FydMark() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 22 22"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="11" cy="11" r="9.5" fill="#2A1B4E" />
      <circle
        cx="11"
        cy="11"
        r="9.5"
        fill="none"
        stroke="#C9A227"
        strokeWidth="2"
      />
      <circle cx="11" cy="11" r="3.2" fill="#C9A227" />
    </svg>
  );
}

export function ObjectAffordance({
  objectId,
  title,
  kindLabel,
  evidenceLine,
  schemaId,
  controllerId,
  theme,
}: {
  /** Stable object id: the detail link and the preview key off it. */
  objectId: string;
  /** One-line identity (bound title), or null when unbound. */
  title: string | null;
  /** Plain-language kind, e.g. "Service". */
  kindLabel: string;
  /** Evidence line from the object's own provenance. */
  evidenceLine: string;
  /** Schema id, resolved through the capability authority. */
  schemaId: string;
  /** Controller id, for viewer-dependent capability options. */
  controllerId: string;
  theme: FYDThemeTokens;
}) {
  if (!title) return null;
  // G4: actions come from the capability authority, not from this
  // component. The affordance is a preview surface, so no contact context
  // flags apply; the authority answers from schema + viewer alone.
  const allowed = capabilityOptionsForSchema(schemaId, {
    viewerId: null,
    controllerId,
    hasWebsite: false,
  });
  const canAsk = allowed.includes("ask");
  const canOpen = allowed.includes("open");
  const detailHref = `/o/${encodeURIComponent(objectId)}`;
  return (
    <details
      className="fyd-affordance"
      data-fyd-affordance={objectId}
      style={{ position: "absolute", top: "0.75rem", right: "0.75rem" }}
    >
      <summary
        className="fyd-affordance-mark"
        aria-label={`About ${title}`}
        title={title}
        style={{ cursor: "pointer", listStyle: "none", opacity: 0.55 }}
      >
        <FydMark />
      </summary>
      <div
        className="fyd-affordance-preview"
        role="dialog"
        aria-label={title}
        style={{
          position: "absolute",
          top: "2rem",
          right: 0,
          zIndex: 20,
          width: "16rem",
          background: theme.surface,
          border: "1px solid rgba(0,0,0,0.08)",
          borderRadius: theme.radius === "none" ? 0 : 10,
          boxShadow: "0 12px 32px rgba(0,0,0,0.16)",
          padding: "0.9rem 1rem",
        }}
      >
        <p
          className="text-sm font-semibold leading-snug"
          style={{ color: theme.ink }}
        >
          {title}
        </p>
        <p
          className="mt-0.5 text-[11px] uppercase tracking-wide"
          style={{ color: theme.ink, opacity: 0.6 }}
        >
          {kindLabel}
        </p>
        <p
          className="mt-2 text-xs"
          style={{ color: theme.ink, opacity: 0.75 }}
        >
          {evidenceLine}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {canAsk ? (
            <a
              href={detailHref + "#ask"}
              className="inline-flex min-h-[44px] items-center rounded px-4 py-2 text-sm font-semibold"
              style={{
                background: theme.accent,
                color: theme.accentForeground,
                borderRadius: theme.radius === "full" ? 9999 : 8,
              }}
            >
              Ask FYD
            </a>
          ) : null}
          {canOpen ? (
            <a
              href={detailHref}
              className="inline-flex min-h-[44px] items-center rounded border px-4 py-2 text-sm font-semibold"
              style={{
                borderColor: theme.accent,
                color: theme.ink,
                borderRadius: theme.radius === "full" ? 9999 : 8,
              }}
            >
              View details
            </a>
          ) : null}
        </div>
      </div>
    </details>
  );
}
