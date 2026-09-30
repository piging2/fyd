/**
 * Deterministic body-contact mining (2026-09-30).
 *
 * The UNDERSTAND lane (proceduralizer.parseRich) previously extracted
 * contact facts only from structured data (JSON-LD/microdata), head
 * meta/OG tags, and service cards. Real business sites usually carry
 * their phone number and street address in body HTML (footers, contact
 * sections, location blocks) with no structured markup at all; the
 * five-URL falsification (2026-09-30) found missing phone/address to be
 * the dominant understanding failure. This module mines those two facts
 * deterministically from the source bytes, following the service-card
 * precedent (service-cards.ts): strip hostile content, regex over text,
 * clean, emit ParsedFact with sourceType "html", an extractor label, and
 * evidence detail.
 *
 * Design contract (same as service-cards.ts:22-23):
 * - Pure: no I/O, no clock, no module state. Same bytes in, same facts
 *   out; output order is document order (stable).
 * - Hostile-input posture: HTML comments and <script>/<style>/<noscript>
 *   blocks are removed before mining, so phone-like digit runs inside
 *   executable content, stylesheets, or commented-out markup are never
 *   mined as business contact facts.
 * - Conservative: the address pattern requires house number + street
 *   suffix + city + ST + ZIP. A partial address (no ZIP, no city) is not
 *   emitted. extract() later coarsens "address" to a public "locality"
 *   claim; precise street detail never auto-publishes (Grill 19).
 */

import type { ParsedFact } from "./proceduralizer";

/** Extractor label stamped on every fact this lane emits. */
export const BODY_CONTACT_EXTRACTOR = "body-contact@2026-09-30";

/**
 * Phone pattern HARVESTED from src/fyd/onboarding/extractor.ts:65
 * (onboarding preview lane). Copied, not imported: the live UNDERSTAND
 * lane must not depend on the onboarding lane's module. Used here with
 * the global flag to mine every occurrence; values are emitted verbatim
 * and deduped by normalized digits.
 */
const PHONE_RE =
  /(?<!\d)(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g;

const STREET_SUFFIX =
  "St(?:reet)?|Ave(?:nue)?|Rd|Road|Blvd|Boulevard|Dr(?:ive)?|Ln|Lane|" +
  "Ct|Court|Pl(?:ace)?|Way|Hwy|Highway|Pkwy|Parkway|Cir(?:cle)?|" +
  "Ter(?:race)?|Trl|Trail|Loop|Plaza|Sq(?:uare)?";

const DIRECTIONAL = "(?:North|South|East|West|[NSEW])\\.?";

/**
 * Conservative US street-address pattern. Requires ALL of: house
 * number, a street suffix (or highway form), city, 2-letter state,
 * 5-digit ZIP. Handles:
 * - unit designators: "1190 Bookcliff Ave, Unit 101 Grand Junction, CO 81501"
 * - letter streets: "1234 G Rd, Grand Junction, CO 81501"
 * - highway forms: "825 East US Hwy 6&50 Fruita, CO 81521"
 * - punctuation-light forms: "220 E. Aspen Ave. Fruita CO. 81521"
 * Deliberately NOT matched (conservative misses, documented):
 * - "400 Main St. Grand Junction, CO" (no ZIP)
 * - "400 Main Street in Downtown Grand Junction, Colorado" (prose, no ZIP)
 * - "126 S. 5th St." (no city/state/ZIP)
 */
const ADDRESS_RE = new RegExp(
  "(?<!\\d)" + // not in the middle of a longer digit run
    "\\d{1,6}" + // house number
    "\\s+" +
    "(?:" +
    "(?:" +
    DIRECTIONAL +
    "\\s+)?" +
    "(?:US\\s+)?Hwy\\s+[\\w&/.-]+" + // highway form
    "|" +
    "(?:" +
    DIRECTIONAL +
    "\\s+)?" + // optional directional ("E.", "East")
    "[A-Z0-9][\\w.'&-]*" + // street name, first token
    "(?:\\s+[A-Z0-9][\\w.'&-]*)*" + // additional name tokens
    "\\s+(?:" +
    STREET_SUFFIX +
    ")\\.?" + // required street suffix (the space before it is
    // consumed here: a zero-iteration middle group left the suffix
    // stranded behind a leading space, which silently failed matches
    // like "Bookcliff Ave")
    ")" +
    "(?:\\s*,?\\s*(?:Unit|Apt\\.?|Suite|Ste\\.?|#)\\s*[\\w-]+)?" + // unit
    "[\\s,;.]*" +
    "[A-Z][a-zA-Z.'-]*(?:\\s+[A-Z][a-zA-Z.'-]*){0,2}" + // city, 1-3 words
    "[\\s,;.]*" +
    "[A-Z]{2}" + // ST
    "[\\s.,;]+" +
    "\\d{5}(?:-\\d{4})?" + // ZIP
    "(?!\\d)",
  "g",
);

/** Footer/address elements: address candidates found inside one of these
 *  win over body-text candidates (see conflict policy below). */
const LABELED_BLOCK_RE = /<(footer|address)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi;

/** Strip hostile/non-content markup before mining. */
function stripHostile(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ");
}

/** Minimal entity decoder (mirrors service-cards.ts). */
function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) =>
      String.fromCodePoint(parseInt(h, 16)),
    )
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

