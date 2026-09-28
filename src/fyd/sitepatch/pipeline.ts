/**
 * TRACK C (website builder harvest), 2026-09-28.
 * The typed SitePatch pipeline:
 *
 *   PATCH -> VALIDATE -> CAPABILITY -> PREVIEW -> APPROVAL -> EVENT -> NEW SPEC VERSION
 *
 * PATCH      the op is already typed data (SitePatchOp). Natural language
 *            compiles to it upstream (src/fyd/customize/intent.ts for the
 *            classic intents; the new kinds compile here).
 * VALIDATE   structural checks against the live spec. Failures are typed
 *            errors; nothing proceeds.
 * CAPABILITY the owner-mode capability verdict. Deny-by-default; the
 *            frozen Lane D layer law refuses SET_DESIGN_TOKEN and any
 *            fact-touching op. Refusal is a verdict, never a silent skip.
 * PREVIEW    before/after review card computed from a pure apply on a
 *            spec copy. The owner reviews exactly this.
 * APPROVAL   the proposal is emitted through the approval seam
 *            (./approval-seam.ts) in the exact Phase 1 OwnerProposal
 *            shape. The decision belongs to the Phase 1 gate; this stage
 *            returns the pending proposal. A decide() helper mirrors the
 *            gate's exact-digest verification for tests and for the
 *            demo-owner console.
 * EVENT      on APPROVE, a FYD_SITE_OVERLAY-compatible set_presentation_intent
 *            op carrying the proposal and its approval lineage. Reuses the
 *            existing overlay op shape (src/fyd/customize/types.ts); it does
 *            not invent a second event system.
 * NEW SPEC   VERSION the approved proposal applied to a spec copy. Covered
 *            kinds delegate to applySitePatch; the five new kinds
 *            (ADD_SECTION, REMOVE_SECTION, ADD_PAGE, REMOVE_PAGE,
 *            CHANGE_QUERY) apply through applyExtendedSitePatch, a pure
 *            additive extension. Binding the new kinds into the canonical
 *            apply-layer is documented Phase-2 work.
 *
 * Pure except for the injectable clock. Browser-safe (no node:crypto;
 * sha256 comes from src/fyd/proceduralize/sha256).
 *
 * No em dashes in user-facing strings (standing rule).
 */

import { opMappingOf, type SitePatchOp } from "./types";
import {
  emitGateProposal,
  verifyGateDecision,
  type SeamApprovalVerdict,
  type SeamOwnerProposal,
} from "./approval-seam";
import {
  applySitePatch,
  proposeSitePatch,
  proposalDigest,
  type SiteIntent,
  type SitePatchBody,
} from "../proceduralize/patch";
import { sha256Hex } from "../proceduralize/sha256";
import { canonicalize } from "@/lib/ping/ask-composer";
import type {
  FYDSiteSpec,
  FYDPage,
  FYDSection,
  FYDQuery,
} from "../sitespec/types";
import type { SetPresentationIntentOp } from "../customize/types";

/** The seeded demo actor id (mirrors owner-mode DEMO_OWNER_LABEL). */
export const TRACKC_DEMO_OWNER = "demo-owner";

export interface PipelineContext {
  siteId: string;
  tenantId: string;
  actorId: string;
  /** The site object the patch targets (business/root object id). */
  targetObjectId: string;
  /** Evidence link for the gate proposal (e.g. the served site path). */
  evidenceLink: string;
  /** ISO-8601 UTC; inject for determinism. */
  nowIso?: string;
  /**
   * Optional owner decision for the demo/test path: the verdict plus the
   * digest the decider presented. In production the decision arrives from
   * the Phase 1 gate; this path mirrors its exact-digest verification.
   */
  decide?: { verdict: SeamApprovalVerdict; presentedDigest: string };
}

export interface PreviewCard {
  title: string;
  before: string[];
  after: string[];
}

export interface StagedSitePatch {
  op: SitePatchOp;
  validation: { ok: true } | { ok: false; errors: string[] };
  capability: { allowed: boolean; capability: string; reason: string };
  preview: PreviewCard | null;
  /** Digest-bound overlay proposal (null until VALIDATE passes). */
  overlayProposal: SitePatchBody | null;
  /** Phase-1-shaped record emitted for the gate (null until CAPABILITY allows). */
  gateProposal: SeamOwnerProposal | null;
  /** Set when ctx.decide is provided. */
  decision: { ok: true; status: "APPROVED" | "DENIED" } | { ok: false; error: string } | null;
  /** FYD_SITE_OVERLAY-compatible event (only on APPROVE). */
  event: SetPresentationIntentOp | null;
  /** The new spec version (only on APPROVE). */
  newSpec: FYDSiteSpec | null;
  /** sha256-canonical-json-v1 digest of the input spec. */
  specDigest: string;
  /** Digest of newSpec (null unless applied). */
  newSpecDigest: string | null;
}

