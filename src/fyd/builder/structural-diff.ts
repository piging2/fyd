/**
 * Structural diff of two SiteSpecs: the material-difference proof.
 *
 * Compares page sets, per-page section component sequences and order,
 * theme tokens, object presence, and the archetype vocabulary stamp.
 * Reports whether the two specs are MATERIALLY different: different page
 * sets, different section order on any shared page, different token
 * selection, or different presence mode. Copy text is compared structurally
 * (which slots exist), never semantically.
 *
 * Zero customer-specific code: the diff is a pure function of two specs.
 */

import type { FYDSiteSpec } from "../sitespec/types";

export interface PageSectionDiff {
  pageSlug: string;
  componentsA: string[];
  componentsB: string[];
  /** Components in A but not B. */
  onlyInA: string[];
  /** Components in B but not A. */
  onlyInB: string[];
  /** True when the shared components appear in a different order. */
  orderChanged: boolean;
}

export interface StructuralDiff {
  tenantA: string;
  tenantB: string;
  plannerVersion: string;
  semanticDigestA: string;
  semanticDigestB: string;
  pagesOnlyInA: string[];
  pagesOnlyInB: string[];
  pageDiffs: PageSectionDiff[];
  tokenDiffs: string[];
  presenceDiffs: string[];
  archetypeA: string | null;
  archetypeB: string | null;
  materiallyDifferent: boolean;
  /** Human-readable reasons the diff is (or is not) material. */
  materialReasons: string[];
}

function componentsOf(spec: FYDSiteSpec, slug: string): string[] {
  const page = spec.pages.find((p) => p.slug === slug);
  return page ? page.sections.map((s) => s.component) : [];
}

function tokenEntries(spec: FYDSiteSpec): Record<string, string> {
  const t = spec.themeTokens as unknown as Record<string, unknown>;
  const flat: Record<string, string> = {};
  const walk = (prefix: string, v: unknown) => {
    if (typeof v !== "object" || v === null) {
      flat[prefix] = String(v);
      return;
    }
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      walk(prefix === "" ? k : prefix + "." + k, (v as Record<string, unknown>)[k]);
    }
  };
  walk("", t);
  return flat;
}

/**
 * Diff two planned specs. tenantA/tenantB and the semantic digests are
 * caller-supplied labels (the diff itself is structural).
 */
export function diffSiteSpecs(
  a: FYDSiteSpec,
  b: FYDSiteSpec,
  labels: { tenantA: string; tenantB: string; digestA: string; digestB: string; plannerVersion: string },
): StructuralDiff {
  const slugsA = a.pages.map((p) => p.slug);
  const slugsB = b.pages.map((p) => p.slug);
  const pagesOnlyInA = slugsA.filter((s) => !slugsB.includes(s)).sort();
  const pagesOnlyInB = slugsB.filter((s) => !slugsA.includes(s)).sort();

  const pageDiffs: PageSectionDiff[] = [];
  for (const slug of slugsA.filter((s) => slugsB.includes(s)).sort()) {
    const ca = componentsOf(a, slug);
    const cb = componentsOf(b, slug);
    const setA = new Set(ca);
    const setB = new Set(cb);
    const onlyInA = ca.filter((c) => !setB.has(c));
    const onlyInB = cb.filter((c) => !setA.has(c));
    const sharedA = ca.filter((c) => setB.has(c));
    const sharedB = cb.filter((c) => setA.has(c));
    const orderChanged = sharedA.join("|") !== sharedB.join("|");
    pageDiffs.push({ pageSlug: slug, componentsA: ca, componentsB: cb, onlyInA, onlyInB, orderChanged });
  }

  const ta = tokenEntries(a);
  const tb = tokenEntries(b);
  const tokenDiffs: string[] = [];
  for (const k of [...new Set([...Object.keys(ta), ...Object.keys(tb)])].sort()) {
    if (ta[k] !== tb[k]) tokenDiffs.push(k + ": " + (ta[k] ?? "<absent>") + " -> " + (tb[k] ?? "<absent>"));
  }

  const presenceDiffs: string[] = [];
  const pa = a.objectPresence;
  const pb = b.objectPresence;
  if ((pa?.mode ?? null) !== (pb?.mode ?? null)) {
    presenceDiffs.push("mode: " + (pa?.mode ?? "<absent>") + " -> " + (pb?.mode ?? "<absent>"));
  }
  if ((pa?.rules.collapseBelow ?? null) !== (pb?.rules.collapseBelow ?? null)) {
    presenceDiffs.push(
      "collapseBelow: " + (pa?.rules.collapseBelow ?? "<absent>") + " -> " + (pb?.rules.collapseBelow ?? "<absent>"),
    );
  }
  if ((pa?.objects.length ?? 0) !== (pb?.objects.length ?? 0)) {
    presenceDiffs.push(
      "objects: " + (pa?.objects.length ?? 0) + " -> " + (pb?.objects.length ?? 0),
    );
  }

  const materialReasons: string[] = [];
  if (pagesOnlyInA.length > 0 || pagesOnlyInB.length > 0) {
    materialReasons.push("different page sets");
  }
  for (const pd of pageDiffs) {
    if (pd.orderChanged) materialReasons.push("section order differs on page \"" + pd.pageSlug + "\"");
    if (pd.onlyInA.length > 0 || pd.onlyInB.length > 0) {
      materialReasons.push("section set differs on page \"" + pd.pageSlug + "\"");
    }
  }
  if (tokenDiffs.length > 0) materialReasons.push(tokenDiffs.length + " theme token differences");
  if (presenceDiffs.length > 0) materialReasons.push("presence differences: " + presenceDiffs.join("; "));
  if ((a.archetype ?? null) !== (b.archetype ?? null)) {
    materialReasons.push("different archetype vocabulary: " + (a.archetype ?? "?") + " vs " + (b.archetype ?? "?"));
  }

  return {
    tenantA: labels.tenantA,
    tenantB: labels.tenantB,
    plannerVersion: labels.plannerVersion,
    semanticDigestA: labels.digestA,
    semanticDigestB: labels.digestB,
    pagesOnlyInA,
    pagesOnlyInB,
    pageDiffs,
    tokenDiffs,
    presenceDiffs,
    archetypeA: a.archetype ?? null,
    archetypeB: b.archetype ?? null,
    materiallyDifferent: materialReasons.length > 0,
    materialReasons,
  };
}

