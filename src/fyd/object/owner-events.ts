/**
 * Owner event log (server-only).
 *
 * The owner store is APPEND-ONLY. Every owner decision is recorded as an
 * event with full provenance (actor, target fact, previous basis, new
 * value/state, timestamp, event identity, evidence reference), and the
 * current owner-visible state is a pure fold (reduceOwnerEvents) over the
 * log. There is no mutable owner map: reverting a correction appends an
 * owner.restored-fact event; nothing is ever deleted.
 *
 * Event identity reuses the repo's existing transition identity substrate
 * (the src/fyd/social/transition-id.ts pattern): a content-hash ID over
 * canonical bytes via canonicalizeJson from ../../lib/ping/dev-signer,
 * with the generator bound in as "fyd-owner@1" so owner event IDs live in
 * their own namespace and can never collide with social action IDs.
 *
 * Persistence: data/fyd-owner/<objectId>.json holds
 *   { version: 2, objectId, events: [...] }.
 * Files written by the old mutable store (version 1) are migrated
 * TRANSPARENTLY ON READ: readOwnerEvents synthesizes provenance-labeled
 * migration events from the v1 state (evidence kind "migration") in
 * memory. Reads never write; the first append after a migration persists
 * the migrated events plus the new event as one v2 file.
 *
 * FYD_OWNER_DIR env override exists so tests can use a temp directory.
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { canonicalizeJson } from "../../lib/ping/dev-signer";
import type { OwnerOverrides } from "./types";
import { EMPTY_OVERRIDES } from "./types";
import type { OwnerFieldCorrection } from "../../lib/ping/types";

export class OwnerEventError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OwnerEventError";
  }
}

/** Generator bound into every owner event ID (identity namespace). */
export const FYD_OWNER_GENERATOR = "fyd-owner@1";

/**
 * Owner event types. Minimum set per the owner-core directive:
 * confirmed / corrected / hid / restored, plus added for owner-created
 * facts (services). The reducer handles every type; unknown types fail
 * closed.
 */
export type OwnerEventType =
  | "owner.confirmed-fact"
  | "owner.corrected-fact"
  | "owner.hid-fact"
  | "owner.restored-fact"
  | "owner.defaulted-fact"
  | "owner.added-fact";

/**
 * Fact addresses inside one object. Contact fields, the service order,
 * individual service visibility/existence, and address visibility.
 */
export type OwnerFactTarget = string;

export const CONTACT_FIELD_TARGETS = {
  phone: "contact:phone",
  email: "contact:email",
  website: "contact:website",
} as const;

export const ADDRESS_TARGET = "contact:address";
export const SERVICE_ORDER_TARGET = "services:order";
export const serviceTarget = (serviceId: string): string =>
  "service:" + serviceId;

/**
 * Fact address for a service description correction, e.g.
 * "service-field:ping-fyd-svc-calls". Deliberately NOT under the
 * "service:<id>" namespace: the restored-fact reducer matches
 * startsWith("service:") for visibility toggles, so a description
 * correction must not share that prefix.
 */
export const serviceFieldTarget = (serviceId: string): string =>
  "service-field:" + serviceId;

/** True for a "service-field:<id>" description-correction target. */
export function isServiceFieldTarget(t: string): boolean {
  return (
    t.startsWith("service-field:") && t.length > "service-field:".length
  );
}

/** The service id inside a "service-field:<id>" target. */
export function serviceFieldOf(t: string): string {
  return t.slice("service-field:".length);
}

/**
 * The actor an event is recorded under. Demo events carry kind "demo"
 * with the seeded demo label: an explicit non-identity, never a verified
 * owner. Real owner identity attaches as kind "owner" later; the reducer
 * does not care which kind recorded the event.
 */
export type OwnerEventActor =
  | { kind: "demo"; label: string }
  | { kind: "owner"; identityId: string; label: string };

