/**
 * PresentationSpec: the seam between OBJECT DATA and OBJECT PRESENTATION.
 *
 * Conceptually:
 *   Object + ViewerContext + SurfaceContext + ViewportCapabilities +
 *   AvailableCapabilities + EvidenceSummary -> PresentationSpec ->
 *   Circle, Peek, Card, Page, Sheet, FeedItem, AgentContext.
 *
 * ViewportCapabilities rides inside SurfaceContext (one object, one
 * seam). AvailableCapabilities and EvidenceSummary ride inside the
 * object projection: capabilities gate the actions, the projection's
 * provenance becomes the evidence summary. Nothing is invented.
 *
 * This module owns the DATA -> SPEC direction only. It is pure,
 * deterministic, and renders nothing. Every FYD surface (glyph, peek,
 * workspace, card, page, feed item) consumes the same spec, so one
 * object behaves one way everywhere. No business-object behavior is
 * hardcoded here or in any consumer: actions derive from capabilities,
 * suggestions from kind labels, contact from ContactMethod values.
 */

import type {
  ContactMethod,
  Fact,
  ObjectProjection,
  RelatedRef,
} from "@/fyd/object/object-projection";
import type { ViewportCapabilities } from "./viewport";
import { resolveObjectPresentationIdentity, type ObjectPresentationIdentity } from "../../presentation/identity";

export type ViewerRole = "visitor" | "owner-demo";

export interface ViewerContext {
  /**
   * Visitor gets Ask, Contact, Website, Follow, Like where appropriate.
   * Owner-demo is an explicitly labeled DEMO/DEV capability injection
   * (Customize, Correct, Hide, Evidence, Visibility, Regenerate):
   * impossible to mistake for production security. Never an auth
   * platform.
   */
  role: ViewerRole;
}

export type SurfaceKind =
  | "glyph"
  | "peek"
  | "workspace"
  | "card"
  | "page"
  | "sheet"
  | "feed";

export interface SurfaceContext {
  surface: SurfaceKind;
  /**
   * What the rendering viewport can do (width class, pointer, hover,
   * reduced motion, color scheme, safe-area insets, device class).
   * ONE semantic spec: mobile is another composition of the same
   * objects, and this is how the seam adapts without forking.
   */
  viewport: ViewportCapabilities;
}

/**
 * Information density for this surface + viewport. Compact (xs/sm
 * viewports: phones) budgets fewer actions and suggestions than
 * comfortable. Same object, different window.
 */
export type SpecDensity = "compact" | "comfortable";

/**
 * Pure: viewport -> density. xs/sm (under 600px) is compact; md and up
 * is comfortable. Deterministic, pinned by test.
 */
export function densityFor(viewport: ViewportCapabilities): SpecDensity {
  return viewport.widthClass === "xs" || viewport.widthClass === "sm"
    ? "compact"
    : "comfortable";
}

/** Pure: how many peek actions the density allows (after Ask FYD). */
export function peekActionBudgetFor(density: SpecDensity): number {
  return density === "compact" ? 3 : 4;
}

/** Pure: how many ask suggestions the density allows. */
export function suggestionBudgetFor(density: SpecDensity): number {
  return density === "compact" ? 2 : 3;
}

export type SpecActionKind =
  | "ask"
  | "website"
  | "contact"
  | "follow"
  | "like"
  | "customize"
  | "correct"
  | "hide"
  | "evidence"
  | "visibility"
  | "regenerate";

export interface SpecAction {
  kind: SpecActionKind;
  label: string;
  /** External href when the action navigates (website). */
  href?: string;
  /** Owner-demo only. Rendered with the DEMO badge. */
  demo?: boolean;
}

export interface EvidenceSummary {
  state: string;
  receipt?: string;
  asOf?: string;
}

export interface PresentationSpec {
  objectId: string;
  name: string;
  /** Display-only identity; carries no business ownership or sponsorship authority. */
  identity?: ObjectPresentationIdentity;
  kindLabel: string | null;
  /** One sentence, roughly 80-140 chars, content-budgeted by callers. */
  shortDescription: string;
  /**
   * Capability-derived, priority-ordered: ask, website, contact,
   * follow, like, then owner-demo actions. Peek renders the first
   * 2-4 visitor actions; workspace renders all (+ owner tab).
   */
  actions: SpecAction[];
  /** Ask suggestions, max 3, generated from the kind label. */
  suggestions: string[];
  contactMethods: ContactMethod[];
  evidence: EvidenceSummary | null;
  /** True when viewer.role is owner-demo: surfaces render the DEMO badge. */
  ownerDemo: boolean;
  /**
   * Key facts with per-fact evidence (workspace Evidence tab). Rendered
   * through the ProvenanceLine grammar: claim -> compact line -> expand.
   */
  facts: Fact[];
  /**
   * Real related objects: people + services + location, deduped by id,
   * owner order preserved (workspace Related tab).
   */
  related: RelatedRef[];
  /**
   * Information density for this surface + viewport: compact on phones
   * (fewer actions, fewer suggestions), comfortable elsewhere. Same
   * object, different window; never a forked spec.
   */
  density: SpecDensity;
}

