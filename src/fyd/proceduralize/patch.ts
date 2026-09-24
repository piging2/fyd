/**
 * Site customization: structured intents -> site_patch proposals.
 *
 * Lightweight customization only: reorder sections, hide/show sections,
 * featured-object selection, proposed presentation-copy edits, basic
 * design tokens. Structured editor, never drag and drop.
 *
 * Every intent follows the proposal path (harvest B2): intent ->
 * canonicalize -> validate -> ProposalBody with a proposalDigest the owner
 * approves verbatim. Copy edits and theme tokens are PROPOSED changes;
 * nothing changes until the digest is approved.
 */

import { sha256Hex } from "./sha256";
import type { FYDSiteSpec, FYDThemeTokens } from "../sitespec/types";

// ---------------------------------------------------------------------------
// Intents.
// ---------------------------------------------------------------------------

export type SiteIntent =
  | { kind: "reorder_section"; pageSlug: string; sectionId: string; toIndex: number }
  | { kind: "toggle_section"; pageSlug: string; sectionId: string; hidden: boolean }
  | { kind: "set_featured"; pageSlug: string; sectionId: string; objectIds: string[] }
  | {
      kind: "reorder_object";
      pageSlug: string;
      sectionId: string;
      /** Full desired display order of the section's objects (object ids). */
      objectIds: string[];
    }
  | { kind: "edit_copy"; pageSlug: string; sectionId: string; heading?: string; copy?: string }
  | { kind: "set_theme_token"; token: keyof FYDThemeTokens; value: string };

export interface SitePatchBody {
  kind: "site_patch";
  proposalDigest: string;
  targetPage: string;
  targetSection: string;
  component: string;
  /** The exact presentation/token change being proposed. */
  propsDiff: Record<string, unknown>;
  reason: string;
}

export interface PatchResult {
  ok: boolean;
  proposal?: SitePatchBody;
  /** Human-readable rejection when the intent is invalid. */
  error?: string;
}

// ---------------------------------------------------------------------------
// Proposal digest. Mirrors src/lib/ping/ask-composer.ts: canonicalize the
// body (sorted keys, volatile fields stripped) then sha256.
// ---------------------------------------------------------------------------

const VOLATILE_KEYS = new Set(["proposalDigest", "createdAt", "generatedAt", "nonce"]);

