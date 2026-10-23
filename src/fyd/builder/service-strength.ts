/**
 * FYD builder: service-graph strength signal (EXECUTION MODE item 6).
 *
 * Generic invariant: "if a business has strong Service objects, surface
 * them earlier." The signal is a deterministic function of graph
 * semantics only: service cardinality + evidence quality + relationship
 * topology. No per-site layouts, no customer names, no timestamps, no
 * randomness. Same graph -> same signal -> same composition.
 *
 * This module is also the single owner of evidenceScore (hoisted from
 * src/fyd/components/object-rail.tsx, which re-exports it): the ObjectRail
 * doorway and the service signal share one scoring function so the two
 * consumers cannot drift.
 */

import type { PingObject } from "@/lib/ping/types";
import type { ObjectGraph } from "../sitespec/types";
import {
  ROLE_PREDICATES,
  SCHEMA_ROLES,
  ownerRelationshipTarget,
} from "../sitespec/schema-roles";

export const SERVICE_SIGNAL_VERSION = "fyd.service-signal@1";

/**
 * Evidence-richness score for featured-object selection.
 *
 * Deterministic and monotone in observable evidence: description words
 * weigh most (customer-meaningful prose), then populated field count,
 * then a small bonus for a recorded provenance ref. No randomness, no
 * wall clock, no network.
 *
 * Hoisted verbatim from src/fyd/components/object-rail.tsx (single owner
 * now; that module re-exports it for its existing importers).
 */
export function evidenceScore(o: PingObject): number {
  const words = (o.description ?? "").trim().split(/\s+/).filter(Boolean).length;
  const fields = Object.values(o.fields ?? {}).filter((v) =>
    typeof v === "string"
      ? v.trim().length > 0
      : Array.isArray(v)
        ? v.length > 0
        : v !== null && v !== undefined,
  ).length;
  return words * 4 + fields * 3 + (o.provenance?.ref ? 5 : 0);
}

/**
 * Provenance-kind weight for the evidence-quality aggregate.
 * website-derived > canonical-journal > other. Unknown kinds fall through
 * to the lowest weight (deterministic, never throws on data): the known
 * vocabulary is pinned by unit tests so a vocabulary change fails loudly
 * there instead of silently shifting composition.
 */
export function provenanceWeight(kind: string | undefined): number {
  if (kind === "website-derived") return 3;
  if (kind === "canonical-journal") return 2;
  return 1;
}

/**
 * The public service-role objects linked to the owner through the
 * service role predicates (provides / offers / provided_by),
 * direction-agnostic. Mirrors the proceduralize generator's
 * related("service") membership exactly (same predicates, same schemas,
 * same public-only filter, same id ordering and dedup) so the planner's
 * signal and the generator's Services section can never disagree about
 * which objects count as services.
 */