/** Render the diff as a Markdown report. */
export function renderStructuralDiffReport(d: StructuralDiff): string {
  const lines: string[] = [];
  lines.push("# Structural diff: " + d.tenantA + " vs " + d.tenantB);
  lines.push("");
  lines.push("- planner: " + d.plannerVersion);
  lines.push("- semantic digest " + d.tenantA + ": `" + d.semanticDigestA + "`");
  lines.push("- semantic digest " + d.tenantB + ": `" + d.semanticDigestB + "`");
  lines.push("- materially different: **" + (d.materiallyDifferent ? "YES" : "NO") + "**");
  if (d.materialReasons.length > 0) {
    lines.push("- reasons: " + d.materialReasons.join("; "));
  }
  lines.push("");
  if (d.pagesOnlyInA.length > 0 || d.pagesOnlyInB.length > 0) {
    lines.push("## Pages");
    if (d.pagesOnlyInA.length > 0) lines.push("- only in " + d.tenantA + ": " + d.pagesOnlyInA.join(", "));
    if (d.pagesOnlyInB.length > 0) lines.push("- only in " + d.tenantB + ": " + d.pagesOnlyInB.join(", "));
    lines.push("");
  }
  lines.push("## Sections per shared page");
  for (const pd of d.pageDiffs) {
    lines.push("### " + pd.pageSlug + (pd.orderChanged ? " (ORDER DIFFERS)" : ""));
    lines.push("- " + d.tenantA + ": " + pd.componentsA.join(" > "));
    lines.push("- " + d.tenantB + ": " + pd.componentsB.join(" > "));
    if (pd.onlyInA.length > 0) lines.push("  - only in " + d.tenantA + ": " + pd.onlyInA.join(", "));
    if (pd.onlyInB.length > 0) lines.push("  - only in " + d.tenantB + ": " + pd.onlyInB.join(", "));
  }
  lines.push("");
  lines.push("## Theme tokens (" + d.tokenDiffs.length + " differences)");
  for (const t of d.tokenDiffs) lines.push("- " + t);
  lines.push("");
  lines.push("## Presence");
  if (d.presenceDiffs.length === 0) lines.push("- identical");
  for (const p of d.presenceDiffs) lines.push("- " + p);
  lines.push("");
  lines.push("## Archetype vocabulary");
  lines.push("- " + d.tenantA + ": " + (d.archetypeA ?? "?"));
  lines.push("- " + d.tenantB + ": " + (d.archetypeB ?? "?"));
  lines.push("");
  return lines.join("\n");
}
