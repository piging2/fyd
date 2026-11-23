/**
 * Lane 3 composer: static spec-to-HTML serializer (backlog B2).
 *
 * The repo's production rendering path is the React component renderer
 * (src/fyd/components/renderer.tsx), served through the Next app route.
 * The repo has NO static, dependency-free serializer for a composed
 * SiteSpec (Wave 1 receipt, bootstrap-wave1/WAVE1-RECEIPT.md: "the repo
 * has NO static spec-to-HTML renderer; HTML rendering happens through
 * the Next app route, which needs a running server"). This module fills
 * that gap for fixture proof and the acceptance matrix's VIEW row only.
 * It is not a rendering engine and never competes with the React
 * renderer: it serializes exactly the text a composed spec itself
 * carries (page titles, navigation labels, section presentation
 * heading/copy) into one self-contained HTML document per page.
 *
 * Law:
 * - Coverage is exactly the set of components compile.ts mapSection can
 *   emit (STATIC_RENDER_COMPONENTS), no more. A section naming any other
 *   component is reported in the coverage manifest and left as an HTML
 *   comment in place, never silently dropped.
 * - No copy invention: every text node comes verbatim from the spec.
 *   Query-resolved object content is not part of a spec (sections declare
 *   HOW to fetch their objects, never the objects themselves) and is
 *   never fabricated here.
 * - Theme tokens ride as inline CSS custom properties where the spec
 *   carries scalar values. The radius keyword and media treatment are
 *   renderer-resolved token names, not serializable values, and are not
 *   emitted; layoutCharacter rides as a body data attribute.
 * - No JavaScript, no external assets, no wall clock, no randomness:
 *   identical spec input yields byte-identical documents.
 * - Hidden sections (presentation.hidden) are suppressed, as the
 *   production renderer suppresses them, and are listed in the manifest.
 */

import type {
  FYDPage,
  FYDSection,
  FYDSiteSpec,
  FYDThemeTokens,
} from "@/fyd/sitespec/types";

/**
 * Components compile.ts mapSection can emit, sorted. Pinned by test
 * against this exact list; extend only when mapSection learns a new
 * component, never ahead of it.
 */
export const STATIC_RENDER_COMPONENTS: readonly string[] = [
  "AskFYD",
  "BusinessSummary",
  "CTA",
  "Contact",
  "Gallery",
  "Hero",
  "Locations",
  "ObjectGrid",
  "People",
  "RecentObjects",
  "Services",
  "SocialProof",
];

const COVERED = new Set(STATIC_RENDER_COMPONENTS);

/** True when the static serializer covers the named component. */
export function isStaticallyCovered(component: string): boolean {
  return COVERED.has(component);
}

export interface UncoveredSection {
  page: string;
  sectionId: string;
  component: string;
}

export interface SuppressedSection {
  page: string;
  sectionId: string;
  component: string;
  reason: "hidden";
}

export interface PageCoverage {
  slug: string;
  sectionsTotal: number;
  sectionsRendered: number;
  sectionsWithText: number;
  bytes: number;
}

export interface CoverageManifest {
  pages: PageCoverage[];
  totalPages: number;
  totalSections: number;
  sectionsRendered: number;
  sectionsWithText: number;
  totalBytes: number;
  uncovered: UncoveredSection[];
  suppressed: SuppressedSection[];
}

export interface RenderedPage {
  slug: string;
  title: string;
  html: string;
  bytes: number;
}

export interface StaticRenderResult {
  pages: RenderedPage[];
  manifest: CoverageManifest;
}

const utf8 = new TextEncoder();

function byteLength(text: string): number {
  return utf8.encode(text).length;
}

