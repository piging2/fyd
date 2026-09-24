/**
 * WEBSITE BUILDER: the site planner. Decides how known things are presented.
 *
 * Boundary (hard): the planner consumes ONLY verified object graphs
 * (object-builder attestations), owner overrides already composed by the
 * read seam, owner intent, capabilities, and design tokens. It NEVER
 * manufactures business facts: every section comes from the existing
 * generator's data-driven output, every generated copy slot is
 * evidence-bound and verified, and the confidence law
 * (presentationConfidence <= factConfidence) is enforced before return.
 *
 * Pipeline:
 *   verified graph -> generateSiteSpec (base, data-driven sections)
 *     -> eligibility filter (defensive) -> dimension-vector composition
 *        (section order, density, tokens, presence) -> owner-intent
 *        filters -> generated presentation (verified) -> dependency
 *        manifest + confidence records -> planned site
 *
 * Semantic determinism: the same (ObjectGraph, OwnerIntent, vector,
 * planner version, design tokens, viewer class) yields the same semantic
 * render model. Volatile stamps (generatedAt) are excluded from the
 * semantic digest; ordering is canonicalized; no timestamps enter
 * planning decisions.
 */

import type { PingObject } from "@/lib/ping/types";
import { generateSiteSpec } from "../proceduralize/generator";
import {
  DEFAULT_FYD_THEME,
  type FYDPage,
  type FYDQuery,
  type FYDSection,
  type FYDSiteSpec,
  type FYDThemeTokens,
  type ObjectGraph,
  type ObjectPresence,
} from "../sitespec/types";
import { SCHEMA_ROLES, ownerRelationshipTarget } from "../sitespec/schemas";
import { requireTenantContext, type TenantContext } from "../tenant/tenant-context";
import {
  nearestPresetName,
  policyForVector,
  quantizeVector,
  validateVector,
  type ArchetypeVector,
} from "./dimensions";
import { deriveEligibility } from "./eligibility";
import {
  normalizeOwnerIntent,
  resolveOperatingConstraints,
  type OwnerIntent,
} from "./owner-intent";
import {
  assertConfidenceLaw,
  confidenceForBinding,
  type ConfidenceRecord,
} from "./confidence";
import {
  bindingsForComponent,
  emptyManifest,
  type BindingManifest,
  type DependencyManifest,
} from "./manifest";
import {
  assertGeneratedPresentationVerified,
  type GeneratedCopySlot,
  type GeneratedPresentation,
} from "./generated-presentation";
import { assertNoPrivateLeak, publicObjects } from "./visibility";
import type { GraphAttestation } from "./object-builder";
import { canonicalizeSpec, semanticDigestOf } from "./canonical";
import { COMPONENT_REGISTRY_VERSION } from "../components/registry";
import type { BindingClassification } from "../sitespec/graph";
import {
  buildVerifiedRenderModel,
  ownerAssertionsFromGraph,
  type PresentationBinding,
  type VerifiedRenderModel,
} from "../sitespec/binding-verifier";

export const SITE_PLANNER_VERSION = "fyd-site-planner@2";

/** Canonical base order of components; the vector policy boosts against it. */
const BASE_COMPONENT_ORDER = [
  "Hero",
  "IdentityCard",
  "BusinessSummary",
  "Services",
  "Products",
  "SocialProof",
  "Locations",
  "People",
  "Posts",
  "ObjectFeed",
  "RecentObjects",
  "ObjectGrid",
  "Contact",
  "Links",
  "CTA",
  "AskFYD",
  "ObjectRail",
  "GenericObjectCard",
];

/**
 * Must-win components: the density cap may drop optional sections, never
 * these. Graph-backed essentials (what the business is, what it offers,
 * how to reach it) plus the site capabilities (CTA, AskFYD) plus the
 * featured-object doorway (ObjectRail). Fully generic: no tenant logic.
 */
const MUST_WIN_COMPONENTS = new Set([
  "Hero",
  "BusinessSummary",
  "Services",
  "Products",
  "Contact",
  "CTA",
  "AskFYD",
  "ObjectRail",
]);

