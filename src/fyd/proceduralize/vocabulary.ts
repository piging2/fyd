/**
 * Fail-closed vocabulary gate for canonical ingestion.
 *
 * Nolan binding decision 2026-09-28:
 *   RAW OBSERVATION -> vocabulary validation ->
 *     KNOWN VALID   -> normalize -> canonical semantic candidate
 *     UNKNOWN/UNSUPPORTED -> preserve evidence -> mark unsupported/quarantined
 *                            -> do NOT canonicalize -> reconciliation/work queue
 *
 * Unknown vocabulary must not poison canonical meaning (a foreign-namespace
 * type named "Plumber" must never become a schema.org Plumber), and useful
 * source evidence must not be discarded (the raw IRIs survive on the
 * unsupported-evidence record and the reconciliation queue).
 *
 * This module owns ONE thing: namespace classification of observed term
 * IRIs. It is not a schema.org database and it does not decide which
 * schema.org terms the pipeline maps (the LITERAL_FACTS / PREDICATE_MAP /
 * EMIT_TYPES tables stay where they are). It answers the single question
 * the ingestion boundary must ask before any mapping table is consulted:
 * "is this term inside the known input vocabulary at all?"
 *
 * Known input vocabulary: the schema.org namespace, http(s)://schema.org/.
 * Rationale: the pipeline's documented input-vocabulary default is
 * schema.org @vocab (STRUCTURED-DATA.md), every mapping table is keyed by
 * schema.org terms, and a wrong-vocabulary block is already unreadable to
 * those tables. Anything outside the namespace is UNKNOWN, never "probably
 * the same term".
 *
 * No new authority: this is a pure classifier consumed by the existing
 * extraction seam (structured-data.ts, microdata.ts). No store, no registry.
 */

export const SCHEMA_ORG = "https://schema.org/";

/** Matches http://schema.org/ and https://schema.org/ term IRIs (and only those). */
export const SCHEMA_ORG_NAMESPACE_RE = /^https?:\/\/schema\.org\//;

export type TermNamespace = "schema.org" | "unknown";

export interface ClassifiedTerm {
  /** The observed IRI, trimmed. Preserved verbatim for evidence. */
  iri: string;
  /** "schema.org" iff the IRI is inside the schema.org namespace. */
  namespace: TermNamespace;
  /**
   * Compact term name when the namespace is schema.org; the raw IRI
   * otherwise. A name is never invented for an unknown-namespace term:
   * "https://evil.example/Plumber" keeps its full IRI and can never
   * collide with schema.org "Plumber" in a mapping table.
   */
  name: string;
}

/**
 * Classify one observed term IRI. Pure, total, deterministic.
 * Empty/missing input classifies as unknown (callers decide whether an
 * absent term is filterable noise or evidence; see microdata.ts).
 */
export function classifyTerm(iri: string | undefined | null): ClassifiedTerm {
  const t = (iri ?? "").trim();
  if (t !== "" && SCHEMA_ORG_NAMESPACE_RE.test(t)) {
    return { iri: t, namespace: "schema.org", name: t.replace(SCHEMA_ORG_NAMESPACE_RE, "") };
  }
  return { iri: t, namespace: "unknown", name: t };
}

export type VocabularyVerdict = "KNOWN" | "UNKNOWN";

export interface EntityVocabularyVerdict {
  /**
   * KNOWN when at least one observed @type is inside the schema.org
   * namespace: the entity is a canonical semantic candidate (canonical
   * meaning comes from the known types only). UNKNOWN when no observed
   * @type is inside the namespace: the entity is quarantined -- evidence
   * preserved, never canonicalized.
   */
  verdict: VocabularyVerdict;
  /** Compact schema.org type names, sorted, deduped. */
  knownTypes: string[];
  /** Raw IRIs outside the known vocabulary, sorted, deduped: evidence, not meaning. */
  unknownTypeIris: string[];
}

/**
 * Vocabulary verdict for one entity's observed @type IRIs. Pure, total,
 * deterministic. A schema.org IRI that compacts to an empty name
 * ("https://schema.org/") is treated as unknown: it names no term.
 */
export function classifyEntityTypes(typeIris: Array<string | undefined | null>): EntityVocabularyVerdict {
  const known = new Set<string>();
  const unknown = new Set<string>();
  for (const raw of typeIris) {
    const c = classifyTerm(raw);
    if (c.namespace === "schema.org" && c.name !== "") {
      known.add(c.name);
    } else {
      unknown.add(c.iri);
    }
  }
  const knownTypes = [...known].sort();
  const unknownTypeIris = [...unknown].sort();
  return {
    verdict: knownTypes.length > 0 ? "KNOWN" : "UNKNOWN",
    knownTypes,
    unknownTypeIris,
  };
}