/** Provenance reference carried by every event. */
export interface OwnerEventEvidence {
  /** e.g. "source-snapshot", "owner-attestation", "migration". */
  kind: string;
  /** The reference itself, e.g. a source URL or "owner-store:v1". */
  ref: string;
  /** Optional human detail. */
  detail?: string;
}

export interface OwnerEvent {
  /** Content-hash identity (fydOwnerEventId over the body + seq). */
  id: string;
  /** Position in this object's log. Assigned at append; part of the ID. */
  seq: number;
  /** ISO timestamp of the transition. */
  at: string;
  objectId: string;
  type: OwnerEventType;
  actor: OwnerEventActor;
  /** Fact address, e.g. "contact:phone", "service:svc-decks". */
  target: OwnerFactTarget;
  /** What the basis was before this transition. Null when not applicable. */
  previousBasis: unknown;
  /** The new value/state. Null when not applicable. */
  newValue: unknown;
  evidence: OwnerEventEvidence;
  /** Human-language line; the projection builds `history` from these. */
  note: string;
  generator: typeof FYD_OWNER_GENERATOR;
}

/** Everything except the store-assigned identity fields. */
export type OwnerEventDraft = Omit<OwnerEvent, "id" | "seq">;

/**
 * Deterministic content-hash identity for an owner event, mirroring
 * fydActionId: canonical bytes of the body (including seq, excluding id)
 * with the generator version bound in. The same logical event appended at
 * the same position always yields the same ID.
 */
export function fydOwnerEventId(
  body: Omit<OwnerEvent, "id">,
): string {
  const bytes = canonicalizeJson({
    ...body,
    generator_version: FYD_OWNER_GENERATOR,
  });
  return createHash("sha256").update(bytes, "utf8").digest("hex");
}

/**
 * Pure reducer: fold an event log into the current owner-visible state.
 * Deterministic: the same log always produces byte-identical state.
 * Unknown event types fail closed (throw) rather than silently skipping.
 */
