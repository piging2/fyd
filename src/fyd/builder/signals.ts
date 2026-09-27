/**
 * Graph signal compiler: the composition compiler's measurement stage.
 *
 * The 8-dimension archetype vector is COMPUTED from the verified object
 * graph, not hand-authored. signalsForGraph measures service
 * count/cardinality, media richness, relationship cardinality, and business
 * type signals, then maps them onto the eight archetype dimensions through
 * documented saturating curves. The output vector is quantized (3
 * decimals) and validated, so it is a drop-in operating point for
 * policyForVector.
 *
 * Determinism: every count is over a fixed object set; every curve is a
 * pure function of counts; reasons are fixed strings of counts. No clock,
 * no randomness, no map iteration order leaks (reasons are assembled in
 * fixed order, ids sorted where listed).
 *
 * Visibility: signals measure the PUBLIC graph only (composition is about
 * the rendered site). inferStrategy counts public AND private objects
 * because classification is about what the business IS; the signal
 * compiler measures what the site SHOWS. The difference is deliberate.
 */

import { quantizeVector, validateVector, type ArchetypeVector } from "./dimensions";
import type { ObjectGraph } from "../sitespec/types";
import { SCHEMA_ROLES } from "../sitespec/schemas";
import type { PingObject } from "@/lib/ping/types";

export const SIGNAL_COMPILER_VERSION = "fyd-signal-compiler@1";

/**
 * Measured media summary, supplied by the caller from the media-selection
 * chain's output. Optional: absent, media-driven composition rules stay
 * neutral (documented as unknown, never assumed text-first).
 */
export interface CompositionMediaInput {
  /** Acquired gallery assets (logos, heroes, thumbnails excluded). */
  galleryAssets: number;
  /** A hero-grade asset exists for the site. */
  heroAsset: boolean;
  /** Object ids with real photography, in id order. */
  photographicObjectIds: string[];
}

/** The raw measured counts behind a signal vector. All public objects. */
export interface SignalCounts {
  services: number;
  products: number;
  people: number;
  posts: number;
  articles: number;
  locations: number;
  businesses: number;
  /** Active relationships touching any public object. */
  relationships: number;
  /** Service-catalog edges (offers/provides family). */
  offersEdges: number;
  /** Emergency keyword hits across service title+description. */
  emergencyHits: number;
  /** Business phone field present. */
  phonePresent: boolean;
  /** Business service-area/locality field present. */
  serviceAreaPresent: boolean;
  /** Credential keyword signals across business+service text. */
  credentialSignals: number;
  /** Mean description words over public non-business objects. */
  avgDescWords: number;
  /** Mean populated field count over public non-business objects. */
  avgFields: number;
  /** Acquired gallery assets (0 when no media input supplied). */
  galleryAssets: number;
  /** Hero-grade asset present (false when no media input supplied). */
  heroAsset: boolean;
  /** photographicObjectIds / public non-business objects, [0,1]. */
  photoCoverage: number;
}

/** A measured graph: counts, the derived vector, and counted reasons. */
export interface GraphSignals {
  counts: SignalCounts;
  /** The 8-dimension vector: quantized, validated, ready for policyForVector. */
  vector: ArchetypeVector;
  /** Fixed-order human-readable count citations. */
  reasons: string[];
  /** True when a media manifest was supplied (else media is neutral). */
  mediaSupplied: boolean;
}