export interface SpecInput {
  projection: ObjectProjection | null;
  descriptor: {
    objectId: string;
    name: string;
    websiteUrl?: string | null;
  };
  viewer: ViewerContext;
  surface: SurfaceContext;
}

/**
 * Pure: build the spec. Deterministic for identical inputs. Never
 * invents actions: a capability exists only when the underlying value
 * exists (projection contract). No fake buttons.
 */
export function buildPresentationSpec(input: SpecInput): PresentationSpec {
  const { projection, descriptor, viewer, surface } = input;
  const caps = projection?.capabilities ?? [];
  const has = (kind: string): boolean => caps.some((c) => c.kind === kind);
  const density = densityFor(surface.viewport);

  const websiteCap = caps.find(
    (c): c is { kind: "website"; href: string; label: string } =>
      c.kind === "website",
  );
  const websiteHref = websiteCap?.href ?? descriptor.websiteUrl ?? undefined;

  const actions: SpecAction[] = [];
  // Priority: [Ask FYD], then Website, Contact, then Follow, Like.
  if (has("ask")) actions.push({ kind: "ask", label: "Ask FYD" });
  if (websiteHref)
    actions.push({ kind: "website", label: "Website", href: websiteHref });
  const contactMethods = projection?.contactMethods ?? [];
  if (contactMethods.length > 0)
    actions.push({ kind: "contact", label: "Contact" });
  if (has("follow")) actions.push({ kind: "follow", label: "Follow" });
  if (has("like")) actions.push({ kind: "like", label: "Like" });

  const ownerDemo = viewer.role === "owner-demo";
  if (ownerDemo) {
    for (const [kind, label] of [
      ["customize", "Customize"],
      ["correct", "Correct"],
      ["hide", "Hide"],
      ["evidence", "Evidence"],
      ["visibility", "Visibility"],
      ["regenerate", "Regenerate"],
    ] as Array<[SpecActionKind, string]>) {
      actions.push({ kind, label, demo: true });
    }
  }

  const kindLabel = projection?.kindLabel ?? null;
  // The projection's evidence-backed sampleQuestions win when present;
  // the kind-generated variants are the deterministic fallback.
  const sampleQs = (projection?.sampleQuestions ?? []).filter(
    (q) => q.trim().length > 0,
  );
  const suggestions = (sampleQs.length > 0 ? sampleQs : suggestionsFor(kindLabel)).slice(
    0,
    suggestionBudgetFor(density),
  );

  const facts = projection?.facts ?? [];
  const firstKnown = facts.find((f) => f.value && f.value.trim().length > 0);

  // Related: people + services + location, deduped by id, owner order
  // preserved. Real related objects only; never invented.
  const related: RelatedRef[] = [];
  const seen = new Set<string>();
  for (const r of [
    ...(projection?.people ?? []),
    ...(projection?.serviceRefs ?? []),
    ...(projection?.locationRef ? [projection.locationRef] : []),
  ]) {
    if (!seen.has(r.id)) {
      seen.add(r.id);
      related.push(r);
    }
  }

  return {
    objectId: descriptor.objectId,
    name: descriptor.name,
    identity: resolveObjectPresentationIdentity(projection ?? { id: descriptor.objectId, name: descriptor.name }),
    kindLabel,
    shortDescription: (firstKnown?.value ?? "").trim(),
    actions,
    suggestions,
    contactMethods,
    evidence:
      projection != null
        ? {
            state: "observed",
            receipt: projection.provenance.label,
            asOf: projection.provenance.derivedAt,
          }
        : null,
    ownerDemo,
    facts,
    related,
    density,
  };
}

/**
 * Pure: the peek's visible actions. Contextually valid actions within
 * the density budget: Ask FYD first, then Website, Contact, then
 * Follow, Like (compact: 3, comfortable: 4). Owner-demo actions never
 * appear in the peek; they live in the workspace owner tab behind the
 * DEMO badge.
 */
export function peekActionsFor(spec: PresentationSpec): SpecAction[] {
  const order: SpecActionKind[] = ["ask", "website", "contact", "follow", "like"];
  return order
    .map((kind) => spec.actions.find((a) => a.kind === kind))
    .filter((a): a is SpecAction => !!a)
    .slice(0, peekActionBudgetFor(spec.density));
}

/**
 * Pure: suggested Ask FYD questions generated from the object type.
 * Fixed variants per kind; never invented per object. The projection's
 * evidence-backed sampleQuestions win when present (callers prefer
 * those); this is the deterministic fallback.
 */
export function suggestionsFor(kindLabel: string | null | undefined): string[] {
  const kind = (kindLabel ?? "").toLowerCase();
  if (/product/.test(kind))
    return [
      "What does this product do?",
      "How much does it cost?",
      "Where can I get it?",
    ];
  if (/person/.test(kind))
    return [
      "What do they do?",
      "How do I contact them?",
      "Where are they based?",
    ];
  if (/service/.test(kind))
    return [
      "What does this service include?",
      "Where is it available?",
      "How do I book it?",
    ];
  return [
    "What services do they offer?",
    "Where do they work?",
    "How do I contact them?",
  ];
}
