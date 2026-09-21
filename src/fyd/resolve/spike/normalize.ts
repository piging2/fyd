/**
 * Normalization layer (spike-1). Pure, deterministic, dependency-free.
 *
 * Design choices, documented because they are the spike's falsifiable
 * claims:
 * - URLs: scheme, www., query, fragment, trailing slash, and trailing
 *   punctuation artifacts (a real ";" artifact exists in the pipeline data)
 *   are dropped. The PATH is kept: "/contact" and "/" are different
 *   strings and do NOT exact-match. Host equality is still available as an
 *   ambiguous-tier signal.
 * - Phones: digits only; a leading US country code is stripped; exactly 10
 *   digits or empty. Anything else (extensions, short codes) is UNKNOWN,
 *   never coerced.
 * - Names: lowercase, diacritics stripped, "&" -> "and", punctuation
 *   removed, legal-entity suffixes dropped (llc, inc, co, corp, ltd,
 *   pllc, pa, dba, company). No stemming: "plumbing" and "plumber" stay
 *   distinct; the fuzzy tier owns that ambiguity.
 * - Addresses: lowercase, common US street/suite abbreviations expanded
 *   (st->street, ave->avenue, ste->suite, ...), punctuation removed.
 *   Suite/unit tokens are KEPT: "same street different suite" must not
 *   exact-match.
 */

import { NORMALIZER_VERSION } from "./types.ts";

export { NORMALIZER_VERSION };

const LEGAL_SUFFIXES = new Set([
  "llc", "inc", "co", "corp", "corporation", "ltd", "pllc", "pa", "dba", "company",
]);

const STREET_EXPANSIONS: Record<string, string> = {
  st: "street", ave: "avenue", av: "avenue", rd: "road", blvd: "boulevard",
  dr: "drive", ln: "lane", ct: "court", cir: "circle", pkwy: "parkway",
  ste: "suite", hwy: "highway", n: "north", s: "south", e: "east", w: "west",
};

function stripDiacritics(s: string): string {
  return s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}

export function normalizeUrl(raw: string | undefined): string {
  if (!raw) return "";
  let u = raw.trim().toLowerCase();
  // Drop trailing punctuation artifacts observed in real pipeline data.
  u = u.replace(/[;.,]+$/, "");
  u = u.replace(/^https?:\/\//, "");
  u = u.replace(/^www\./, "");
  const hash = u.indexOf("#");
  if (hash >= 0) u = u.slice(0, hash);
  const q = u.indexOf("?");
  if (q >= 0) u = u.slice(0, q);
  if (u.endsWith("/") && u.length > 1) u = u.slice(0, -1);
  return u;
}

/** Host only, for the ambiguous tier ("/contact" vs "/" still score). */
export function urlHost(raw: string | undefined): string {
  const n = normalizeUrl(raw);
  const slash = n.indexOf("/");
  return slash >= 0 ? n.slice(0, slash) : n;
}

export function normalizePhone(raw: string | undefined): string {
  if (!raw) return "";
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  return digits.length === 10 ? digits : "";
}

/** First 6 digits (area + exchange) as a weak blocking/scoring signal. */
export function phoneArea(raw: string | undefined): string {
  const n = normalizePhone(raw);
  return n ? n.slice(0, 6) : "";
}

export function normalizeName(raw: string | undefined): string {
  if (!raw) return "";
  let s = stripDiacritics(raw.toLowerCase());
  s = s.replace(/&/g, " and ");
  s = s.replace(/[^a-z0-9 ]/g, " ");
  const tokens = s
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => !LEGAL_SUFFIXES.has(t));
  return tokens.join(" ");
}

export function normalizeAddress(raw: string | undefined): string {
  if (!raw) return "";
  let s = stripDiacritics(raw.toLowerCase());
  s = s.replace(/[^a-z0-9 ]/g, " ");
  const tokens = s
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => STREET_EXPANSIONS[t] ?? t);
  return tokens.join(" ");
}

export function normalizeCity(raw: string | undefined): string {
  if (!raw) return "";
  return stripDiacritics(raw.toLowerCase()).replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
}

/** Lowercased word tokens of the normalized name, for blocking. */
export function nameTokens(raw: string | undefined): string[] {
  return normalizeName(raw).split(" ").filter(Boolean);
}