export interface SitePlannerInput {
  ctx: TenantContext;
  /** Verified graph (object-builder attestation). */
  graph: ObjectGraph;
  /** Eight-dimension archetype vector. */
  vector: ArchetypeVector;
  ownerIntent?: Partial<OwnerIntent> | null;
  designTokens?: FYDThemeTokens;
  /** Volatile stamp; excluded from the semantic digest. */
  generatedAt?: string;
  /** Acceptance-sequence window of the ingestion events, when known. */
  eventSequences?: [number, number];
  /** Carried for provenance; the graph must already be verified. */
  attestation?: GraphAttestation | null;
}

export interface PlannedSite {
  spec: FYDSiteSpec;
  manifest: DependencyManifest;
  generatedPresentation: GeneratedPresentation;
  confidence: ConfidenceRecord[];
  eligibility: ReturnType<typeof deriveEligibility>;
  plannerVersion: string;
  /** sha256 over the canonicalized spec: the semantic identity. */
  semanticDigest: string;
  /** Canonical JSON of the spec (sorted keys, no volatile stamps). */
  canonicalSpecJson: string;
  /**
   * The BindingVerifier's output at the projection seam: every factual
   * atom the emitted spec carries, classified per the content contract
   * (OWNER_ASSERTED / DIRECT_EVIDENCE / DETERMINISTIC_DERIVATION /
   * GENERATED_PRESENTATION) with its value and its evidence or owner
   * assertion ref. Optional for backward compatibility with in-flight
   * fixtures; always set by planSite. The renderer consumes only this
   * model and performs no claim checking of its own.
   */
  verifiedRenderModel?: VerifiedRenderModel;
}

function baseRank(component: string): number {
  const i = BASE_COMPONENT_ORDER.indexOf(component);
  return i === -1 ? BASE_COMPONENT_ORDER.length : i;
}

function ownerOf(graph: ObjectGraph): PingObject | null {
  const businesses = graph.objects
    .filter((o) => SCHEMA_ROLES.business.includes(o.schema) && o.visibility === "public")
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return businesses[0] ?? null;
}

/** Resolve a section query to its bound objects, in id order. Never throws. */
export function resolveQueryObjects(
  graph: ObjectGraph,
  query: FYDQuery,
  ownerId: string,
): PingObject[] {
  const byId = new Map(graph.objects.map((o) => [o.id, o]));
  const pub = (o: PingObject) => (o.visibility === "public" ? o : null);
  switch (query.kind) {
    case "owner": {
      const o = byId.get(ownerId);
      return o && o.visibility === "public" ? [o] : [];
    }
    case "related": {
      const predicates = query.predicates ?? [query.predicate];
      const schemas = query.schemas ?? (query.schema ? [query.schema] : []);
      // Direction-agnostic: the bound object is whichever endpoint of
      // the relationship is not the query anchor (usually the owner).
      // Inverse predicates (works_for, provided_by, published_by) bind
      // exactly like their forward twins; edge direction never drops a
      // member from composition. Deduped by id: a pair linked in both
      // directions still binds once.
      const seen = new Set<string>();
      const out: PingObject[] = [];
      for (const r of graph.relationships) {
        if (!predicates.includes(r.predicate)) continue;
        const memberId = ownerRelationshipTarget(r, query.from);
        if (memberId === null || seen.has(memberId)) continue;
        const t = byId.get(memberId);
        if (t && t.visibility === "public" && (schemas.length === 0 || schemas.includes(t.schema))) {
          seen.add(memberId);
          out.push(t);
        }
      }
      return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    }
    case "all": {
      const schemas = query.schemas ?? (query.schema ? [query.schema] : []);
      return graph.objects
        .filter(
          (o) =>
            o.visibility === "public" &&
            (schemas.length === 0 || schemas.includes(o.schema)),
        )
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    }
    case "reference": {
      const out: PingObject[] = [];
      for (const id of query.objectIds) {
        const o = byId.get(id);
        if (o && o.visibility === "public") out.push(o);
      }
      return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    }
    case "static":
      return [];
  }
}

