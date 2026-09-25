/**
 * Lane D: resolved intent -> digest-bound site_patch proposal.
 *
 * Reuses the existing structured-editor machinery
 * (src/fyd/proceduralize/patch.ts): the same SiteIntent type, the same
 * proposeSitePatch, the same digest algorithm. This lane adds the
 * plain-English front door and the honest no-op refusals; it does not
 * fork the proposal format.
 *
 * The proposal binds the exact spec digest it was drafted against. Apply
 * re-verifies that digest against the live spec: a stale proposal is a
 * 409, never a silent apply.
 */

import { canonicalize } from "@/lib/ping/ask-composer";
import { createHash } from "node:crypto";
import {
  proposeSitePatch,
  type SiteIntent,
  type SitePatchBody,
} from "../proceduralize/patch";
import { applyObjectOrder, resolveQuery } from "../components/renderer";
import type { FYDSiteSpec, ObjectGraph } from "../sitespec/types";

export interface ReviewCard {
  title: string;
  before: string[];
  after: string[];
  operationCount: number;
}

export type ProposeOutcome =
  | { ok: true; proposal: SitePatchBody; reviewCard: ReviewCard; specDigest: string }
  | { ok: false; error: string };

/** Digest of the exact spec a proposal was drafted against. */
export function specDigestOf(spec: FYDSiteSpec): string {
  return createHash("sha256").update(canonicalize(spec), "utf8").digest("hex");
}

function describeMove(spec: FYDSiteSpec, intent: SiteIntent): { before: string[]; after: string[] } | null {
  if (intent.kind !== "reorder_section") return null;
  const page = spec.pages.find((p) => p.slug === intent.pageSlug);
  if (!page) return null;
  const idx = page.sections.findIndex((s) => s.id === intent.sectionId);
  if (idx === -1) return null;
  const names = page.sections.map((s) => s.component + " (" + s.id + ")");
  const after = [...names];
  const [moved] = after.splice(idx, 1);
  after.splice(intent.toIndex, 0, moved);
  return { before: names, after };
}

function describeToggle(spec: FYDSiteSpec, intent: SiteIntent): { before: string[]; after: string[] } | null {
  if (intent.kind !== "toggle_section") return null;
  const sec = spec.pages
    .find((p) => p.slug === intent.pageSlug)
    ?.sections.find((s) => s.id === intent.sectionId);
  if (!sec) return null;
  const cur = sec.presentation.hidden === true ? "hidden" : "visible";
  const next = intent.hidden ? "hidden" : "visible";
  return {
    before: ["Section " + sec.component + " (" + sec.id + "): " + cur],
    after: ["Section " + sec.component + " (" + sec.id + "): " + next],
  };
}

function describeFeatured(spec: FYDSiteSpec, intent: SiteIntent): { before: string[]; after: string[] } | null {
  if (intent.kind !== "set_featured") return null;
  const sec = spec.pages
    .find((p) => p.slug === intent.pageSlug)
    ?.sections.find((s) => s.id === intent.sectionId);
  if (!sec) return null;
  const cur = Array.isArray(sec.presentation.featuredIds) ? sec.presentation.featuredIds : [];
  return {
    before: ["Featured in " + sec.component + ": " + (cur.join(", ") || "(none)")],
    after: ["Featured in " + sec.component + ": " + intent.objectIds.join(", ")],
  };
}

function describeObjectOrder(
  spec: FYDSiteSpec,
  intent: Extract<SiteIntent, { kind: "reorder_object" }>,
  graph: ObjectGraph | undefined,
): { before: string[]; after: string[]; noOp: boolean } | null {
  const sec = spec.pages
    .find((p) => p.slug === intent.pageSlug)
    ?.sections.find((s) => s.id === intent.sectionId);
  if (!sec) return null;
  const afterIds = [...new Set(intent.objectIds)];
  const titleOf = (id: string) =>
    graph?.objects.find((o) => o.id === id)?.title ?? id;
  const name = (ids: string[]) =>
    ids.map(titleOf).join(", ") || "(query order)";
  let beforeIds: string[];
  if (graph) {
    beforeIds = applyObjectOrder(
      resolveQuery(sec.query, graph, spec.ownerObjectId),
      sec.presentation.objectOrder,
    ).map((o) => o.id);
  } else {
    beforeIds = sec.presentation.objectOrder
      ? [...sec.presentation.objectOrder]
      : [];
  }
  return {
    before: ["Objects in " + sec.component + ": " + name(beforeIds)],
    after: ["Objects in " + sec.component + ": " + name(afterIds)],
    noOp: beforeIds.join("|") === afterIds.join("|"),
  };
}

function describeDeactivated(
  spec: FYDSiteSpec,
  intent: Extract<SiteIntent, { kind: "deactivate_object" }>,
  graph: ObjectGraph | undefined,
): { before: string[]; after: string[]; noOp: boolean } | null {
  const sec = spec.pages
    .find((p) => p.slug === intent.pageSlug)
    ?.sections.find((s) => s.id === intent.sectionId);
  if (!sec) return null;
  const title =
    graph?.objects.find((o) => o.id === intent.objectId)?.title ??
    intent.objectId;
  const cur = Array.isArray(sec.presentation.hiddenObjectIds)
    ? sec.presentation.hiddenObjectIds
    : [];
  return {
    before: ["Object \"" + title + "\" in " + sec.component + ": visible"],
    after: ["Object \"" + title + "\" in " + sec.component + ": hidden"],
    noOp: cur.includes(intent.objectId),
  };
}