export function serviceObjects(graph: ObjectGraph, ownerId: string): PingObject[] {
  const byId = new Map(graph.objects.map((o) => [o.id, o]));
  const schemas = SCHEMA_ROLES.service;
  const predicates = ROLE_PREDICATES.service;
  const seen = new Set<string>();
  const out: PingObject[] = [];
  for (const r of graph.relationships) {
    if (r.status !== "active" || !predicates.includes(r.predicate)) continue;
    const memberId = ownerRelationshipTarget(r, ownerId);
    if (memberId === null || seen.has(memberId)) continue;
    const target = byId.get(memberId);
    if (target && schemas.includes(target.schema) && target.visibility === "public") {
      seen.add(memberId);
      out.push(target);
    }
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export type ServiceTier = "weak" | "moderate" | "strong" | "dominant";

/**
 * Additive Services-component rank boost per signal tier. Small on
 * purpose: the graph signal moves Services earlier, but identity (Hero)
 * always stays first (the planner clamps the composed rank).
 */
export const SERVICE_TIER_BOOST: Record<ServiceTier, number> = {
  weak: 0,
  moderate: 0.5,
  strong: 1,
  dominant: 1.5,
};

/** How many top services become featuredIds on a strong signal. */
export const FEATURED_SERVICE_COUNT = 3;

export interface ServiceSignal {
  version: string;
  /** Count of public service objects linked to the owner. */
  cardinality: number;
  /** Mean per-service quality: provenance weight + description words/50 + fields/10. */
  evidenceQuality: number;
  /** Distinct service predicates in use + (1-hop service->object edges)/20. */
  topologyDepth: number;
  /** Pure arithmetic combination, quantized to 3 decimals. */
  score: number;
  tier: ServiceTier;
  /** Member ids, id-sorted. */
  serviceIds: string[];
  /**
   * Top-k member ids by evidenceScore (id-sorted tiebreak): the
   * deterministic featured-service set the planner writes to
   * presentation.featuredIds on strong signals.
   */
  topServiceIds: string[];
  /** Human-readable derivation, in the inferStrategy reasons style. */
  reasons: string[];
}

function quantize3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * The service-graph strength signal. Pure + deterministic: same
 * (graph, ownerId) -> same signal. No timestamps, no randomness;
 * every ordering uses canonical id order.
 */
export function serviceSignal(graph: ObjectGraph, ownerId: string): ServiceSignal {
  const services = serviceObjects(graph, ownerId);
  const cardinality = services.length;

  const qualities = services.map((s) => {
    const words = (s.description ?? "").trim().split(/\s+/).filter(Boolean).length;
    const fields = Object.values(s.fields ?? {}).filter((v) =>
      typeof v === "string"
        ? v.trim().length > 0
        : Array.isArray(v)
          ? v.length > 0
          : v !== null && v !== undefined,
    ).length;
    return provenanceWeight(s.provenance?.kind) + words / 50 + fields / 10;
  });
  const evidenceQuality = quantize3(
    cardinality === 0 ? 0 : qualities.reduce((a, b) => a + b, 0) / cardinality,
  );

  // Topology: distinct service predicates actually linking the owner to a
  // service member, plus 1-hop edges from services to other public
  // objects (service -> location, service -> media/post, ...).
  // Deterministic counts only.
  const byId = new Map(graph.objects.map((o) => [o.id, o]));
  const memberIds = new Set(services.map((s) => s.id));
  const predicatesInUse = new Set<string>();
  let edgeCount = 0;
  for (const r of graph.relationships) {
    if (r.status !== "active") continue;
    const touchesOwner = r.subject === ownerId || r.object === ownerId;
    if (touchesOwner) {
      const memberId = ownerRelationshipTarget(r, ownerId);
      if (
        memberId !== null &&
        memberIds.has(memberId) &&
        ROLE_PREDICATES.service.includes(r.predicate)
      ) {
        predicatesInUse.add(r.predicate);
      }
      continue;
    }
    const subjectIsService = memberIds.has(r.subject);
    const objectIsService = memberIds.has(r.object);
    if (!subjectIsService && !objectIsService) continue;
    const otherId = subjectIsService ? r.object : r.subject;
    const other = byId.get(otherId);
    if (other && other.visibility === "public") edgeCount++;
  }
  const topologyDepth = quantize3(predicatesInUse.size + edgeCount / 20);

  const score = quantize3(cardinality + evidenceQuality * 2 + topologyDepth * 2);

  let tier: ServiceTier = "weak";
  if (cardinality >= 10 && evidenceQuality >= 3) tier = "dominant";
  else if (cardinality >= 4 && evidenceQuality >= 3) tier = "strong";
  else if (cardinality >= 2) tier = "moderate";

  const ranked = services
    .map((s) => ({ id: s.id, score: evidenceScore(s) }))
    .sort((a, b) => (b.score !== a.score ? b.score - a.score : a.id < b.id ? -1 : 1));
  const topServiceIds = ranked.slice(0, FEATURED_SERVICE_COUNT).map((r) => r.id);

  const meanWords =
    cardinality === 0
      ? 0
      : Math.round(
          services.reduce(
            (a, s) => a + (s.description ?? "").trim().split(/\s+/).filter(Boolean).length,
            0,
          ) / cardinality,
        );
  const reasons = [
    cardinality + " public service object" + (cardinality === 1 ? "" : "s") + " linked to owner",
    "mean evidence quality " + evidenceQuality + " (provenance-weighted, ~" + meanWords + " description words)",
    "topology depth " + topologyDepth + " (" + predicatesInUse.size + " service predicate" +
      (predicatesInUse.size === 1 ? "" : "s") + ", " + edgeCount + " service->object edges)",
  ];

  return {
    version: SERVICE_SIGNAL_VERSION,
    cardinality,
    evidenceQuality,
    topologyDepth,
    score,
    tier,
    serviceIds: services.map((s) => s.id),
    topServiceIds,
    reasons,
  };
}
