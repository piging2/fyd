/**
 * SiteSpec validator: three layers, findings out (harvest B6).
 *
 * Layer 1 (structure): the spec shape is well-formed, pages/sections/queries
 * reference known components, ids are unique and deterministic.
 * Layer 2 (semantic): components accept the schemas their queries can
 * return, required fields are satisfiable, no section renders without data.
 * Layer 3 (item 4, fyd-execution): token/contrast validation. Every text-role
 * pairing (accentText/surface, foreground/surface, mutedForeground/surface,
 * onAccent/accent, accentForeground/accent) must meet WCAG AA 4.5:1. A
 * contrast failure is an error, so an unreadable spec is never renderable.
 *
 * Never render an invalid spec: the demo page renders only when no error
 * findings exist. Warnings and info pass through to the operator.
 */

import { getComponentDef } from "../components/registry";
import { SCHEMA_ROLES, eligibleComponents } from "./schemas";
import {
  CONTRAST_TEXT_THRESHOLD,
  contrastRatio,
  isValidHexColor,
  resolveThemeRoles,
} from "./theme-roles";
import type { FYDFinding, FYDSiteSpec, FYDSection } from "./types";

function err(resourceId: string, path: string, message: string): FYDFinding {
  return { severity: "error", authority: "fyd.sitespec.validator", resourceId, path, message };
}

function warn(resourceId: string, path: string, message: string): FYDFinding {
  return { severity: "warning", authority: "fyd.sitespec.validator", resourceId, path, message };
}

/**
 * Validate a SiteSpec. Pure and deterministic.
 * `knownSchemas` is the set of schema ids present in the graph being rendered.
 */
export function validateSiteSpec(spec: FYDSiteSpec, knownSchemas: Set<string>): FYDFinding[] {
  const findings: FYDFinding[] = [];
  const rid = "spec:" + spec.ownerObjectId;

  if (spec.kind !== "fyd.sitespec@1") {
    findings.push(err(rid, "kind", "Unknown spec kind '" + spec.kind + "'."));
  }
  if (spec.pages.length === 0) {
    findings.push(err(rid, "pages", "A site needs at least one page."));
  }

  const seenSectionIds = new Set<string>();
  const seenSlugs = new Set<string>();
  for (const page of spec.pages) {
    if (seenSlugs.has(page.slug)) {
      findings.push(err(rid, "pages." + page.slug, "Duplicate page slug '" + page.slug + "'."));
    }
    seenSlugs.add(page.slug);
    if (page.sections.length === 0) {
      findings.push(
        warn(rid, "pages." + page.slug + ".sections", "Page '" + page.slug + "' has no sections; it renders empty."),
      );
    }
    page.sections.forEach((section: FYDSection, index: number) => {
      const spath = "pages." + page.slug + ".sections[" + index + "]";
      if (seenSectionIds.has(section.id)) {
        findings.push(err(rid, spath + ".id", "Duplicate section id '" + section.id + "'."));
      }
      seenSectionIds.add(section.id);
      const expectedId = page.slug + ":" + section.component + ":" + index;
      if (section.id !== expectedId) {
        findings.push(
          warn(rid, spath + ".id", "Section id '" + section.id + "' is not the deterministic '" + expectedId + "'."),
        );
      }
      const def = getComponentDef(section.component);
      if (!def) {
        findings.push(err(rid, spath + ".component", "Unknown component '" + section.component + "'."));
        return;
      }
      // Semantic layer: the query's schemas must be acceptable to the component.
      const querySchemas = querySchemasFor(section, knownSchemas);
      for (const qs of querySchemas) {
        const eligible = eligibleComponents(qs);
        if (!eligible.includes(section.component) && section.component !== "GenericObjectCard") {
          findings.push(
            err(
              rid,
              spath + ".query",
              "Component '" + section.component + "' does not accept schema '" + qs + "'.",
            ),
          );
        }
      }
      if (section.presentation.hidden && section.component === "Hero") {
        findings.push(
          warn(rid, spath + ".presentation.hidden", "Hiding the Hero leaves the home page without an identity block."),
        );
      }
    });
  }

  // Navigation must point at real pages.
  for (const nav of spec.navigation) {
    if (!seenSlugs.has(nav.pageSlug)) {
      findings.push(err(rid, "navigation", "Nav item '" + nav.label + "' points at missing page '" + nav.pageSlug + "'."));
    }
  }

  // Layer 3 (item 4): token/contrast validation. Roles resolve
  // deterministically (explicit spec roles win, absent roles derive), so a
  // legacy spec with base tokens only resolves to its historical values and
  // keeps validating. An explicitly unreadable pairing is an error: the
  // compiler rejects it before it renders, for every site, forever.
  validateThemeContrast(spec, rid, findings);

  return findings;
}

