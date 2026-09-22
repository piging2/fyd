/**
 * Deterministic HTML service-card extraction (service lane v2, 2026-09-22).
 *
 * The Tier 1 lane (proceduralizer.ts "Services and products") only sees
 * JSON-LD Service/Product entities. Real business sites usually describe
 * their services in HTML: service cards, CTA widgets, estimate-flow links.
 * This module identifies those cards deterministically from the source
 * bytes, with per-card evidence (detector name, selector, byte span).
 *
 * Design contract (Nolan's rule: deterministic when unambiguous,
 * intelligence when ambiguous):
 * - A card is extracted only when it is UNAMBIGUOUS: a titled card widget
 *   with descriptive text that links into an explicit services context
 *   (a /services/ URL, or a service= estimate parameter inside a labeled
 *   Services section). Nav-only labels, bare headings, and section
 *   subheads without card structure are NOT extracted here; they are
 *   candidates for a future AI-proposed (INFERRED) lane, never silently
 *   promoted.
 * - Every card carries its evidenceDetail: detector name + selector +
 *   byte span, so the observation record names exactly which bytes the
 *   service claim came from.
 * - Pure: no I/O, no clock, no module state. Same bytes in, same cards
 *   out; output sorted by card key for stability.
 *
 * Detectors (documented, site-pattern named so new patterns add cleanly):
 * 1. "elementor-cta-services": Elementor call-to-action cards
 *    (an <a class="elementor-cta"> whose href contains /services/) with an
 *    .elementor-cta__title heading and .elementor-cta__description text.
 * 2. "estimate-service-card": estimate/quote-flow cards
 *    (<a href="...?service=<slug>...">) containing an <h3> title and a
 *    <p> description, inside a labeled Services section
 *    (data-slot-section="Services" or a services heading).
 */

export interface ServiceCardFact {
  /** Stable card key: slug from the card link (lowercase, URL-safe). */
  key: string;
  /** Verbatim card title from the source bytes. */
  name: string;
  /** Verbatim card description text from the source bytes. */
  description: string;
  /** Verbatim card link href from the source bytes (unresolved). */
  href: string;
  /** Which detector fired. */
  pattern: "elementor-cta-services" | "estimate-service-card";
  /** Evidence locator: detector + selector + byte span. */
  evidenceDetail: string;
  /** The page URL the card was read from. */
  sourceUrl: string;
}

/** ParsedFact names this lane emits (shared with proceduralizer.ts). */
export const SERVICE_CARD_FACT_NAMES = {
  name: "service_card_name",
  description: "service_card_description",
  href: "service_card_href",
} as const;

/** Entity-id prefix for card facts: service-card:<pattern>:<key>. */
export const SERVICE_CARD_ENTITY_PREFIX = "service-card:";

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

