/**
 * Owner patch loop helpers for POST /api/fyd/objects/[objectId]/overrides.
 *
 * The loop: typed owner request -> proposal -> preview (before/after +
 * evidence/capability impact) -> bound approval -> apply -> revert.
 *
 * Digest binding (STALE PROPOSAL): the propose stage returns
 * baseStateDigest = sha256 over the canonicalized CURRENT owner state
 * projection (the event-log projection, stable across reads) and
 * patchDigest = sha256 over the canonicalized typed command. The approve
 * stage recomputes the state digest against the live log; a mismatch means
 * the state moved since the proposal was drafted and the approval is
 * refused with 409 stale_proposal. Nothing is written on refusal.
 *
 * The approval record binds tenant + actor + base digest + patch digest +
 * approval metadata + result digest, and is returned with every approve
 * response alongside the chain audit trail.
 *
 * G4: every mutation requires a server-side TenantContext (derived from
 * the trusted route path: the object id IS the site id) and an
 * ActorContext. The actor on this route is always the seeded demo actor:
 * DEMO OWNER CONTEXT is labeled on every response, never presented as a
 * verified owner identity.
 */
import { createHash } from "node:crypto";
import { canonicalize } from "@/lib/ping/ask-composer";
import { getPingObjectGraphSync } from "@/fyd/data/ping-object-source";
import { findBusinessObject, rawFieldValue } from "@/fyd/object/owner-overlay";
import { readOverrides } from "@/fyd/object/owner-store";
import { readOwnerEvents } from "@/fyd/object/owner-events";
import type { OwnerCommand } from "@/fyd/object/types";
import { loadObjectView } from "@/fyd/object/view";
import type { VerifiedPublicProjection } from "@/fyd/sitespec/public-projection";

/** sha256 hex over the canonicalized value. Deterministic across reads. */
export function digestOf(value: unknown): string {
  return createHash("sha256").update(canonicalize(value), "utf8").digest("hex");
}

/**
 * Digest of the owner state the proposal was computed against: the
 * event-log projection for this object. Stable across reads when nothing
 * is written (updatedAt tracks the last event, not read time).
 */
export function ownerStateDigest(objectId: string): string {
  return digestOf(readOverrides(objectId));
}

/** Digest of the typed command the owner is asked to approve. */
export function patchDigestOf(command: OwnerCommand): string {
  return digestOf(command);
}

/**
 * The acting owner identity, future-neutral. The demo implementation
 * (OwnerActorContext, below) pins demoOwnerContext: true; a future
 * PING-backed implementation satisfies this base with a verified owner
 * identity and no demo marker. Demo honesty is preserved structurally:
 * every DEMO response and approval still carries the literal
 * demoOwnerContext: true stamp, so demo authorization can never be
 * mistaken for production authorization.
 */
export interface OwnerActor {
  actorId: string;
  label: string;
  /** Human-readable statement of what this context is and is not. */
  disclosure: string;
}

/**
 * The acting owner identity on this route. DEMO SCAFFOLDING: always the
 * seeded demo actor, never a verified owner. Authentication alone never
 * grants mutation; the capability verdict (resolved separately by the
 * demo chain) is the only gate to the apply step.
 */
export interface OwnerActorContext extends OwnerActor {
  /** Always true on this route. Rendered on every demo-owner affordance. */
  demoOwnerContext: true;
}

export function demoActorContext(actorId: string, label: string): OwnerActorContext {
  return {
    actorId,
    label,
    demoOwnerContext: true,
    disclosure:
      "DEMO OWNER CONTEXT: '" +
      label +
      "' is a seeded demo actor, not a verified owner identity. " +
      "No identity was verified. Nothing decided here may back a production " +
      "authorization decision.",
  };
}

/** Before/after + impact preview for one typed command. Never writes. */
export interface PatchPreview {
  before: string;
  after: string;
  evidenceImpact: string;
  capabilityImpact: string;
}

function serviceName(names: Map<string, string>, id: string): string {
  return names.get(id) ?? id;
}

