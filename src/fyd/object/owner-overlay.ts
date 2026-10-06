/**
 * Owner field-correction overlay (server-only).
 *
 * The legitimate projection path for owner corrections. The projection
 * read seam (src/fyd/data/ping-object-source.ts) composes this AFTER the
 * projection's digest verification, which gives three guarantees:
 *
 * 1. The source projection is never mutated. Its digest still verifies,
 *    the projection file still says what the source said, and the public
 *    projection endpoint (/api/fyd/projection) serves only the verified
 *    public projection. SOURCE SAYS X stands on its own evidence.
 * 2. Every consumer of the read seam (generated site pages, Ask FYD, the
 *    ObjectView, the Circle projection) sees the same EFFECTIVE value
 *    with the same provenance. There is no per-surface patching: the
 *    correction flows through the read model or not at all.
 * 3. The correction is itself evidence: each composed object carries the
 *    full correction record (source value, owner value, timestamp, actor
 *    label, basis), so any surface can render the SOURCE SAYS X /
 *    OWNER SAYS Y distinction honestly.
 *
 * Owner state lives in the owner store (data/fyd-owner/<siteId>.json),
 * completely separate from source state. Source re-ingestion rewrites
 * only the projection; it re-reads the owner store on every serve, so a
 * source refresh can never silently wipe an owner correction. When the
 * source's CURRENT value no longer matches what it said at correction
 * time, the composed record carries sourceDrifted: true (derived per
 * read, never written back): the owner value still wins, and the drift
 * is visible instead of silent.
 */

import { SCHEMA_ROLES } from "../sitespec/schemas";
import type { ObjectGraph } from "../sitespec/types";
import type {
  OwnerFieldCorrection,
  PingObject,
} from "../../lib/ping/types";
import { readOverrides } from "./owner-store";
import {
  SERVICE_ORDER_TARGET,
  serviceFieldTarget,
  serviceTarget,
} from "./owner-events";

/**
 * The public business object of a site graph. Fail-closed: returns the
 * object only when EXACTLY ONE candidate matches the predicate. Zero
 * matches (the refresh re-derived the business object as non-public) or
 * several (the refresh emitted a parent brand plus the local listing) both
 * return null instead of silently picking the first: every caller already
 * null-handles (the overrides route records sourceValue null, the
 * patch-loop preview reports unpreviewable, the overlay surfaces an
 * orphaned correction with a reason). It shares the candidate predicate
 * with the ObjectView loader but NOT the selection rule: the loader
 * renders against the FIRST match, so callers that must judge what the
 * view actually shows (orphaned-service detection) must use
 * firstBusinessObject, never this fail-closed resolver.
 */
export function findBusinessObject(graph: ObjectGraph): PingObject | null {
  const candidates = businessCandidates(graph);
  return candidates.length === 1 ? candidates[0] : null;
}

/**
 * First-match business resolution: the same predicate AND the same
 * selection the ObjectView loader (loadObjectView) uses. Orphan
 * detection resolves through this, never through findBusinessObject:
 * the view renders service order and visibility against the first public
 * business candidate, so judging "current services" against a
 * fail-closed null (parent brand plus local listing) flagged corrections
 * the view was actually applying (PROD-8).
 */
export function firstBusinessObject(graph: ObjectGraph): PingObject | null {
  return graph.objects.find(isBusinessCandidate) ?? null;
}

/** The single predicate that identifies the correctable business object. */
function isBusinessCandidate(o: PingObject): boolean {
  return SCHEMA_ROLES.business.includes(o.schema) && o.visibility === "public";
}

/** All objects matching the business-candidate predicate, in graph order. */
export function businessCandidates(graph: ObjectGraph): PingObject[] {
  return graph.objects.filter(isBusinessCandidate);
}

/** Raw scalar field read: what the SOURCE projection says, pre-overlay. */
export function rawFieldValue(
  obj: PingObject,
  field: string,
): string | null {
  const v = obj.fields?.[field];
  if (typeof v === "string" && v.trim().length > 0) return v.trim();
  if (Array.isArray(v) && v.length > 0 && typeof v[0] === "string" && v[0].trim().length > 0) {
    return v[0].trim();
  }
  return null;
}

/**
 * Pure reader: the composed owner correction for one field on one object,
 * or null. Surfaces use this to render the SOURCE SAYS X / OWNER SAYS Y
 * distinction; it performs no I/O.
 */