export function reduceOwnerEvents(
  objectId: string,
  events: readonly OwnerEvent[],
): OwnerOverrides {
  const o = EMPTY_OVERRIDES(objectId);
  const history: { at: string; text: string }[] = [];
  let lastAt: string | null = null;

  for (const e of events) {
    if (e.objectId !== objectId) {
      throw new OwnerEventError(
        "Event " + e.id + " belongs to object '" + e.objectId + "', not '" + objectId + "'.",
      );
    }
    lastAt = e.at;
    history.push({ at: e.at, text: e.note });

    switch (e.type) {
      case "owner.confirmed-fact": {
        // Attestation only by default: no state change. EXCEPTION: a
        // confirm-contact-field assertion (newValue.confirmation === true
        // on a contact target) IS projected into fieldConfirmations so the
        // assertion survives regeneration and re-observation, and so the
        // read model can surface sourceDrifted against the source value
        // recorded at confirmation time. All other confirmed-fact events
        // (migration log lines, no-op confirmations) stay no-ops.
        const nv =
          e.newValue !== null && typeof e.newValue === "object"
            ? (e.newValue as {
                confirmation?: unknown;
                confirmedValue?: unknown;
                sourceValue?: unknown;
                actorLabel?: unknown;
              })
            : null;
        if (
          nv !== null &&
          nv.confirmation === true &&
          isContactFieldTarget(e.target)
        ) {
          const field = contactFieldOf(e.target);
          const prior = o.fieldConfirmations[field] ?? null;
          const confirmedValue =
            typeof nv.confirmedValue === "string" ? nv.confirmedValue : null;
          o.fieldConfirmations[field] = {
            // Full OwnerAssertion contract (see types.ts): actor,
            // subject/object, field/path, operation, value, visibility,
            // timestamp, superseded assertion, source/evidence relationship.
            subject: e.objectId,
            path: e.target as
              | "contact:phone"
              | "contact:email"
              | "contact:website",
            operation: "confirm",
            value: confirmedValue,
            visibility: "unchanged",
            actor: { kind: e.actor.kind, label: e.actor.label },
            at: e.at,
            supersedes: prior?.eventId ?? null,
            evidence: {
              kind: e.evidence.kind,
              ref: e.evidence.ref,
              detail: e.evidence.detail,
            },
            eventId: e.id,
            // Confirmation specifics.
            field,
            confirmedValue,
            sourceValue:
              typeof nv.sourceValue === "string" ? nv.sourceValue : null,
            confirmedAt: e.at,
            actorLabel: e.actor.label,
          };
        }
        break;
      }
      case "owner.corrected-fact": {
        if (e.target === SERVICE_ORDER_TARGET) {
          if (!Array.isArray(e.newValue)) {
            throw new OwnerEventError("corrected services:order needs an array newValue.");
          }
          o.serviceOrder = (e.newValue as unknown[]).filter(
            (v): v is string => typeof v === "string",
          );
        } else if (isContactFieldTarget(e.target)) {
          const field = contactFieldOf(e.target);
          o.fieldCorrections[field] = e.newValue as OwnerFieldCorrection;
        } else if (isServiceFieldTarget(e.target)) {
          // Service description correction: keyed by its event target so
          // two services can each hold a description correction. The
          // record carries targetObjectId for the read-model composer.
          o.fieldCorrections[e.target] = e.newValue as OwnerFieldCorrection;
        } else {
          throw new OwnerEventError(
            "owner.corrected-fact does not apply to target '" + e.target + "'.",
          );
        }
        break;
      }
      case "owner.added-fact": {
        const v = e.newValue as { id?: unknown; name?: unknown } | null;
        if (
          !v ||
          typeof v.id !== "string" ||
          typeof v.name !== "string" ||
          e.target !== serviceTarget(v.id)
        ) {
          throw new OwnerEventError("added-fact needs newValue { id, name } matching its target.");
        }
        if (!o.addedServices.some((s) => s.id === v.id)) {
          o.addedServices.push({ id: v.id, name: v.name });
        }
        break;
      }
      case "owner.hid-fact": {
        if (e.target === ADDRESS_TARGET) {
          o.addressVisibility = "hide";
          // Persistent HIDE assertion carrying the full OwnerAssertion
          // contract: the pipeline never owns the presentation decision.
          const priorHide = o.addressVisibilityAssertion;
          o.addressVisibilityAssertion = {
            subject: e.objectId,
            path: ADDRESS_TARGET,
            operation: "hide",
            value: "hide",
            visibility: "hide",
            actor: { kind: e.actor.kind, label: e.actor.label },
            at: e.at,
            supersedes: priorHide?.eventId ?? null,
            evidence: {
              kind: e.evidence.kind,
              ref: e.evidence.ref,
              detail: e.evidence.detail,
            },
            eventId: e.id,
          };
        } else if (e.target.startsWith("service:")) {
          const id = e.target.slice("service:".length);
          if (!o.hiddenServices.includes(id)) o.hiddenServices.push(id);
        } else {
          throw new OwnerEventError(
            "owner.hid-fact does not apply to target '" + e.target + "'.",
          );
        }
        break;
      }
      case "owner.defaulted-fact": {
        // DEFAULT is a recorded preference, not an absence: the owner
        // explicitly returned the address to the conservative default
        // (append-only; no history is deleted).
        if (e.target === ADDRESS_TARGET) {
          o.addressVisibility = "default";
          const priorDefault = o.addressVisibilityAssertion;
          o.addressVisibilityAssertion = {
            subject: e.objectId,
            path: ADDRESS_TARGET,
            operation: "default",
            value: "default",
            visibility: "default",
            actor: { kind: e.actor.kind, label: e.actor.label },
            at: e.at,
            supersedes: priorDefault?.eventId ?? null,
            evidence: {
              kind: e.evidence.kind,
              ref: e.evidence.ref,
              detail: e.evidence.detail,
            },
            eventId: e.id,
          };
        } else {
          throw new OwnerEventError(
            "owner.defaulted-fact does not apply to target '" + e.target + "'.",
          );
        }
        break;
      }
      case "owner.restored-fact": {
        if (e.target === ADDRESS_TARGET) {
          o.addressVisibility = "show";
          // Persistent SHOW assertion carrying the full OwnerAssertion
          // contract: the pipeline never owns the presentation decision.
          const priorShow = o.addressVisibilityAssertion;
          o.addressVisibilityAssertion = {
            subject: e.objectId,
            path: ADDRESS_TARGET,
            operation: "show",
            value: "show",
            visibility: "show",
            actor: { kind: e.actor.kind, label: e.actor.label },
            at: e.at,
            supersedes: priorShow?.eventId ?? null,
            evidence: {
              kind: e.evidence.kind,
              ref: e.evidence.ref,
              detail: e.evidence.detail,
            },
            eventId: e.id,
          };
        } else if (isServiceFieldTarget(e.target)) {
          // Revert a service description correction: a new event, never a
          // delete; the correction event stays in the log and the
          // projection stops composing it. Checked before the
          // startsWith("service:") arm, which owns a different namespace.
          delete o.fieldCorrections[e.target];
        } else if (e.target.startsWith("service:")) {
          const id = e.target.slice("service:".length);
          o.hiddenServices = o.hiddenServices.filter((x) => x !== id);
        } else if (isContactFieldTarget(e.target)) {
          // Revert is a new event, never a delete: the correction event
          // stays in the log; the projection simply stops composing it.
          delete o.fieldCorrections[contactFieldOf(e.target)];
        } else {
          throw new OwnerEventError(
            "owner.restored-fact does not apply to target '" + e.target + "'.",
          );
        }
        break;
      }
      default:
        throw new OwnerEventError(
          "Unknown owner event type '" + (e as OwnerEvent).type + "'.",
        );
    }
  }

  if (history.length > 200) o.history = history.slice(-200);
  else o.history = history;
  o.updatedAt = lastAt ?? new Date(0).toISOString();
  return o;
}