/** The service order the site shows now: owner order first, then derived ids. */
function currentOrder(objectId: string, ids: string[]): string[] {
  const known = new Set(ids);
  const owner = readOverrides(objectId).serviceOrder.filter((id) => known.has(id));
  const order = [...owner];
  for (const id of ids) if (!order.includes(id)) order.push(id);
  return order;
}

/** What the order would be after applying a move-service command. */
function movedOrder(order: string[], id: string, to: "up" | "down" | "first" | "last"): string[] {
  const next = order.filter((x) => x !== id);
  if (to === "first") next.unshift(id);
  else if (to === "last") next.push(id);
  else {
    const idx = order.indexOf(id);
    const at = to === "up" ? Math.max(0, idx - 1) : Math.min(next.length, idx + 1);
    next.splice(at, 0, id);
  }
  return next;
}

function sourceFieldValue(objectId: string, field: "phone" | "email" | "website"): string | null {
  try {
    const graph = getPingObjectGraphSync(objectId, { ownerOverlay: false }).graph;
    const business = findBusinessObject(graph);
    if (!business) return null;
    return rawFieldValue(business, field);
  } catch {
    return null;
  }
}

/**
 * Build the before/after + impact preview for a typed command. Pure read:
 * interprets the command against the CURRENT state and describes the
 * transition the approval would authorize. Returns null when the command
 * cannot be previewed (the approve stage still validates independently).
 */
export function buildPatchPreview(
  objectId: string,
  command: OwnerCommand,
  serviceIds: string[],
  serviceNames: Map<string, string>,
  capabilityImpact: string,
): PatchPreview | null {
  const overrides = readOverrides(objectId);
  switch (command.type) {
    case "set-contact-field": {
      const existing = overrides.fieldCorrections[command.field];
      const before = existing ? existing.ownerValue : (sourceFieldValue(objectId, command.field) ?? "(not on record)");
      return {
        before: command.field + ": " + before,
        after: command.field + ": " + command.value,
        evidenceImpact:
          "Appends one owner.corrected-fact event (owner attestation) to this object's log. " +
          "Ask FYD will cite the new value as an 'Owner-set value' from 'Owner correction'; " +
          "the site's current value (" + before + ") stays recorded as what the source says. " +
          "The /build page shows the owner value with a correction note.",
        capabilityImpact,
      };
    }
    case "revert-contact-field": {
      const existing = overrides.fieldCorrections[command.field];
      if (!existing) return null;
      const source = sourceFieldValue(objectId, command.field) ?? "(not on record)";
      return {
        before: command.field + ": " + existing.ownerValue + " (owner correction)",
        after: command.field + ": " + source + " (site's value shown again)",
        evidenceImpact:
          "Appends one owner.restored-fact event. The correction event stays in the log; " +
          "the site's value is shown again on /build and in Ask FYD answers.",
        capabilityImpact,
      };
    }
    case "move-service": {
      const order = currentOrder(objectId, serviceIds);
      if (!order.includes(command.id)) return null;
      const after = movedOrder(order, command.id, command.to);
      const nameOf = (id: string) => serviceName(serviceNames, id);
      return {
        before: "Services order: " + order.map(nameOf).join(" > "),
        after: "Services order: " + after.map(nameOf).join(" > "),
        evidenceImpact:
          "Appends one owner.corrected-fact event for services:order (owner attestation). " +
          "The ObjectView service list re-projects from the log. " +
          "Note: the /build page planner currently consumes owner field corrections, not service order.",
        capabilityImpact,
      };
    }
    case "set-service-visibility": {
      if (!serviceIds.includes(command.id)) return null;
      const hidden = overrides.hiddenServices.includes(command.id);
      return {
        before: serviceName(serviceNames, command.id) + ": " + (hidden ? "hidden" : "visible"),
        after: serviceName(serviceNames, command.id) + ": " + (command.visible ? "visible" : "hidden"),
        evidenceImpact:
          "Appends one owner.hid-fact / owner.corrected-fact event (owner attestation). " +
          "The ObjectView re-projects from the log. " +
          "Note: the /build page planner currently consumes owner field corrections, not service visibility.",
        capabilityImpact,
      };
    }
    case "add-service": {
      const order = currentOrder(objectId, serviceIds);
      return {
        before: order.length + " services: " + order.map((id) => serviceName(serviceNames, id)).join(", "),
        after: order.length + 1 + " services: " + [...order.map((id) => serviceName(serviceNames, id)), command.name].join(", "),
        evidenceImpact:
          "Appends one owner.added-fact event (owner attestation). " +
          "The ObjectView re-projects from the log.",
        capabilityImpact,
      };
    }
    case "set-address-visibility": {
      return {
        before: "address visibility: " + overrides.addressVisibility,
        after: "address visibility: " + command.visibility,
        evidenceImpact:
          "Appends one owner event (owner attestation) for contact:address visibility. " +
          "The ObjectView re-projects from the log.",
        capabilityImpact,
      };
    }
    case "confirm-contact-field": {
      const correction = overrides.fieldCorrections[command.field];
      const effective = correction
        ? correction.ownerValue
        : sourceFieldValue(objectId, command.field);
      if (effective === null) return null;
      return {
        before: command.field + ": " + effective,
        after: command.field + ": " + effective + " (owner confirms correct)",
        evidenceImpact:
          "Appends one owner.confirmed-fact event (owner attestation) " +
          "recording that the owner asserts the current " +
          command.field +
          " is correct, with actor and timestamp. Nothing is rewritten: the " +
          "source record is unchanged, and the confirmation keeps the " +
          "source's value at confirmation time so later source drift can be " +
          "detected (sourceDrifted).",
        capabilityImpact,
      };
    }
    default:
      return null;
  }
}