function normalizePhoneDigits(verbatim: string): string {
  const digits = verbatim.replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("1")
    ? digits.slice(1)
    : digits;
}

interface AddressCandidate {
  value: string;
  /** True when the candidate text also occurs inside a <footer> or
   *  <address> element (address-labeled block). */
  labeled: boolean;
  /** Offset in the cleaned document text (document order). */
  index: number;
}

/**
 * CONFLICT POLICY (bin707 case: a relocation note names one address
 * form, the footer another). When multiple DISTINCT addresses are
 * found, they are never merged into one string. Selection:
 *  1. Prefer a candidate inside a <footer> or <address> element
 *     (address-labeled block); first in document order among those.
 *  2. Else the first candidate in document order.
 * The choice is recorded in evidenceDetail (candidates count, labeled
 * count, policy name) so the selection is auditable, never silent.
 */
function selectAddress(candidates: AddressCandidate[]): AddressCandidate {
  const labeled = candidates.filter((c) => c.labeled);
  return (labeled.length > 0 ? labeled[0] : candidates[0]) as AddressCandidate;
}

/**
 * Mine phone/address contact facts from raw HTML. Returns zero or more
 * ParsedFacts (at most one "phone", at most one "address").
 */
export function mineBodyContactFacts(
  html: string,
  _url: string,
): ParsedFact[] {
  const facts: ParsedFact[] = [];
  const sanitized = stripHostile(html);
  const text = cleanText(sanitized);
  if (text === "") return facts;

  // -- Phones: verbatim observed values, deduped by normalized digits,
  //    document order.
  const phones: string[] = [];
  const seenDigits = new Set<string>();
  for (const m of text.matchAll(PHONE_RE)) {
    const verbatim = m[0];
    const key = normalizePhoneDigits(verbatim);
    if (seenDigits.has(key)) continue;
    seenDigits.add(key);
    phones.push(verbatim);
  }
  if (phones.length > 0) {
    facts.push({
      name: "phone",
      value: phones,
      sourceType: "html",
      inferred: false,
      factClass: "DIRECT_FACT",
      visibility: "public",
      evidenceDetail: `body-contact: distinct_phones=${phones.length}`,
      extractor: BODY_CONTACT_EXTRACTOR,
    });
  }

  // -- Addresses: candidates from the whole document; labeled-block
  //    membership decided by re-mining <footer>/<address> regions.
  const labeledValues = new Set<string>();
  for (const block of sanitized.matchAll(LABELED_BLOCK_RE)) {
    const regionText = cleanText(block[2]);
    for (const am of regionText.matchAll(ADDRESS_RE)) {
      labeledValues.add(am[0]);
    }
  }
  const seen = new Map<string, AddressCandidate>();
  for (const m of text.matchAll(ADDRESS_RE)) {
    const value = m[0];
    const prev = seen.get(value);
    if (prev) {
      prev.labeled = prev.labeled || labeledValues.has(value);
      continue;
    }
    seen.set(value, {
      value,
      labeled: labeledValues.has(value),
      index: m.index ?? 0,
    });
  }
  const candidates = [...seen.values()].sort((a, b) => a.index - b.index);
  if (candidates.length > 0) {
    const winner = selectAddress(candidates);
    const policy = winner.labeled ? "labeled-block" : "document-order";
    facts.push({
      name: "address",
      value: winner.value,
      sourceType: "html",
      inferred: false,
      factClass: "DIRECT_FACT",
      visibility: "public",
      evidenceDetail:
        `body-contact: candidates=${candidates.length} ` +
        `labeled=${candidates.filter((c) => c.labeled).length} ` +
        `policy=${policy}`,
      extractor: BODY_CONTACT_EXTRACTOR,
    });
  }
  return facts;
}