function isContactFieldTarget(t: string): boolean {
  return (
    t === CONTACT_FIELD_TARGETS.phone ||
    t === CONTACT_FIELD_TARGETS.email ||
    t === CONTACT_FIELD_TARGETS.website
  );
}

function contactFieldOf(t: string): "phone" | "email" | "website" {
  if (t === CONTACT_FIELD_TARGETS.phone) return "phone";
  if (t === CONTACT_FIELD_TARGETS.email) return "email";
  return "website";
}

/**
 * Digest of the owner-visible state: sha256 over canonical JSON.
 * Replay proof compares these: two folds of the same log from empty
 * state must produce byte-identical canonical bytes, hence equal digests.
 */
export function digestOwnerState(state: OwnerOverrides): string {
  return createHash("sha256")
    .update(canonicalizeJson(state), "utf8")
    .digest("hex");
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const STORE_VERSION = 2;

interface OwnerEventLogFile {
  version: 2;
  objectId: string;
  events: OwnerEvent[];
}

function ownerDir(): string {
  const override = process.env.FYD_OWNER_DIR;
  if (override) return override;
  return join(process.cwd(), "data", "fyd-owner");
}

function ownerPath(objectId: string): string {
  if (!/^[a-z0-9-]+$/.test(objectId)) {
    throw new OwnerEventError("Invalid object id.");
  }
  return join(ownerDir(), objectId + ".json");
}

function isValidEvent(v: unknown): v is OwnerEvent {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.seq === "number" &&
    typeof r.at === "string" &&
    typeof r.objectId === "string" &&
    typeof r.type === "string" &&
    typeof r.target === "string" &&
    typeof r.note === "string" &&
    typeof r.evidence === "object" &&
    r.evidence !== null &&
    typeof r.actor === "object" &&
    r.actor !== null
  );
}

function isValidLogFile(v: unknown): v is OwnerEventLogFile {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    r.version === STORE_VERSION &&
    typeof r.objectId === "string" &&
    Array.isArray(r.events) &&
    r.events.every(isValidEvent)
  );
}

