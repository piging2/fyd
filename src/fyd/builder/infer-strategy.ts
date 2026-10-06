/**
 * Strategy inference: which named site strategy a graph wants, decided by
 * deterministic schema-role counting. No tenant branching, no customer
 * logic, no manufactured facts: the counts are the evidence, the winner
 * is arithmetic, and the reasons cite the counts.
 *
 * Scoring (all counts over public AND private objects; role membership is
 * what matters, not visibility):
 *   TRADES           = Service objects + Location objects
 *                      + phone/service-area signals on business objects
 *   KNOWLEDGE_WORKER = Article + Post + Person objects
 *   TECHNOLOGY       = Product objects
 *
 * Note on the vocabulary: the schema-role table (SCHEMA_ROLES) defines
 * exactly seven roles (business, service, product, location, person,
 * post, article). There are no software/documentation/repository roles,
 * so the TECHNOLOGY signal is the product role; documentation-like
 * content counts toward KNOWLEDGE_WORKER through the article/post roles.
 *
 * Determinism law: the same graph always yields the same candidate and
 * the same reasons. Ties break by the fixed contender order
 * [TECHNOLOGY, KNOWLEDGE_WORKER, TRADES] via strictly-greater
 * replacement, so the earliest contender wins every tie. An empty (or
 * fully unclassifiable) graph resolves to KNOWLEDGE_WORKER as the
 * neutral default; reasons are never empty.
 */

import { schemaRole, type FYDSchemaRole } from "../sitespec/schemas";
import type { ObjectGraph } from "../sitespec/types";
import type { SiteStrategyName } from "./strategies";

export interface StrategyInference {
  candidate: SiteStrategyName;
  /** Human-readable evidence citations with counts. Never empty. */
  reasons: string[];
}

function roleCounts(graph: ObjectGraph): Record<FYDSchemaRole, number> {
  const counts: Record<FYDSchemaRole, number> = {
    business: 0,
    service: 0,
    product: 0,
    location: 0,
    person: 0,
    post: 0,
    article: 0,
  };
  for (const o of graph.objects ?? []) {
    const role = schemaRole(o.schema);
    if (role) counts[role]++;
  }
  return counts;
}

/**
 * Phone / service-area signals: one per non-empty phone, serviceArea /
 * service_area, or locality field on a business object. Field presence is
 * the signal; nothing is inferred from field values.
 */
function phoneServiceAreaSignals(graph: ObjectGraph): number {
  let n = 0;
  for (const o of graph.objects ?? []) {
    if (schemaRole(o.schema) !== "business") continue;
    const fields = o.fields ?? {};
    for (const key of ["phone", "serviceArea", "service_area", "locality"]) {
      const v = fields[key];
      if (typeof v === "string") {
        if (v.trim() !== "") n++;
      } else if (Array.isArray(v)) {
        if (v.some((x) => typeof x === "string" && x.trim() !== "")) n++;
      }
    }
  }
  return n;
}

export function inferStrategy(graph: ObjectGraph): StrategyInference {
  const counts = roleCounts(graph);
  const signals = phoneServiceAreaSignals(graph);
  const classified =
    counts.business +
    counts.service +
    counts.product +
    counts.location +
    counts.person +
    counts.post +
    counts.article +
    signals;
  if (classified === 0) {
    return {
      candidate: "KNOWLEDGE_WORKER",
      reasons: ["no classifiable objects; neutral default"],
    };
  }

  const tradesScore = counts.service + counts.location + signals;
  const knowledgeScore = counts.article + counts.post + counts.person;
  const techScore = counts.product;

  // Fixed contender order doubles as the tie-break order: strictly-greater
  // replacement keeps the earliest contender on every tie.
  const contenders: { name: SiteStrategyName; score: number; detail: string }[] = [
    {
      name: "TECHNOLOGY",
      score: techScore,
      detail: counts.product + " Product objects",
    },
    {
      name: "KNOWLEDGE_WORKER",
      score: knowledgeScore,
      detail:
        counts.article + " Article + " + counts.post + " Post + " + counts.person + " Person objects",
    },
    {
      name: "TRADES",
      score: tradesScore,
      detail:
        counts.service +
        " Service + " +
        counts.location +
        " Location objects + " +
        signals +
        " phone/service-area signals",
    },
  ];

  let winner = contenders[0];
  for (const c of contenders.slice(1)) {
    if (c.score > winner.score) winner = c;
  }

  const reasons = [
    winner.detail + " -> " + winner.name + " (score " + winner.score + ")",
    ...contenders
      .filter((c) => c !== winner)
      .map((c) => c.detail + " -> " + c.name + " (score " + c.score + ")"),
  ];
  return { candidate: winner.name, reasons };
}