/**
 * Item 4: every text-role pairing must meet WCAG AA. Failures are errors so
 * isRenderable() stays fail-closed. Unparseable token values are errors too:
 * text-role pairings must be concrete colors.
 */
function validateThemeContrast(
  spec: FYDSiteSpec,
  rid: string,
  findings: FYDFinding[],
): void {
  const tokens = spec.themeTokens;
  const roles = resolveThemeRoles(tokens);
  const pairings: Array<{ path: string; fg: string; bg: string; bgLabel: string }> = [
    { path: "themeTokens.accentText", fg: roles.accentText, bg: roles.surface, bgLabel: "surface" },
    { path: "themeTokens.foreground", fg: roles.foreground, bg: roles.surface, bgLabel: "surface" },
    { path: "themeTokens.mutedForeground", fg: roles.mutedForeground, bg: roles.surface, bgLabel: "surface" },
    { path: "themeTokens.onAccent", fg: roles.onAccent, bg: tokens.accent, bgLabel: "accent" },
    { path: "themeTokens.accentForeground", fg: tokens.accentForeground, bg: tokens.accent, bgLabel: "accent" },
  ];
  for (const { path, fg, bg, bgLabel } of pairings) {
    if (!isValidHexColor(fg) || !isValidHexColor(bg)) {
      findings.push(
        err(
          rid,
          path,
          "Token pairing '" + path + "' on '" + bgLabel + "' is not a concrete hex color pair ('" +
            fg + "' / '" + bg + "'); text-role pairings must be concrete colors.",
        ),
      );
      continue;
    }
    const ratio = contrastRatio(fg, bg);
    if (ratio !== null && ratio < CONTRAST_TEXT_THRESHOLD) {
      findings.push(
        err(
          rid,
          path,
          "Contrast " + ratio.toFixed(2) + ":1 for '" + path + "' (" + fg + ") on '" +
            bgLabel + "' (" + bg + ") is below the required " + CONTRAST_TEXT_THRESHOLD + ":1.",
        ),
      );
    }
  }
}

/** Schemas a section query can resolve to, for eligibility checks. */
function querySchemasFor(section: FYDSection, knownSchemas: Set<string>): string[] {
  const q = section.query;
  switch (q.kind) {
    case "static":
      return [];
    case "reference":
      // References are resolved at render; eligibility is checked per object.
      return [];
    case "owner":
      return [...SCHEMA_ROLES.business];
    case "all":
      // Mirrors "related": an explicit schema filter narrows expansion, but a
      // bare "all" still expands to every known schema (fail-closed for
      // hand-written specs).
      return q.schemas ?? (q.schema ? [q.schema] : [...knownSchemas]);
    case "related": {
      if (q.schemas) return q.schemas;
      return q.schema ? [q.schema] : [...knownSchemas];
    }
  }
}

/** True when the spec has no error findings and may be rendered. */
export function isRenderable(findings: FYDFinding[]): boolean {
  return !findings.some((f) => f.severity === "error");
}
