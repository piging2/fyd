/**
 * Lane D: the PRESENTATION INTENT apply layer.
 *
 * Approved directives are applied OVER the compiled SiteSpec at render
 * time, in journal (event) order. The layer is pure: it returns a new
 * spec, never mutates its input, and never touches the object graph
 * (FACTS) or the theme tokens (DESIGN SYSTEM).
 *
 * Source-refresh semantics (exact):
 *  1. Directives are journaled separately from the base graph. A source
 *     re-observation rebuilds the base; the journal replays on top, so a
 *     re-observation never deletes an owner directive.
 *  2. Every directive's targets are resolved against the CURRENT compiled
 *     spec before applying. A directive whose section, page, or object
 *     no longer exists is NOT applied and is NOT dropped: it lands in
 *     `unresolved` with the reason, surfaced to the owner. Missing
 *     evidence never becomes a silent no-op.
 *  3. Section ids are position-derived ("home:Services:2"), so after a
 *     move they shift. Resolution first tries the stored section id, then
 *     falls back to a unique component-name match within the page. An
 *     ambiguous or absent match is unresolved, never guessed.
 *  4. Applying the same journal twice is idempotent: reorder to an index
 *     the section already occupies, hide an already-hidden section, and
 *     feature an already-featured object are all no-ops. Deactivating an
 *     already-deactivated object rewrites the same hidden set, also a
 *     no-op.
 */

import {
  applySitePatch,
  proposalDigest,
  type SitePatchBody,
} from "../proceduralize/patch";
import type { FYDSiteSpec, ObjectGraph } from "../sitespec/types";
import type {
  PresentationIntentBlock,
  PresentationIntentDirective,
} from "./types";

export interface AppliedDirective {
  intentId: string;
  summary: string;
}

export interface UnresolvedDirective {
  intentId: string;
  reason: string;
}

export interface LayerResult {
  spec: FYDSiteSpec;
  applied: AppliedDirective[];
  unresolved: UnresolvedDirective[];
}

function digestOfProposalBody(proposal: SitePatchBody): string {
  const { proposalDigest: _drop, ...body } = proposal;
  return proposalDigest(body);
}

function summarize(d: PresentationIntentDirective): string {
  const si = d.siteIntent;
  switch (si.kind) {
    case "reorder_section":
      return "move section " + si.sectionId + " to index " + si.toIndex + " on " + si.pageSlug;
    case "toggle_section":
      return (si.hidden ? "hide " : "show ") + "section " + si.sectionId;
    case "set_featured":
      return "feature [" + si.objectIds.join(", ") + "] in " + si.sectionId;
    case "reorder_object":
      return "order objects [" + si.objectIds.join(", ") + "] in " + si.sectionId;
    case "deactivate_object":
      return "hide object " + si.objectId + " in " + si.sectionId;
    case "edit_copy":
      return "copy edit on " + si.sectionId;
    case "set_theme_token":
      return "theme token " + String(si.token);
  }
}

/**
 * Resolve the directive's target section in the current spec. Tries the
 * stored section id first, then a unique component-name match within the
 * page (ids are position-derived and shift after moves). Returns null
 * when the target cannot be pinned down exactly.
 */
function resolveSection(
  spec: FYDSiteSpec,
  pageSlug: string,
  sectionId: string,
): { pageSlug: string; sectionId: string; component: string } | null {
  const page = spec.pages.find((p) => p.slug === pageSlug);
  if (!page) return null;
  const byId = page.sections.find((s) => s.id === sectionId);
  if (byId) return { pageSlug, sectionId: byId.id, component: byId.component };
  const component = sectionId.split(":")[1] ?? "";
  if (!component) return null;
  const matches = page.sections.filter(
    (s) => s.component.toLowerCase() === component.toLowerCase(),
  );
  if (matches.length === 1) {
    return { pageSlug, sectionId: matches[0].id, component: matches[0].component };
  }
  return null;
}

export function applyPresentationIntent(
  spec: FYDSiteSpec,
  block: PresentationIntentBlock | null | undefined,
  graph: ObjectGraph,
): LayerResult {
  let current: FYDSiteSpec = JSON.parse(JSON.stringify(spec));
  const applied: AppliedDirective[] = [];
  const unresolved: UnresolvedDirective[] = [];
  if (!block || block.directives.length === 0) {
    return { spec: current, applied, unresolved };
  }

  const objectIds = new Set(graph.objects.map((o) => o.id));

  for (const d of block.directives) {
    const nope = (reason: string) =>
      unresolved.push({ intentId: d.intentId, reason });
    // 1. The stored proposal must still verify against its own digest.
    //    A tampered or corrupted directive never applies.
    if (
      !d.proposal ||
      typeof d.proposal.proposalDigest !== "string" ||
      digestOfProposalBody(d.proposal) !== d.proposal.proposalDigest
    ) {
      nope("proposal digest does not verify; directive not applied.");
      continue;
    }
    // 2. Design-system changes are not presentation intent. The siteIntent
    //    check comes first so the section-kind narrowing below is sound.
    const si = d.siteIntent;
    if (si.kind === "set_theme_token") {
      nope(
        "directive targets the design system (theme tokens), which is not " +
          "customizable through the presentation-intent layer.",
      );
      continue;
    }
    if (d.proposal.component === "theme") {
      nope(
        "proposal targets the design system (theme), which is not " +
          "customizable through the presentation-intent layer.",
      );
      continue;
    }
    // 3. Resolve the target section in the CURRENT spec.
    const pageSlug = si.pageSlug;
    const sectionId = si.sectionId;
    const target = resolveSection(current, pageSlug, sectionId);
    if (!target) {
      nope(
        "target section \"" + sectionId + "\" on page \"" + pageSlug +
          "\" no longer exists in the current spec (source may have changed); " +
          "directive kept, not applied, not dropped.",
      );
      continue;
    }
    // 4. Per-kind validation against current state.
    if (si.kind === "reorder_section") {
      const page = current.pages.find((p) => p.slug === target.pageSlug)!;
      if (si.toIndex < 0 || si.toIndex >= page.sections.length) {
        nope(
          "target index " + si.toIndex + " is out of range for page \"" +
            target.pageSlug + "\" (" + page.sections.length + " sections).",
        );
        continue;
      }
    }
    if (
      si.kind === "set_featured" ||
      si.kind === "reorder_object" ||
      si.kind === "deactivate_object"
    ) {
      const ids =
        si.kind === "deactivate_object" ? [si.objectId] : si.objectIds;
      const missing = ids.filter((id) => !objectIds.has(id));
      if (missing.length > 0) {
        nope(
          "objects [" + missing.join(", ") + "] are no longer in the site's " +
            "evidence; directive kept, not applied, not dropped.",
        );
        continue;
      }
    }
    // 5. Apply the exact approved proposal. Pure: returns a new spec.
    //    Rewrite the proposal's targetSection to the resolved id so a
    //    position-shifted section still applies to the right section.
    const proposalForApply: SitePatchBody = {
      ...d.proposal,
      targetSection: target.sectionId,
      targetPage: target.pageSlug,
    };
    const after = applySitePatch(current, proposalForApply);
    current = after;
    applied.push({ intentId: d.intentId, summary: summarize(d) });
  }

  return { spec: current, applied, unresolved };
}
