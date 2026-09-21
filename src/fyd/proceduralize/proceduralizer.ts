/**
 * Proceduralizer: sources -> DISCOVER -> ACQUIRE -> PARSE -> NORMALIZE ->
 * EXTRACT -> PROVENANCE -> RESOLVE -> RELATE -> PROJECT.
 *
 * Deterministic first, AI second. The machine-readable layers are harvested
 * first, in priority order: JSON-LD / schema.org > OpenGraph > HTML
 * metadata > RSS/Atom > sitemaps. Every extracted field carries what it is,
 * the source URL, the source type, the observation time, an evidence
 * reference, a confidence when inferred, and a public flag.
 *
 * Website claims are labeled website_statement. They are never verified
 * fact. Precise personal addresses are never auto-published: location is
 * an object/claim, never a duplicated string.
 */

import type { PingObject, PingRelationship } from "@/lib/ping/types";
import { sha256Hex } from "./sha256";

/** A source the proceduralizer may acquire. */
export interface SourceRecord {
  url: string;
  sourceType: "json-ld" | "opengraph" | "html-meta" | "rss" | "atom" | "sitemap" | "html";
  discoveredAt: string;
}

/** One extracted field with full provenance. */
export interface ExtractedField {
  /** What the field is, e.g. "title", "phone", "openingHours". */
  name: string;
  value: string | string[];
  sourceUrl: string;
  sourceType: SourceRecord["sourceType"];
  observedAt: string;
  /** Evidence reference, e.g. a content hash or source span id. */
  evidenceRef: string;
  /** 1.0 when read verbatim; lower when inferred. Always present when < 1. */
  confidence: number;
  public: boolean;
  /** Website claims are always website_statement. */
  claimKind: "website_statement";
}

/** A parsed machine-readable fact, pre-provenance. */
export interface ParsedFact {
  name: string;
  value: string | string[];
  sourceType: SourceRecord["sourceType"];
  /** True when the value was inferred rather than read verbatim. */
  inferred: boolean;
}

/** Source priority for RESOLVE: machine-readable truth first. */
const SOURCE_PRIORITY: SourceRecord["sourceType"][] = [
  "json-ld",
  "opengraph",
  "html-meta",
  "rss",
  "atom",
  "sitemap",
  "html",
];

// ---------------------------------------------------------------------------
// Stage 1: DISCOVER. Enumerate candidate sources from a seed URL.
// Pure: sitemap and feed URLs follow conventions from the seed.
// ---------------------------------------------------------------------------

export function discover(seedUrl: string, observedAt: string): SourceRecord[] {
  const base = seedUrl.replace(/\/$/, "");
  const candidates: SourceRecord["sourceType"][] = [
    "sitemap",
    "rss",
    "atom",
    "html",
  ];
  const paths: Record<string, string> = {
    sitemap: "/sitemap.xml",
    rss: "/feed",
    atom: "/atom.xml",
    html: "/",
  };
  return candidates.map((sourceType) => ({
    url: base + paths[sourceType],
    sourceType,
    discoveredAt: observedAt,
  }));
}

// ---------------------------------------------------------------------------
// Stage 2: ACQUIRE. Fetch raw bytes. This is the impure boundary: network
// lives here and only here. Everything downstream is pure.
// ---------------------------------------------------------------------------

export interface AcquiredSource extends SourceRecord {
  /** Raw text; empty when the fetch failed. */
  raw: string;
  ok: boolean;
  status: number;
}

export async function acquire(
  source: SourceRecord,
  fetchImpl: (url: string) => Promise<{ status: number; text: string }>,
): Promise<AcquiredSource> {
  try {
    const res = await fetchImpl(source.url);
    return { ...source, raw: res.text, ok: res.status >= 200 && res.status < 300, status: res.status };
  } catch {
    return { ...source, raw: "", ok: false, status: 0 };
  }
}

// ---------------------------------------------------------------------------
// Stage 3: PARSE. Raw text -> structured facts. Deterministic.
// JSON-LD blocks first, then OpenGraph meta tags, then plain meta tags.
// ---------------------------------------------------------------------------

export function parse(acquired: AcquiredSource): ParsedFact[] {
  if (!acquired.ok || !acquired.raw) return [];
  const facts: ParsedFact[] = [];
  const push = (name: string, value: string | string[], inferred = false) => {
    if (value === "" || (Array.isArray(value) && value.length === 0)) return;
    facts.push({ name, value, sourceType: acquired.sourceType, inferred });
  };

  if (acquired.sourceType === "json-ld" || acquired.sourceType === "html") {
    for (const block of extractJsonLdBlocks(acquired.raw)) {
      const flat = flattenJsonLd(block);
      for (const [name, value] of flat) push(name, value);
    }
  }
  for (const [property, content] of extractMetaTags(acquired.raw)) {
    if (property.startsWith("og:")) {
      push(ogToField(property), content, false);
    } else if (property === "description" || property === "keywords") {
      push(property, content, false);
    }
  }
  const title = extractTitle(acquired.raw);
  if (title) push("title", title, false);
  return facts;
}

