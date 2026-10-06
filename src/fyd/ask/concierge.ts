/**
 * Ask FYD minimal concierge: deterministic, evidence-only answers for the
 * seven canonical visitor questions.
 *
 * This module EXTENDS the existing ask lane (src/fyd/ask), it does not
 * replace it. It answers exactly these questions, and nothing else:
 *
 *   1. "What does this business do?"            (profile)
 *   2. "What services do they offer?"           (services)
 *   3. "Where do they operate?"                (where)
 *   4. "Who works here?"                       (who)
 *   5. "How do you know?"                       (provenance)
 *   6. "What information conflicts?"            (conflicts)
 *   7. "What don't you know?"                   (unknowns)
 *
 * Every claim in every answer carries exactly one grade:
 *
 *   SUPPORTED: the claim restates evidence directly (an object field, a
 *              relationship, an owner value, the site's own words). It
 *              MUST cite at least one evidence item.
 *   DERIVED:   the claim is computed from evidence (a count, a comparison,
 *              a merged list). It MUST cite every input it was computed from.
 *   INFERRED:  the claim is a labeled inference from evidence: a guess that
 *              says it is a guess. It MUST cite the evidence it was drawn from.
 *   UNKNOWN:   no evidence exists. The claim says so explicitly and cites
 *              nothing, because there is nothing to cite. UNKNOWN is a
 *              feature, not a failure: it is the honest answer when the
 *              graph has no record.
 *
 * No LLM, no filler, no completion of truncated text, no guessing. Same
 * graph + same question always produce the same answer (pure function; no
 * dates, no randomness; every list is sorted before rendering).
 *
 * Wiring: matchConciergeQuestion identifies the seven questions; the ask
 * pipeline routes them here before the generic composer. toAskFydAnswer
 * converts a ConciergeAnswer into the existing AskAnswer-shaped view
 * (answer text with [n] markers, evidenceRefs, claimClassifications,
 * unknowns) so the route and widget need no changes.
 */

import type {
  AskClaimClassification,
  AskEvidenceRef,
  PingObject,
  PingRelationship,
} from "../../lib/ping/types";
import type { ObjectGraph } from "../sitespec/types";

/** The epistemic grade of one claim. */
export type ConciergeGrade = "SUPPORTED" | "DERIVED" | "INFERRED" | "UNKNOWN";

/** The seven canonical questions, by id. */
export type ConciergeQuestionId =
  | "profile"
  | "services"
  | "where"
  | "who"
  | "provenance"
  | "conflicts"
  | "unknowns";

/** One cited piece of evidence: an object (optionally one field) or a relationship. */
export interface ConciergeEvidence {
  /** Stable dedupe key, never rendered. */
  key: string;
  objectId: string;
  field?: string;
  relationId?: string;
  /** Plain-language label, e.g. "Business record: Happy Place Carpentry LLC (description)". */
  label: string;
  /** Plain-language source, e.g. "The business website (https://...)". */
  source: string;
  /** Epistemic basis, e.g. "The site's own words (website statement, not independently verified)". */
  basis: string;
  lastChecked: string | null;
  /** Fact-class vocabulary for the AskAnswer conversion. */
  claimClass: string;
}

/** One graded claim: the unit the answer is built from. */
export interface GradedClaim {
  text: string;
  grade: ConciergeGrade;
  evidence: ConciergeEvidence[];
}

/** One detected contradiction: one fact, two or more differing values, each cited. */
export interface ConciergeConflict {
  fact: string;
  values: { value: string; evidence: ConciergeEvidence }[];
}

export interface ConciergeAnswer {
  questionId: ConciergeQuestionId;
  siteId: string;
  businessName: string;
  claims: GradedClaim[];
  /** Deterministic rendering: graded claims with [n] markers, then the evidence list. */
  text: string;
  /** Evidence chain in citation order. */
  evidence: ConciergeEvidence[];
  conflicts: ConciergeConflict[];
  /** Asked-about facts with no evidence. */
  unknowns: string[];
  /** True only when the question could not be answered from evidence at all. */
  refused: boolean;
}

export interface ConciergeInput {
  siteId: string;
  target: PingObject;
  /** The visible graph the answer may cite: target plus related public objects. */
  objects: PingObject[];
  relationships: PingRelationship[];
  question: string;
}

// ---------------------------------------------------------------------------
// Question matching: deterministic normalization, fixed match order.
// ---------------------------------------------------------------------------

