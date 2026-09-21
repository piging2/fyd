/**
 * Proceduralizer: sources -> DISCOVER -> ACQUIRE -> PARSE -> NORMALIZE ->
 * EXTRACT -> PROVENANCE -> RESOLVE -> RELATE -> PROJECT.
 *
 * Deterministic first, AI second. The machine-readable layers are harvested
 * first, in priority order: JSON-LD / schema.org > OpenGraph > HTML
 * metadata > RSS/Atom > sitemaps. Every extracted field carries what it is,
 * the source URL, the source type, the observation time, an evidence
 * reference, a confidence when inferred, a fact class (Grill 7), and a
 * visibility tag (Grill 19).
 *
 * JSON-LD goes through src/fyd/proceduralize/structured-data.ts: discovery,
 * offline graph expansion via the `jsonld` library, entity candidates,
 * and deterministic fact extraction. The old recursive flattener is gone:
 * it could not see @graph envelopes or nested objects (RUN-NOTES.md #1-2).
 *
 * Website claims are labeled website_statement. They are never verified
 * fact. Precise street addresses are classified private and withheld
 * before generation: location is an object/claim, never a duplicated
 * string, and never a street address.
 */

import type { PingObject, PingRelationship } from "@/lib/ping/types";
import { sha256Hex } from "./sha256";
import { feedFacts } from "./feed-parser";
import {
  extractStructuredData,
  selectPrimaryBusiness,
  type EntityCandidate,
  type ScorableFact,
  type StructuredExtraction,
  type StructuredRelation,
} from "./structured-data";

/** A source the proceduralizer may acquire. */
export interface SourceRecord {
  url: string;
  sourceType: "json-ld" | "opengraph" | "html-meta" | "rss" | "atom" | "sitemap" | "html";
  discoveredAt: string;
}

/** Claim source grading. Website claims are never verified fact; feed
 *  items are per-entry claims from an RSS/Atom feed with GUID provenance. */
export type ClaimKind = "website_statement" | "feed_item";

/**
 * Grill 7: every emitted fact carries a class, so generated sites never
 * mix sourced truth with synthesis indistinguishably.
 * - DIRECT_FACT: read verbatim from an observed source (JSON-LD literal,
 *   meta tag, feed entry). Confidence 1.0.
 * - DERIVED_FACT: deterministic transform of direct facts (coarsened
 *   locality, assembled address string, platform label from a URL host).
 * - INFERENCE: heuristic or AI guess. This pipeline emits none by
 *   default; the slot exists so a future intelligence step is labeled.
 * - GENERATED_COPY: copy written by the generator lane, not the extractor.
 * - USER_OVERRIDE: owner-supplied edit applied via the patch lane.
 */
export type FactClass =
  | "DIRECT_FACT"
  | "DERIVED_FACT"
  | "INFERENCE"
  | "GENERATED_COPY"
  | "USER_OVERRIDE";

/**
 * Grill 19: visibility tag. Only material whose visibility permits the
 * public surface flows toward generation. Private context fails closed:
 * classified at extraction, withheld before resolve/project, counted in
 * the pipeline report. Architectural: required before any dogfood.
 */
export type Visibility = "public" | "private";

/** One parsed machine-readable fact, pre-provenance. factClass/visibility
 *  are optional on parse output; provenance() fills them deterministically,
 *  so every emitted ExtractedField carries both (Grill 7 + 19). */
export interface ParsedFact {
  /** What the field is, e.g. "title", "phone", "openingHours". */
  name: string;
  value: string | string[];
  sourceType: SourceRecord["sourceType"];
  /** True when the value was inferred rather than read verbatim. */
  inferred: boolean;
  /** Source grading override; provenance() defaults to website_statement. */
  claimKind?: ClaimKind;
  /** Extra provenance detail, e.g. a feed item GUID. */
  evidenceDetail?: string;
  factClass?: FactClass;
  visibility?: Visibility;
  /** Compact schema.org property, when the fact came from JSON-LD. */
  property?: string;
  /** Entity key (node @id or blank-node key), when from JSON-LD. */
  entityId?: string;
}

/** One extracted field with full provenance. factClass and visibility are
 *  required here: provenance() is the emission choke point. */
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
  factClass: FactClass;
  visibility: Visibility;
  /** Source grading for the claim; see ClaimKind. */
  claimKind: ClaimKind;
  property?: string;
  entityId?: string;
}