function extractJsonLdBlocks(html: string): unknown[] {
  const blocks: unknown[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const parsed: unknown = JSON.parse(m[1]);
      if (Array.isArray(parsed)) blocks.push(...parsed);
      else blocks.push(parsed);
    } catch {
      // Malformed JSON-LD is skipped, never fatal.
    }
  }
  return blocks;
}

const JSON_LD_FIELD_MAP: Record<string, string> = {
  name: "title",
  headline: "title",
  description: "description",
  telephone: "phone",
  email: "email",
  url: "website",
  openingHours: "hours",
  image: "images",
  sameAs: "socials",
};

function flattenJsonLd(node: unknown, out: [string, string | string[]][] = []): [string, string | string[]][] {
  if (node === null || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const item of node) flattenJsonLd(item, out);
    return out;
  }
  const record = node as Record<string, unknown>;
  for (const [key, value] of Object.entries(record)) {
    const mapped = JSON_LD_FIELD_MAP[key];
    if (!mapped) continue;
    if (typeof value === "string") out.push([mapped, value]);
    else if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
      out.push([mapped, value as string[]]);
    }
  }
  return out;
}

function extractMetaTags(html: string): [string, string][] {
  const tags: [string, string][] = [];
  const re = /<meta[^>]*?(?:property|name)=["']([^"']+)["'][^>]*?content=["']([^"']*)["'][^>]*?>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) tags.push([m[1].toLowerCase(), m[2]]);
  return tags;
}

function ogToField(property: string): string {
  const map: Record<string, string> = {
    "og:title": "title",
    "og:description": "description",
    "og:image": "images",
    "og:url": "website",
  };
  return map[property] ?? property.replace(/^og:/, "");
}

function extractTitle(html: string): string {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return m ? m[1] : "";
}

// ---------------------------------------------------------------------------
// Stage 4: NORMALIZE. Facts -> cleaned facts. Same shape as the ingestion
// normalizer (trim, collapse whitespace, strip tags, lowercase keys).
// ---------------------------------------------------------------------------

export function normalize(facts: ParsedFact[]): ParsedFact[] {
  return facts.map((f) => ({
    ...f,
    name: f.name.trim().toLowerCase(),
    value: Array.isArray(f.value)
      ? f.value.map(cleanString).filter((v) => v !== "")
      : cleanString(f.value),
  }));
}

function cleanString(value: string): string {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// Stage 5: EXTRACT. Facts -> candidate fields with classification.
// Addresses: only coarse public location claims; precise street addresses
// are dropped here and never auto-published.
// ---------------------------------------------------------------------------

export function extract(facts: ParsedFact[]): ParsedFact[] {
  const out: ParsedFact[] = [];
  for (const f of facts) {
    if (f.name === "address" || f.name === "streetaddress") {
      // Precise personal addresses are never auto-published. Keep only
      // coarse claims (city/region), drop street-level detail.
      const coarse = coarsenAddress(f.value);
      if (coarse) out.push({ ...f, name: "locality", value: coarse, inferred: true });
      continue;
    }
    if (f.name === "socials" || f.name === "sameas") {
      out.push({ ...f, name: "socials" });
      continue;
    }
    out.push(f);
  }
  return out;
}

function coarsenAddress(value: string | string[]): string | string[] {
  const pick = (s: string): string => {
    // Keep locality/region-ish tails, drop leading street numbers/names.
    const parts = s.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length <= 1) return "";
    return parts.slice(1).join(", ");
  };
  return Array.isArray(value)
    ? value.map(pick).filter(Boolean)
    : pick(value);
}

// ---------------------------------------------------------------------------
// Stage 6: PROVENANCE. Attach what/source/source-type/observed/evidence/
// confidence/public/claim-kind to every field.
// ---------------------------------------------------------------------------

export function provenance(
  source: SourceRecord,
  facts: ParsedFact[],
  observedAt: string,
  evidenceRefFor: (fact: ParsedFact) => string,
): ExtractedField[] {
  return facts.map((f) => ({
    name: f.name,
    value: f.value,
    sourceUrl: source.url,
    sourceType: source.sourceType,
    observedAt,
    evidenceRef: evidenceRefFor(f),
    confidence: f.inferred ? 0.7 : 1.0,
    public: true,
    claimKind: "website_statement" as const,
  }));
}

// ---------------------------------------------------------------------------
// Stage 7: RESOLVE. One canonical value per field name across sources.
// Priority: json-ld > opengraph > html-meta > rss > atom > sitemap > html.
// First verbatim value wins; inferred values fill gaps only.
// ---------------------------------------------------------------------------