/** The old mutable v1 shape, for transparent migration on read. */
function isV1File(v: unknown): v is OwnerOverrides {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  const fc = r.fieldCorrections;
  return (
    r.version === 1 &&
    typeof r.objectId === "string" &&
    Array.isArray(r.serviceOrder) &&
    Array.isArray(r.hiddenServices) &&
    Array.isArray(r.addedServices) &&
    (fc === undefined || (typeof fc === "object" && fc !== null)) &&
    Array.isArray(r.history)
  );
}

const MIGRATION_ACTOR: OwnerEventActor = {
  kind: "demo",
  label: "owner-store v1 migration (original actor unrecorded)",
};

function migrationEvidence(detail: string): OwnerEventEvidence {
  return { kind: "migration", ref: "owner-store:v1", detail };
}

/**
 * Synthesize provenance-labeled events from a v1 mutable state.
 * The v1 human history lines are carried forward as no-op confirmed
 * events (evidence kind "migration") so the human log survives; current
 * state facts become their own events (corrected/hid/added) with
 * migration evidence. Deterministic given the v1 file. Reads never
 * persist; the first append writes these plus the new event as one v2 file.
 */
export function migrateV1ToEvents(v1: OwnerOverrides): OwnerEventDraft[] {
  const drafts: OwnerEventDraft[] = [];
  // Deterministic timestamp: the v1 updatedAt when present, else the last
  // history entry's time, else the epoch sentinel. Never wall-clock: the
  // same v1 file must always migrate to the same events.
  const hist = v1.history ?? [];
  const lastHistAt =
    hist.length > 0 && typeof hist[hist.length - 1].at === "string"
      ? hist[hist.length - 1].at
      : null;
  const at =
    typeof v1.updatedAt === "string" && v1.updatedAt.length > 0
      ? v1.updatedAt
      : (lastHistAt ?? new Date(0).toISOString());

  // Carry the human log first, in its original order. These are no-ops on
  // state; they preserve what the owner did, with honest provenance.
  for (const h of v1.history ?? []) {
    drafts.push({
      at: typeof h.at === "string" ? h.at : at,
      objectId: v1.objectId,
      type: "owner.confirmed-fact",
      actor: MIGRATION_ACTOR,
      target: "object",
      previousBasis: null,
      newValue: null,
      evidence: migrationEvidence("human log line carried from the v1 store"),
      note: typeof h.text === "string" ? h.text : "",
      generator: FYD_OWNER_GENERATOR,
    });
  }

  const stateEvidence = (detail: string): OwnerEventEvidence =>
    migrationEvidence(detail);

  if (v1.serviceOrder.length > 0) {
    drafts.push({
      at,
      objectId: v1.objectId,
      type: "owner.corrected-fact",
      actor: MIGRATION_ACTOR,
      target: SERVICE_ORDER_TARGET,
      previousBasis: null,
      newValue: [...v1.serviceOrder],
      evidence: stateEvidence("owner service order carried from the v1 store"),
      note: "Migrated owner service order from the previous store.",
      generator: FYD_OWNER_GENERATOR,
    });
  }
  for (const s of v1.addedServices) {
    drafts.push({
      at,
      objectId: v1.objectId,
      type: "owner.added-fact",
      actor: MIGRATION_ACTOR,
      target: serviceTarget(s.id),
      previousBasis: null,
      newValue: { id: s.id, name: s.name },
      evidence: stateEvidence("owner-added service carried from the v1 store"),
      note: "Migrated owner-added service '" + s.name + "'.",
      generator: FYD_OWNER_GENERATOR,
    });
  }
  for (const id of v1.hiddenServices) {
    drafts.push({
      at,
      objectId: v1.objectId,
      type: "owner.hid-fact",
      actor: MIGRATION_ACTOR,
      target: serviceTarget(id),
      previousBasis: null,
      newValue: { hidden: true },
      evidence: stateEvidence("hidden service carried from the v1 store"),
      note: "Migrated hidden service '" + id + "'.",
      generator: FYD_OWNER_GENERATOR,
    });
  }
  // v1 files may carry the legacy binary ("public" | "hidden") or the
  // tri-state values ("default" | "show" | "hide"): normalize through the
  // same compatibility mapping as command validation ("hidden" -> "hide",
  // "public" -> "default"). "default" needs no event (the conservative
  // default applies).
  const v1Visibility: unknown = (v1 as { addressVisibility?: unknown })
    .addressVisibility;
  const normalizedVisibility =
    v1Visibility === "hidden"
      ? "hide"
      : v1Visibility === "public"
        ? "default"
        : v1Visibility;
  if (normalizedVisibility === "hide") {
    drafts.push({
      at,
      objectId: v1.objectId,
      type: "owner.hid-fact",
      actor: MIGRATION_ACTOR,
      target: ADDRESS_TARGET,
      previousBasis: null,
      newValue: { hidden: true },
      evidence: stateEvidence("hidden address carried from the v1 store"),
      note: "Migrated hidden street address.",
      generator: FYD_OWNER_GENERATOR,
    });
  } else if (normalizedVisibility === "show") {
    drafts.push({
      at,
      objectId: v1.objectId,
      type: "owner.restored-fact",
      actor: MIGRATION_ACTOR,
      target: ADDRESS_TARGET,
      previousBasis: null,
      newValue: { visibility: "show" },
      evidence: stateEvidence("shown address carried from the v1 store"),
      note: "Migrated shown street address.",
      generator: FYD_OWNER_GENERATOR,
    });
  }
  for (const [field, correction] of Object.entries(v1.fieldCorrections ?? {})) {
    const target =
      field === "phone"
        ? CONTACT_FIELD_TARGETS.phone
        : field === "email"
          ? CONTACT_FIELD_TARGETS.email
          : CONTACT_FIELD_TARGETS.website;
    drafts.push({
      at: correction.correctedAt ?? at,
      objectId: v1.objectId,
      type: "owner.corrected-fact",
      actor: MIGRATION_ACTOR,
      target,
      previousBasis: {
        sourceValue: correction.sourceValue,
        priorOwnerValue: null,
      },
      newValue: { ...correction },
      evidence: stateEvidence("field correction carried from the v1 store"),
      note:
        "Migrated " +
        correction.label +
        " correction: the owner says " +
        correction.ownerValue +
        ".",
      generator: FYD_OWNER_GENERATOR,
    });
  }
  return drafts;
}