export function ownerCorrectionForObject(
  obj: PingObject,
  field: string,
): OwnerFieldCorrection | null {
  const list = obj.ownerFieldCorrections;
  if (!list) return null;
  return list.find((c) => c.field === field) ?? null;
}

export interface OwnerOverlayResult {
  graph: ObjectGraph;
  /** Corrections composed onto the graph, in field order. Empty when none. */
  applied: OwnerFieldCorrection[];
  /**
   * Corrections that could NOT be composed, never silently dropped.
   * A source refresh that removes the business object (no-business-object)
   * or re-derives several of them (ambiguous-target, e.g. franchise parent
   * plus local listing) surfaces here instead of returning applied: [] or
   * attaching the correction to the wrong object with no trace.
   */
  orphaned: OrphanedCorrection[];
}

/**
 * One owner correction the overlay could not compose onto the refreshed
 * graph. The owner layer is untouched (the correction is retained); the
 * surface must render this explicitly instead of showing source values as
 * if no correction existed.
 */
export interface OrphanedCorrection {
  /**
   * The field correction that could not be composed. Null for
   * non-field corrections (service order, service visibility), which
   * are identified by `target` instead.
   */
  correction: OwnerFieldCorrection | null;
  /** Fact address, e.g. "contact:phone", "services:order", "service:<id>". */
  target: string;
  /** Machine-readable reason. */
  reason:
    | "no-business-object"
    | "ambiguous-target"
    | "service-order-orphaned"
    | "service-visibility-orphaned"
    | "service-description-orphaned";
  /** Human-readable detail for owner surfaces and logs. */
  detail: string;
}

function cloneFields(
  fields: Record<string, string | string[]>,
): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = Array.isArray(v) ? [...v] : v;
  }
  return out;
}

/**
 * Drift comparison, normalization-symmetric with the correction record
 * path. rawFieldValue trims the live source value on read, but
 * sourceValue was recorded raw at correction time; comparing the two
 * exactly flags a whitespace / bidi-mark re-emission as drift and raises
 * a spurious CorrectionConflict downstream ("source now says X" when the
 * source says the same thing with different spacing). Normalize both
 * sides identically: trim, collapse whitespace runs, strip Unicode bidi
 * controls. Dashes, case, and punctuation are NOT folded: those can be
 * semantic (an en-dash vs hyphen change is real drift).
 */