function canonicalize(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      if (VOLATILE_KEYS.has(key)) continue;
      out[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

export function proposalDigest(body: Omit<SitePatchBody, "proposalDigest">): string {
  const canonical = JSON.stringify(canonicalize(body));
  return sha256Hex(canonical);
}

// ---------------------------------------------------------------------------
// Intent -> proposal.
// ---------------------------------------------------------------------------

export function proposeSitePatch(spec: FYDSiteSpec, intent: SiteIntent): PatchResult {
  const page = spec.pages.find((p) => p.slug === intentPage(intent));
  if (!page && intent.kind !== "set_theme_token") {
    return { ok: false, error: "Page '" + intentPage(intent) + "' does not exist in this spec." };
  }

  switch (intent.kind) {
    case "set_theme_token": {
      const allowed: (keyof FYDThemeTokens)[] = [
        "accent",
        "accentForeground",
        "surface",
        "ink",
        "radius",
        "fontDisplay",
        "fontBody",
      ];
      if (!allowed.includes(intent.token)) {
        return { ok: false, error: "Token '" + String(intent.token) + "' is not customizable." };
      }
      if (typeof intent.value !== "string" || intent.value.trim() === "") {
        return { ok: false, error: "Theme token value must be a non-empty string." };
      }
      return build({
        targetPage: "",
        targetSection: "",
        component: "theme",
        propsDiff: { ["themeTokens." + intent.token]: intent.value.trim() },
        reason: "Proposed theme token change.",
      });
    }
    case "reorder_section": {
      const idx = page!.sections.findIndex((s) => s.id === intent.sectionId);
      if (idx === -1) return { ok: false, error: "Section '" + intent.sectionId + "' not found." };
      if (intent.toIndex < 0 || intent.toIndex >= page!.sections.length) {
        return { ok: false, error: "Target index " + intent.toIndex + " is out of range." };
      }
      return build({
        targetPage: page!.slug,
        targetSection: intent.sectionId,
        component: page!.sections[idx].component,
        propsDiff: { moveFrom: idx, moveTo: intent.toIndex },
        reason: "Reorder section within page.",
      });
    }
    case "toggle_section": {
      const sec = page!.sections.find((s) => s.id === intent.sectionId);
      if (!sec) return { ok: false, error: "Section '" + intent.sectionId + "' not found." };
      return build({
        targetPage: page!.slug,
        targetSection: intent.sectionId,
        component: sec.component,
        propsDiff: { "presentation.hidden": intent.hidden },
        reason: intent.hidden ? "Hide section." : "Show section.",
      });
    }
    case "set_featured": {
      const sec = page!.sections.find((s) => s.id === intent.sectionId);
      if (!sec) return { ok: false, error: "Section '" + intent.sectionId + "' not found." };
      const ids = [...new Set(intent.objectIds)].sort();
      return build({
        targetPage: page!.slug,
        targetSection: intent.sectionId,
        component: sec.component,
        propsDiff: { "presentation.featuredIds": ids },
        reason: "Select featured objects for section.",
      });
    }
    case "reorder_object": {
      const sec = page!.sections.find((s) => s.id === intent.sectionId);
      if (!sec) return { ok: false, error: "Section '" + intent.sectionId + "' not found." };
      // Order is significant: dedupe preserving the requested sequence.
      const ids = [...new Set(intent.objectIds)];
      if (ids.length === 0) {
        return { ok: false, error: "Object reorder needs at least one object id." };
      }
      return build({
        targetPage: page!.slug,
        targetSection: intent.sectionId,
        component: sec.component,
        propsDiff: { "presentation.objectOrder": ids },
        reason: "Reorder objects within section.",
      });
    }
    case "edit_copy": {
      const sec = page!.sections.find((s) => s.id === intent.sectionId);
      if (!sec) return { ok: false, error: "Section '" + intent.sectionId + "' not found." };
      const diff: Record<string, unknown> = {};
      if (intent.heading !== undefined) diff["presentation.heading"] = intent.heading;
      if (intent.copy !== undefined) diff["presentation.copy"] = intent.copy;
      if (Object.keys(diff).length === 0) {
        return { ok: false, error: "Copy edit needs a heading, copy, or both." };
      }
      return build({
        targetPage: page!.slug,
        targetSection: intent.sectionId,
        component: sec.component,
        propsDiff: diff,
        reason: "Proposed presentation-copy edit. Draft only until the digest is approved.",
      });
    }
  }
}

function intentPage(intent: SiteIntent): string {
  return intent.kind === "set_theme_token" ? "" : intent.pageSlug;
}

function build(body: Omit<SitePatchBody, "kind" | "proposalDigest">): PatchResult {
  const withoutDigest = { kind: "site_patch" as const, ...body };
  return {
    ok: true,
    proposal: { ...withoutDigest, proposalDigest: proposalDigest(withoutDigest) },
  };
}

/**
 * Apply an approved proposal to a spec copy. Used by the structured editor
 * preview after the owner approves the exact digest. Pure: returns a new
 * spec, never mutates.
 */
export function applySitePatch(spec: FYDSiteSpec, proposal: SitePatchBody): FYDSiteSpec {
  const next: FYDSiteSpec = JSON.parse(JSON.stringify(spec));
  if (proposal.component === "theme") {
    const tokens = next.themeTokens as unknown as Record<string, unknown>;
    for (const [path, value] of Object.entries(proposal.propsDiff)) {
      const token = path.replace(/^themeTokens\./, "");
      tokens[token] = value;
    }
    return next;
  }
  const page = next.pages.find((p) => p.slug === proposal.targetPage);
  if (!page) return next;
  const idx = page.sections.findIndex((s) => s.id === proposal.targetSection);
  if (idx === -1) return next;
  const sec = page.sections[idx];
  const diff = proposal.propsDiff;
  if (typeof diff["moveTo"] === "number") {
    const [moved] = page.sections.splice(idx, 1);
    page.sections.splice(diff["moveTo"] as number, 0, moved);
    // Section ids are deterministic: re-derive after a move.
    page.sections.forEach((s, i) => {
      s.id = page.slug + ":" + s.component + ":" + i;
    });
  }
  if (typeof diff["presentation.hidden"] === "boolean") {
    sec.presentation.hidden = diff["presentation.hidden"] as boolean;
  }
  if (Array.isArray(diff["presentation.featuredIds"])) {
    sec.presentation.featuredIds = diff["presentation.featuredIds"] as string[];
  }
  if (Array.isArray(diff["presentation.objectOrder"])) {
    sec.presentation.objectOrder = diff["presentation.objectOrder"] as string[];
  }
  if (typeof diff["presentation.heading"] === "string") {
    sec.presentation.heading = diff["presentation.heading"] as string;
  }
  if (typeof diff["presentation.copy"] === "string") {
    sec.presentation.copy = diff["presentation.copy"] as string;
  }
  return next;
}