function objectFieldFor(query: FYDQuery): string {
  switch (query.kind) {
    case "owner":
      return "owner";
    case "related": {
      const predicates = (query.predicates ?? [query.predicate]).slice().sort().join(",");
      const schemas = (query.schemas ?? (query.schema ? [query.schema] : [])).slice().sort().join(",");
      return "related:" + query.from + ":" + predicates + ":" + schemas;
    }
    case "all": {
      const schemas = (query.schemas ?? (query.schema ? [query.schema] : [])).slice().sort().join(",");
      return "all:" + schemas;
    }
    case "reference":
      return "reference:" + query.objectIds.slice().sort().join(",");
    case "static":
      return "static";
  }
}

function fieldText(o: PingObject, field: string): string {
  if (field === "title") return o.title;
  if (field === "description") return o.description;
  const v = o.fields[field];
  return typeof v === "string" ? v : Array.isArray(v) ? v.join(", ") : "";
}

/**
 * The emitted spec's factual binding set: every generated-copy slot
 * binding as a PresentationBinding. The planner's slots bind object fields
 * whose claimRef matched the object's provenance ref (checked by
 * assertGeneratedPresentationVerified); the BindingVerifier re-checks the
 * full seam (object field + evidence ref + owner assertions) so the
 * renderer path cannot be handed an unverified spec.
 */
function slotBindingsForVerification(
  gp: GeneratedPresentation,
): PresentationBinding[] {
  const out: PresentationBinding[] = [];
  for (const slot of gp.slots) {
    for (const b of slot.bindings) {
      out.push({
        objectId: b.objectId,
        field: b.field,
        classification: "direct",
        evidenceRef: b.claimRef ?? undefined,
      });
    }
  }
  return out;
}

/**
 * planSite: the deterministic site planner.
 * Same (graph, intent, vector, plannerVersion, tokens) -> same semantic spec.
 */