function driftValuesEqual(a: string | null, b: string | null): boolean {
  const norm = (v: string | null): string | null => {
    if (v == null) return null;
    const t = v
      .replace(/[\u200E\u200F\u202A-\u202E]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    return t.length > 0 ? t : null;
  };
  return norm(a) === norm(b);
}

/**
 * Compose the owner store's field corrections onto a projection graph.
 * Never mutates the input graph: the source layer's objects are left
 * untouched and a new graph is returned.
 *
 * Target resolution is explicit: exactly one public business object must
 * match the findBusinessObject predicate. Zero matches (the refresh
 * re-derived the business object as non-public) or several (the refresh
 * emitted a parent brand plus the local listing) no longer fail silently:
 * the corrections are returned in `orphaned` with a reason, so surfaces
 * can render "owner correction pending review" instead of showing raw
 * source values as if the owner had never spoken.
 *
 * A correction for a field the source never emitted is composed by
 * CREATING the field, not orphaned: the owner asserts the business HAS
 * this field with this value, so the correction is fully effective (the
 * view shows the owner value). Only the missing/ambiguous TARGET OBJECT
 * orphans a field correction, never an unknown field name.
 *
 * Service description corrections (field "description", targetObjectId
 * set) are composed onto the service object resolved BY ID, not onto
 * the business object: the description belongs to the service. Drift is
 * read off the service's live description; a missing or non-public
 * service orphans the correction with reason
 * "service-description-orphaned".
 */
export function applyOwnerFieldCorrections(
  graph: ObjectGraph,
  siteId: string,
): OwnerOverlayResult {
  const overrides = readOverrides(siteId);
  const corrections = Object.values(overrides.fieldCorrections ?? {});
  if (corrections.length === 0) return { graph, applied: [], orphaned: [] };

  // Contact corrections resolve the single public business object;
  // service description corrections resolve their target service by id.
  const isServiceDescription = (c: OwnerFieldCorrection): boolean =>
    c.field === "description" && typeof c.targetObjectId === "string";
  const businessCorrections = corrections.filter((c) => !isServiceDescription(c));
  const serviceCorrections = corrections.filter(isServiceDescription);

  const applied: OwnerFieldCorrection[] = [];
  const orphaned: OrphanedCorrection[] = [];
  // Composed copies, keyed by object id. Never mutates the input graph.
  const composed = new Map<string, PingObject>();
  const take = (obj: PingObject): PingObject => {
    let c = composed.get(obj.id);
    if (!c) {
      c = { ...obj, fields: cloneFields(obj.fields ?? {}) };
      composed.set(obj.id, c);
    }
    return c;
  };
  const composeOnto = (obj: PingObject, correction: OwnerFieldCorrection): void => {
    const currentSource = rawFieldValue(obj, correction.field);
    const target = take(obj);
    target.fields[correction.field] = correction.ownerValue;
    const attached: OwnerFieldCorrection = {
      ...correction,
      // Derived per read, never persisted: true when the source was
      // re-observed after the correction and now says something
      // different than it did then. The owner value still wins.
      // Comparison is normalization-symmetric (driftValuesEqual): a
      // whitespace / bidi-mark re-emission is not drift.
      sourceDrifted: !driftValuesEqual(currentSource, correction.sourceValue),
    };
    // Preserve any corrections already attached (there should be none on a
    // raw projection, but never silently drop evidence).
    target.ownerFieldCorrections = [
      ...(target.ownerFieldCorrections ?? []),
      attached,
    ];
    applied.push(attached);
  };

  // Contact corrections: exactly one public business object must match
  // the findBusinessObject predicate. Zero matches (the refresh
  // re-derived the business object as non-public) or several (the refresh
  // emitted a parent brand plus the local listing) no longer fail
  // silently: the corrections are returned in `orphaned` with a reason,
  // so surfaces can render "owner correction pending review" instead of
  // showing raw source values as if the owner had never spoken.
  if (businessCorrections.length > 0) {
    const candidates = businessCandidates(graph);
    if (candidates.length !== 1) {
      const reason =
        candidates.length === 0 ? "no-business-object" : "ambiguous-target";
      const detail =
        reason === "no-business-object"
          ? "No public business object on the refreshed graph; the correction is retained in the owner store, not applied."
          : `${candidates.length} public business objects on the refreshed graph; refusing to guess which one the correction belongs to.`;
      for (const correction of businessCorrections) {
        orphaned.push({ correction, target: "contact:" + correction.field, reason, detail });
      }
    } else {
      const business = candidates[0];
      // Capture SOURCE SAYS X before composing anything over it.
      for (const correction of businessCorrections) composeOnto(business, correction);
    }
  }

  // Service description corrections: by-id resolution against the
  // refreshed graph. The business-object ambiguity above does not block
  // them: the correction names its target service directly. A service
  // that is gone (deleted, unlinked, or no longer public) is orphaned
  // with its own reason; the owner layer keeps the correction.
  if (serviceCorrections.length > 0) {
    const byId = new Map(graph.objects.map((o) => [o.id, o]));
    for (const correction of serviceCorrections) {
      const service = byId.get(correction.targetObjectId as string);
      if (!service || service.visibility !== "public") {
        orphaned.push({
          correction,
          target: serviceFieldTarget(correction.targetObjectId as string),
          reason: "service-description-orphaned",
          detail:
            "The service '" +
            correction.targetObjectId +
            "' is not on the refreshed graph (deleted, unlinked, or no longer public); " +
            "the description correction is retained in the owner store, not applied.",
        });
        continue;
      }
      // Capture SOURCE SAYS X (the service's live description) before
      // composing anything over it.
      composeOnto(service, correction);
    }
  }

  const objects = graph.objects.map((o) => composed.get(o.id) ?? o);
  return {
    graph: { objects, relationships: graph.relationships },
    applied,
    orphaned,
  };
}

/**
 * PROD-8: orphaned-correction detection (read-only on the journal).
 *
 * A correction is orphaned when it is ACTIVE in the owner store (it
 * survives in the event-log projection) but applies to nothing the
 * ObjectView renders from the CURRENT graph: no public business object at
 * all, several of them (the target is ambiguous, so the overlay refuses
 * to guess), or every service id it names is unknown to the first-match
 * business (deleted, renamed, unlinked, or moved).
 *
 * Field corrections are never orphaned for naming a field the source
 * does not emit: the overlay composes them by CREATING the field (an
 * owner assertion that the business has this field with this value), so
 * the correction is fully effective and the view shows the owner value.
 * Only no-business-object / ambiguous-target orphan a field correction,
 * because then the overlay genuinely composes nothing.
 *
 * The journal is never modified here: the correction is retained, and
 * the caller must surface the warning so the owner knows the correction
 * is ineffective instead of silently ignoring it.
 *
 * Pure: folds the log (read-only) and inspects the graph. No writes.
 */
export function detectOrphanedCorrections(
  graph: ObjectGraph,
  objectId: string,
): OrphanedCorrection[] {
  const overrides = readOverrides(objectId);
  // Field corrections the overlay could not compose onto the refreshed
  // graph (no business object, or an ambiguous target).
  const out: OrphanedCorrection[] = [
    ...applyOwnerFieldCorrections(graph, objectId).orphaned,
  ];

  // The service ids a correction can currently apply to: structured
  // services linked from the business the ObjectView renders (the same
  // predicate AND the same first-match selection the ObjectView loader
  // uses, so detection and the view agree) plus owner-added services
  // (they define themselves, so they always apply).
  const current = new Set<string>();
  const candidates = businessCandidates(graph);
  // First-match, mirroring the ObjectView loader (firstBusinessObject):
  // the view renders service order and visibility against the first
  // public business candidate, so detection judges "current" against
  // that same object. A fail-closed null here (parent brand plus local
  // listing) flagged corrections the view was actually applying (PROD-8).
  const business = firstBusinessObject(graph);
  if (business) {
    for (const id of structuredServiceIds(graph, business.id)) {
      current.add(id);
    }
  }
  for (const s of overrides.addedServices) current.add(s.id);

  // Detail text names the actual target resolution: on an ambiguous
  // target the ids may well exist in the site data (on the other
  // candidate), so claiming "none of which exist in the current site
  // data" would be false. Say what was checked instead.
  const targetContext =
    business === null
      ? "No public business object exists on the refreshed graph; only owner-added services are current."
      : candidates.length === 1
        ? `The ObjectView renders services from the public business object ("${business.id}").`
        : `The ObjectView renders services from the first of ${candidates.length} public business objects ("${business.id}").`;

  // Service order: orphaned only when it names NO current service. A
  // partially stale order still applies to the ids it names; the view
  // ignores the unknown ids (same as buildServices), so they are not
  // orphans, just dead entries in an otherwise live correction.
  if (overrides.serviceOrder.length > 0) {
    const applies = overrides.serviceOrder.some((id) => current.has(id));
    if (!applies) {
      out.push({
        correction: null,
        target: SERVICE_ORDER_TARGET,
        reason: "service-order-orphaned",
        detail:
          "This correction does not apply to anything. " +
          targetContext +
          " The service order correction names " +
          overrides.serviceOrder.length +
          " service(s) (" +
          overrides.serviceOrder.join(", ") +
          "), none of which are current services of the rendered business; " +
          "they may have been deleted, renamed, unlinked, or moved to another business object.",
      });
    }
  }

  // Service visibility: each hidden id that is not a current service
  // hides nothing.
  for (const id of overrides.hiddenServices) {
    if (!current.has(id)) {
      out.push({
        correction: null,
        target: serviceTarget(id),
        reason: "service-visibility-orphaned",
        detail:
          "This correction does not apply to anything. " +
          targetContext +
          " The service '" +
          id +
          "' is hidden by an owner correction but is not a current service of the rendered business, " +
          "so the correction hides nothing; the service may have been deleted, renamed, unlinked, " +
          "or moved to another business object.",
      });
    }
  }

  return out;
}

/**
 * Ids of structured service objects linked from the business by an
 * active provides/offers relationship. Mirrors the selection predicate
 * the ObjectView loader (view.ts structuredServices) applies, so
 * detection and the rendered view agree on what "current services"
 * means.
 */
function structuredServiceIds(
  graph: ObjectGraph,
  businessId: string,
): string[] {
  const byId = new Map(graph.objects.map((o) => [o.id, o]));
  const out: string[] = [];
  for (const r of graph.relationships) {
    if (r.subject !== businessId) continue;
    if (r.status !== "active") continue;
    if (r.predicate !== "provides" && r.predicate !== "offers") continue;
    const target = byId.get(r.object);
    if (
      target &&
      SCHEMA_ROLES.service.includes(target.schema) &&
      target.visibility === "public"
    ) {
      out.push(target.id);
    }
  }
  return out;
}