function normalizeQuestion(q: string): string {
  return q
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasWord(q: string, ...words: string[]): boolean {
  return words.some((w) => new RegExp(`\\b${w}\\b`).test(q));
}

/**
 * Identify one of the seven canonical questions. Returns null for anything
 * else, so the existing composer keeps handling the long tail. Match order
 * is fixed and documented: conflicts > unknowns > provenance > who > where
 * > services > profile.
 */
export function matchConciergeQuestion(question: string): ConciergeQuestionId | null {
  const q = normalizeQuestion(question);
  if (q.length === 0) return null;
  if (hasWord(q, "conflict", "conflicts", "conflicting", "contradict", "contradiction", "contradicts", "disagree", "inconsistent")) {
    return "conflicts";
  }
  if (
    hasWord(q, "unknown", "unknowns", "missing") ||
    /dont you know/.test(q) ||
    /do you not know/.test(q) ||
    /what is missing/.test(q)
  ) {
    return "unknowns";
  }
  if (
    hasWord(q, "source", "sources", "provenance", "evidence") ||
    (hasWord(q, "how") && hasWord(q, "know")) ||
    /where did .* come from/.test(q) ||
    /where do you get/.test(q)
  ) {
    return "provenance";
  }
  if (
    /who works/.test(q) ||
    (hasWord(q, "who") && hasWord(q, "owner", "owners", "team", "staff", "people", "employee", "employees", "founder", "founders", "work", "works", "here", "there"))
  ) {
    return "who";
  }
  if (
    hasWord(q, "where", "location", "located", "address", "based", "operate", "operates", "area", "areas", "serve", "serves", "serving", "region", "regions", "city", "town")
  ) {
    return "where";
  }
  if (hasWord(q, "service", "services", "offer", "offers", "offering", "offerings", "provide", "provides")) {
    return "services";
  }
  if (/what do .* (do|offer|provide)/.test(q) || /does .* (offer|provide)/.test(q)) {
    return "services";
  }
  // "what does this business do" is the canonical profile question: it must
  // not be claimed by the services branch via its broad "do" trigger.
  // The "what is" shape is anchored to the business ("what is this",
  // "what is it") so open-ended "what is X" questions fall through to the
  // existing composer instead of getting a business-profile answer.
  if (
    /what does/.test(q) ||
    /what is (this business|this|it|your business)/.test(q) ||
    /what are (you|they|we)/.test(q) ||
    /who are (you|they|we)/.test(q) ||
    hasWord(q, "describe", "about", "profile", "tell", "do")
  ) {
    return "profile";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Evidence helpers: every citation names its source and epistemic basis.
// ---------------------------------------------------------------------------

function provenanceUrl(ref: string): string | null {
  const m = /^website-ingestion:(https?:\/\/.+)$/.exec(ref);
  return m ? m[1] : null;
}

function sourceFor(obj: PingObject): string {
  const prov = obj.provenance;
  const url = prov?.ref ? provenanceUrl(prov.ref) : null;
  const kind: string = prov?.kind ?? "";
  if (kind === "overlay-authored") return "Demo content added by the site operator";
  if (kind === "canonical-journal") return "Site record (canonical journal)";
  if (kind === "owner") return "Owner-authored content";
  if (kind === "procedural-fixture") return "Site record (fixture)";
  if (url) return `The business website (${url})`;
  return "The business website";
}

function basisFor(obj: PingObject): string {
  const kind: string = obj.provenance?.kind ?? "";
  if (kind === "overlay-authored")
    return "Demo content added by the site operator (not the website's own words, not a recorded fact)";
  if (kind === "canonical-journal") return "A recorded fact in the site data";
  if (kind === "owner") return "Owner-authored content";
  if (kind === "website-derived" || kind === "website-ingestion" || (obj.provenance?.ref ?? "").startsWith("website-ingestion:"))
    return "The site's own words (website statement, not independently verified)";
  return "The site record";
}

function claimClassFor(obj: PingObject, isRelationship: boolean): string {
  if (isRelationship) return "relationship_fact";
  const kind: string = obj.provenance?.kind ?? "";
  if (kind === "overlay-authored") return "DEMO_SYNTHETIC";
  if (kind === "canonical-journal") return "DIRECT_FACT";
  if (kind === "owner") return "owner_authorship";
  if (typeof obj.fields["claimKind"] === "string" && (obj.fields["claimKind"] as string).length > 0) {
    return obj.fields["claimKind"] as string;
  }
  return "website_statement";
}

function checkedDate(obj: PingObject): string | null {
  const d = obj.provenance?.derivedAt ?? obj.updatedAt ?? "";
  return d.length >= 10 ? d.slice(0, 10) : null;
}

function schemaShort(schema: string): string {
  return (schema.split(".").pop() ?? schema).replace(/@.*$/, "").replace(/_/g, " ");
}

function evidenceForObject(obj: PingObject, field?: string): ConciergeEvidence {
  const fieldPart = field ? ` (${field})` : "";
  return {
    key: `obj:${obj.id}#${field ?? ""}`,
    objectId: obj.id,
    field,
    label: `${cap(schemaShort(obj.schema))} record: ${obj.title || obj.id}${fieldPart}`,
    source: sourceFor(obj),
    basis: basisFor(obj),
    lastChecked: checkedDate(obj),
    claimClass: claimClassFor(obj, false),
  };
}

function evidenceForRelationship(
  rel: PingRelationship,
  objects: Map<string, PingObject>,
  label?: string,
): ConciergeEvidence {
  const subject = objects.get(rel.subject);
  const object = objects.get(rel.object);
  const fallback = `${rel.subject.slice(0, 12)} ${rel.predicate} ${rel.object.slice(0, 12)}`;
  const text =
    label ??
    (subject && object
      ? `${subject.title || subject.id} ${rel.predicate.replace(/_/g, " ")} ${object.title || object.id}`
      : fallback);
  const basisObj = subject ?? object;
  return {
    key: `rel:${rel.id}`,
    objectId: rel.subject,
    relationId: rel.id,
    label: `Recorded relationship: ${text}`,
    source: basisObj ? sourceFor(basisObj) : "The site record",
    basis: "A recorded relationship in the site data",
    lastChecked: rel.createdAt && rel.createdAt.length >= 10 ? rel.createdAt.slice(0, 10) : null,
    claimClass: "relationship_fact",
  };
}

function cap(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

function fieldOf(obj: PingObject, ...names: string[]): string | null {
  for (const n of names) {
    const v = obj.fields[n];
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
    if (Array.isArray(v) && v.length > 0) {
      const joined = v.join(", ").trim();
      if (joined.length > 0) return joined;
    }
  }
  return null;
}

function normValue(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

function sortByTitle<T extends { title?: string; id: string }>(items: T[]): T[] {
  return [...items].sort((a, b) =>
    (a.title ?? a.id) < (b.title ?? b.id)
      ? -1
      : (a.title ?? a.id) > (b.title ?? b.id)
        ? 1
        : a.id < b.id
          ? -1
          : 1,
  );
}

// ---------------------------------------------------------------------------
// Graph views: deterministic slices of the visible graph.
// ---------------------------------------------------------------------------

interface GraphView {
  byId: Map<string, PingObject>;
  services: PingObject[];
  serviceRels: PingRelationship[];
  locations: PingObject[];
  locationRels: PingRelationship[];
  persons: PingObject[];
  personLinks: { person: PingObject; rel: PingRelationship; predicate: string }[];
  areaServed: string | null;
  locality: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  hours: string | null;
  priceRange: string | null;
}

const SERVICE_SCHEMAS = new Set(["ping.social.service@1", "ping.social.product@1"]);
const OFFER_PREDICATES = new Set(["offers", "provides"]);

function isServiceSchema(schema: string): boolean {
  return SERVICE_SCHEMAS.has(schema) || schema.toLowerCase().includes("service");
}

function buildGraphView(target: PingObject, objects: PingObject[], relationships: PingRelationship[]): GraphView {
  // Fail closed: the input contract says this is the visible (public) graph,
  // but a caller that passes the full graph would otherwise leak non-public
  // objects through relationship traversal (services, locations, persons).
  // Non-public objects are never citable: they are absent from the id index,
  // so traversal and evidence building cannot reach them.
  const visible = objects.filter((o) => o.visibility === "public");
  const byId = new Map(visible.map((o) => [o.id, o]));
  const active = relationships.filter((r) => r.status === "active");
  const incident = active.filter((r) => r.subject === target.id || r.object === target.id);

  const serviceRels = incident
    .filter((r) => OFFER_PREDICATES.has(r.predicate))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const services: PingObject[] = [];
  for (const r of serviceRels) {
    const otherId = r.subject === target.id ? r.object : r.subject;
    const o = byId.get(otherId);
    if (o && o.id !== target.id && isServiceSchema(o.schema) && !services.some((s) => s.id === o.id)) {
      services.push(o);
    }
  }

  const locationRels = incident
    .filter((r) => r.predicate === "located_at")
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const locations: PingObject[] = [];
  for (const r of locationRels) {
    const otherId = r.subject === target.id ? r.object : r.subject;
    const o = byId.get(otherId);
    if (o && o.id !== target.id && o.schema.toLowerCase().includes("location") && !locations.some((l) => l.id === o.id)) {
      locations.push(o);
    }
  }

  const personLinks: GraphView["personLinks"] = [];
  for (const r of incident.sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const otherId = r.subject === target.id ? r.object : r.subject;
    const o = byId.get(otherId);
    if (o && o.id !== target.id && o.schema.toLowerCase().includes("person")) {
      personLinks.push({ person: o, rel: r, predicate: r.predicate });
    }
  }
  const persons = sortByTitle(personLinks.map((p) => p.person));

  return {
    byId,
    services: sortByTitle(services),
    serviceRels,
    locations: sortByTitle(locations),
    locationRels,
    persons,
    personLinks: personLinks.sort((a, b) => (a.person.title < b.person.title ? -1 : 1)),
    areaServed: fieldOf(target, "area_served", "areaServed", "service_area"),
    locality: fieldOf(target, "locality", "address", "city", "location"),
    phone: fieldOf(target, "phone"),
    email: fieldOf(target, "email"),
    website: fieldOf(target, "website", "url", "domain"),
    hours: fieldOf(target, "hours", "business_hours", "opening_hours"),
    priceRange: fieldOf(target, "price_range", "priceRange"),
  };
}

// ---------------------------------------------------------------------------
// Claim builders: one per canonical question.
// ---------------------------------------------------------------------------

function locationLabel(obj: PingObject): string {
  return fieldOf(obj, "locality") ?? obj.title ?? obj.id;
}

function claimsProfile(target: PingObject, view: GraphView): GradedClaim[] {
  const name = target.title || target.id;
  const desc = target.description?.trim() ?? "";
  const claims: GradedClaim[] = [];
  if (desc.length > 0) {
    claims.push({
      text: `${name} is described as: "${desc}"`,
      grade: "SUPPORTED",
      evidence: [evidenceForObject(target, "description")],
    });
  } else {
    claims.push({
      text: `What this business does: unknown. The site data has no description for ${name}, so I will not characterize it.`,
      grade: "UNKNOWN",
      evidence: [],
    });
  }
  const category = fieldOf(target, "category", "businessCategory", "type");
  if (category && category.toLowerCase() !== "website") {
    claims.push({
      text: `Category on record: ${category}.`,
      grade: "SUPPORTED",
      evidence: [evidenceForObject(target, "category")],
    });
  }
  if (view.services.length > 0) {
    claims.push({
      text: `Their listed services are: ${view.services.map((s) => s.title || s.id).join("; ")}.`,
      grade: "DERIVED",
      evidence: [
        ...view.services.map((s) => evidenceForObject(s)),
        ...view.serviceRels.map((r) => evidenceForRelationship(r, view.byId)),
      ],
    });
  }
  return claims;
}

function claimsServices(target: PingObject, view: GraphView): GradedClaim[] {
  const name = target.title || target.id;
  if (view.services.length === 0) {
    return [
      {
        text: `Services offered: unknown. The site data lists no service records for ${name}, so I will not invent a service list.`,
        grade: "UNKNOWN",
        evidence: [],
      },
    ];
  }
  const claims: GradedClaim[] = view.services.map((s) => {
    const rel = view.serviceRels.find(
      (r) =>
        (r.subject === target.id && r.object === s.id) ||
        (r.object === target.id && r.subject === s.id),
    );
    const evidence = [evidenceForObject(s)];
    if (rel) evidence.push(evidenceForRelationship(rel, view.byId));
    return {
      text: `Offers: ${s.title || s.id}.`,
      grade: "SUPPORTED" as ConciergeGrade,
      evidence,
    };
  });
  claims.push({
    text: `The site data lists ${view.services.length} service${view.services.length === 1 ? "" : "s"} for ${name}.`,
    grade: "DERIVED",
    evidence: [
      ...view.services.map((s) => evidenceForObject(s)),
      ...view.serviceRels.map((r) => evidenceForRelationship(r, view.byId)),
    ],
  });
  return claims;
}

function claimsWhere(target: PingObject, view: GraphView): GradedClaim[] {
  const name = target.title || target.id;
  const claims: GradedClaim[] = [];
  for (const loc of view.locations) {
    const rel = view.locationRels.find(
      (r) =>
        (r.subject === target.id && r.object === loc.id) ||
        (r.object === target.id && r.subject === loc.id),
    );
    const evidence = [evidenceForObject(loc)];
    if (rel) evidence.push(evidenceForRelationship(rel, view.byId));
    claims.push({
      text: `Listed location: ${locationLabel(loc)}.`,
      grade: "SUPPORTED",
      evidence,
    });
  }
  if (view.areaServed) {
    claims.push({
      text: `Service area on record: ${view.areaServed}.`,
      grade: "SUPPORTED",
      evidence: [evidenceForObject(target, "area_served")],
    });
  } else if (view.locality && view.locations.length === 0) {
    claims.push({
      text: `Location on record: ${view.locality}.`,
      grade: "SUPPORTED",
      evidence: [evidenceForObject(target, "locality")],
    });
  }
  if (claims.length === 0) {
    claims.push({
      text: `Where they operate: unknown. The site data has no location record for ${name}, so I will not guess a service area.`,
      grade: "UNKNOWN",
      evidence: [],
    });
  }
  return claims;
}

function looksLikeUsername(label: string): boolean {
  const t = label.trim();
  return t.length > 0 && !/\s/.test(t) && (/[0-9]/.test(t) || t === t.toLowerCase());
}

function claimsWho(target: PingObject, view: GraphView): GradedClaim[] {
  const name = target.title || target.id;
  if (view.personLinks.length === 0) {
    return [
      {
        text: `Who works here: unknown. The site data contains no person records for ${name}, so I cannot name an owner or staff. I will not guess at names, roles, or personal details that are not on record.`,
        grade: "UNKNOWN",
        evidence: [],
      },
    ];
  }
  const claims: GradedClaim[] = [];
  for (const { person, rel, predicate } of view.personLinks) {
    const label = person.title || fieldOf(person, "name") || person.id;
    claims.push({
      text: `Person on record: ${label}. The site links this person to ${name} (${predicate.replace(/_/g, " ")}).`,
      grade: "SUPPORTED",
      evidence: [evidenceForObject(person), evidenceForRelationship(rel, view.byId)],
    });
    if (looksLikeUsername(label)) {
      claims.push({
        text: `The label "${label}" looks like a website username rather than a person's name, so treat it as a site account label, not an identified individual.`,
        grade: "INFERRED",
        evidence: [evidenceForObject(person, "name")],
      });
    }
  }
  claims.push({
    text: `Real names and roles beyond the labels above: unknown. The records give only what is quoted.`,
    grade: "UNKNOWN",
    evidence: [],
  });
  return claims;
}

function claimsProvenance(target: PingObject, view: GraphView): GradedClaim[] {
  const name = target.title || target.id;
  const claims: GradedClaim[] = [];
  const ev = evidenceForObject(target);
  claims.push({
    text: `I answer from the site record for ${name}.`,
    grade: "SUPPORTED",
    evidence: [ev],
  });
  claims.push({
    text: `The record's stated source is: ${ev.source}.`,
    grade: "SUPPORTED",
    evidence: [ev],
  });
  if (ev.lastChecked) {
    claims.push({
      text: `The record was derived on ${ev.lastChecked}.`,
      grade: "SUPPORTED",
      evidence: [ev],
    });
  }
  claims.push({
    text: `Basis: ${ev.basis}.`,
    grade: "SUPPORTED",
    evidence: [ev],
  });
  const extraSources = new Map<string, ConciergeEvidence>();
  for (const o of view.services) extraSources.set(o.id, evidenceForObject(o));
  for (const o of view.locations) extraSources.set(o.id, evidenceForObject(o));
  for (const { person } of view.personLinks) extraSources.set(person.id, evidenceForObject(person));
  if (extraSources.size > 0) {
    claims.push({
      text: `Related records consulted: ${[...extraSources.values()].map((e) => e.label).join("; ")}.`,
      grade: "DERIVED",
      evidence: [...extraSources.values()],
    });
  }
  return claims;
}

// ---------------------------------------------------------------------------
// Conflict scan: one fact, two differing values, both cited.
// ---------------------------------------------------------------------------

function scanConflicts(target: PingObject, view: GraphView): ConciergeConflict[] {
  const conflicts: ConciergeConflict[] = [];

  const titleField = fieldOf(target, "title");
  if (titleField && target.title.trim().length > 0 && normValue(titleField) !== normValue(target.title)) {
    conflicts.push({
      fact: "business name",
      values: [
        { value: target.title, evidence: evidenceForObject(target) },
        { value: titleField, evidence: evidenceForObject(target, "title") },
      ],
    });
  }

  const descField = fieldOf(target, "description");
  const desc = target.description?.trim() ?? "";
  if (descField && desc.length > 0 && normValue(descField) !== normValue(desc)) {
    conflicts.push({
      fact: "business description",
      values: [
        { value: desc, evidence: evidenceForObject(target, "description") },
        { value: descField, evidence: evidenceForObject(target, "description") },
      ],
    });
  }

  const localityValues = new Map<string, { value: string; evidence: ConciergeEvidence }>();
  for (const loc of view.locations) {
    const label = locationLabel(loc);
    const key = normValue(label);
    if (!localityValues.has(key)) {
      const rel = view.locationRels.find(
        (r) =>
          (r.subject === target.id && r.object === loc.id) ||
          (r.object === target.id && r.subject === loc.id),
      );
      const evidence = rel
        ? evidenceForRelationship(rel, view.byId)
        : evidenceForObject(loc);
      localityValues.set(key, { value: label, evidence });
    }
  }
  if (view.locality) {
    const key = normValue(view.locality);
    if (!localityValues.has(key)) {
      localityValues.set(key, {
        value: view.locality,
        evidence: evidenceForObject(target, "locality"),
      });
    }
  }
  if (localityValues.size > 1) {
    conflicts.push({
      fact: "location",
      values: [...localityValues.values()].sort((a, b) => (a.value < b.value ? -1 : 1)),
    });
  }

  for (const [fact, values] of [
    ["phone", collectFieldValues(target, ["phone"])],
    ["email", collectFieldValues(target, ["email"])],
    ["website", collectFieldValues(target, ["website", "url", "domain"])],
  ] as const) {
    const distinct = new Map<string, string>();
    for (const v of values) {
      const key = normValue(v);
      if (!distinct.has(key)) distinct.set(key, v);
    }
    if (distinct.size > 1) {
      conflicts.push({
        fact,
        values: [...distinct.values()]
          .sort()
          .map((value) => ({ value, evidence: evidenceForObject(target, fact) })),
      });
    }
  }

  return conflicts;
}

function collectFieldValues(obj: PingObject, names: string[]): string[] {
  const out: string[] = [];
  for (const n of names) {
    const v = obj.fields[n];
    if (typeof v === "string" && v.trim().length > 0) out.push(v.trim());
    else if (Array.isArray(v)) {
      for (const item of v) if (item.trim().length > 0) out.push(item.trim());
    }
  }
  return out;
}

function claimsConflicts(target: PingObject, view: GraphView): { claims: GradedClaim[]; conflicts: ConciergeConflict[] } {
  const conflicts = scanConflicts(target, view);
  const compared: ConciergeEvidence[] = [evidenceForObject(target)];
  for (const loc of view.locations) compared.push(evidenceForObject(loc));
  if (conflicts.length === 0) {
    return {
      conflicts,
      claims: [
        {
          text: `No conflicting information found. I compared the name, description, location, and contact details across ${compared.length} record${compared.length === 1 ? "" : "s"} and found no contradictions.`,
          grade: "DERIVED",
          evidence: compared,
        },
      ],
    };
  }
  const claims: GradedClaim[] = [];
  for (const c of conflicts.sort((a, b) => (a.fact < b.fact ? -1 : 1))) {
    for (const v of c.values) {
      claims.push({
        text: `${cap(c.fact)} value on record: "${v.value}".`,
        grade: "SUPPORTED",
        evidence: [v.evidence],
      });
    }
    claims.push({
      text: `These ${c.values.length} values for ${c.fact} contradict each other: the site data says more than one thing.`,
      grade: "DERIVED",
      evidence: c.values.map((v) => v.evidence),
    });
  }
  return { conflicts, claims };
}

// ---------------------------------------------------------------------------
// Unknowns: asked-about facts with no evidence.
// ---------------------------------------------------------------------------

interface UnknownProbe {
  key: string;
  fact: string;
  has: (view: GraphView) => boolean;
}

const UNKNOWN_PROBES: UnknownProbe[] = [
  { key: "people", fact: "Who works here (names and roles)", has: (v) => v.personLinks.length > 0 },
  { key: "services", fact: "The services this business offers", has: (v) => v.services.length > 0 },
  {
    key: "location",
    fact: "Where this business operates",
    has: (v) => v.locations.length > 0 || v.locality !== null || v.areaServed !== null,
  },
  {
    key: "contact",
    fact: "How to contact this business",
    has: (v) => v.phone !== null || v.email !== null || v.website !== null,
  },
  { key: "hours", fact: "Business hours", has: (v) => v.hours !== null },
  { key: "pricing", fact: "Pricing", has: (v) => v.priceRange !== null },
  {
    key: "owner",
    fact: "The owner's identity",
    has: (v) =>
      v.personLinks.some((p) =>
        ["owns", "owner_of", "founded_by", "founder_of"].includes(p.predicate),
      ),
  },
];

function claimsUnknowns(target: PingObject, view: GraphView): { claims: GradedClaim[]; unknowns: string[] } {
  const missing = UNKNOWN_PROBES.filter((p) => !p.has(view));
  const claims: GradedClaim[] = missing.map((p) => ({
    text: `${p.fact}: unknown. The site data has no record of it, so I will not guess.`,
    grade: "UNKNOWN" as ConciergeGrade,
    evidence: [],
  }));
  if (missing.length === 0) {
    // Derived from the full probe pass over the business record: every
    // probed fact has evidence. Cites the record the probes ran against.
    claims.push({
      text: "Everything this question probes has evidence on record: people, services, location, contact, hours, pricing, and owner identity.",
      grade: "DERIVED",
      evidence: [evidenceForObject(target)],
    });
  }
  return { claims, unknowns: missing.map((p) => p.fact) };
}

// ---------------------------------------------------------------------------
// Rendering: deterministic text with [n] evidence markers.
// ---------------------------------------------------------------------------

function renderAnswer(
  questionId: ConciergeQuestionId,
  siteId: string,
  businessName: string,
  claims: GradedClaim[],
): { text: string; evidence: ConciergeEvidence[] } {
  const evidence: ConciergeEvidence[] = [];
  const indexOf = new Map<string, number>();
  const marker = (e: ConciergeEvidence): string => {
    let i = indexOf.get(e.key);
    if (i === undefined) {
      i = evidence.length;
      evidence.push(e);
      indexOf.set(e.key, i);
    }
    return `[${i + 1}]`;
  };
  const lines: string[] = claims.map((c) => {
    const tags = [...new Set(c.evidence.map((e) => marker(e)))].join("");
    return `[${c.grade}] ${c.text}${tags.length > 0 ? " " + tags : ""}`;
  });
  if (evidence.length > 0) {
    lines.push("Evidence");
    evidence.forEach((e, i) => {
      const parts = [
        `[${i + 1}] ${e.label}.`,
        `Source: ${e.source}.`,
        `Basis: ${e.basis}.`,
      ];
      if (e.lastChecked) parts.push(`Last checked: ${e.lastChecked}.`);
      lines.push(parts.join(" "));
    });
  }
  return { text: lines.join("\n\n"), evidence };
}

// ---------------------------------------------------------------------------
// Public interface.
// ---------------------------------------------------------------------------

/**
 * Answer one of the seven canonical questions from the visible graph only.
 * Returns null when the question is not one of the seven (the existing
 * composer keeps handling those).
 */
export function answerConciergeQuestion(input: ConciergeInput): ConciergeAnswer | null {
  const questionId = matchConciergeQuestion(input.question);
  if (!questionId) return null;
  const businessName = input.target.title || input.target.id;
  const view = buildGraphView(input.target, input.objects, input.relationships);

  let claims: GradedClaim[];
  let conflicts: ConciergeConflict[] = [];
  let unknowns: string[] = [];
  switch (questionId) {
    case "profile":
      claims = claimsProfile(input.target, view);
      break;
    case "services":
      claims = claimsServices(input.target, view);
      break;
    case "where":
      claims = claimsWhere(input.target, view);
      break;
    case "who":
      claims = claimsWho(input.target, view);
      break;
    case "provenance":
      claims = claimsProvenance(input.target, view);
      break;
    case "conflicts": {
      const out = claimsConflicts(input.target, view);
      claims = out.claims;
      conflicts = out.conflicts;
      break;
    }
    case "unknowns": {
      const out = claimsUnknowns(input.target, view);
      claims = out.claims;
      unknowns = out.unknowns;
      break;
    }
  }

  // Invariant: every SUPPORTED/DERIVED/INFERRED claim cites evidence.
  // A claim that cannot meet its grade is a bug, not an answer.
  for (const c of claims) {
    if (c.grade !== "UNKNOWN" && c.evidence.length === 0) {
      throw new Error(
        `concierge: ${c.grade} claim without evidence for question '${questionId}': ${c.text.slice(0, 80)}`,
      );
    }
  }

  const { text, evidence } = renderAnswer(questionId, input.siteId, businessName, claims);
  const refused = claims.length > 0 && claims.every((c) => c.grade === "UNKNOWN");
  return { questionId, siteId: input.siteId, businessName, claims, text, evidence, conflicts, unknowns, refused };
}

/** The seven canonical questions, in the fixed order the tests iterate. */
export const CONCIERGE_QUESTIONS: { id: ConciergeQuestionId; question: string }[] = [
  { id: "profile", question: "What does this business do?" },
  { id: "services", question: "What services do they offer?" },
  { id: "where", question: "Where do they operate?" },
  { id: "who", question: "Who works here?" },
  { id: "provenance", question: "How do you know?" },
  { id: "conflicts", question: "What information conflicts?" },
  { id: "unknowns", question: "What don't you know?" },
];

// ---------------------------------------------------------------------------
// Wiring view: convert a ConciergeAnswer into the existing AskAnswer-shaped
// pieces (answer text, evidenceRefs, claimClassifications, unknowns) so the
// pipeline, route, and widget need no changes.
// ---------------------------------------------------------------------------

export interface ConciergeAskFydView {
  answer: string;
  evidenceRefs: AskEvidenceRef[];
  claimClassifications: AskClaimClassification[];
  unknowns: string[];
}

const GRADE_TO_CLASSIFICATION: Record<Exclude<ConciergeGrade, "UNKNOWN">, string> = {
  SUPPORTED: "DIRECT_FACT",
  DERIVED: "DERIVED_FACT",
  INFERRED: "INFERENCE",
};

/**
 * Map a ConciergeAnswer onto the evidence pieces the ask pipeline already
 * renders. The [n] markers in the answer text line up with evidenceRefs by
 * construction (same order). UNKNOWN claims carry no evidence, so they
 * become unknowns strings instead of citations.
 */
export function toAskFydAnswer(ans: ConciergeAnswer): ConciergeAskFydView {
  const evidenceRefs: AskEvidenceRef[] = ans.evidence.map((e) => ({
    kind: e.relationId ? ("relationship" as const) : e.field ? ("field" as const) : ("object" as const),
    id: e.relationId ?? (e.field ? `${e.objectId}#${e.field}` : e.objectId),
    label: e.label,
    detail: `Source: ${e.source}. Basis: ${e.basis}.`,
  }));
  const claimClassifications: AskClaimClassification[] = [];
  const unknowns: string[] = [...ans.unknowns];
  for (const claim of ans.claims) {
    const refIds: string[] = [];
    for (const e of claim.evidence) {
      const id = e.relationId ?? (e.field ? `${e.objectId}#${e.field}` : e.objectId);
      if (!refIds.includes(id)) refIds.push(id);
    }
    if (claim.grade === "UNKNOWN") {
      if (!unknowns.includes(claim.text)) unknowns.push(claim.text);
      continue;
    }
    // SUPPORTED keeps the evidence's own epistemic class (website statement,
    // relationship fact, ...); DERIVED/INFERRED are always labeled as such.
    const classification =
      claim.grade === "SUPPORTED"
        ? (claim.evidence[0]?.claimClass ?? GRADE_TO_CLASSIFICATION.SUPPORTED)
        : GRADE_TO_CLASSIFICATION[claim.grade];
    claimClassifications.push({ claim: claim.text, classification, evidenceRefIds: refIds });
  }
  return { answer: ans.text, evidenceRefs, claimClassifications, unknowns };
}

/** Build a ConciergeInput from the same public graph the pipeline answers from. */
export function conciergeInputFor(
  siteId: string,
  target: PingObject,
  objects: PingObject[],
  relationships: PingRelationship[],
  question: string,
): ConciergeInput {
  return { siteId, target, objects, relationships, question };
}

export type { ObjectGraph };