/** Field names that are private by policy (Grill 19). Precise street
 *  addresses are never auto-published. */
const PRIVATE_FIELD_NAMES = new Set([
  "street_address",
  "streetaddress",
  "post_office_box",
]);

export function visibilityForField(name: string): Visibility {
  return PRIVATE_FIELD_NAMES.has(name) ? "private" : "public";
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
//
// RUN-NOTES #3 fix: facts are tagged with their TRUE discovery tier
// (json-ld vs opengraph vs html-meta), not the fetch sourceType, so the
// documented RESOLVE priority fires and an RSS channel title can no
// longer outrank the organization's own JSON-LD name.
// ---------------------------------------------------------------------------

export interface ParsedResult {
  facts: ParsedFact[];
  /** Present when the source carried JSON-LD: entities, relationships,
   *  unsupported evidence, and @graph verification stats. */
  structured?: StructuredExtraction;
}

function wrapJsonLd(raw: string): string {
  return '<script type="application/ld+json">' + raw + "</script>";
}

export async function parseRich(acquired: AcquiredSource): Promise<ParsedResult> {
  if (!acquired.ok || !acquired.raw) return { facts: [] };
  // Feed XML never goes through the HTML extractors: the <title> regex
  // would misfire on channel titles, and items are feed_item claims.
  if (acquired.sourceType === "rss" || acquired.sourceType === "atom") {
    return { facts: feedFacts(acquired) };
  }
  const facts: ParsedFact[] = [];
  const push = (
    name: string,
    value: string | string[],
    sourceType: SourceRecord["sourceType"],
  ) => {
    if (value === "" || (Array.isArray(value) && value.length === 0)) return;
    facts.push({
      name,
      value,
      sourceType,
      inferred: false,
      factClass: "DIRECT_FACT",
      visibility: visibilityForField(name),
    });
  };

  const ctx = { sourceUrl: acquired.url, observedAt: acquired.discoveredAt };
  let structured: StructuredExtraction | undefined;

  if (acquired.sourceType === "json-ld") {
    structured = await extractStructuredData(wrapJsonLd(acquired.raw), ctx);
    facts.push(...structured.facts);
  } else if (acquired.sourceType === "html") {
    structured = await extractStructuredData(acquired.raw, ctx);
    facts.push(...structured.facts);
    for (const [property, content] of extractMetaTags(acquired.raw)) {
      if (property.startsWith("og:")) {
        push(ogToField(property), content, "opengraph");
      } else if (property === "description" || property === "keywords") {
        push(property, content, "html-meta");
      }
    }
    const title = extractTitle(acquired.raw);
    if (title) push("title", title, "html-meta");
  }
  // sitemap: parse() extracts nothing (RUN-NOTES #9: the fetch is pure
  // cost until a sitemap handler exists; recorded, not silently dropped).
  return { facts, structured };
}

/** Backward-compatible facts-only parse. */
export async function parse(acquired: AcquiredSource): Promise<ParsedFact[]> {
  return (await parseRich(acquired)).facts;
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
// normalizer (trim, collapse whitespace, strip tags, decode entities,
// lowercase keys). Grill 7/19 fields pass through untouched.
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

/** Decode HTML entities (RUN-NOTES #5: &amp; reached resolved fields
 *  verbatim). Tags are stripped BEFORE decoding so a literal "&lt;div&gt;"
 *  in content does not become a stripped tag. */
function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

function cleanString(value: string): string {
  return decodeEntities(value.replace(/<[^>]*>/g, ""))
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// Stage 5: EXTRACT. Facts -> candidate fields with classification.
// Addresses: only coarse public location claims; precise street addresses
// are dropped here and never auto-published (legacy flat path; the
// structured path classifies streetAddress private instead).
// ---------------------------------------------------------------------------

export function extract(facts: ParsedFact[]): ParsedFact[] {
  const out: ParsedFact[] = [];
  for (const f of facts) {
    if (f.name === "address" || f.name === "streetaddress") {
      // Precise personal addresses are never auto-published. Keep only
      // coarse claims (city/region), drop street-level detail. The
      // coarsened claim is a deterministic transform: DERIVED_FACT.
      const coarse = coarsenAddress(f.value);
      if (coarse) {
        out.push({
          ...f,
          name: "locality",
          value: coarse,
          inferred: true,
          factClass: "DERIVED_FACT",
          visibility: "public",
        });
      }
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
// confidence/fact-class/visibility/claim-kind to every field. This is the
// emission choke point: every ExtractedField leaves here carrying a
// factClass (Grill 7) and a visibility tag (Grill 19).
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
    // Per-fact tier (RUN-NOTES #3): the fact's own sourceType wins over
    // the fetch sourceType, so json-ld facts outrank og: facts from the
    // same page.
    sourceType: f.sourceType,
    observedAt,
    evidenceRef: evidenceRefFor(f),
    confidence: f.inferred ? 0.7 : 1.0,
    factClass: f.factClass ?? (f.inferred ? "INFERENCE" : "DIRECT_FACT"),
    visibility: f.visibility ?? visibilityForField(f.name),
    claimKind: f.claimKind ?? "website_statement",
    property: f.property,
    entityId: f.entityId,
  }));
}

/** Deterministic evidence reference for a fact. Pure: no clock, no state. */
export function evidenceRefForFact(fact: ParsedFact): string {
  return (
    "web:" +
    sha256Hex(
      [fact.sourceType, fact.name, JSON.stringify(fact.value), fact.entityId ?? ""].join("|"),
    ).slice(0, 12)
  );
}

// ---------------------------------------------------------------------------
// Stage 7: RESOLVE. One canonical value per field name across sources.
// Priority: json-ld > opengraph > html-meta > rss > atom > sitemap > html.
// First verbatim value wins; inferred values fill gaps only.
//
// Grill 19: private fields are withheld here, before any merging or
// projection. Private context fails closed.
// ---------------------------------------------------------------------------

export function resolve(fields: ExtractedField[]): ExtractedField[] {
  // Fail closed: private material never reaches resolution or projection.
  const open = fields.filter((f) => f.visibility === "public");
  const byName = new Map<string, ExtractedField[]>();
  for (const f of open) {
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
// Scoping: with multiple JSON-LD entities on one page (Organization,
// Person, WebPage...), only the primary business entity's facts plus the
// page-scope facts (OG/meta/title/feed, entityId undefined) resolve into
// the business field map. Other entities keep their facts for project().
// ---------------------------------------------------------------------------

export interface ScopedFields {
  /** Facts that resolve into the business object. */
  pageScope: ExtractedField[];
  /** Remaining facts, grouped by entity key, for project(). */
  entityFields: Map<string, ExtractedField[]>;
}

export function scopeFields(
  fields: ExtractedField[],
  primaryKey: string | null,
): ScopedFields {
  const pageScope: ExtractedField[] = [];
  const entityFields = new Map<string, ExtractedField[]>();
  for (const f of fields) {
    if (f.entityId === undefined || f.entityId === primaryKey) {
      pageScope.push(f);
    } else {
      const list = entityFields.get(f.entityId) ?? [];
      list.push(f);
      entityFields.set(f.entityId, list);
    }
  }
  return { pageScope, entityFields };
}

// ---------------------------------------------------------------------------
// Stage 8: RELATE. Fields -> relationships between emitted objects.
// Page-scope social links become links_to pairs (RUN-NOTES #7: these are
// now consumed by project(); previously they were dead output).
// Structured @id-reference relationships flow through project() opts.
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
// Stage 9: PROJECT. Resolved fields + entities -> PingObject graph shapes.
// Location stays an object/claim; identity and provenance are labeled.
// People, external identities, services, and products become objects when
// the JSON-LD describes them (RUN-NOTES #8: previously unreachable).
// ---------------------------------------------------------------------------

export interface ProjectedGraph {
  objects: PingObject[];
  relationships: PingRelationship[];
  /** Grill 7: per-object, per-field fact classes for the projected graph. */
  fieldClasses?: Record<string, Record<string, FactClass>>;
  /** Relationships dropped because an endpoint had no projected object. */
  droppedRelationships?: number;
}

export interface ProjectOptions {
  entities?: EntityCandidate[];
  entityFields?: Map<string, ExtractedField[]>;
  relationships?: StructuredRelation[];
  primaryKey?: string | null;
  /** Pairs from relate(): page-scope social links. */
  pairs?: RelatedPair[];
  /** Owner-supplied field overrides; applied last, tagged USER_OVERRIDE. */
  overrides?: Record<string, string | string[]>;
}

/**
 * Derive a stable business id from the projection inputs. Pure: no
 * module state, no clock. The same website, fields, and controller
 * always yield the same id, so re-projection deduplicates instead of
 * forking. The observation time stays caller-injected
 * (createdAt/updatedAt/derivedAt) so tests can pin it.
 *
 * Grill 28 verdict: KEEP (see STRUCTURED-DATA.md). This is a derived
 * projection key, not a canonical PING identity: IdentityAuthority's
 * generate_id() is non-deterministic by design (UUIDv7) and would break
 * re-projection dedup; its generate_deterministic_id() is semantically
 * identical to this hash but would couple a browser-safe lane to the
 * Python runtime. When a website-derived business is promoted to a
 * first-class PING object via the proposal path, the canonical id is
 * minted by the runtime.
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

/** Deterministic relationship id: no counters, no allocation order. */
function deriveRelationshipId(subject: string, predicate: string, object: string): string {
  return "rel-" + sha256Hex([subject, predicate, object].join("|")).slice(0, 16);
}

function asString(value: string | string[]): string {
  return Array.isArray(value) ? value.join(", ") : value;
}

function fieldOf(
  entityFields: Map<string, ExtractedField[]> | undefined,
  key: string,
  name: string,
): ExtractedField | undefined {
  return entityFields?.get(key)?.find((f) => f.name === name);
}

function allValues(
  entityFields: Map<string, ExtractedField[]> | undefined,
  key: string,
  name: string,
): string[] {
  const out: string[] = [];
  for (const f of entityFields?.get(key) ?? []) {
    if (f.name !== name) continue;
    const vals = Array.isArray(f.value) ? f.value : [f.value];
    out.push(...vals);
  }
  return [...new Set(out)];
}

/** Deterministic platform label from a URL host (mapping, not inference). */
function platformFromUrl(url: string): string {
  const host = url.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  const map: Record<string, string> = {
    "facebook.com": "facebook",
    "instagram.com": "instagram",
    "x.com": "x",
    "twitter.com": "x",
    "linkedin.com": "linkedin",
    "youtube.com": "youtube",
    "youtu.be": "youtube",
    "tiktok.com": "tiktok",
    "yelp.com": "yelp",
    "bbb.org": "bbb",
    "nextdoor.com": "nextdoor",
    "angi.com": "angi",
    "homeadvisor.com": "homeadvisor",
    "thumbtack.com": "thumbtack",
  };
  return map[host] ?? host;
}

export function project(
  fields: ExtractedField[],
  sourceUrl: string,
  nowIso: string,
  controllerId: string,
  opts: ProjectOptions = {},
): ProjectedGraph {
  // Defense in depth: project() never emits private fields even if a
  // caller skipped resolve().
  const scalar: Record<string, string | string[]> = {};
  const businessClasses: Record<string, FactClass> = {};
  for (const f of fields) {
    if (f.visibility !== "public") continue;
    scalar[f.name] = f.value;
    businessClasses[f.name] = f.factClass;
  }
  if (opts.overrides) {
    for (const [name, value] of Object.entries(opts.overrides)) {
      scalar[name] = value;
      businessClasses[name] = "USER_OVERRIDE";
    }
  }

  // -- Derived business locality: the structured PostalAddress entity's
  //    coarse parts become the business's public locality (DERIVED_FACT),
  //    so the business object carries "City, Region, Postal, Country"
  //    even though the precise street address stays private in the
  //    entity facts and never reaches the graph. Page-scope locality
  //    facts (legacy path) win if present.
  const _entities = opts.entities ?? [];
  const _entityFields = opts.entityFields;
  const _addressEntity = _entities.find((e) => e.types.includes("PostalAddress"));
  if (_addressEntity && _entityFields && !scalar["locality"]) {
    const _parts = (
      [
        allValues(_entityFields, _addressEntity.key, "address_locality")[0],
        allValues(_entityFields, _addressEntity.key, "address_region")[0],
        allValues(_entityFields, _addressEntity.key, "postal_code")[0],
        allValues(_entityFields, _addressEntity.key, "address_country")[0],
      ] as Array<string | undefined>
    ).filter((p): p is string => !!p);
    if (_parts.length > 0) {
      scalar["locality"] = _parts.join(", ");
      businessClasses["locality"] = "DERIVED_FACT";
    }
  }

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
  const fieldClasses: Record<string, Record<string, FactClass>> = {
    [businessId]: businessClasses,
  };
  let droppedRelationships = 0;

  const objectIdByEntityKey = new Map<string, string>();
  if (opts.primaryKey) objectIdByEntityKey.set(opts.primaryKey, businessId);

  const mkObject = (
    id: string,
    schema: string,
    title: string,
    description: string,
    objFields: Record<string, string | string[]>,
    classes: Record<string, FactClass>,
  ): PingObject => {
    const obj: PingObject = {
      id,
      schema,
      controllerId,
      visibility: "public",
      title,
      description,
      fields: objFields,
      createdAt: nowIso,
      updatedAt: nowIso,
      provenance,
    };
    objects.push(obj);
    fieldClasses[id] = classes;
    return obj;
  };

  const mkRel = (subject: string, predicate: string, object: string, evidenceRef: string) => {
    relationships.push({
      id: deriveRelationshipId(subject, predicate, object),
      subject,
      predicate,
      object,
      status: "active",
      createdAt: nowIso,
      evidenceRef,
    });
  };

  const entities = opts.entities ?? [];
  const entityFields = opts.entityFields;

  // -- Location: prefer the structured PostalAddress entity; fall back to
  //    the legacy coarse locality string.
  const addressEntity = entities.find((e) => e.types.includes("PostalAddress"));
  const legacyLocality = scalar["locality"];
  if (addressEntity && entityFields) {
    const parts = [
      allValues(entityFields, addressEntity.key, "address_locality")[0],
      allValues(entityFields, addressEntity.key, "address_region")[0],
      allValues(entityFields, addressEntity.key, "postal_code")[0],
      allValues(entityFields, addressEntity.key, "address_country")[0],
    ].filter((p): p is string => !!p);
    const locationId = businessId + "-location";
    objectIdByEntityKey.set(addressEntity.key, locationId);
    const locFields: Record<string, string | string[]> = {};
    const locClasses: Record<string, FactClass> = {};
    for (const n of ["address_locality", "address_region", "postal_code", "address_country"] as const) {
      const v = allValues(entityFields, addressEntity.key, n)[0];
      if (v) {
        locFields[n] = v;
        locClasses[n] = "DIRECT_FACT";
      }
    }
    const locality = parts.join(", ");
    if (locality) {
      locFields["locality"] = locality;
      locClasses["locality"] = "DERIVED_FACT";
    }
    mkObject(
      locationId,
      "ping.social.location@1",
      locality || "Service area",
      "Coarse public location claim from the website's structured data.",
      { ...locFields, claimKind: "website_statement" },
      { ...locClasses, claimKind: "DIRECT_FACT" },
    );
    mkRel(businessId, "located_at", locationId, "proceduralizer:project:postal-address");
  } else if (legacyLocality && asString(legacyLocality) !== "") {
    const locationId = businessId + "-location";
    mkObject(
      locationId,
      "ping.social.location@1",
      asString(legacyLocality),
      "Coarse public location claim from the website.",
      { locality: asString(legacyLocality), claimKind: "website_statement" },
      { locality: businessClasses["locality"] ?? "DIRECT_FACT", claimKind: "DIRECT_FACT" },
    );
    mkRel(businessId, "located_at", locationId, "proceduralizer:extract:locality");
  }

  // -- People: Person entities with names.
  for (const e of entities) {
    if (!e.types.includes("Person")) continue;
    const name = fieldOf(entityFields, e.key, "title")?.value;
    if (!name || asString(name) === "") continue;
    const personId = `${businessId}-person-${sha256Hex(e.key).slice(0, 12)}`;
    objectIdByEntityKey.set(e.key, personId);
    const pFields: Record<string, string | string[]> = { name: asString(name) };
    const pClasses: Record<string, FactClass> = { name: "DIRECT_FACT" };
    const jobTitle = fieldOf(entityFields, e.key, "job_title")?.value;
    if (jobTitle) {
      pFields["job_title"] = asString(jobTitle);
      pClasses["job_title"] = "DIRECT_FACT";
    }
    mkObject(
      personId,
      "ping.social.person@1",
      asString(name),
      `Person described in the website's structured data.`,
      { ...pFields, claimKind: "website_statement" },
      { ...pClasses, claimKind: "DIRECT_FACT" },
    );
  }

  // -- External identities: sameAs URLs become link candidates with
  //    evidence (field rule), not bare strings.
  const extIdByUrl = new Map<string, string>();
  const ensureExternalIdentity = (url: string): string => {
    const prev = extIdByUrl.get(url);
    if (prev) return prev;
    const extId = `${businessId}-ext-${sha256Hex(url).slice(0, 12)}`;
    extIdByUrl.set(url, extId);
    mkObject(
      extId,
      "ping.social.external_identity@1",
      platformFromUrl(url),
      `External profile linked from the website's structured data.`,
      {
        url,
        platform: platformFromUrl(url),
        claimKind: "website_statement",
      },
      { url: "DIRECT_FACT", platform: "DERIVED_FACT", claimKind: "DIRECT_FACT" },
    );
    return extId;
  };
  if (entityFields) {
    for (const e of entities) {
      const subjectId = objectIdByEntityKey.get(e.key);
      if (!subjectId) continue;
      for (const url of allValues(entityFields, e.key, "socials")) {
        if (!/^https?:\/\//i.test(url)) continue;
        const extId = ensureExternalIdentity(url);
        mkRel(subjectId, "links_to", extId, `proceduralizer:project:sameAs:${e.key}`);
      }
    }
  }

  // -- Services and products: Service/Product entities (RUN-NOTES #8).
  //    Service extraction lane (2026-09-21): service_type and area_served
  //    literals ride along as DIRECT_FACT fields when the JSON-LD carries
  //    them. The offers edge stays the product-facing summary edge
  //    (generator ROLE_PREDICATES accepts provides|offers).
  for (const e of entities) {
    const isService = e.types.includes("Service");
    const isProduct = e.types.includes("Product");
    if (!isService && !isProduct) continue;
    const name = fieldOf(entityFields, e.key, "title")?.value;
    if (!name || asString(name) === "") continue;
    const kind = isService ? "service" : "product";
    const objId = `${businessId}-${kind}-${sha256Hex(e.key).slice(0, 12)}`;
    objectIdByEntityKey.set(e.key, objId);
    const sFields: Record<string, string | string[]> = { name: asString(name) };
    const sClasses: Record<string, FactClass> = { name: "DIRECT_FACT" };
    const desc = fieldOf(entityFields, e.key, "description")?.value;
    if (desc) {
      sFields["description"] = asString(desc);
      sClasses["description"] = "DIRECT_FACT";
    }
    if (isService) {
      const serviceType = fieldOf(entityFields, e.key, "service_type")?.value;
      if (serviceType) {
        sFields["service_type"] = asString(serviceType);
        sClasses["service_type"] = "DIRECT_FACT";
      }
      const areaServed = allValues(entityFields, e.key, "area_served");
      if (areaServed.length > 0) {
        sFields["area_served"] = areaServed.length === 1 ? areaServed[0] : areaServed;
        sClasses["area_served"] = "DIRECT_FACT";
      }
    }
    mkObject(
      objId,
      `ping.social.${kind}@1`,
      asString(name),
      `${isService ? "Service" : "Product"} described in the website's structured data.`,
      { ...sFields, claimKind: "website_statement" },
      { ...sClasses, claimKind: "DIRECT_FACT" },
    );
    mkRel(businessId, "offers", objId, `proceduralizer:project:${kind}:${e.key}`);
  }

  // -- Offers: Offer entities (Service extraction lane, 2026-09-21). An
  //    Offer is the evidence node behind makesOffer/itemOffered chains:
  //    Business -makes_offer-> Offer -item_offered-> Service. Projected
  //    when it has a name, a description, or an itemOffered link; a bare
  //    node with none of those is noise, not evidence. The schema id
  //    ping.social.offer@1 was already known (types.ts) and already
  //    answerable (ask-composer); emission was the missing piece.
  for (const e of entities) {
    if (!e.types.includes("Offer")) continue;
    const name = fieldOf(entityFields, e.key, "title")?.value;
    const desc = fieldOf(entityFields, e.key, "description")?.value;
    const itemOffered = (opts.relationships ?? []).some(
      (r) => r.subjectKey === e.key && r.property === "itemOffered",
    );
    if ((!name || asString(name) === "") && !desc && !itemOffered) continue;
    const objId = `${businessId}-offer-${sha256Hex(e.key).slice(0, 12)}`;
    objectIdByEntityKey.set(e.key, objId);
    const oFields: Record<string, string | string[]> = {};
    const oClasses: Record<string, FactClass> = {};
    if (name && asString(name) !== "") {
      oFields["name"] = asString(name);
      oClasses["name"] = "DIRECT_FACT";
    } else {
      // Fallback label: the offer exists (itemOffered link) but the source
      // gave it no name. The label is derived, not a direct fact.
      oFields["name"] = "Offer";
      oClasses["name"] = "DERIVED_FACT";
    }
    if (desc) {
      oFields["description"] = asString(desc);
      oClasses["description"] = "DIRECT_FACT";
    }
    mkObject(
      objId,
      "ping.social.offer@1",
      asString(name ?? "Offer"),
      `Offer described in the website's structured data.`,
      { ...oFields, claimKind: "website_statement" },
      { ...oClasses, claimKind: "DIRECT_FACT" },
    );
  }

  // -- Structured @id-reference relationships (subject/object mapped
  //    through the entity->object map; unmapped endpoints are dropped and
  //    counted, never half-emitted).
  for (const r of opts.relationships ?? []) {
    const subject = objectIdByEntityKey.get(r.subjectKey);
    const object = objectIdByEntityKey.get(r.objectKey);
    if (!subject || !object || subject === object) {
      droppedRelationships++;
      continue;
    }
    mkRel(subject, r.predicate, object, `proceduralizer:structured:${r.property}`);
  }

  // -- Page-scope pairs from relate() (RUN-NOTES #7: now consumed).
  for (const p of opts.pairs ?? []) {
    const subject = p.subjectHint === "business" ? businessId : objectIdByEntityKey.get(p.subjectHint);
    if (!subject) {
      droppedRelationships++;
      continue;
    }
    let object: string | undefined;
    if (/^https?:\/\//i.test(p.objectHint)) {
      object = ensureExternalIdentity(p.objectHint);
    } else {
      object = objectIdByEntityKey.get(p.objectHint);
    }
    if (!object || subject === object) {
      droppedRelationships++;
      continue;
    }
    mkRel(subject, p.predicate, object, "proceduralizer:relate");
  }

  // Deterministic order: ids are content-derived, sort for stability.
  // Dedupe identical (subject, predicate, object) triples first: the
  // structured address projection and the @id-reference extraction can
  // both emit the same link (e.g. business located_at location).
  const seenRel = new Set<string>();
  const uniqueRelationships = relationships.filter((r) => {
    const k = r.subject + "|" + r.predicate + "|" + r.object;
    if (seenRel.has(k)) return false;
    seenRel.add(k);
    return true;
  });
  objects.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  uniqueRelationships.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return { objects, relationships: uniqueRelationships, fieldClasses, droppedRelationships };
}

// ---------------------------------------------------------------------------
// Full pipeline orchestration: acquired sources -> projected graph +
// per-source report. This is the composition the regression corpus runs.
// ---------------------------------------------------------------------------

export interface PipelineOptions {
  sourceUrl: string;
  observedAt: string;
  controllerId: string;
  /** Owner-supplied field overrides (tagged USER_OVERRIDE). */
  overrides?: Record<string, string | string[]>;
}

export interface PipelineReport {
  sourceUrl: string;
  factsDiscovered: number;
  factsByClass: Record<FactClass, number>;
  factsBySource: Record<string, number>;
  objectsGenerated: number;
  relationshipsGenerated: number;
  /** Honest unsupported-evidence list: what the bytes had that the
   *  pipeline could not turn into facts. */
  unsupported: StructuredExtraction["unsupported"];
  /** Private facts classified and withheld before generation (Grill 19). */
  privateWithheld: number;
  /** @GRAPH VERIFIED: every node the expansion visited. */
  graphNodesVisited: number;
  graphNodeIds: string[];
}

export interface PipelineOutput {
  graph: ProjectedGraph;
  report: PipelineReport;
}

function mergeStructuredExtractions(
  extractions: StructuredExtraction[],
): StructuredExtraction {
  const facts: ParsedFact[] = [];
  const relationships: StructuredRelation[] = [];
  const unsupported: StructuredExtraction["unsupported"] = [];
  const seenEntities = new Map<string, EntityCandidate>();
  const seenNodeIds = new Set<string>();
  const stats = {
    blocksTotal: 0,
    blocksOk: 0,
    blocksMalformed: 0,
    nodesVisited: 0,
    nodeIds: [] as string[],
    privateFactsWithheld: 0,
  };
  for (const e of extractions) {
    facts.push(...e.facts);
    relationships.push(...e.relationships);
    unsupported.push(...e.unsupported);
    for (const ent of e.entities) {
      if (!seenEntities.has(ent.key)) seenEntities.set(ent.key, ent);
    }
    stats.blocksTotal += e.stats.blocksTotal;
    stats.blocksOk += e.stats.blocksOk;
    stats.blocksMalformed += e.stats.blocksMalformed;
    stats.privateFactsWithheld += e.stats.privateFactsWithheld;
    // nodesVisited is the per-extraction unique-node count (pre-chrome-skip):
    // "@GRAPH VERIFIED" means every expanded node was seen, including the
    // chrome node that was then deliberately skipped (recorded as
    // unsupported evidence). The merged entity list is post-skip, so the
    // count cannot be recomputed from it; accumulate it here.
    stats.nodesVisited += e.stats.nodesVisited;
    for (const id of e.stats.nodeIds) {
      if (!seenNodeIds.has(id)) {
        seenNodeIds.add(id);
        stats.nodeIds.push(id);
      }
    }
  }
  const entities = [...seenEntities.values()].sort((a, b) =>
    a.key < b.key ? -1 : a.key > b.key ? 1 : 0,
  );
  stats.nodeIds.sort();
  relationships.sort((a, b) => {
    const ka = a.subjectKey + "|" + a.predicate + "|" + a.objectKey;
    const kb = b.subjectKey + "|" + b.predicate + "|" + b.objectKey;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
  return { facts, relationships, entities, unsupported, stats };
}

export async function runExtractionPipeline(
  acquired: AcquiredSource[],
  opts: PipelineOptions,
): Promise<PipelineOutput> {
  const extractions: StructuredExtraction[] = [];
  const allFacts: ParsedFact[] = [];
  for (const a of acquired) {
    const r = await parseRich(a);
    allFacts.push(...r.facts);
    if (r.structured) extractions.push(r.structured);
  }
  const structured = mergeStructuredExtractions(extractions);

  const normalized = normalize(allFacts);
  const extracted = extract(normalized);
  const fields = provenance(
    { url: opts.sourceUrl, sourceType: "html", discoveredAt: opts.observedAt },
    extracted,
    opts.observedAt,
    evidenceRefForFact,
  );

  const factsByEntity = new Map<string, ScorableFact[]>();
  for (const f of fields) {
    if (f.entityId === undefined) continue;
    const list = factsByEntity.get(f.entityId) ?? [];
    list.push({ name: f.name, value: f.value });
    factsByEntity.set(f.entityId, list);
  }
  const primaryKey = selectPrimaryBusiness(structured.entities, factsByEntity, opts.sourceUrl);
  const { pageScope, entityFields } = scopeFields(fields, primaryKey);
  const resolved = resolve(pageScope);
  const pairs = relate(pageScope);

  const graph = project(resolved, opts.sourceUrl, opts.observedAt, opts.controllerId, {
    entities: structured.entities,
    entityFields,
    relationships: structured.relationships,
    primaryKey,
    pairs,
    overrides: opts.overrides,
  });

  const factsByClass = {
    DIRECT_FACT: 0,
    DERIVED_FACT: 0,
    INFERENCE: 0,
    GENERATED_COPY: 0,
    USER_OVERRIDE: 0,
  } satisfies Record<FactClass, number>;
  const sourceCounts: Record<string, number> = {};
  for (const f of fields) {
    factsByClass[f.factClass]++;
    sourceCounts[f.sourceType] = (sourceCounts[f.sourceType] ?? 0) + 1;
  }
  // Sorted keys: the report must not depend on source ingestion order.
  const factsBySource: Record<string, number> = {};
  for (const k of Object.keys(sourceCounts).sort()) factsBySource[k] = sourceCounts[k];

  return {
    graph,
    report: {
      sourceUrl: opts.sourceUrl,
      factsDiscovered: fields.length,
      factsByClass,
      factsBySource,
      objectsGenerated: graph.objects.length,
      relationshipsGenerated: graph.relationships.length,
      unsupported: structured.unsupported,
      privateWithheld: fields.filter((f) => f.visibility === "private").length,
      graphNodesVisited: structured.stats.nodesVisited,
      graphNodeIds: structured.stats.nodeIds,
    },
  };
}