/**
 * Pure before/after review card for a site intent against a spec snapshot.
 * This is the exact card the owner reviews at propose time; the apply layer
 * and the inspect read-back reuse it so "what changed" is always derived
 * from the same describers, never reworded.
 *
 * Returns null when the target section is missing or the kind has no
 * presentation card (edit_copy, set_theme_token). Never refuses no-ops: the
 * card of an already-satisfied intent shows identical before/after, which is
 * the honest replay evidence.
 *
 * graph is optional: when provided, cards resolve object titles and the
 * current object order comes from the live query; without it the card falls
 * back to ids and any stored objectOrder.
 */
export function reviewCardForSiteIntent(
  spec: FYDSiteSpec,
  siteIntent: SiteIntent,
  graph?: ObjectGraph,
): ReviewCard | null {
  switch (siteIntent.kind) {
    case "reorder_section": {
      const order = describeMove(spec, siteIntent);
      if (!order) return null;
      // proposeSitePatch sets propsDiff.moveTo = intent.toIndex, so the
      // title matches the proposal-time card exactly.
      return {
        title: "Move section to position " + siteIntent.toIndex,
        before: ["Page order: " + order.before.join(" | ")],
        after: ["Page order: " + order.after.join(" | ")],
        operationCount: 1,
      };
    }
    case "toggle_section": {
      const t = describeToggle(spec, siteIntent);
      if (!t) return null;
      return {
        title: siteIntent.hidden ? "Hide section" : "Show section",
        before: t.before,
        after: t.after,
        operationCount: 1,
      };
    }
    case "set_featured": {
      const t = describeFeatured(spec, siteIntent);
      if (!t) return null;
      return {
        title: "Feature object",
        before: t.before,
        after: t.after,
        operationCount: 1,
      };
    }
    case "reorder_object": {
      const t = describeObjectOrder(spec, siteIntent, graph);
      if (!t) return null;
      return {
        title: "Reorder objects within section",
        before: t.before,
        after: t.after,
        operationCount: 1,
      };
    }
    case "deactivate_object": {
      const t = describeDeactivated(spec, siteIntent, graph);
      if (!t) return null;
      return {
        title: "Hide object",
        before: t.before,
        after: t.after,
        operationCount: 1,
      };
    }
    default:
      return null;
  }
}

/**
 * Draft the digest-bound proposal for a resolved intent. Refuses honestly
 * on no-ops (already first, already hidden, already featured, already
 * ordered, already deactivated) instead of producing an empty proposal.
 *
 * graph is optional: when provided, review cards resolve object titles and
 * the current object order comes from the live query; without it the card
 * falls back to ids and any stored objectOrder.
 */
export function proposeFromSiteIntent(
  spec: FYDSiteSpec,
  siteIntent: SiteIntent,
  graph?: ObjectGraph,
): ProposeOutcome {
  const specDigest = specDigestOf(spec);
  const drafted = proposeSitePatch(spec, siteIntent);
  if (!drafted.ok || !drafted.proposal) {
    return { ok: false, error: drafted.error ?? "Could not draft a proposal." };
  }
  const proposal = drafted.proposal;

  // Honest no-op refusals. The card itself comes from
  // reviewCardForSiteIntent below so propose-time and read-back cards are
  // the same object shape from the same describers.
  if (siteIntent.kind === "reorder_section") {
    const diff = proposal.propsDiff as { moveFrom?: number; moveTo?: number };
    if (diff.moveFrom === diff.moveTo) {
      const page = spec.pages.find((p) => p.slug === siteIntent.pageSlug);
      const sec = page?.sections.find((s) => s.id === siteIntent.sectionId);
      return {
        ok: false,
        error:
          "The " + (sec?.component ?? "section") + " section is already " +
          (diff.moveTo === 0 ? "first" : "at position " + diff.moveTo) +
          ", so there is nothing to change.",
      };
    }
  } else if (siteIntent.kind === "toggle_section") {
    const sec = spec.pages
      .find((p) => p.slug === siteIntent.pageSlug)
      ?.sections.find((s) => s.id === siteIntent.sectionId);
    const already = (sec?.presentation.hidden === true) === siteIntent.hidden;
    if (already) {
      return {
        ok: false,
        error:
          "The " + (sec?.component ?? "section") + " section is already " +
          (siteIntent.hidden ? "hidden" : "visible") + ", so there is nothing to change.",
      };
    }
  } else if (siteIntent.kind === "set_featured") {
    const sec = spec.pages
      .find((p) => p.slug === siteIntent.pageSlug)
      ?.sections.find((s) => s.id === siteIntent.sectionId);
    const cur = Array.isArray(sec?.presentation.featuredIds)
      ? [...(sec.presentation.featuredIds as string[])].sort()
      : [];
    const next = [...siteIntent.objectIds].sort();
    if (cur.join("|") === next.join("|")) {
      return { ok: false, error: "That object is already featured, so there is nothing to change." };
    }
  } else if (siteIntent.kind === "reorder_object") {
    const t = describeObjectOrder(spec, siteIntent, graph);
    if (!t) return { ok: false, error: "Section not found in this spec." };
    if (t.noOp) {
      return {
        ok: false,
        error:
          "The objects are already in that order, so there is nothing to change.",
      };
    }
  } else if (siteIntent.kind === "deactivate_object") {
    const t = describeDeactivated(spec, siteIntent, graph);
    if (!t) return { ok: false, error: "Section not found in this spec." };
    if (t.noOp) {
      return {
        ok: false,
        error:
          "That object is already hidden, so there is nothing to change.",
      };
    }
  } else {
    return {
      ok: false,
      error:
        "Intent kind \"" + (siteIntent as SiteIntent).kind +
        "\" is not appliable through the presentation-intent layer.",
    };
  }

  const card = reviewCardForSiteIntent(spec, siteIntent, graph);
  if (!card) return { ok: false, error: "Section not found in this spec." };
  return { ok: true, proposal, reviewCard: card, specDigest };
}