/** Saturating curve: 0 at 0, 0.5 at n=k, approaches 1. */
function sat(n: number, k: number): number {
  return n / (n + k);
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

const EMERGENCY_KEYWORDS = [
  "emergency",
  "24/7",
  "24-7",
  "same-day",
  "same day",
  "urgent",
  "after-hours",
  "after hours",
];

const CREDENTIAL_PATTERN = /licen[cs]e|insured|certified|certification|guarantee|warranty/i;

/** Service-catalog edge predicates (mirrors the planner's service vocabulary). */
const SERVICE_EDGE_PREDICATES = new Set(["offers", "provides", "provided_by"]);

function words(text: string): number {
  const t = text.trim();
  return t === "" ? 0 : t.split(/\s+/).length;
}

function populatedFieldCount(o: PingObject): number {
  let n = 0;
  for (const v of Object.values(o.fields ?? {})) {
    if (typeof v === "string") {
      if (v.trim() !== "") n++;
    } else if (Array.isArray(v)) {
      if (v.length > 0) n++;
    } else if (v !== null && v !== undefined) {
      n++;
    }
  }
  return n;
}

function objectText(o: PingObject): string {
  const fieldText = Object.values(o.fields ?? {})
    .filter((v): v is string => typeof v === "string")
    .join(" ");
  return (o.title + " " + o.description + " " + fieldText).toLowerCase();
}

/**
 * Measure the graph. Never throws on well-formed graphs; counts what the
 * public site will show. media is optional (see CompositionMediaInput).
 */
export function signalsForGraph(graph: ObjectGraph, media?: CompositionMediaInput): GraphSignals {
  const publicObjects = graph.objects.filter((o) => o.visibility === "public");
  const byRole = (role: keyof typeof SCHEMA_ROLES): PingObject[] =>
    publicObjects.filter((o) => SCHEMA_ROLES[role].includes(o.schema));

  const businesses = byRole("business");
  const services = byRole("service");
  const products = byRole("product");
  const people = byRole("person");
  const posts = byRole("post");
  const articles = byRole("article");
  const locations = byRole("location");
  const catalog = publicObjects.filter((o) => !SCHEMA_ROLES.business.includes(o.schema));

  const activeRels = graph.relationships.filter((r) => r.status === "active");
  const offersEdges = activeRels.filter((r) => SERVICE_EDGE_PREDICATES.has(r.predicate)).length;

  let emergencyHits = 0;
  for (const s of services) {
    const text = objectText(s);
    for (const kw of EMERGENCY_KEYWORDS) {
      if (text.includes(kw)) emergencyHits++;
    }
  }

  let credentialSignals = 0;
  for (const o of [...businesses, ...services]) {
    if (CREDENTIAL_PATTERN.test(objectText(o))) credentialSignals++;
  }

  const owner = businesses
    .slice()
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0];
  const ownerFields = owner?.fields ?? {};
  const phonePresent =
    typeof ownerFields.phone === "string" && ownerFields.phone.trim() !== "";
  const serviceAreaPresent = ["serviceArea", "service_area", "serviceAreaDescription", "locality"].some(
    (k) => typeof ownerFields[k] === "string" && (ownerFields[k] as string).trim() !== "",
  );

  const avgDescWords =
    catalog.length === 0
      ? 0
      : catalog.reduce((sum, o) => sum + words(o.description), 0) / catalog.length;
  const avgFields =
    catalog.length === 0
      ? 0
      : catalog.reduce((sum, o) => sum + populatedFieldCount(o), 0) / catalog.length;

  const galleryAssets = Math.max(0, Math.floor(media?.galleryAssets ?? 0));
  const heroAsset = media?.heroAsset === true;
  const photoIds = (media?.photographicObjectIds ?? []).slice().sort();
  const photoCoverage =
    catalog.length === 0 ? 0 : Math.min(1, photoIds.length / catalog.length);

  const counts: SignalCounts = {
    services: services.length,
    products: products.length,
    people: people.length,
    posts: posts.length,
    articles: articles.length,
    locations: locations.length,
    businesses: businesses.length,
    relationships: activeRels.length,
    offersEdges,
    emergencyHits,
    phonePresent,
    serviceAreaPresent,
    credentialSignals,
    avgDescWords,
    avgFields,
    galleryAssets,
    heroAsset,
    photoCoverage,
  };

  // Dimension mapping. Every dimension is 0.05..0.15 at zero signal (a
  // measured floor, not an invented claim) and saturates toward 1 as its
  // signals grow. The k values are the "half-effect" counts: the signal
  // strength at which the dimension reaches half its variable range.
  const vector: ArchetypeVector = {
    // Emergency language in the catalog plus a call-now channel.
    urgency: clamp01(0.1 + 0.55 * sat(emergencyHits, 2) + 0.25 * (phonePresent ? 1 : 0)),
    // Credential/proof language plus people-first composition.
    trust_requirement: clamp01(
      0.3 + 0.4 * sat(credentialSignals, 2) + 0.3 * sat(people.length, 3),
    ),
    // Product and article depth: the technology/knowledge signal.
    technical_depth: clamp01(0.1 + 0.8 * sat(products.length + articles.length, 4)),
    // Team presence.
    human_prominence: clamp01(0.1 + 0.8 * sat(people.length, 3)),
    // Measured media richness; neutral 0.5 when no manifest is supplied
    // (unknown, not text-first).
    media_density:
      media === undefined
        ? 0.5
        : clamp01(
            0.15 +
              0.5 * sat(galleryAssets, 8) +
              0.2 * (heroAsset ? 1 : 0) +
              0.15 * photoCoverage,
          ),
    // Catalog size plus catalog relationship depth.
    service_complexity: clamp01(
      0.05 + 0.75 * sat(services.length, 6) + 0.2 * sat(offersEdges, 6),
    ),
    // Location objects plus an explicit service area.
    locality: clamp01(
      0.1 + 0.5 * sat(locations.length, 3) + 0.4 * (serviceAreaPresent ? 1 : 0),
    ),
    // Description depth, field coverage, and content volume.
    evidence_density: clamp01(
      0.15 +
        0.45 * sat(avgDescWords, 40) +
        0.25 * sat(avgFields, 4) +
        0.15 * sat(posts.length + articles.length, 6),
    ),
  };
  const quantized = quantizeVector(vector);
  validateVector(quantized);

  const reasons = [
    services.length +
      " public services, " +
      offersEdges +
      " catalog edges, " +
      products.length +
      " products, " +
      articles.length +
      " articles",
    people.length +
      " people, " +
      locations.length +
      " locations, " +
      posts.length +
      " posts, " +
      businesses.length +
      " businesses",
    phonePresent ? "business phone present" : "no business phone",
    serviceAreaPresent ? "service area present" : "no service area",
    emergencyHits + " emergency keyword hits, " + credentialSignals + " credential signals",
    "avg " +
      avgDescWords.toFixed(1) +
      " description words, avg " +
      avgFields.toFixed(1) +
      " populated fields per catalog object",
    media === undefined
      ? "no media manifest supplied: media_density neutral 0.5"
      : galleryAssets +
        " gallery assets, hero " +
        (heroAsset ? "present" : "absent") +
        ", photo coverage " +
        photoCoverage.toFixed(2),
  ];

  return { counts, vector: quantized, reasons, mediaSupplied: media !== undefined };
}