export function resolve(fields: ExtractedField[]): ExtractedField[] {
  const byName = new Map<string, ExtractedField[]>();
  for (const f of fields) {
    const list = byName.get(f.name) ?? [];
    list.push(f);
    byName.set(f.name, list);
  }
  const resolved: ExtractedField[] = [];
  for (const [, group] of byName) {
    const sorted = group.slice().sort((a, b) => {
      const pa = SOURCE_PRIORITY.indexOf(a.sourceType);
      const pb = SOURCE_PRIORITY.indexOf(b.sourceType);
      if (pa !== pb) return pa - pb;
      return b.confidence - a.confidence;
    });
    const winner = sorted[0];
    const mergedValues = new Set<string>();
    const merged: string[] = [];
    for (const g of sorted) {
      const vals = Array.isArray(g.value) ? g.value : [g.value];
      for (const v of vals) {
        if (!mergedValues.has(v)) {
          mergedValues.add(v);
          merged.push(v);
        }
      }
    }
    resolved.push({
      ...winner,
      value: Array.isArray(winner.value) ? merged : merged[0] ?? "",
    });
  }
  resolved.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return resolved;
}

// ---------------------------------------------------------------------------
// Stage 8: RELATE. Fields -> relationships between emitted objects.
// Social links and same-domain links become relationships, not strings.
// ---------------------------------------------------------------------------

export interface RelatedPair {
  subjectHint: string;
  predicate: string;
  objectHint: string;
}

export function relate(fields: ExtractedField[]): RelatedPair[] {
  const pairs: RelatedPair[] = [];
  const socials = fields.find((f) => f.name === "socials");
  if (socials) {
    const urls = Array.isArray(socials.value) ? socials.value : [socials.value];
    for (const url of urls) {
      pairs.push({ subjectHint: "business", predicate: "links_to", objectHint: url });
    }
  }
  return pairs;
}

// ---------------------------------------------------------------------------
// Stage 9: PROJECT. Resolved fields -> PingObject graph shapes.
// Location stays an object/claim; identity and provenance are labeled.
// ---------------------------------------------------------------------------

export interface ProjectedGraph {
  objects: PingObject[];
  relationships: PingRelationship[];
}

/**
 * Derive a stable business id from the projection inputs. Pure: no
 * module state, no clock. The same website, fields, and controller
 * always yield the same id, so re-projection deduplicates instead of
 * forking. The observation time stays caller-injected
 * (createdAt/updatedAt/derivedAt) so tests can pin it.
 */
function deriveBusinessId(
  sourceUrl: string,
  controllerId: string,
  scalar: Record<string, string | string[]>,
): string {
  const canonical = JSON.stringify({
    url: sourceUrl,
    controller: controllerId,
    fields: Object.keys(scalar)
      .sort()
      .map((k) => [k, scalar[k]]),
  });
  return "website-business-" + sha256Hex(canonical).slice(0, 16);
}

export function project(
  fields: ExtractedField[],
  sourceUrl: string,
  nowIso: string,
  controllerId: string,
): ProjectedGraph {
  const scalar: Record<string, string | string[]> = {};
  for (const f of fields) scalar[f.name] = f.value;

  const businessId = deriveBusinessId(sourceUrl, controllerId, scalar);
  const provenance = {
    kind: "website-derived" as const,
    ref: "website-ingestion:" + sourceUrl,
    derivedAt: nowIso,
  };
  const business: PingObject = {
    id: businessId,
    schema: "ping.social.business@1",
    controllerId,
    visibility: "public",
    title: asString(scalar["title"] ?? new URL(sourceUrl).hostname),
    description: asString(scalar["description"] ?? ""),
    fields: scalar,
    createdAt: nowIso,
    updatedAt: nowIso,
    provenance,
  };

  const objects: PingObject[] = [business];
  const relationships: PingRelationship[] = [];

  // Location is an object/claim, not a duplicated string.
  const locality = scalar["locality"];
  if (locality && asString(locality) !== "") {
    const locationId = businessId + "-location";
    objects.push({
      id: locationId,
      schema: "ping.social.location@1",
      controllerId,
      visibility: "public",
      title: asString(locality),
      description: "Coarse public location claim from the website.",
      fields: { locality: asString(locality), claimKind: "website_statement" },
      createdAt: nowIso,
      updatedAt: nowIso,
      provenance,
    });
    relationships.push({
      id: businessId + "-located_at",
      subject: businessId,
      predicate: "located_at",
      object: locationId,
      status: "active",
      createdAt: nowIso,
      evidenceRef: "proceduralizer:extract:locality",
    });
  }

  return { objects, relationships };
}

function asString(value: string | string[]): string {
  return Array.isArray(value) ? value.join(", ") : value;
}