/** Escape text for HTML text and double-quoted attribute contexts. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Keep a value safe inside an HTML comment: no angle brackets, no "--". */
function commentSafe(text: string): string {
  return text.replace(/[<>"']/g, "").replace(/--+/g, "-");
}

/** Keep a value safe inside a CSS declaration: no block or tag breakouts. */
function cssSafe(text: string): string {
  return text.replace(/[<>{};]/g, "");
}

/**
 * Theme custom properties, sorted by property name so the style block is
 * byte-stable regardless of the spec's key order. Only scalar token
 * values the spec itself carries are emitted.
 */
function themeProperties(tokens: FYDThemeTokens): Array<[string, string]> {
  const props: Array<[string, string]> = [
    ["--fyd-accent", tokens.accent],
    ["--fyd-accent-foreground", tokens.accentForeground],
    ["--fyd-font-body", tokens.fontBody],
    ["--fyd-font-display", tokens.fontDisplay],
    ["--fyd-ink", tokens.ink],
    ["--fyd-surface", tokens.surface],
  ];
  if (tokens.typography) {
    props.push(["--fyd-type-base", `${tokens.typography.base}px`]);
    props.push(["--fyd-type-ratio", String(tokens.typography.ratio)]);
  }
  return props.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

function styleBlock(tokens: FYDThemeTokens): string {
  const lines: string[] = ["<style>", ":root {"];
  for (const [name, value] of themeProperties(tokens)) {
    lines.push(`  ${name}: ${cssSafe(value)};`);
  }
  lines.push(
    "}",
    "body { margin: 0; font-family: var(--fyd-font-body); color: var(--fyd-ink); background: var(--fyd-surface); }",
    "h1, h2 { font-family: var(--fyd-font-display); }",
    "a { color: var(--fyd-accent); }",
    "</style>",
  );
  return lines.join("\n");
}

function navBlock(spec: FYDSiteSpec, currentSlug: string): string {
  const lines: string[] = ["<nav>", "<ul>"];
  for (const item of spec.navigation) {
    const current = item.pageSlug === currentSlug ? ' aria-current="page"' : "";
    lines.push(
      `<li><a href="${escapeHtml(item.pageSlug)}.html"${current}>${escapeHtml(item.label)}</a></li>`,
    );
  }
  lines.push("</ul>", "</nav>");
  return lines.join("\n");
}

function sectionBlock(section: FYDSection): { html: string; hasText: boolean } {
  const { heading, copy } = section.presentation;
  const lines: string[] = [
    `<section data-component="${escapeHtml(section.component)}" id="${escapeHtml(section.id)}">`,
  ];
  let hasText = false;
  if (heading) {
    lines.push(`<h2>${escapeHtml(heading)}</h2>`);
    hasText = true;
  }
  if (copy) {
    for (const paragraph of copy.split(/\n{2,}/)) {
      lines.push(`<p>${escapeHtml(paragraph)}</p>`);
    }
    hasText = true;
  }
  lines.push("</section>");
  return { html: lines.join("\n"), hasText };
}

function renderPage(
  spec: FYDSiteSpec,
  page: FYDPage,
  uncovered: UncoveredSection[],
  suppressed: SuppressedSection[],
): { rendered: RenderedPage; coverage: PageCoverage } {
  const bodyLines: string[] = [];
  let sectionsRendered = 0;
  let sectionsWithText = 0;
  for (const section of page.sections) {
    if (section.presentation.hidden) {
      suppressed.push({
        page: page.slug,
        sectionId: section.id,
        component: section.component,
        reason: "hidden",
      });
      continue;
    }
    if (!COVERED.has(section.component)) {
      uncovered.push({
        page: page.slug,
        sectionId: section.id,
        component: section.component,
      });
      bodyLines.push(
        `<!-- uncovered-section component="${commentSafe(section.component)}" section="${commentSafe(section.id)}" -->`,
      );
      continue;
    }
    const { html, hasText } = sectionBlock(section);
    bodyLines.push(html);
    sectionsRendered += 1;
    if (hasText) sectionsWithText += 1;
  }

  const layoutAttr = spec.themeTokens.layoutCharacter
    ? ` data-layout-character="${escapeHtml(spec.themeTokens.layoutCharacter)}"`
    : "";
  const html = [
    "<!DOCTYPE html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(page.title)}</title>`,
    styleBlock(spec.themeTokens),
    "</head>",
    `<body${layoutAttr}>`,
    "<header>",
    `<h1>${escapeHtml(page.title)}</h1>`,
    navBlock(spec, page.slug),
    "</header>",
    "<main>",
    ...bodyLines,
    "</main>",
    "</body>",
    "</html>",
    "",
  ].join("\n");

  const bytes = byteLength(html);
  return {
    rendered: { slug: page.slug, title: page.title, html, bytes },
    coverage: {
      slug: page.slug,
      sectionsTotal: page.sections.length,
      sectionsRendered,
      sectionsWithText,
      bytes,
    },
  };
}

/**
 * Serialize a composed SiteSpec into one self-contained HTML document
 * per page, plus the coverage manifest. Pure and deterministic.
 */
export function renderSpecToHtml(spec: FYDSiteSpec): StaticRenderResult {
  const uncovered: UncoveredSection[] = [];
  const suppressed: SuppressedSection[] = [];
  const pages: RenderedPage[] = [];
  const pageCoverage: PageCoverage[] = [];
  for (const page of spec.pages) {
    const { rendered, coverage } = renderPage(spec, page, uncovered, suppressed);
    pages.push(rendered);
    pageCoverage.push(coverage);
  }
  const manifest: CoverageManifest = {
    pages: pageCoverage,
    totalPages: pages.length,
    totalSections: pageCoverage.reduce((n, p) => n + p.sectionsTotal, 0),
    sectionsRendered: pageCoverage.reduce((n, p) => n + p.sectionsRendered, 0),
    sectionsWithText: pageCoverage.reduce((n, p) => n + p.sectionsWithText, 0),
    totalBytes: pageCoverage.reduce((n, p) => n + p.bytes, 0),
    uncovered,
    suppressed,
  };
  return { pages, manifest };
}
