/**
 * Structured-data extraction: raw HTML -> JSON-LD discovery -> graph/node
 * expansion (via the `jsonld` library, never a hand-rolled processor) ->
 * entity candidates -> deterministic fact extraction.
 *
 * Why the library: JSON-LD's graph semantics (@graph envelopes, @id
 * reference merging, blank-node labeling, multi-value @type, nested node
 * objects) are exactly what jsonld.flatten() implements. Hand-rolling a
 * partial processor is how the old flattener silently dropped the entire
 * Rank Math @graph on the Coppersmith site (RUN-NOTES.md failure #1).
 *
 * Offline by design: the pipeline NEVER fetches remote contexts. A
 * schema.org @context is rewritten to the equivalent inline
 * {"@vocab": "https://schema.org/"} (faithful: the published schema.org
 * context is @vocab plus aliases), and the document loader refuses every
 * other remote URL. A block that needs a remote context is recorded as
 * unsupported evidence, never fetched.
 *
 * Determinism: no module state. Blank nodes are re-keyed by content hash
 * (never the library's _:bN labels, which are allocation-order labels),
 * entities are sorted by key, relationships derive ids from
 * subject|predicate|object. Same source -> same facts -> same ids ->
 * same relationships, regardless of process, import order, or prior
 * ingestions.
 *
 * Harvest note: normalizeUrl/normalizePhone below are vendored from
 * src/fyd/resolve/spike/normalize.ts (spike-1). A direct import fails
 * under this lane's ts-jest node resolution (the spike's `./types.ts`
 * extension import); the algorithms are reused verbatim with attribution
 * instead of re-derived.
 */

import jsonld, { type JsonLdDocument } from "jsonld";
import type { FactClass, ParsedFact, Visibility } from "./proceduralizer";
import { sha256Hex } from "./sha256";

// ---------------------------------------------------------------------------
// Vendored from src/fyd/resolve/spike/normalize.ts (spike-1, verbatim).
// ---------------------------------------------------------------------------