/** The id of the most recently appended event for this object, or null. */
export function lastEventId(objectId: string): string | null {
  const events = readOwnerEvents(objectId);
  return events.length > 0 ? events[events.length - 1].id : null;
}

/**
 * The bound approval record: tenant + actor + base digests + patch digest +
 * approval metadata + result digest. Returned with every approve response
 * and describing exactly what was authorized and what resulted.
 *
 * The approval binds TWO base digests: baseStateDigest (the owner overlay
 * journal the approval reviewed) and baseViewDigest (the composed ObjectView
 * the /build surface renders). The view digest is the current build-state
 * equivalent of the requested base SiteSpec/state digest: it is the canonical
 * hash of the composed ObjectView, so a source refresh that moves the
 * rendered build under an unchanged owner journal still invalidates the
 * approval. Either digest moving makes the proposal STALE.
 */
export interface BoundApproval {
  tenantId: string;
  actor: OwnerActor;
  baseStateDigest: string;
  baseViewDigest: string;
  patchDigest: string;
  approvedAt: string;
  eventId: string | null;
  resultDigest: string;
  /**
   * Present (literal true) on demo-stamped approvals, absent on future
   * production approvals. Optional so a PING-backed stamper can satisfy
   * this record without claiming demo status.
   */
  demoOwnerContext?: true;
}

/**
 * Canonical digest of the composed ObjectView for an object: the current
 * build state the owner approval is bound to. Unknown objects hash a
 * stable missing marker so the digest is always well defined.
 */
export function buildViewDigest(
  projection: VerifiedPublicProjection,
  objectId: string,
): string {
  const view = loadObjectView(projection, objectId);
  return digestOf(view ?? { objectId, missing: true });
}

/**
 * The DEMO approval stamper: always stamps demoOwnerContext: true, so a
 * demo approval can never be mistaken for a production authorization. A
 * future PING-backed implementation provides its own stamper (no demo
 * marker) against the same BoundApproval record shape.
 */
export function buildBoundApproval(args: {
  tenantId: string;
  actor: OwnerActor;
  baseStateDigest: string;
  baseViewDigest: string;
  patchDigest: string;
  eventId: string | null;
  resultDigest: string;
}): BoundApproval {
  return {
    tenantId: args.tenantId,
    actor: args.actor,
    baseStateDigest: args.baseStateDigest,
    baseViewDigest: args.baseViewDigest,
    patchDigest: args.patchDigest,
    approvedAt: new Date().toISOString(),
    eventId: args.eventId,
    resultDigest: args.resultDigest,
    demoOwnerContext: true,
  };
}