export function planSite(input: SitePlannerInput): PlannedSite {
  const tenantId = requireTenantContext(input.ctx);
  const vector = quantizeVector(input.vector);
  validateVector(vector);
  const intent = normalizeOwnerIntent(input.ownerIntent);
  const graph = input.graph;
  const generatedAt = input.generatedAt ?? new Date().toISOString();

  // Base: the existing data-driven generator. Sections exist only when
  // their data exists; the planner never invents sections.
  const base = generateSiteSpec(graph, {
    generatedAt,
    eventSequences: input.eventSequences,
  });
  const owner = ownerOf(graph);
  const ownerId = owner?.id ?? base.ownerObjectId;

  // Eligibility: defensive filter over the generator's output.
  const eligibility = deriveEligibility(graph);
  const manifest = emptyManifest(SITE_PLANNER_VERSION, tenantId);

  // Owner intent: operating constraints remove components. Unknown
  // constraints are recorded, never applied.
  const constraints = resolveOperatingConstraints(intent.operatingConstraints);
  const removedByIntent = new Set(constraints.removed);
  for (const u of constraints.unknown) {
    manifest.notes.push("unknown operating constraint recorded, not applied: \"" + u + "\"");
  }

  const policy = policyForVector(vector);

  const plannedPages: FYDPage[] = [];
  for (const page of base.pages) {
    // Filter: eligible components only, minus intent-removed.
    let sections = page.sections.filter((s) => {
      if (removedByIntent.has(s.component)) {
        manifest.notes.push(
          "section \"" + s.id + "\" removed by operating constraint",
        );
        return false;
      }
      const ok = eligibility.eligible[s.component] ?? false;
      if (!ok) {
        manifest.notes.push(
          "section \"" + s.id + "\" filtered: component \"" + s.component + "\" not eligible",
        );
      }
      return ok;
    });
    // Order: dimension-vector composition policy. Stable sort by
    // (baseRank - boost, original index): the same vector always yields
    // the same order.
    const indexed = sections.map((s, i) => ({ s, i }));
    indexed.sort((a, b) => {
      const ra = baseRank(a.s.component) - (policy.sectionBoosts[a.s.component] ?? 0);
      const rb = baseRank(b.s.component) - (policy.sectionBoosts[b.s.component] ?? 0);
      if (ra !== rb) return ra - rb;
      return a.i - b.i;
    });
    sections = indexed.map((x) => x.s);
    // Must-win preservation: the density cap may drop optional sections,
    // never must-wins. Must-win sections keep their composed order and
    // fill first; remaining capacity fills with optional sections in
    // composed order. Deterministic: both classes keep the sort above.
    const mustWins = sections.filter((s) => MUST_WIN_COMPONENTS.has(s.component));
    const optionals = sections.filter(
      (s) => !MUST_WIN_COMPONENTS.has(s.component),
    );
    sections = [...mustWins, ...optionals]
      .slice(0, policy.maxSectionsPerPage)
      .map((s, i) => ({
        ...s,
        id: page.slug + ":" + s.component + ":" + i,
      }));
    if (sections.length === 0) {
      manifest.notes.push("page \"" + page.slug + "\" dropped: no sections survived");
      continue;
    }
    plannedPages.push({ ...page, sections });
  }

  // Generated presentation: the hero tagline slot, bound to owner fields.
  // Template interpolates ONLY bound fields; the verifier refuses anything else.
  const slots: GeneratedCopySlot[] = [];
  if (owner) {
    const locality = fieldText(owner, "locality").trim();
    const tagline = locality !== "" ? owner.title + " -- " + locality : owner.title;
    const bindings = [
      { objectId: owner.id, field: "title", claimRef: owner.provenance?.ref ?? null },
    ];
    if (locality !== "") {
      bindings.push({ objectId: owner.id, field: "locality", claimRef: owner.provenance?.ref ?? null });
    }
    slots.push({ slotId: "hero-tagline", sectionId: "", text: tagline, bindings });
  }
  const generatedPresentation: GeneratedPresentation = { version: 1, slots };

  // Attach the tagline to the first Hero section, if one survived.
  const heroSections: FYDSection[] = [];
  for (const page of plannedPages) {
    for (const s of page.sections) if (s.component === "Hero") heroSections.push(s);
  }
  heroSections.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (heroSections[0] && slots[0]) {
    slots[0].sectionId = heroSections[0].id;
    heroSections[0].presentation = { ...heroSections[0].presentation, copy: slots[0].text };
  }
  assertGeneratedPresentationVerified(generatedPresentation, graph, intent.prohibitedPositioning);

  // BindingVerifier at the projection seam (EVIDENCE GRAPH ->
  // BINDING VERIFIER -> VERIFIED RENDER MODEL -> SITE SPEC / RENDERER).
  // The verifier emits the verified render model: every factual atom the
  // emitted spec carries, classified per the content contract
  // (OWNER_ASSERTED / DIRECT_EVIDENCE / DETERMINISTIC_DERIVATION /
  // GENERATED_PRESENTATION) with its value and its evidence or owner
  // assertion ref. Unsupported factual atoms fail closed here: the planner
  // throws before any spec is produced, so no render path can be handed an
  // unverified model. The renderer consumes only this model and performs
  // no claim checking of its own.
  const verifiedRenderModel = buildVerifiedRenderModel(
    slotBindingsForVerification(generatedPresentation),
    graph,
    ownerAssertionsFromGraph(graph),
    { rendererVersion: COMPONENT_REGISTRY_VERSION, viewerId: null },
  );

  // Object presence: the margin/rail capability, owned by the spec.
  const presenceObjects = publicObjects(graph)
    .filter((o) => o.id !== ownerId)
    .map((o) => o.id);
  const objectPresence: ObjectPresence | undefined =
    presenceObjects.length > 0
      ? { mode: policy.presenceMode, objects: presenceObjects, rules: { collapseBelow: policy.collapseBelow } }
      : undefined;

  // Theme tokens: base tokens re-skinned by the vector policy. The accent
  // is NOT assigned per site here (that law belongs to derive-presence);
  // only structural token groups move.
  const baseTokens = input.designTokens ?? DEFAULT_FYD_THEME;
  const themeTokens: FYDThemeTokens = {
    ...baseTokens,
    typography: policy.typography,
    media: { ...(baseTokens.media ?? {}), treatment: policy.mediaTreatment },
    radius: policy.radius,
  };

  // Dependency manifest + confidence: one binding per surviving section.
  const confidence: ConfidenceRecord[] = [];
  const bindings: BindingManifest[] = [];
  for (const page of plannedPages) {
    for (const s of page.sections) {
      const bound = resolveQueryObjects(graph, s.query, ownerId);
      assertNoPrivateLeak(
        graph,
        bound.map((o) => o.id),
      );
      const first = bound.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0] ?? null;
      const isHeroCopy = heroSections[0] && s.id === heroSections[0].id && slots[0];
      const classification: BindingClassification = isHeroCopy ? "generated" : "direct";
      const objectField = isHeroCopy ? "slot:hero-tagline" : objectFieldFor(s.query);
      const claimRef = isHeroCopy
        ? (owner?.provenance?.ref ?? null)
        : (first?.provenance?.ref ??
          owner?.provenance?.ref ??
          input.attestation?.digest ??
          null);
      const factBasis = first ?? owner;
      const conf = factBasis
        ? confidenceForBinding(s.id, factBasis, isHeroCopy ? "generated" : "direct")
        : {
            bindingId: s.id,
            factConfidence: 0.5,
            presentationConfidence: 0.5,
            basis: "static section: no bound objects",
          };
      confidence.push(conf);
      bindings.push({
        bindingId: s.id,
        component: s.component,
        componentVersion: COMPONENT_REGISTRY_VERSION,
        objectField,
        ownerPolicy: "owner-wins",
        siteSpecVersion: SITE_PLANNER_VERSION,
        claimRef,
        classification,
        factConfidence: conf.factConfidence,
        presentationConfidence: conf.presentationConfidence,
      });
    }
  }
  assertConfidenceLaw(confidence);
  manifest.bindings = bindings
    .slice()
    .sort((a, b) => (a.bindingId < b.bindingId ? -1 : a.bindingId > b.bindingId ? 1 : 0));
  manifest.notes.push(
    "composition: vector=" + JSON.stringify(vector) +
      " policy=" + policy.density + "/" + policy.mediaTreatment +
      "/cta-" + policy.ctaEmphasis + "/presence-" + policy.presenceMode,
  );

  const navigation = plannedPages.map((p) => ({ label: p.navLabel, pageSlug: p.slug }));

  const spec: FYDSiteSpec = {
    kind: "fyd.sitespec@1",
    ownerObjectId: base.ownerObjectId,
    version: 1,
    generator: { name: "fyd-site-generator", version: SITE_PLANNER_VERSION, generatedAt },
    themeTokens,
    navigation,
    pages: plannedPages,
    provenance: base.provenance,
    status: "draft",
    revision: 1,
    archetype: nearestPresetName(vector),
    objectPresence,
  };

  const canonicalSpecJson = canonicalizeSpec(spec);
  const semanticDigest = semanticDigestOf(spec);

  // Prove the manifest walks before handing it over.
  for (const b of manifest.bindings) {
    const fwd = bindingsForComponent(manifest, b.component).find((x) => x.bindingId === b.bindingId);
    if (!fwd) throw new Error("manifest walk failed for binding \"" + b.bindingId + "\"");
  }

  return {
    spec,
    manifest,
    generatedPresentation,
    confidence,
    eligibility,
    plannerVersion: SITE_PLANNER_VERSION,
    semanticDigest,
    canonicalSpecJson,
    verifiedRenderModel,
  };
}