/** Strip tags, decode entities, collapse whitespace. */
function cleanText(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function attr(tag: string, name: string): string | null {
  const m = new RegExp("\\b" + name + '="([^"]*)"', "i").exec(tag);
  return m ? m[1] : null;
}

/** Last non-empty path segment of a URL path, slugified. */
function slugOfPath(href: string): string {
  const path = href.split(/[?#]/)[0].replace(/\/+$/, "");
  const seg = path.split("/").pop() ?? "";
  return seg
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function evidenceDetail(
  pattern: ServiceCardFact["pattern"],
  href: string,
  start: number,
  end: number,
): string {
  return (
    "pattern=" + pattern + ' selector=a[href="' + href + '"]' +
    " bytes=" + start + "-" + end
  );
}

function pushCard(
  out: ServiceCardFact[],
  seen: Set<string>,
  card: Omit<ServiceCardFact, "sourceUrl">,
  sourceUrl: string,
): void {
  // Title 2..80 chars, description >= 20 chars: a real card, not a
  // nav label or an icon-only tile. Thresholds are documented here,
  // not tuned per site.
  if (card.name.length < 2 || card.name.length > 80) return;
  if (card.description.length < 20) return;
  if (card.key === "") return;
  const id = card.pattern + ":" + card.key;
  if (seen.has(id)) return;
  seen.add(id);
  out.push({ ...card, sourceUrl });
}

// ---------------------------------------------------------------------------
// Detector 1: elementor-cta-services.
// ---------------------------------------------------------------------------

const CTA_ANCHOR_RE =
  /<a\b([^>]*\bclass="[^"]*\belementor-cta\b[^"]*"[^>]*)>([\s\S]*?)<\/a>/gi;
const CTA_TITLE_RE =
  /<h[1-6]\b[^>]*class="[^"]*elementor-cta__title[^"]*"[^>]*>([\s\S]*?)<\/h[1-6]>/i;
const CTA_DESC_RE =
  /<([a-z][a-z0-9]*)\b[^>]*class="[^"]*elementor-cta__description[^"]*"[^>]*>([\s\S]*?)<\/\1>/i;

function detectElementorCtas(
  html: string,
  sourceUrl: string,
  out: ServiceCardFact[],
  seen: Set<string>,
): void {
  let m: RegExpExecArray | null;
  CTA_ANCHOR_RE.lastIndex = 0;
  while ((m = CTA_ANCHOR_RE.exec(html)) !== null) {
    const attrs = m[1];
    const inner = m[2];
    const href = attr(attrs, "href") ?? "";
    // Explicit services context: the card links into /services/.
    if (!/\/services\//i.test(href)) continue;
    const titleM = CTA_TITLE_RE.exec(inner);
    const descM = CTA_DESC_RE.exec(inner);
    if (!titleM || !descM) continue;
    const name = cleanText(titleM[1]);
    const description = cleanText(descM[2]);
    pushCard(
      out,
      seen,
      {
        key: slugOfPath(href),
        name,
        description,
        href,
        pattern: "elementor-cta-services",
        evidenceDetail: evidenceDetail(
          "elementor-cta-services",
          href,
          m.index,
          m.index + m[0].length,
        ),
      },
      sourceUrl,
    );
  }
}

// ---------------------------------------------------------------------------
// Detector 2: estimate-service-card.
// ---------------------------------------------------------------------------

const EST_ANCHOR_RE =
  /<a\b([^>]*href="[^"]*[?&]service=([a-z0-9-]+)[^"]*"[^>]*)>([\s\S]*?)<\/a>/gi;
const EST_TITLE_RE = /<h3\b[^>]*>([\s\S]*?)<\/h3>/i;
const EST_DESC_RE = /<p\b[^>]*>([\s\S]*?)<\/p>/i;
/** Services-section markers that qualify an estimate card's context. */
const SERVICES_SECTION_MARKERS: RegExp[] = [
  /data-slot-section="Services"/,
  /<h[1-6][^>]*>[^<]*\bservices?\b[^<]*<\/h[1-6]>/i,
  /<h[1-6][^>]*>[^<]*what we do[^<]*<\/h[1-6]>/i,
];
/** Chars of preceding markup searched for a section marker. */
const SECTION_LOOKBACK = 4000;

function detectEstimateCards(
  html: string,
  sourceUrl: string,
  out: ServiceCardFact[],
  seen: Set<string>,
): void {
  let m: RegExpExecArray | null;
  EST_ANCHOR_RE.lastIndex = 0;
  while ((m = EST_ANCHOR_RE.exec(html)) !== null) {
    const attrs = m[1];
    const slug = m[2];
    const inner = m[3];
    const href = attr(attrs, "href") ?? "";
    const titleM = EST_TITLE_RE.exec(inner);
    if (!titleM) continue;
    const afterTitle = inner.slice(titleM.index + titleM[0].length);
    const descM = EST_DESC_RE.exec(afterTitle) ?? EST_DESC_RE.exec(inner);
    if (!descM) continue;
    // Explicit services context: the card sits inside a labeled Services
    // section. Without the marker this is just a link with a slug.
    const context = html.slice(Math.max(0, m.index - SECTION_LOOKBACK), m.index);
    if (!SERVICES_SECTION_MARKERS.some((re) => re.test(context))) continue;
    const name = cleanText(titleM[1]);
    const description = cleanText(descM[1]);
    pushCard(
      out,
      seen,
      {
        key: slug,
        name,
        description,
        href,
        pattern: "estimate-service-card",
        evidenceDetail: evidenceDetail(
          "estimate-service-card",
          href,
          m.index,
          m.index + m[0].length,
        ),
      },
      sourceUrl,
    );
  }
}

/**
 * Extract deterministic service cards from a full HTML page.
 * Comments are stripped first so commented-out markup cannot produce
 * cards. Output is sorted by card key for run-to-run stability.
 */
export function extractServiceCards(html: string, sourceUrl: string): ServiceCardFact[] {
  const decommented = html.replace(/<!--[\s\S]*?-->/g, "");
  const out: ServiceCardFact[] = [];
  const seen = new Set<string>();
  detectElementorCtas(decommented, sourceUrl, out, seen);
  detectEstimateCards(decommented, sourceUrl, out, seen);
  out.sort((a, b) =>
    a.pattern + ":" + a.key < b.pattern + ":" + b.key ? -1 : 1,
  );
  return out;
}
