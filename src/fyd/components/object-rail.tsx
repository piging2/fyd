"use client";

/**
 * ObjectRail: the generic margin/rail layout capability (ObjectPresence).
 *
 * Placement law: center content is untouched. The rail renders contextual
 * object cards in the margin on wide viewports and collapses to a
 * drawer/sheet on narrow ones, never displacing content.
 *
 * Composition: the server builds ObjectCard elements (from the harvested
 * ObjectCard over pingObjectToProjection) and passes them as the cards
 * prop, so this client component never imports server modules. Cards are
 * plain ReactNode and may render in both the rail aside and the drawer
 * sheet; React elements are immutable descriptions, so sharing is safe.
 *
 * Geometry: mode auto resolves rail vs drawer from the collapseBelow
 * breakpoint key through the spec theme tokens (resolveCollapseBreakpoint);
 * no placement logic hardcodes px. The responsive switch is CSS media
 * queries emitted from the token value, which keeps server rendering and
 * hydration identical (no viewport width on the server).
 *
 * Resize lifecycle (portal law): an open drawer is a placement-bound
 * surface. When the viewport crosses back to rail geometry the drawer
 * placement is invalid, so the drawer releases instead of lingering over
 * content. Escape closes the drawer and returns focus to the trigger.
 */

import * as React from "react";
import type { PingObject } from "@/lib/ping/types";
import type { FYDThemeTokens, ObjectPresence } from "../sitespec/types";
import { resolveCollapseBreakpoint } from "../sitespec/types";
import { schemaRole } from "../sitespec/schemas";
import type { ClaimEvidence, ObjectProjection } from "../object/object-projection";
import type { ObjectView } from "../object/types";
import { verifyPresentationBinding } from "../sitespec/graph";

/** Resolved placement for one render. */
export type RailPlacement = "rail" | "drawer" | "hidden";

/**
 * Pure placement resolution. Deterministic and unit-tested:
 * hidden mode or zero objects -> hidden; explicit rail/drawer honored;
 * auto -> rail at/above the collapseBelow breakpoint, drawer below it.
 */
export function resolvePresenceMode(
  presence: ObjectPresence | undefined,
  viewportWidthPx: number,
  theme: FYDThemeTokens,
): RailPlacement {
  if (!presence || presence.mode === "hidden") return "hidden";
  if (!presence.objects || presence.objects.length === 0) return "hidden";
  if (presence.mode === "rail") return "rail";
  if (presence.mode === "drawer") return "drawer";
  const bp = resolveCollapseBreakpoint(theme, presence.rules.collapseBelow);
  return viewportWidthPx >= bp ? "rail" : "drawer";
}

