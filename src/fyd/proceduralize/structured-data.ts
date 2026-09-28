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

import jsonld, { type JsonLdDocument, type NodeObject } from "jsonld";
import type { FactClass, ParsedFact, Visibility } from "./proceduralizer";
import { sha256Hex } from "./sha256";
import { extractMicrodataWithRejections } from "./microdata";
import { classifyEntityTypes, SCHEMA_ORG } from "./vocabulary";

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
  /**
   * Extraction syntax that produced this block. Absent means "json-ld":
   * every block the stage produced before the microdata harvest was
   * JSON-LD, so existing callers and records are unaffected.
   */
  syntax?: "json-ld" | "microdata";
  /**
   * Microdata-only: the itemscope was refused by the vocabulary gate
   * (itemtype outside the known vocabulary). The block carries no parsed
   * record; the rejection becomes unmapped-node-type unsupported evidence.
   */
  vocabRejection?: { itemtype: string; reason: string };
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
  // Harvest 2026-09-28: additive microdata extraction, appended AFTER the
  // JSON-LD blocks with continuing indices. ld+json-only pages produce
  // byte-identical output to before this patch.
  // Vocabulary gate 2026-09-28: itemscopes whose itemtype is outside the
  // known vocabulary are not emitted as records; their rejections ride
  // along as !ok blocks so the evidence survives into unsupported evidence
  // and the reconciliation queue (never silently dropped).
  const { items: microdataItems, rejections: microdataRejections } =
    extractMicrodataWithRejections(html);
  for (const item of microdataItems) {
    blocks.push({
      index,
      ok: true,
      raw: item.raw,
      parsed: item.parsed,
      syntax: "microdata",
    });
    index++;
  }
  for (const r of microdataRejections) {
    blocks.push({
      index,
      ok: false,
      raw: r.raw,
      error: "vocabulary gate: " + r.reason,
      syntax: "microdata",
      vocabRejection: { itemtype: r.itemtype, reason: r.reason },
    });
    index++;
  }
  return blocks;
}

// ---------------------------------------------------------------------------
// Stage: GRAPH/NODE EXPANSION via the jsonld library (offline).
// ---------------------------------------------------------------------------

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
  contextUrl: undefined;
  documentUrl: string;
  document: NodeObject;
}