function normalizeUrl(raw: string | undefined): string {
  if (!raw) return "";
  let u = raw.trim().toLowerCase();
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

function urlHost(raw: string | undefined): string {
  const n = normalizeUrl(raw);
  const slash = n.indexOf("/");
  return slash >= 0 ? n.slice(0, slash) : n;
}

// ---------------------------------------------------------------------------
// Stage: STRUCTURED-DATA DISCOVERY. Find JSON-LD blocks in raw HTML.
// Malformed blocks are recorded, never fatal.
// ---------------------------------------------------------------------------

export interface StructuredDataBlock {
  index: number;
  ok: boolean;
  raw: string;
  parsed?: unknown;
  error?: string;
}

export function discoverStructuredData(html: string): StructuredDataBlock[] {
  const blocks: StructuredDataBlock[] = [];
  const re =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  let index = 0;
  while ((m = re.exec(html)) !== null) {
    const raw = m[1];
    try {
      blocks.push({ index, ok: true, raw, parsed: JSON.parse(raw) });
    } catch (err) {
      blocks.push({
        index,
        ok: false,
        raw,
        error: err instanceof Error ? err.message : "JSON parse error",
      });
    }
    index++;
  }
  return blocks;
}

// ---------------------------------------------------------------------------
// Stage: GRAPH/NODE EXPANSION via the jsonld library (offline).
// ---------------------------------------------------------------------------

const SCHEMA_ORG = "https://schema.org/";
const SCHEMA_PREFIX_RE = /^https?:\/\/schema\.org\//;
const SCHEMA_CONTEXT_RE = /^https?:\/\/(www\.)?schema\.org\/?$/;

function rewriteContextValue(ctx: unknown): unknown {
  if (typeof ctx === "string") {
    if (SCHEMA_CONTEXT_RE.test(ctx.trim())) return { "@vocab": SCHEMA_ORG };
    return ctx; // Non-schema remote context: left alone; the loader refuses it.
  }
  if (Array.isArray(ctx)) return ctx.map(rewriteContextValue);
  return ctx;
}

/** Rewrite only the top-level @context; node bodies are the library's job.
 *  A block with NO declared @context gets the pipeline's input-vocabulary
 *  default (schema.org @vocab). Documented assumption: JSON-LD embedded in
 *  HTML pages without a context is overwhelmingly schema.org, and the
 *  property tables only know schema.org terms. A wrong-vocabulary block
 *  would already be unreadable; the default keeps the common case working
 *  instead of dropping every term. Recorded in STRUCTURED-DATA.md. */
function offlineContext(doc: unknown): unknown {
  if (Array.isArray(doc)) return doc.map(offlineContext);
  if (doc !== null && typeof doc === "object") {
    const rec = doc as Record<string, unknown>;
    if (!("@context" in rec)) {
      return { ...rec, "@context": { "@vocab": SCHEMA_ORG } };
    }
    return { ...rec, "@context": rewriteContextValue(rec["@context"]) };
  }
  return doc;
}

interface LoadedDocument {
  contextUrl: null;
  documentUrl: string;
  document: unknown;
}

async function offlineDocumentLoader(url: string): Promise<LoadedDocument> {
  if (SCHEMA_CONTEXT_RE.test(url)) {
    return {
      contextUrl: null,
      documentUrl: url,
      document: { "@context": { "@vocab": SCHEMA_ORG } },
    };
  }
  // Fail closed: private context and untrusted remotes are never fetched.
  throw new Error(`structured-data: offline; refusing remote context ${url}`);
}

export interface ExpandedNode {
  "@id": string;
  "@type"?: string[];
  [property: string]: unknown;
}

export interface FlattenedNode {
  node: ExpandedNode;
  blockIndex: number;
}

function extractGraph(flattened: unknown): ExpandedNode[] {
  // jsonld.flatten resolves to a JSON-LD array of nodes.
  if (Array.isArray(flattened)) return flattened as ExpandedNode[];
  if (flattened === null || typeof flattened !== "object") return [];
  const rec = flattened as Record<string, unknown>;
  if (Array.isArray(rec["@graph"])) return rec["@graph"] as ExpandedNode[];
  if (typeof rec["@id"] === "string") return [rec as unknown as ExpandedNode];
  return [];
}

export async function expandJsonLdBlocks(
  blocks: StructuredDataBlock[],
): Promise<{ nodes: FlattenedNode[]; unsupported: UnsupportedEvidence[] }> {
  const nodes: FlattenedNode[] = [];
  const unsupported: UnsupportedEvidence[] = [];
  for (const block of blocks) {
    if (!block.ok) {
      unsupported.push({
        kind: "malformed-block",
        blockIndex: block.index,
        reason: "JSON-LD block failed to parse",
        detail: block.error ?? "",
      });
      continue;
    }
    try {
      // NOTE: flatten(input, ctx?, options?). The documentLoader belongs in
      // the THIRD argument (options). Passing it as the second argument
      // makes jsonld read it as a @context, whose function-valued
      // "documentLoader" term is invalid ("@context term values must be
      // strings or objects").
      const flattened = (await jsonld.flatten(
        offlineContext(block.parsed) as JsonLdDocument,
        undefined,
        { documentLoader: offlineDocumentLoader },
      )) as unknown;
      for (const node of extractGraph(flattened)) {
        nodes.push({ node, blockIndex: block.index });
      }
    } catch (err) {
      unsupported.push({
        kind: "expansion-failed",
        blockIndex: block.index,
        reason: "jsonld expansion failed (offline)",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { nodes, unsupported };
}

// ---------------------------------------------------------------------------
// Stage: ENTITY CANDIDATES. One candidate per distinct node. The library
// merges same-@id nodes; blank nodes are re-keyed by content hash so
// identity never depends on the library's allocation-order _:bN labels.
// ---------------------------------------------------------------------------

export interface EntityCandidate {
  /** Stable key: the @id IRI, or "blank:<sha256>" for blank nodes. */
  key: string;
  /** The @id as emitted by the library ("_:bN" for blank nodes). */
  nodeId: string;
  /** Compact schema.org type names, sorted, deduped. */
  types: string[];
  blockIndex: number;
  node: ExpandedNode;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  const rec = value as Record<string, unknown>;
  return (
    "{" +
    Object.keys(rec)
      .sort()
      .map((k) => JSON.stringify(k) + ":" + canonicalJson(rec[k]))
      .join(",") +
    "}"
  );
}

function compactTerm(iri: string): string {
  return iri.replace(SCHEMA_PREFIX_RE, "");
}

function typeNames(node: ExpandedNode): string[] {
  const t = node["@type"];
  const arr = Array.isArray(t) ? t : t === undefined ? [] : [t];
  const names = arr
    .map((x) => (typeof x === "string" ? compactTerm(x) : ""))
    .filter((s) => s !== "");
  return [...new Set(names)].sort();
}

export function entityCandidates(nodes: FlattenedNode[]): EntityCandidate[] {
  const byKey = new Map<string, EntityCandidate>();
  for (const { node, blockIndex } of nodes) {
    const nodeId = typeof node["@id"] === "string" ? node["@id"] : "";
    let key: string;
    if (nodeId && !nodeId.startsWith("_:")) {
      key = nodeId;
    } else {
      const { "@id": _drop, ...rest } = node;
      key = "blank:" + sha256Hex(canonicalJson(rest));
    }
    const prev = byKey.get(key);
    // Identical blank nodes merge into one entity (same address stated
    // twice is one address). Keep the earliest block index for provenance.
    if (!prev || blockIndex < prev.blockIndex) {
      byKey.set(key, { key, nodeId, types: typeNames(node), blockIndex, node });
    }
  }
  return [...byKey.values()].sort((a, b) =>
    a.key < b.key ? -1 : a.key > b.key ? 1 : 0,
  );
}

// ---------------------------------------------------------------------------
// Stage: DETERMINISTIC FACT EXTRACTION. Expanded-form values are arrays of
// {"@value": ...} (literals) or {"@id": ...} (references). Literals become
// DIRECT_FACTs; references become relationships. Nothing is flattened into
// dot paths; nested typed nodes stay entities.
// ---------------------------------------------------------------------------

export interface StructuredRelation {
  subjectKey: string;
  predicate: string;
  objectKey: string;
  /** Compact schema.org property the relationship came from. */
  property: string;
  blockIndex: number;
}

export interface UnsupportedEvidence {
  kind:
    | "malformed-block"
    | "expansion-failed"
    | "unmapped-property"
    | "unmapped-node-type"
    | "site-chrome-node";
  blockIndex: number;
  entityKey?: string;
  property?: string;
  reason: string;
  detail?: string;
}

export interface StructuredExtraction {
  facts: ParsedFact[];
  relationships: StructuredRelation[];
  entities: EntityCandidate[];
  unsupported: UnsupportedEvidence[];
  stats: {
    blocksTotal: number;
    blocksOk: number;
    blocksMalformed: number;
    nodesVisited: number;
    /** Every @id visited, sorted. @GRAPH VERIFIED means this is complete. */
    nodeIds: string[];
    privateFactsWithheld: number;
  };
}

/** Compact schema.org property -> pipeline field name (literal values). */
const LITERAL_FACTS: Record<string, string> = {
  name: "title",
  alternateName: "title",
  headline: "title",
  description: "description",
  telephone: "phone",
  email: "email",
  url: "website",
  openingHours: "hours",
  sameAs: "socials",
  priceRange: "price_range",
  areaServed: "area_served",
  serviceType: "service_type",
  slogan: "slogan",
  foundingDate: "founded",
  datePublished: "date_published",
  dateModified: "date_modified",
  currenciesAccepted: "currencies",
  paymentAccepted: "payment",
  jobTitle: "job_title",
  // PostalAddress structured fields (kept structured; scoped to the address entity).
  addressLocality: "address_locality",
  addressRegion: "address_region",
  postalCode: "postal_code",
  addressCountry: "address_country",
  streetAddress: "street_address",
  postOfficeBoxNumber: "post_office_box",
  // GeoCoordinates.
  latitude: "latitude",
  longitude: "longitude",
  // ImageObject.
  contentUrl: "image_url",
  caption: "caption",
};

/** Grill 19: properties whose values are private by policy. Precise street
 *  addresses are never auto-published; they are classified, counted, and
 *  withheld before generation (fail closed). */
const PRIVATE_PROPERTIES = new Set(["streetAddress", "postOfficeBoxNumber"]);

function visibilityForProperty(property: string): Visibility {
  return PRIVATE_PROPERTIES.has(property) ? "private" : "public";
}

/** schema.org property -> relationship predicate for @id references. */
const PREDICATE_MAP: Record<string, string> = {
  location: "located_at",
  address: "located_at",
  logo: "has_logo",
  image: "has_image",
  publisher: "published_by",
  author: "authored_by",
  worksFor: "works_for",
  about: "about",
  isPartOf: "part_of",
  mainEntityOfPage: "main_entity_of",
  primaryImageOfPage: "primary_image_of",
  containsPlace: "contains_place",
  department: "has_department",
  subOrganization: "has_sub_organization",
  parentOrganization: "parent_organization",
  memberOf: "member_of",
  founder: "founded_by",
  employee: "has_employee",
  brand: "has_brand",
  makesOffer: "makes_offer",
  areaServed: "serves_area",
  provider: "provided_by",
  itemOffered: "item_offered",
  offers: "offers",
};

/** Node types that are site chrome, never business entities. */
const SITE_CHROME_TYPES = new Set(["SearchAction"]);

function literalValues(value: unknown): string[] {
  const out: string[] = [];
  const arr = Array.isArray(value) ? value : [value];
  for (const item of arr) {
    if (item !== null && typeof item === "object") {
      const rec = item as Record<string, unknown>;
      if ("@list" in rec) {
        out.push(...literalValues(rec["@list"]));
        continue;
      }
      if ("@value" in rec) {
        const v = rec["@value"];
        if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
          out.push(String(v));
        }
      }
    } else if (typeof item === "string") {
      out.push(item);
    }
  }
  return out;
}

/** @id references (excluding {"@value":...} literals and blank targets
 *  handled as entities elsewhere). Returns the referenced @id strings. */
function idRefs(value: unknown): string[] {
  const out: string[] = [];
  const arr = Array.isArray(value) ? value : [value];
  for (const item of arr) {
    if (item !== null && typeof item === "object") {
      const rec = item as Record<string, unknown>;
      if (typeof rec["@id"] === "string" && !("@value" in rec)) {
        out.push(rec["@id"] as string);
      }
    }
  }
  return out;
}

export interface StructuredContext {
  sourceUrl: string;
  observedAt: string;
}

export async function extractStructuredData(
  html: string,
  ctx: StructuredContext,
): Promise<StructuredExtraction> {
  const blocks = discoverStructuredData(html);
  const { nodes, unsupported } = await expandJsonLdBlocks(blocks);
  const entities = entityCandidates(nodes);

  // Resolve @id references to entity keys. Library _:bN labels are
  // translated through the candidate key map so relationships never
  // depend on allocation order.
  const keyByNodeId = new Map<string, string>();
  for (const e of entities) keyByNodeId.set(e.nodeId, e.key);

  const facts: ParsedFact[] = [];
  const relationships: StructuredRelation[] = [];
  let privateFactsWithheld = 0;

  const skippedKeys = new Set<string>();
  for (const e of entities) {
    if (e.types.some((t) => SITE_CHROME_TYPES.has(t))) {
      skippedKeys.add(e.key);
      unsupported.push({
        kind: "site-chrome-node",
        blockIndex: e.blockIndex,
        entityKey: e.key,
        reason: `site-chrome node type skipped (${e.types.join(",")})`,
      });
    }
  }
  // @GRAPH VERIFIED counts every node the expansion visited, including
  // site-chrome nodes (visited, then deliberately skipped).
  const visitedNodeIds = entities.map((e) => e.nodeId).sort();

  for (const e of entities) {
    if (skippedKeys.has(e.key)) continue;
    const propNames = Object.keys(e.node)
      .filter((k) => !k.startsWith("@"))
      .map(compactTerm)
      .sort();
    for (const property of propNames) {
      const iri = SCHEMA_ORG + property;
      const rawValue =
        e.node[iri] ?? e.node[property];
      const literals = literalValues(rawValue);
      const refs = idRefs(rawValue);

      const mapped = LITERAL_FACTS[property];
      if (literals.length > 0) {
        if (mapped) {
          const visibility = visibilityForProperty(property);
          if (visibility === "private") privateFactsWithheld += literals.length;
          facts.push({
            name: mapped,
            value: literals.length === 1 ? literals[0] : literals,
            sourceType: "json-ld",
            inferred: false,
            factClass: "DIRECT_FACT" satisfies FactClass,
            visibility,
            property,
            entityId: e.key,
          });
        } else {
          unsupported.push({
            kind: "unmapped-property",
            blockIndex: e.blockIndex,
            entityKey: e.key,
            property,
            reason: `literal property has no field mapping (${e.types.join(",") || "untyped"})`,
            detail: literals.slice(0, 3).join(" | ").slice(0, 200),
          });
        }
      }

      for (const ref of refs) {
        const objectKey = keyByNodeId.get(ref);
        if (!objectKey || skippedKeys.has(objectKey)) continue;
        relationships.push({
          subjectKey: e.key,
          predicate: PREDICATE_MAP[property] ?? "references",
          objectKey,
          property,
          blockIndex: e.blockIndex,
        });
      }

      if (literals.length === 0 && refs.length === 0 && rawValue !== undefined) {
        unsupported.push({
          kind: "unmapped-property",
          blockIndex: e.blockIndex,
          entityKey: e.key,
          property,
          reason: "value shape not understood (not literal, not @id reference)",
        });
      }
    }
  }

  // Deterministic relationship order: subject, predicate, object.
  relationships.sort((a, b) => {
    const k = (r: StructuredRelation) => r.subjectKey + "|" + r.predicate + "|" + r.objectKey;
    const ka = k(a);
    const kb = k(b);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });

  const nodeIds = visitedNodeIds;
  const malformed = blocks.filter((b) => !b.ok).length;
  return {
    facts,
    relationships,
    entities: entities.filter((e) => !skippedKeys.has(e.key)),
    unsupported,
    stats: {
      blocksTotal: blocks.length,
      blocksOk: blocks.length - malformed,
      blocksMalformed: malformed,
      nodesVisited: entities.length,
      nodeIds,
      privateFactsWithheld,
    },
  };
}

// ---------------------------------------------------------------------------
// Stage: ENTITY RESOLUTION (in-extraction). The library merges same-@id
// nodes and entityCandidates() merges identical blank nodes. What remains
// is selecting the primary business entity for the site.
// ---------------------------------------------------------------------------

const BUSINESS_TYPE_RANK: Record<string, number> = {
  LocalBusiness: 3,
  Organization: 2,
};

/** Minimal fact shape needed for primary-business scoring. */
export interface ScorableFact {
  name: string;
  value: string | string[];
}

/** Deterministic primary-business selection. Scores: same host as the
 *  source URL first, then type rank, then name+telephone evidence.
 *  Ties break on entity key. Returns the entity key or null. */
export function selectPrimaryBusiness(
  entities: EntityCandidate[],
  factsByEntity: Map<string, ScorableFact[]>,
  sourceUrl: string,
): string | null {
  const sourceHost = urlHost(sourceUrl);
  const scored: Array<{ key: string; score: number }> = [];
  for (const e of entities) {
    const isOrg = e.types.some(
      (t) => t === "Organization" || t === "LocalBusiness" || t.endsWith("Business") || BUSINESS_TYPE_RANK[t] !== undefined,
    );
    if (!isOrg) continue;
    let score = 0;
    const facts = factsByEntity.get(e.key) ?? [];
    const website = facts.find((f) => f.name === "website");
    const websiteVals = website ? (Array.isArray(website.value) ? website.value : [website.value]) : [];
    if (websiteVals.some((u) => urlHost(u) === sourceHost)) score += 100;
    for (const t of e.types) score += BUSINESS_TYPE_RANK[t] ?? 1;
    if (facts.some((f) => f.name === "title" && f.value !== "")) score += 10;
    if (facts.some((f) => f.name === "phone" && f.value !== "")) score += 5;
    scored.push({ key: e.key, score });
  }
  if (scored.length === 0) return null;
  scored.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.key < b.key ? -1 : 1));
  return scored[0].key;
}