// ---------------------------------------------------------------------------
// VALIDATE
// ---------------------------------------------------------------------------

const QUERY_KINDS = new Set(["owner", "related", "all", "reference", "static"]);

function isFYDQuery(q: unknown): q is FYDQuery {
  if (typeof q !== "object" || q === null) return false;
  const kind = (q as { kind?: unknown }).kind;
  return typeof kind === "string" && QUERY_KINDS.has(kind);
}

function findPage(spec: FYDSiteSpec, slug: string): FYDPage | undefined {
  return spec.pages.find((p) => p.slug === slug);
}

function findSection(page: FYDPage, sectionId: string): FYDSection | undefined {
  return page.sections.find((s) => s.id === sectionId);
}

/** Structural validation of a typed op against the live spec. */
export function validateSitePatchOp(spec: FYDSiteSpec, op: SitePatchOp): string[] {
  const errors: string[] = [];
  const needPage = (slug: string): FYDPage | undefined => {
    const page = findPage(spec, slug);
    if (!page) errors.push("Page '" + slug + "' does not exist in this spec.");
    return page;
  };
  const needSection = (page: FYDPage | undefined, sectionId: string): FYDSection | undefined => {
    if (!page) return undefined;
    const sec = findSection(page, sectionId);
    if (!sec) errors.push("Section '" + sectionId + "' does not exist on page '" + page.slug + "'.");
    return sec;
  };

  switch (op.kind) {
    case "MOVE_SECTION": {
      const page = needPage(op.pageSlug);
      const sec = needSection(page, op.sectionId);
      if (page && sec && (op.toIndex < 0 || op.toIndex >= page.sections.length)) {
        errors.push("Target index " + op.toIndex + " is out of range (0.." + (page.sections.length - 1) + ").");
      }
      break;
    }
    case "ADD_SECTION": {
      const page = needPage(op.pageSlug);
      if (page) {
        if (!op.component || op.component.trim() === "") errors.push("ADD_SECTION needs a component name.");
        if (!isFYDQuery(op.query)) errors.push("ADD_SECTION needs a valid section query.");
        if (op.atIndex !== undefined && (op.atIndex < 0 || op.atIndex > page.sections.length)) {
          errors.push("Insert index " + op.atIndex + " is out of range (0.." + page.sections.length + ").");
        }
      }
      break;
    }
    case "REMOVE_SECTION": {
      const page = needPage(op.pageSlug);
      const sec = needSection(page, op.sectionId);
      if (page && sec && page.sections.length <= 1) {
        errors.push("Cannot remove the last section of page '" + page.slug + "'.");
      }
      break;
    }
    case "SET_VISIBILITY": {
      const page = needPage(op.pageSlug);
      needSection(page, op.sectionId);
      break;
    }
    case "SET_FEATURED_OBJECT": {
      const page = needPage(op.pageSlug);
      needSection(page, op.sectionId);
      if (!Array.isArray(op.objectIds) || op.objectIds.length === 0) {
        errors.push("SET_FEATURED_OBJECT needs at least one object id.");
      } else if (op.objectIds.some((id) => typeof id !== "string" || id.trim() === "")) {
        errors.push("SET_FEATURED_OBJECT object ids must be non-empty strings.");
      }
      break;
    }
    case "SET_DESIGN_TOKEN": {
      // Shape is validated so the refusal at CAPABILITY is about policy,
      // not about a malformed op.
      if (!op.token || op.token.trim() === "") errors.push("SET_DESIGN_TOKEN needs a token name.");
      if (typeof op.value !== "string" || op.value.trim() === "") {
        errors.push("SET_DESIGN_TOKEN needs a non-empty value.");
      }
      break;
    }
    case "SET_PRESENTATION_COPY": {
      const page = needPage(op.pageSlug);
      needSection(page, op.sectionId);
      if (op.heading === undefined && op.copy === undefined) {
        errors.push("SET_PRESENTATION_COPY needs a heading, copy, or both.");
      }
      break;
    }
    case "ADD_PAGE": {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(op.slug)) {
        errors.push("ADD_PAGE slug '" + op.slug + "' must be lowercase alphanumeric with hyphens.");
      }
      if (findPage(spec, op.slug)) errors.push("Page '" + op.slug + "' already exists.");
      if (!op.title || op.title.trim() === "") errors.push("ADD_PAGE needs a title.");
      if (!op.navLabel || op.navLabel.trim() === "") errors.push("ADD_PAGE needs a nav label.");
      break;
    }
    case "REMOVE_PAGE": {
      const page = needPage(op.slug);
      if (page) {
        if (spec.pages.length <= 1) errors.push("Cannot remove the last page of the site.");
        if (op.slug === "home") errors.push("Cannot remove the home page.");
      }
      break;
    }
    case "CHANGE_QUERY": {
      const page = needPage(op.pageSlug);
      needSection(page, op.sectionId);
      if (!isFYDQuery(op.query)) errors.push("CHANGE_QUERY needs a valid section query.");
      break;
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------
// CAPABILITY
// ---------------------------------------------------------------------------

/**
 * Capability verdict for an op. Deny-by-default; the demo actor holds the
 * controller relationship. The frozen Lane D layer law refuses
 * SET_DESIGN_TOKEN: the design system is not customizable through this
 * pipeline. Nothing here writes FACTS, so no fact capability is needed.
 */
export function capabilityForOp(
  op: SitePatchOp,
  actorId: string,
): { allowed: boolean; capability: string; reason: string } {
  if (actorId !== TRACKC_DEMO_OWNER) {
    return {
      allowed: false,
      capability: "owner.customize-approve",
      reason: "Actor '" + actorId + "' has no controller relationship to the site; only the demo owner may propose site patches.",
    };
  }
  const mapping = opMappingOf(op.kind);
  if (mapping.disposition === "REFUSE") {
    return {
      allowed: false,
      capability: "owner.customize-approve",
      reason: "Refused by policy: " + mapping.canonical + ". " + mapping.note,
    };
  }
  return {
    allowed: true,
    capability: "owner.customize-approve",
    reason: "demo: controller may propose site patches (" + op.kind + " -> " + mapping.canonical.split(" ")[0] + ").",
  };
}

// ---------------------------------------------------------------------------
// PROPOSE (overlay proposal for each op)
// ---------------------------------------------------------------------------

function siteIntentForOp(op: SitePatchOp): SiteIntent | null {
  switch (op.kind) {
    case "MOVE_SECTION":
      return { kind: "reorder_section", pageSlug: op.pageSlug, sectionId: op.sectionId, toIndex: op.toIndex };
    case "SET_VISIBILITY":
      return { kind: "toggle_section", pageSlug: op.pageSlug, sectionId: op.sectionId, hidden: op.hidden };
    case "SET_FEATURED_OBJECT":
      return { kind: "set_featured", pageSlug: op.pageSlug, sectionId: op.sectionId, objectIds: op.objectIds };
    case "SET_PRESENTATION_COPY":
      return { kind: "edit_copy", pageSlug: op.pageSlug, sectionId: op.sectionId, heading: op.heading, copy: op.copy };
    default:
      return null;
  }
}

function newOpProposalBody(op: SitePatchOp): Omit<SitePatchBody, "proposalDigest"> | null {
  switch (op.kind) {
    case "ADD_SECTION":
      return {
        kind: "site_patch",
        targetPage: op.pageSlug,
        targetSection: "",
        component: op.component,
        propsDiff: {
          addSection: {
            component: op.component,
            query: op.query,
            heading: op.heading,
            copy: op.copy,
            atIndex: op.atIndex,
          },
        },
        reason: "Add a section to the page (Track C extension).",
      };
    case "REMOVE_SECTION":
      return {
        kind: "site_patch",
        targetPage: op.pageSlug,
        targetSection: op.sectionId,
        component: "section",
        propsDiff: { removeSection: true },
        reason: "Remove a section from the page (Track C extension).",
      };
    case "ADD_PAGE":
      return {
        kind: "site_patch",
        targetPage: op.slug,
        targetSection: "",
        component: "page",
        propsDiff: { addPage: { slug: op.slug, title: op.title, navLabel: op.navLabel } },
        reason: "Add a page to the site (Track C extension).",
      };
    case "REMOVE_PAGE":
      return {
        kind: "site_patch",
        targetPage: op.slug,
        targetSection: "",
        component: "page",
        propsDiff: { removePage: true },
        reason: "Remove a page from the site (Track C extension).",
      };
    case "CHANGE_QUERY":
      return {
        kind: "site_patch",
        targetPage: op.pageSlug,
        targetSection: op.sectionId,
        component: "section",
        propsDiff: { query: op.query },
        reason: "Change how a section resolves its objects (Track C extension).",
      };
    default:
      return null;
  }
}

/**
 * Build the digest-bound overlay proposal for a validated op. Covered
 * kinds delegate to the canonical proposeSitePatch; the five new kinds
 * build the same SitePatchBody shape with the same digest algorithm.
 */
export function proposeForOp(
  spec: FYDSiteSpec,
  op: SitePatchOp,
): { ok: true; proposal: SitePatchBody } | { ok: false; error: string } {
  const intent = siteIntentForOp(op);
  if (intent) {
    const res = proposeSitePatch(spec, intent);
    if (!res.ok || !res.proposal) return { ok: false, error: res.error ?? "Proposal failed." };
    return { ok: true, proposal: res.proposal };
  }
  const body = newOpProposalBody(op);
  if (!body) return { ok: false, error: "Op kind '" + op.kind + "' has no proposal builder." };
  return { ok: true, proposal: { ...body, proposalDigest: proposalDigest(body) } };
}

// ---------------------------------------------------------------------------
// APPLY (extended, pure)
// ---------------------------------------------------------------------------

function rederiveSectionIds(page: FYDPage): void {
  page.sections.forEach((s, i) => {
    s.id = page.slug + ":" + s.component + ":" + i;
  });
}

/**
 * Pure apply of an approved overlay proposal to a spec copy. Covered
 * kinds delegate to the canonical applySitePatch; the five new kinds
 * apply here additively. Never mutates the input.
 */
export function applyExtendedSitePatch(spec: FYDSiteSpec, proposal: SitePatchBody): FYDSiteSpec {
  const diff = proposal.propsDiff;
  const hasExtended =
    diff["addSection"] !== undefined ||
    diff["removeSection"] === true ||
    diff["addPage"] !== undefined ||
    diff["removePage"] === true ||
    diff["query"] !== undefined;
  if (!hasExtended) return applySitePatch(spec, proposal);

  const next: FYDSiteSpec = JSON.parse(JSON.stringify(spec));
  if (diff["addPage"] !== undefined) {
    const p = diff["addPage"] as { slug: string; title: string; navLabel: string };
    if (!next.pages.some((pg) => pg.slug === p.slug)) {
      next.pages.push({ slug: p.slug, title: p.title, navLabel: p.navLabel, sections: [] });
      next.navigation.push({ label: p.navLabel, pageSlug: p.slug });
    }
    return next;
  }
  if (diff["removePage"] === true) {
    next.pages = next.pages.filter((pg) => pg.slug !== proposal.targetPage);
    next.navigation = next.navigation.filter((n) => n.pageSlug !== proposal.targetPage);
    return next;
  }
  const page = next.pages.find((pg) => pg.slug === proposal.targetPage);
  if (!page) return next;
  if (diff["addSection"] !== undefined) {
    const a = diff["addSection"] as {
      component: string;
      query: FYDQuery;
      heading?: string;
      copy?: string;
      atIndex?: number;
    };
    const section: FYDSection = {
      id: "",
      component: a.component,
      query: a.query,
      presentation: { heading: a.heading, copy: a.copy },
    };
    const at = typeof a.atIndex === "number" ? Math.min(a.atIndex, page.sections.length) : page.sections.length;
    page.sections.splice(at, 0, section);
    rederiveSectionIds(page);
    return next;
  }
  if (diff["removeSection"] === true) {
    const idx = page.sections.findIndex((s) => s.id === proposal.targetSection);
    if (idx !== -1) {
      page.sections.splice(idx, 1);
      rederiveSectionIds(page);
    }
    return next;
  }
  if (diff["query"] !== undefined) {
    const sec = page.sections.find((s) => s.id === proposal.targetSection);
    if (sec) sec.query = diff["query"] as FYDQuery;
    return next;
  }
  return next;
}

// ---------------------------------------------------------------------------
// PREVIEW
// ---------------------------------------------------------------------------

function sectionNames(page: FYDPage): string[] {
  return page.sections.map((s) => s.component + " (" + s.id + ")");
}

/** Before/after review card, computed from a pure apply on a spec copy. */
export function previewSitePatch(spec: FYDSiteSpec, op: SitePatchOp): PreviewCard | null {
  const prop = proposeForOp(spec, op);
  if (!prop.ok) return null;
  const after = applyExtendedSitePatch(spec, prop.proposal);
  switch (op.kind) {
    case "MOVE_SECTION": {
      const beforePage = findPage(spec, op.pageSlug);
      const afterPage = findPage(after, op.pageSlug);
      if (!beforePage || !afterPage) return null;
      return {
        title: "Move section '" + op.sectionId + "' to position " + op.toIndex + " on '" + op.pageSlug + "'",
        before: sectionNames(beforePage),
        after: sectionNames(afterPage),
      };
    }
    case "ADD_SECTION": {
      const afterPage = findPage(after, op.pageSlug);
      return {
        title: "Add '" + op.component + "' section to '" + op.pageSlug + "'",
        before: sectionNames(findPage(spec, op.pageSlug)!),
        after: afterPage ? sectionNames(afterPage) : [],
      };
    }
    case "REMOVE_SECTION": {
      const beforePage = findPage(spec, op.pageSlug);
      const afterPage = findPage(after, op.pageSlug);
      return {
        title: "Remove section '" + op.sectionId + "' from '" + op.pageSlug + "'",
        before: beforePage ? sectionNames(beforePage) : [],
        after: afterPage ? sectionNames(afterPage) : [],
      };
    }
    case "SET_VISIBILITY": {
      const sec = findPage(spec, op.pageSlug)?.sections.find((s) => s.id === op.sectionId);
      const cur = sec?.presentation.hidden === true ? "hidden" : "visible";
      const nextState = op.hidden ? "hidden" : "visible";
      return {
        title: "Set section '" + op.sectionId + "' visibility",
        before: ["Section " + (sec?.component ?? op.sectionId) + ": " + cur],
        after: ["Section " + (sec?.component ?? op.sectionId) + ": " + nextState],
      };
    }
    case "SET_FEATURED_OBJECT": {
      const sec = findPage(spec, op.pageSlug)?.sections.find((s) => s.id === op.sectionId);
      const cur = Array.isArray(sec?.presentation.featuredIds) ? sec!.presentation.featuredIds! : [];
      return {
        title: "Set featured objects in '" + op.sectionId + "'",
        before: ["Featured: " + (cur.join(", ") || "(none)")],
        after: ["Featured: " + op.objectIds.join(", ")],
      };
    }
    case "SET_PRESENTATION_COPY": {
      const sec = findPage(spec, op.pageSlug)?.sections.find((s) => s.id === op.sectionId);
      const lines: { before: string[]; after: string[] } = { before: [], after: [] };
      if (op.heading !== undefined) {
        lines.before.push("Heading: " + (sec?.presentation.heading ?? "(none)"));
        lines.after.push("Heading: " + op.heading);
      }
      if (op.copy !== undefined) {
        lines.before.push("Copy: " + (sec?.presentation.copy ?? "(none)"));
        lines.after.push("Copy: " + op.copy);
      }
      return { title: "Edit presentation copy in '" + op.sectionId + "'", before: lines.before, after: lines.after };
    }
    case "ADD_PAGE":
      return {
        title: "Add page '" + op.slug + "'",
        before: spec.pages.map((p) => p.slug),
        after: after.pages.map((p) => p.slug),
      };
    case "REMOVE_PAGE":
      return {
        title: "Remove page '" + op.slug + "'",
        before: spec.pages.map((p) => p.slug),
        after: after.pages.map((p) => p.slug),
      };
    case "CHANGE_QUERY": {
      const sec = findPage(spec, op.pageSlug)?.sections.find((s) => s.id === op.sectionId);
      return {
        title: "Change query of section '" + op.sectionId + "'",
        before: [JSON.stringify(sec?.query ?? null)],
        after: [JSON.stringify(op.query)],
      };
    }
    case "SET_DESIGN_TOKEN":
      return null;
  }
}

// ---------------------------------------------------------------------------
// The staged pipeline
// ---------------------------------------------------------------------------

function decisionSentenceFor(op: SitePatchOp): string {
  switch (op.kind) {
    case "MOVE_SECTION":
      return "Move section '" + op.sectionId + "' to position " + op.toIndex + " on page '" + op.pageSlug + "'.";
    case "ADD_SECTION":
      return "Add a '" + op.component + "' section to page '" + op.pageSlug + "'.";
    case "REMOVE_SECTION":
      return "Remove section '" + op.sectionId + "' from page '" + op.pageSlug + "'.";
    case "SET_VISIBILITY":
      return (op.hidden ? "Hide " : "Show ") + "section '" + op.sectionId + "' on page '" + op.pageSlug + "'.";
    case "SET_FEATURED_OBJECT":
      return "Feature " + op.objectIds.length + " object(s) in section '" + op.sectionId + "'.";
    case "SET_DESIGN_TOKEN":
      return "Set design token '" + op.token + "'.";
    case "SET_PRESENTATION_COPY":
      return "Edit the presentation copy of section '" + op.sectionId + "'.";
    case "ADD_PAGE":
      return "Add page '" + op.slug + "' (" + op.title + ").";
    case "REMOVE_PAGE":
      return "Remove page '" + op.slug + "'.";
    case "CHANGE_QUERY":
      return "Change how section '" + op.sectionId + "' resolves its objects.";
  }
}

/**
 * Run the full staged pipeline. Stages after a failing stage are null;
 * the pipeline never proceeds past a failed VALIDATE or a refused
 * CAPABILITY. The decision stage only runs when ctx.decide is provided
 * (tests / demo console); production decisions arrive from the Phase 1
 * gate through the same seam.
 */
export function runSitePatchPipeline(
  spec: FYDSiteSpec,
  op: SitePatchOp,
  ctx: PipelineContext,
): StagedSitePatch {
  const specDigest = sha256Hex(canonicalize(spec));
  const base: StagedSitePatch = {
    op,
    validation: { ok: true },
    capability: { allowed: false, capability: "owner.customize-approve", reason: "" },
    preview: null,
    overlayProposal: null,
    gateProposal: null,
    decision: null,
    event: null,
    newSpec: null,
    specDigest,
    newSpecDigest: null,
  };

  const errors = validateSitePatchOp(spec, op);
  if (errors.length > 0) {
    base.validation = { ok: false, errors };
    return base;
  }

  const cap = capabilityForOp(op, ctx.actorId);
  base.capability = cap;
  if (!cap.allowed) return base;

  base.preview = previewSitePatch(spec, op);
  const prop = proposeForOp(spec, op);
  if (!prop.ok) {
    base.validation = { ok: false, errors: [prop.error] };
    return base;
  }
  base.overlayProposal = prop.proposal;

  base.gateProposal = emitGateProposal({
    siteId: ctx.siteId,
    tenantId: ctx.tenantId,
    actorId: ctx.actorId,
    targetObjectId: ctx.targetObjectId,
    operation: op.kind,
    baseSpec: spec,
    proposal: prop.proposal,
    decisionSentence: decisionSentenceFor(op),
    evidenceLink: ctx.evidenceLink,
    nowIso: ctx.nowIso,
  });

  if (ctx.decide) {
    const outcome = verifyGateDecision(base.gateProposal, ctx.decide.presentedDigest, ctx.decide.verdict);
    if (!outcome.ok) {
      base.decision = { ok: false, error: outcome.error };
      return base;
    }
    base.decision = {
      ok: true,
      status: outcome.verdict === "APPROVE" ? "APPROVED" : "DENIED",
    };
    if (outcome.verdict !== "APPROVE") return base;

    const intentId =
      "spp-" + sha256Hex(ctx.siteId + "|" + prop.proposal.proposalDigest).slice(0, 16);
    const extendedIntent = { trackcOp: op } as unknown as SiteIntent;
    base.event = {
      op: "set_presentation_intent",
      intentId,
      siteIntent: extendedIntent,
      proposal: prop.proposal,
      approval: {
        proposalDigest: prop.proposal.proposalDigest,
        approvedBy: ctx.actorId + " (demo, unverified)",
        approvedAt: ctx.nowIso ?? new Date().toISOString(),
        note:
          "Track C sitepatch approved via the approval seam (pending Phase 1 binding). " +
          "Gate proposal " + base.gateProposal.proposal_id + " digest-verified.",
      },
    };
    base.newSpec = applyExtendedSitePatch(spec, prop.proposal);
    base.newSpecDigest = sha256Hex(canonicalize(base.newSpec));
  }
  return base;
}