async function offlineDocumentLoader(url: string): Promise<LoadedDocument> {
  if (SCHEMA_CONTEXT_RE.test(url)) {
    return {
      contextUrl: undefined,
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
      // Vocabulary-gate rejections are UNKNOWN vocabulary, not malformed
      // JSON: they become unmapped-node-type unsupported evidence (the
      // kind already existed in the union but was never emitted).
      if (block.vocabRejection) {
        unsupported.push({
          kind: "unmapped-node-type",
          blockIndex: block.index,
          reason: "microdata itemtype refused by the vocabulary gate; quarantined, not canonicalized",
          detail: block.vocabRejection.itemtype.slice(0, 200),
        });
        continue;
      }
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
  /**
   * Compact schema.org type names, sorted, deduped. Vocabulary gate
   * 2026-09-28: ONLY schema.org-namespaced types appear here. A type
   * observed outside the known vocabulary never becomes a compact name,
   * so it can never collide with a schema.org term in downstream logic.
   */
  types: string[];
  /**
   * Raw observed @type IRIs, sorted, deduped. Kept for vocabulary
   * classification and evidence; never used as canonical meaning.
   */
  typeIris: string[];
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

/**
 * Raw observed @type IRIs for a node, trimmed, sorted, deduped.
 * Namespace classification happens in entityCandidates via the vocabulary
 * gate; this function preserves the observation without interpreting it.
 */
function typeIris(node: ExpandedNode): string[] {
  const t = node["@type"];
  const arr = Array.isArray(t) ? t : t === undefined ? [] : [t];
  const iris = arr
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim())
    .filter((s) => s !== "");
  return [...new Set(iris)].sort();
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
      // Vocabulary gate: the candidate keeps the raw IRIs for evidence and
      // exposes only schema.org-namespaced types as canonical type names.
      // classifyEntityTypes is pure; the KNOWN/UNKNOWN verdict is applied
      // by extractStructuredData (quarantine), not here.
      const iris = typeIris(node);
      const verdict = classifyEntityTypes(iris);
      byKey.set(key, {
        key,
        nodeId,
        types: verdict.knownTypes,
        typeIris: iris,
        blockIndex,
        node,
      });
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

/**
 * An @id-reference candidate that died inside extraction, before the
 * proceduralizer ever saw it. G3 (2026-09-24): no silent semantic loss.
 * outcome is one of the relationship terminal outcomes (see
 * proceduralizer.ts RelationshipOutcome): UNRESOLVED_TARGET when the
 * referenced node id was never visited; POLICY_SUPPRESSED when the target
 * was visited but deliberately skipped as site chrome.
 */
export interface StructuredRefDrop {
  subjectKey: string;
  property: string;
  predicate: string;
  refNodeId: string;
  blockIndex: number;
  outcome: "UNRESOLVED_TARGET" | "POLICY_SUPPRESSED" | "VOCABULARY_QUARANTINED";
  reason: string;
}

export interface UnsupportedEvidence {
  kind:
    | "malformed-block"
    | "expansion-failed"
    | "unmapped-property"
    | "unmapped-node-type"
    | "site-chrome-node"
    | "unknown-vocabulary";
  blockIndex: number;
  entityKey?: string;
  property?: string;
  reason: string;
  detail?: string;
}

/**
 * A quarantined-unknown-vocabulary entry: the deterministic work-queue
 * projection of unsupported evidence (Nolan 2026-09-28: UNKNOWN -> work
 * queue). This is a pure projection derived from unsupported[] per call,
 * not a store: no persistence, no writer, nothing to reconcile against
 * except the evidence itself. Operators map namespaces to the known
 * vocabulary (or extend the gate); on re-ingestion the item disappears
 * because the evidence that derived it is gone.
 */
export interface ReconciliationItem {
  /** Stable key: "block:<index>" or "entity:<key>", sorted ascending. */
  queueKey: string;
  /** Where the unknown vocabulary was observed. */
  source: "microdata" | "json-ld";
  blockIndex: number;
  entityKey?: string;
  /** Observed type IRIs outside the known vocabulary (evidence, never meaning). */
  unknownTypeIris: string[];
  /** Known schema.org types also present on the same entity, if any (mixed case). */
  knownTypes: string[];
  reason: string;
}

export interface StructuredExtraction {
  facts: ParsedFact[];
  relationships: StructuredRelation[];
  /** @id-ref candidates dropped inside extraction (G3: typed, never silent). */
  refDrops: StructuredRefDrop[];
  /**
   * Canonical entity candidates ONLY: vocabulary-quarantined and
   * site-chrome entities are excluded here. Their evidence survives in
   * unsupported[] and reconciliation[].
   */
  entities: EntityCandidate[];
  unsupported: UnsupportedEvidence[];
  /**
   * Deterministic work-queue projection derived from unsupported[]: one
   * entry per quarantined vocabulary observation. Not a store.
   */
  reconciliation: ReconciliationItem[];
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
  const syntaxByBlock = new Map<number, "json-ld" | "microdata">(
    blocks.map((b) => [b.index, b.syntax ?? "json-ld"]),
  );
  const { nodes, unsupported } = await expandJsonLdBlocks(blocks);
  const entities = entityCandidates(nodes);

  const facts: ParsedFact[] = [];
  const relationships: StructuredRelation[] = [];
  const refDrops: StructuredRefDrop[] = [];
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

  // Vocabulary gate (Nolan 2026-09-28, fail closed): an entity with NO
  // schema.org-namespaced @type is quarantined. It produces no facts, no
  // relationships, no entity record; its evidence (raw IRIs + block/raw
  // bytes) survives in unsupported[] and the reconciliation projection.
  // Mixed entities (known + unknown types) stay canonical on their KNOWN
  // types only; the unknown IRIs are recorded as evidence.
  const quarantinedKeys = new Set<string>();
  // Reconciliation queue: one entry per unknown-vocabulary observation.
  // Deterministic projection of the evidence, built here and from
  // vocabulary-gate block rejections below; not a store.
  const reconciliation: ReconciliationItem[] = [];
  for (const e of entities) {
    if (skippedKeys.has(e.key)) continue;
    const verdict = classifyEntityTypes(e.typeIris);
    if (verdict.verdict === "UNKNOWN") {
      quarantinedKeys.add(e.key);
      unsupported.push({
        kind: "unknown-vocabulary",
        blockIndex: e.blockIndex,
        entityKey: e.key,
        reason:
          "entity quarantined: no @type in the known vocabulary; never canonicalized",
        detail: verdict.unknownTypeIris.join(" | ").slice(0, 300),
      });
      reconciliation.push({
        queueKey: "entity:" + e.key,
        source: syntaxByBlock.get(e.blockIndex) ?? "json-ld",
        blockIndex: e.blockIndex,
        entityKey: e.key,
        unknownTypeIris: verdict.unknownTypeIris,
        knownTypes: verdict.knownTypes,
        reason:
          "entity quarantined: no @type in the known vocabulary; map the namespace or extend the gate, then re-ingest",
      });
    } else if (verdict.unknownTypeIris.length > 0) {
      unsupported.push({
        kind: "unknown-vocabulary",
        blockIndex: e.blockIndex,
        entityKey: e.key,
        reason:
          "mixed vocabulary: entity kept on known schema.org type(s) only; unknown @type IRIs preserved as evidence",
        detail: verdict.unknownTypeIris.join(" | ").slice(0, 300),
      });
      reconciliation.push({
        queueKey: "entity:" + e.key,
        source: syntaxByBlock.get(e.blockIndex) ?? "json-ld",
        blockIndex: e.blockIndex,
        entityKey: e.key,
        unknownTypeIris: verdict.unknownTypeIris,
        knownTypes: verdict.knownTypes,
        reason:
          "entity kept on known schema.org type(s) only; unknown @type IRIs need a vocabulary mapping decision",
      });
    }
  }

  // @id resolution sees every visited node id (allocation-order-free via
  // the candidate key map). Whether a resolved target is canonical,
  // site-chrome, or quarantined is decided per-ref below, producing the
  // typed drop (VOCABULARY_QUARANTINED / POLICY_SUPPRESSED) or a
  // relationship. UNRESOLVED_TARGET is reserved for ids the expansion
  // never visited.
  const keyByNodeId = new Map<string, string>();
  for (const e of entities) keyByNodeId.set(e.nodeId, e.key);

  // @GRAPH VERIFIED counts every node the expansion visited, including
  // site-chrome and quarantined nodes (visited, then deliberately skipped).
  const visitedNodeIds = entities.map((e) => e.nodeId).sort();

  for (const e of entities) {
    if (skippedKeys.has(e.key) || quarantinedKeys.has(e.key)) continue;
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
            sourceType: syntaxByBlock.get(e.blockIndex) ?? "json-ld",
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
        const predicate = PREDICATE_MAP[property] ?? "references";
        if (!objectKey) {
          // The bytes referenced a node id the expansion never visited:
          // observed, but unresolvable.
          refDrops.push({
            subjectKey: e.key,
            property,
            predicate,
            refNodeId: ref,
            blockIndex: e.blockIndex,
            outcome: "UNRESOLVED_TARGET",
            reason: `referenced node id "${ref}" was never visited by @graph expansion`,
          });
          continue;
        }
        if (quarantinedKeys.has(objectKey)) {
          // Visited, then quarantined by the vocabulary gate: the target
          // is unknown vocabulary, so the reference carries no canonical
          // meaning. Typed drop, never a relationship to a quarantined node.
          refDrops.push({
            subjectKey: e.key,
            property,
            predicate,
            refNodeId: ref,
            blockIndex: e.blockIndex,
            outcome: "VOCABULARY_QUARANTINED",
            reason: `target node is vocabulary-quarantined (${objectKey}); reference carries no canonical meaning`,
          });
          continue;
        }
        if (skippedKeys.has(objectKey)) {
          // Visited, then deliberately skipped: site chrome is a policy
          // decision, so the drop is POLICY_SUPPRESSED, not unresolved.
          refDrops.push({
            subjectKey: e.key,
            property,
            predicate,
            refNodeId: ref,
            blockIndex: e.blockIndex,
            outcome: "POLICY_SUPPRESSED",
            reason: `target node is site chrome (${objectKey}), skipped by policy`,
          });
          continue;
        }
        relationships.push({
          subjectKey: e.key,
          predicate,
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
  refDrops.sort((a, b) => {
    const ka = a.subjectKey + "|" + a.property + "|" + a.refNodeId;
    const kb = b.subjectKey + "|" + b.property + "|" + b.refNodeId;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });

  // Block-level vocabulary rejections (microdata itemtypes refused by the
  // gate) join the reconciliation queue. Their unsupported evidence was
  // recorded during expansion; this is the work-queue projection of it.
  for (const b of blocks) {
    if (b.vocabRejection) {
      reconciliation.push({
        queueKey: "block:" + b.index,
        source: b.syntax ?? "microdata",
        blockIndex: b.index,
        unknownTypeIris: [b.vocabRejection.itemtype],
        knownTypes: [],
        reason:
          "microdata itemtype refused by the vocabulary gate; map the namespace or extend the gate, then re-ingest",
      });
    }
  }
  reconciliation.sort((a, b) =>
    a.queueKey < b.queueKey ? -1 : a.queueKey > b.queueKey ? 1 : 0,
  );

  const canonicalEntities = entities.filter(
    (e) => !skippedKeys.has(e.key) && !quarantinedKeys.has(e.key),
  );
  return {
    facts,
    relationships,
    refDrops,
    entities: canonicalEntities,
    unsupported,
    reconciliation,
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
 *  Ties break on entity key. Returns the entity key or null.
 *  Precondition: entities arrive vocabulary-gated -- extractStructuredData
 *  only returns canonical (schema.org-typed) entities, so quarantined
 *  unknown-vocabulary entities can never be selected here. */
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
