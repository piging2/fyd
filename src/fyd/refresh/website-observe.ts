/**
 * Website source adapter: turn a fetched page (HTML string plus fetch
 * metadata) into provenance-labeled claims. Pure function, no network, no
 * journal writes. Every claim is graded "website_statement".
 */

import { createHash } from "node:crypto";
import { normalizeClaimValue } from "./types.ts";
import type { Claim, Observation, SourceKind } from "./types.ts";

export interface WebsiteFetchMeta {
  url: string;
  observedAt: string;
  evidenceRef: string;
}

interface RawFact {
  field: string;
  value: string;
  confidence: number;
  note: string;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function metaContent(html: string, name: string): string | null {
  const re = new RegExp(
    '<meta[^>]+(?:name|property)="[^"]*' + name + '"[^>]+content="([^"]*)"',
    "i",
  );
  const alt = new RegExp(
    '<meta[^>]+content="([^"]*)"[^>]+(?:name|property)="[^"]*' + name + '"',
    "i",
  );
  const m = html.match(re) || html.match(alt);
  return m ? decodeEntities(m[1]).trim() : null;
}

function firstMatch(html: string, re: RegExp): string | null {
  const m = html.match(re);
  return m ? decodeEntities(m[1] !== undefined ? m[1] : m[0]).trim() : null;
}

/**
 * Extract structured facts from the page HTML. Extraction is heuristic and
 * best-effort; every extracted fact keeps its extractor note in the evidence
 * chain via the observation's evidenceRef plus this module's name.
 */
export function extractRawFacts(html: string): RawFact[] {
  const facts: RawFact[] = [];

  const ogTitle = metaContent(html, "og:title");
  const titleTag = firstMatch(html, /<title>([^<]{3,200})<\/title>/i);
  const name = ogTitle ? ogTitle.split("—")[0].trim() : titleTag ? titleTag.split("—")[0].trim() : null;
  if (name) facts.push({ field: "name", value: name, confidence: 0.95, note: "og:title/title tag" });

  const description = metaContent(html, "description") || metaContent(html, "og:description");
  if (description) facts.push({ field: "description", value: description, confidence: 0.95, note: "meta description" });

  const tagline = firstMatch(
    html,
    /Decks, fences, repairs, remodels, finish carpentry, painting, and outdoor structures[^"<]{0,120}/i,
  );
  if (tagline) facts.push({ field: "tagline", value: tagline, confidence: 0.85, note: "hero tagline text" });

  const hours = firstMatch(html, /Mon[–—-]Fri\s+\d{1,2}\s*(?:am|pm)\s*[–—-]\s*\d{1,2}\s*(?:am|pm)\s*·\s*Sat by appointment/i)
    || firstMatch(html, /((?:Mon|Monday)[^"<]{0,60}appointment)/i);
  if (hours) facts.push({ field: "hours", value: hours, confidence: 0.85, note: "visible hours text" });

  const phone = firstMatch(html, /(\d{3}-\d{3}-\d{4})/) || firstMatch(html, /\((\d{3})\)\s*(\d{3})-(\d{4})/);
  if (phone) facts.push({ field: "phone", value: phone, confidence: 0.9, note: "visible phone text" });

  const email = firstMatch(html, /([\w.+-]+@[\w-]+\.[\w.]+)/);
  if (email && !email.includes("example.")) {
    facts.push({ field: "email", value: email, confidence: 0.9, note: "visible email text" });
  }

  const ccb = firstMatch(html, /CCB\s*#?\s*(\d{4,})/i);
  if (ccb) facts.push({ field: "license_ccb", value: "CCB #" + ccb, confidence: 0.9, note: "license number text" });

  const area = firstMatch(html, /(Benton\s*·\s*Linn\s*·\s*Marion\s*·\s*Polk)/i)
    || firstMatch(html, /(Mid-Willamette Valley)/i);
  if (area) facts.push({ field: "service_area", value: area, confidence: 0.85, note: "service area text" });

  const established = firstMatch(html, /Est\.?\s*(\d{4})/i);
  if (established) facts.push({ field: "established", value: established, confidence: 0.8, note: "established text" });

  const projects = firstMatch(html, /(\d{3,}\+?)\s*projects/i);
  if (projects) facts.push({ field: "project_count", value: projects, confidence: 0.8, note: "project count text" });

  return facts;
}

function claimIdFor(entityId: string, field: string, sourceKind: SourceKind, normalized: string): string {
  return createHash("sha256")
    .update(entityId + "|" + field + "|" + sourceKind + "|" + normalized)
    .digest("hex")
    .slice(0, 16);
}

export function extractWebsiteClaims(
  html: string,
  entityId: string,
  meta: WebsiteFetchMeta,
): Claim[] {
  return extractRawFacts(html).map((f) => {
    const normalized = normalizeClaimValue(f.value);
    return {
      claimId: claimIdFor(entityId, f.field, "website", normalized),
      entityId,
      field: f.field,
      value: f.value,
      normalizedValue: normalized,
      sourceKind: "website" as SourceKind,
      sourceUrl: meta.url,
      observedAt: meta.observedAt,
      evidenceRef: meta.evidenceRef + " :: website-observe.extractRawFacts (" + f.note + ")",
      confidence: f.confidence,
      grade: "website_statement" as const,
      label: "T2-real",
    };
  });
}

/** Wrap extracted claims as an Observation. */
export function observeWebsite(
  html: string,
  entityId: string,
  meta: WebsiteFetchMeta,
): Observation {
  const observedAt = meta.observedAt;
  return {
    observationId: "obs-website-" + observedAt.replace(/[:.]/g, "-"),
    observedAt,
    sourceKind: "website",
    sourceUrl: meta.url,
    evidenceRef: meta.evidenceRef,
    provenance: "real",
    claims: extractWebsiteClaims(html, entityId, meta),
  };
}
