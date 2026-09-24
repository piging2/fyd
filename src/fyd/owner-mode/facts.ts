/**
 * LANE-OWNER: site FACTS.
 *
 * The first of three strictly separated concepts:
 *
 *   FACT         what the extractor observed (this file). Source truth.
 *                Every fact carries its extraction timestamp. Facts are
 *                never edited in place; owner input arrives as assertions
 *                (see ./corrections.ts), never as mutated facts.
 *   VISIBILITY   the owner-overridable policy that decides which facts may
 *                appear on the public site (see ./visibility-policy.ts).
 *   PRESENTATION how the visible facts are arranged and rendered
 *                (the SiteSpec + presentation-intent layer in
 *                ../customize/).
 *
 * Relationship to existing machinery (extend, do not duplicate):
 * - src/fyd/sitespec/field-visibility.ts owns per-FIELD show/hide/coarse
 *   projection. This file owns per-FACT identity: one SiteFact per scalar
 *   value, so a single social link or a single address line can be
 *   addressed, corrected, or hidden on its own.
 * - src/fyd/object/owner-overlay.ts owns the read-seam composition of
 *   contact-field corrections onto the projection. This lane's assertions
 *   (./corrections.ts) are the conversational/owner-mode front door; they
 *   convert 1:1 to that layer's correction records.
 *
 * Pure, deterministic, browser-safe. No dependencies beyond types and the
 * pure-TS sha256 helper.
 */

import { sha256Hex } from "../proceduralize/sha256";
import type { ObjectGraph } from "../sitespec/types";

/** The kind of business truth a fact carries. Drives conservative defaults. */
export type FactKind =
  | "identity"
  | "contact"
  | "location"
  | "social"
  | "service"
  | "team"
  | "other";

/**
 * One observed scalar value on one object. The factId is deterministic:
 * "fact-" + sha256(objectId + "|" + field + "|" + index), first 16 hex.
 * Array-valued fields yield one fact per string element (index disambiguates),
 * so "remove this social link" can target a single link.
 */
export interface SiteFact {
  factId: string;
  objectId: string;
  field: string;
  /** Element index inside an array-valued field; 0 for scalar fields. */
  index: number;
  value: string;
  kind: FactKind;
  /** ISO 8601 timestamp of the extraction run that observed this fact. */
  extractedAt: string;
  /** Set by applyCorrections when the owner CONFIRMs this exact value. */
  ownerConfirmation?: {
    owner: string;
    assertedAt: string;
  };
}

/** Deterministic fact id for a field element. */
export function factIdFor(
  objectId: string,
  field: string,
  index: number = 0,
): string {
  return "fact-" + sha256Hex(objectId + "|" + field + "|" + index).slice(0, 16);
}

function includesAny(haystack: string, needles: readonly string[]): boolean {
  return needles.some((n) => haystack.includes(n));
}

/**
 * Classify a field name into a FactKind. Keyword-anchored and
 * deterministic; unknown fields are "other", never guessed.
 */
export function classifyFactKind(field: string): FactKind {
  const f = field.toLowerCase();
  if (includesAny(f, ["business_name", "legal_name"]) || f === "name") return "identity";
  if (includesAny(f, ["phone", "email", "website", "url", "site"])) return "contact";
  if (
    includesAny(f, [
      "address",
      "street",
      "city",
      "state",
      "zip",
      "postal",
      "locality",
      "region",
    ])
  )
    return "location";
  if (
    includesAny(f, [
      "facebook",
      "instagram",
      "tiktok",
      "youtube",
      "linkedin",
      "twitter",
      "social",
    ])
  )
    return "social";
  if (includesAny(f, ["service", "offering", "specialty"])) return "service";
  if (includesAny(f, ["team", "member", "staff", "employee", "owner", "founder"]))
    return "team";
  return "other";
}

/**
 * Extract one SiteFact per scalar string value in the graph, in object
 * order and field insertion order. Empty and non-string values are skipped.
 * Deterministic: the same graph and timestamp always yield the same facts.
 */
export function extractSiteFacts(
  graph: ObjectGraph,
  extractedAt: string,
): SiteFact[] {
  const facts: SiteFact[] = [];
  for (const obj of graph.objects) {
    const fields = obj.fields ?? {};
    for (const [field, raw] of Object.entries(fields)) {
      const values = Array.isArray(raw) ? raw : [raw];
      let index = 0;
      for (const v of values) {
        if (typeof v !== "string" || v.trim().length === 0) continue;
        facts.push({
          factId: factIdFor(obj.id, field, index),
          objectId: obj.id,
          field,
          index,
          value: v,
          kind: classifyFactKind(field),
          extractedAt,
        });
        index += 1;
      }
    }
  }
  return facts;
}

/** Human label for owner surfaces: "Acme Plumbing : phone". No ids shown. */
export function factLabel(
  objectTitles: ReadonlyMap<string, string>,
  fact: Pick<SiteFact, "objectId" | "field" | "index" | "value">,
): string {
  const title = objectTitles.get(fact.objectId) ?? fact.objectId;
  const indexed = fact.index > 0 ? " #" + (fact.index + 1) : "";
  return title + " : " + fact.field + indexed;
}