/**
 * Typed failure for an owner log that exists but cannot be trusted.
 * The bytes are retained on disk; callers must refuse mutation and
 * surface this instead of projecting empty state. Code OWNER_LOG_CORRUPT.
 */
export class CorruptOwnerLogError extends Error {
  readonly code = "OWNER_LOG_CORRUPT" as const;
  readonly objectId: string;
  readonly logPath: string;
  readonly reason: string;
  constructor(objectId: string, logPath: string, reason: string) {
    super(
      "Owner log for " + objectId + " is corrupt (" + reason + "); bytes retained at " + logPath + ".",
    );
    this.name = "CorruptOwnerLogError";
    this.objectId = objectId;
    this.logPath = logPath;
    this.reason = reason;
  }
}

/**
 * Read this object's event log. A v1 (mutable) file is migrated
 * transparently in memory. A MISSING file yields []. A file that exists
 * but is unreadable, unparseable, or structurally invalid throws
 * CorruptOwnerLogError: missing and corrupt are never conflated, and
 * reads never write.
 */
export function readOwnerEvents(objectId: string): OwnerEvent[] {
  const path = ownerPath(objectId);
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return [];
    throw new CorruptOwnerLogError(objectId, path, "unreadable file");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new CorruptOwnerLogError(objectId, path, "invalid JSON");
  }
  // A file only counts as "our log, but untrusted" when it claims the
  // owner-log shape. A valid JSON file with no log markers (e.g. a
  // projection file sharing the directory in tests) is not an owner log:
  // projecting [] for it is correct, and the mismatch rule must not fire.
  const claimsLogShape =
    typeof parsed === "object" &&
    parsed !== null &&
    ("version" in (parsed as Record<string, unknown>) ||
      "events" in (parsed as Record<string, unknown>));
  if (isValidLogFile(parsed) || isV1File(parsed)) {
    if ((parsed as { objectId?: unknown }).objectId !== objectId) {
      throw new CorruptOwnerLogError(objectId, path, "objectId mismatch");
    }
  } else if (claimsLogShape) {
    throw new CorruptOwnerLogError(objectId, path, "invalid log structure");
  } else {
    return [];
  }
  if (isValidLogFile(parsed)) {
    const events = parsed.events
      .filter((e) => e.objectId === objectId)
      .sort((a, b) => a.seq - b.seq);
    return events;
  }
  // isV1File: transparent migration. Synthesize events, assign seqs + IDs
  // now so the returned log is identical to what the first append persists.
  return finalizeDrafts(objectId, migrateV1ToEvents(parsed as OwnerOverrides));
}