function friendlySchemaLabel(schema: string): string {
  const local = schema.split(".").pop() ?? schema;
  const name = local.split("@")[0];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Honest minimal adapter: PingObject -> ObjectProjection for the rail.
 *
 * Basis mapping (nothing invented):
 * - name: the object title (read-model identity, always present).
 * - kindLabel: the schema role label; never a stronger claim.
 * - summary: the description, evidence observed with the object provenance
 *   ref as receipt; null when absent, so cards omit it instead of
 *   generating prose.
 * - facts / people / contact: empty. The rail shows identity plus summary;
 *   detailed facts stay on the object own surfaces.
 * - capabilities: view and ask only, the registry always-available set.
 *   call, email, website, follow, like need underlying values this adapter
 *   does not verify, so they are never granted here.
 * - media: empty. The rail never invents imagery.
 */
/**
 * Binding-gated description read for the rail adapters.
 *
 * The main sections read factual fields only through the binding authority
 * (boundField -> resolveBoundField); the rail adapters previously read
 * o.description raw, so a description with no provenance (an unbound claim)
 * still rendered in the rail, labeled with an invented
 * "Observed on website-ingestion" receipt. Routing the adapters through the
 * same authority means unbound descriptions are omitted, never rendered.
 */
function boundRailDescription(o: PingObject): string {
  const verdict = verifyPresentationBinding(
    { objectId: o.id, field: "description", classification: "direct" },
    { objects: [o], relationships: [] },
  );
  return verdict.ok ? verdict.value.trim() : "";
}

export function pingObjectToProjection(o: PingObject): ObjectProjection {
  const ref = o.provenance?.ref ?? "website-ingestion";
  const derivedAt = o.provenance?.derivedAt ?? "";
  const evidence: ClaimEvidence = {
    state: "observed",
    receipt: ref,
    asOf: derivedAt.length >= 10 ? derivedAt.slice(0, 10) : undefined,
  };
  const role = schemaRole(o.schema);
  const kindLabel = role
    ? role.charAt(0).toUpperCase() + role.slice(1)
    : friendlySchemaLabel(o.schema);
  const description = boundRailDescription(o);
  return {
    id: o.id,
    schema: o.schema,
    kindLabel,
    name: o.title,
    category: null,
    location: null,
    summary: description ? { label: "About", value: description, evidence } : null,
    facts: [],
    people: [],
    externalIdentities: [],
    serviceRefs: [],
    locationRef: null,
    contact: { phone: null, email: null, website: null },
    contactMethods: [],
    capabilities: [{ kind: "view" }, { kind: "ask" }],
    provenance: { label: "Observed on " + ref, ref, derivedAt },
    sampleQuestions: [],
    ownerUpdatedAt: null,
    media: [],
  };
}

export interface ObjectRailProps {
  /**
   * Server-rendered object cards (ObjectCard elements). Passed as a prop so
   * this client component never imports server modules.
   */
  cards: React.ReactNode;
  presence: ObjectPresence | undefined;
  theme: FYDThemeTokens;
  /** Accessible label for the rail region and drawer dialog. */
  heading?: string;
}

export function ObjectRail({ cards, presence, theme, heading }: ObjectRailProps) {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const mode = presence?.mode ?? "auto";
  const hasObjects = !!presence && !!presence.objects && presence.objects.length > 0;
  const bp = resolveCollapseBreakpoint(theme, presence?.rules.collapseBelow ?? "lg");

  // auto is a placement input, not a resolved placement: geometry (CSS)
  // resolves it at render, so the component type admits it here.
  const placement: RailPlacement | "auto" =
    !hasObjects || mode === "hidden" ? "hidden" : mode;

  // Resize lifecycle (portal law): an open drawer releases when the viewport
  // crosses back to rail geometry, where the drawer placement is invalid.
  // The matchMedia listener only manages the open drawer; the rail/drawer
  // switch itself is CSS, so server and client render identically.
  React.useEffect(() => {
    const mq = window.matchMedia("(max-width: " + (bp - 1) + "px)");
    const onChange = (e: MediaQueryListEvent) => {
      if (!e.matches) setOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [bp]);

  // Escape closes the drawer and returns focus to the trigger.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (placement === "hidden") return null;

  const label = heading ?? "Related objects";
  // Token-driven responsive switch: rail visible at/above the breakpoint,
  // trigger visible below it. Values come from theme tokens, never
  // hardcoded in placement logic.
  const autoCss =
    "@media (max-width: " + (bp - 1) + "px){.fyd-rail-auto-rail{display:none!important}}" +
    "@media (min-width: " + bp + "px){.fyd-rail-auto-trigger{display:none!important}}" +
    // ISSUE-2: below the breakpoint the trigger is in-flow, never fixed. The
    // fixed 153px pill occluded section headings at 320px (48% of viewport).
    "@media (max-width: " +
    (bp - 1) +
    "px){.fyd-rail-auto-trigger .fyd-rail-auto-trigger-btn{position:static!important;margin:0.75rem auto 0}}";

  const railClass =
    "w-72 shrink-0 lg:w-80" + (placement === "auto" ? " fyd-rail-auto-rail" : "");
  const triggerWrapClass = placement === "auto" ? "fyd-rail-auto-trigger" : undefined;

  return (
    <div data-object-rail={mode} className="contents">
      {placement === "auto" ? <style>{autoCss}</style> : null}
      {placement !== "drawer" ? (
        <aside aria-label={label} className={railClass}>
          <div
            className="sticky top-6 rounded-2xl border p-5 shadow-sm"
            style={{ background: theme.surface, borderColor: "rgba(15, 23, 42, 0.10)" }}
          >
            {heading ? (
              <p
                className="mb-4 text-xs font-semibold uppercase tracking-widest"
                style={{ color: theme.accent }}
              >
                {heading}
              </p>
            ) : null}
            {cards}
          </div>
        </aside>
      ) : null}
      {placement !== "rail" ? (
        <div className={triggerWrapClass}>
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={open}
            className="fyd-rail-auto-trigger-btn fixed bottom-6 right-6 z-40 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full px-5 py-3 text-sm font-semibold shadow-lg"
            style={{ background: theme.accent, color: theme.accentForeground }}
          >
            {label}
          </button>
          {open ? (
            <div role="dialog" aria-modal="true" aria-label={label} className="fixed inset-0 z-50">
              <button
                type="button"
                aria-label="Close related objects panel"
                onClick={() => setOpen(false)}
                className="absolute inset-0 h-full w-full cursor-default bg-black/60"
              />
              <div
                className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-3xl p-4 sm:p-6"
                style={{ background: theme.surface }}
              >
                <div className="mx-auto flex max-w-2xl flex-col gap-4">
                  <div className="flex items-center justify-between gap-4">
                    <h2 className="text-lg font-semibold" style={{ color: theme.ink }}>
                      {label}
                    </h2>
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      aria-label="Close"
                      className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border text-lg"
                      style={{ borderColor: theme.accent, color: theme.ink }}
                    >
                      ×
                    </button>
                  </div>
                  {cards}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Display labels for schema roles in the rail circle. Honest: the role. */
const RAIL_ROLE_LABELS: Record<string, string> = {
  business: "Business",
  service: "Service",
  product: "Product",
  location: "Location",
  person: "Person",
  post: "Post",
  article: "Article",
};

/**
 * Honest PingObject -> ObjectView adapter for the rail featured object.
 *
 * Only fields the read model actually carries are mapped; everything else
 * stays empty/null rather than invented. Capabilities are intentionally
 * empty: the /o/ node route serves site slugs only, so view/ask would be
 * dead links on a non-owner object. The ObjectCircle still renders its
 * inline reference, hover preview, and dialog from name/category/media/
 * provenance, which are all real.
 */
export function pingObjectToView(o: PingObject): ObjectView {
  const ref = o.provenance?.ref ?? "website-ingestion";
  const role = schemaRole(o.schema);
  return {
    id: o.id,
    schema: o.schema,
    name: o.title,
    category: role ? (RAIL_ROLE_LABELS[role] ?? "Object") : "Object",
    locationLabel: null,
    summary: boundRailDescription(o),
    media: [],
    services: [],
    serviceArea: [],
    contact: {
      phone: null,
      email: null,
      website: null,
      locality: null,
      addressVisibility: "hidden",
    },
    capabilities: [],
    provenance: {
      kind: o.provenance?.kind ?? "website-derived",
      ref,
      derivedAt: o.provenance?.derivedAt ?? "",
      label: "Observed on " + ref.replace(/^website-ingestion:/, ""),
    },
    ownerUpdatedAt: null,
    sampleQuestions: [],
    fieldCorrections: [],
  };
}

/**
 * Evidence-richness score for featured-object selection.
 *
 * Deterministic and monotone in observable evidence: description words
 * weigh most (customer-meaningful prose), then populated field count,
 * then a small bonus for a recorded provenance ref. No randomness, no
 * wall clock, no network.
 */
export function evidenceScore(o: PingObject): number {
  const words = (o.description ?? "").trim().split(/\s+/).filter(Boolean).length;
  const fields = Object.values(o.fields ?? {}).filter((v) =>
    typeof v === "string"
      ? v.trim().length > 0
      : Array.isArray(v)
        ? v.length > 0
        : v !== null && v !== undefined,
  ).length;
  return words * 4 + fields * 3 + (o.provenance?.ref ? 5 : 0);
}

/**
 * The single richest public non-owner object. Id-sorted before scoring so
 * ties deterministically keep the lowest id. Null when the graph has no
 * public non-owner object. The golden route features exactly this object
 * in the margin: one real object, pulled clearly out of the page.
 */
export function richestObject(
  objects: PingObject[],
  ownerId: string | null,
): PingObject | null {
  const cands = objects
    .filter((o) => o.visibility === "public" && o.id !== ownerId)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  let best: PingObject | null = null;
  let bestScore = -Infinity;
  for (const o of cands) {
    const score = evidenceScore(o);
    if (score > bestScore) {
      bestScore = score;
      best = o;
    }
  }
  return best;
}