function finalizeDrafts(objectId: string, drafts: OwnerEventDraft[]): OwnerEvent[] {
  return drafts.map((d, i) => {
    const body = { ...d, objectId, seq: i };
    return { ...body, id: fydOwnerEventId(body) };
  });
}

function writeLogFile(objectId: string, events: OwnerEvent[]): void {
  const path = ownerPath(objectId);
  mkdirSync(dirname(path), { recursive: true });
  const file: OwnerEventLogFile = { version: STORE_VERSION, objectId, events };
  const tmp = path + ".tmp";
  writeFileSync(tmp, JSON.stringify(file, null, 2) + "\n", "utf8");
  // Atomic replace so a crash can never leave a half-written file.
  renameSync(tmp, path);
}

/**
 * Typed failure for a compare-and-swap refusal: the log moved between the
 * caller's check and the append. Nothing was written. Code
 * OWNER_LOG_CONFLICT.
 */
export class OwnerLogConflictError extends Error {
  readonly code = "OWNER_LOG_CONFLICT" as const;
  readonly objectId: string;
  readonly expectedLength: number;
  readonly actualLength: number;
  constructor(objectId: string, expectedLength: number, actualLength: number) {
    super(
      "Owner log for " +
        objectId +
        " changed since approval (expected length " +
        expectedLength +
        ", found " +
        actualLength +
        "); nothing was written.",
    );
    this.name = "OwnerLogConflictError";
    this.objectId = objectId;
    this.expectedLength = expectedLength;
    this.actualLength = actualLength;
  }
}

/**
 * Append one event draft to the object's log. Assigns seq, computes the
 * content-hash ID, and persists the whole log atomically. Failures throw
 * before anything is written. A corrupt existing log throws
 * CorruptOwnerLogError and the original bytes are retained: the append
 * never overwrites an untrusted log with a fresh one.
 *
 * When opts.expectedLength is set, the append is a compare-and-swap: the
 * log is re-read and the write is refused with OwnerLogConflictError if
 * its length moved since the caller pinned it. This closes the
 * check-then-await-then-append race in the approve path.
 */
export function appendOwnerEvent(
  objectId: string,
  draft: OwnerEventDraft,
  opts?: { expectedLength?: number },
): OwnerEvent {
  const current = readOwnerEvents(objectId);
  if (opts?.expectedLength !== undefined && current.length !== opts.expectedLength) {
    throw new OwnerLogConflictError(objectId, opts.expectedLength, current.length);
  }
  const body = { ...draft, objectId, seq: current.length };
  const event: OwnerEvent = { ...body, id: fydOwnerEventId(body) };
  writeLogFile(objectId, [...current, event]);
  return event;
}

/** Current owner-visible state: the projection over this object's log. */
export function projectOwnerState(objectId: string): OwnerOverrides {
  return reduceOwnerEvents(objectId, readOwnerEvents(objectId));
}
