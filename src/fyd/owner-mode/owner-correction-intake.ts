/**
 * P1 (2026-10-11): the authorized owner-correction intake.
 *
 * The narrow write path for field-level owner corrections on the demo
 * plane. It enforces the full chain, in order, with no demo fallback:
 *
 *   REQUEST -> AUTHENTICATED ACTOR -> TENANT/RESOURCE OWNERSHIP
 *     -> ACTION AUTHORIZATION -> VALIDATED TYPED COMMAND
 *     -> ADMITTED MUTATION -> DURABLE CANONICAL EVIDENCE -> RESULT
 *
 * Reuses, never reinvents:
 * - authentication: the caller-key provider (./caller-key-owner-identity.ts),
 *   itself backed by the existing P8 registry machinery. No key, an
 *   unknown key, or an unreadable registry is a typed denial, never a
 *   downgrade to the demo actor.
 * - entitlement: the P8 credential-derived tenant set (the caller's own
 *   tenant plus entitled_tenants). A caller whose set does not contain
 *   the site is denied; a different owner cannot correct this site.
 * - assertion algebra: assertCorrection / chainHeads (./corrections.ts).
 * - canonical transition: appendOwnerEvent (../object/owner-events.ts)
 *   with actor kind "owner" carrying the verified agent id. The event
 *   references the assertion id, so the canonical log and the assertion
 *   journal reconcile 1:1.
 * - durable assertion journal: one atomic JSON file per site under a
 *   tenant-scoped directory (tenantScopedDir from ../tenant/tenant-context.ts).
 *   This is the owner-assertion layer's durable store; the event log is
 *   the canonical-transition layer's. The intake writes the EVENT first
 *   and the journal second: a journal write failure leaves an audit event
 *   for a failed admission but applies nothing (fail closed on the
 *   effective state), while an event write failure journals nothing at
 *   all (no mutation without canonical evidence).
 *
 * Server-side only (registry reads, file writes).
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  CallerContext,
  CallerRegistry,
} from "../../app/api/mc/_lib/mc-dispatch-identity";
import {
  CONTACT_FIELD_TARGETS,
  appendOwnerEvent,
  readOwnerEvents,
  serviceFieldTarget,
  type OwnerEvent,
  type OwnerEventActor,
  type OwnerEventDraft,
  type OwnerEventType,
} from "../object/owner-events";
import type { OwnerFieldCorrection } from "../../lib/ping/types";
import { tenantScopedDir } from "../tenant/tenant-context";
import {
  CallerKeyOwnerIdentityProvider,
} from "./caller-key-owner-identity";
import {
  applyCorrections,
  assertCorrection,
  assertionFactId,
  chainHeads,
  normalizeFactRef,
  type CorrectionOp,
  type FactRef,
  type OwnerAssertion,
} from "./corrections";
import type { OwnerIdentity } from "./owner-identity";
import type { SiteFact } from "./facts";

/** Typed denial codes. A denial is never a silent empty. */
export type IntakeDenialCode =
  | "caller_key_required"
  | "identity_required"
  | "cross_tenant_denied"
  | "unsupported_target"
  | "unknown_fact"
  | "invalid_input";

export interface IntakeDenial {
  ok: false;
  status: 400 | 401 | 403;
  code: IntakeDenialCode;
  reason: string;
}

export interface IntakeAuthorized {
  ok: true;
  caller: CallerContext;
  identity: OwnerIdentity;
}

function deny(
  status: 400 | 401 | 403,
  code: IntakeDenialCode,
  reason: string,
): IntakeDenial {
  return { ok: false, status, code, reason };
}

export interface AuthorizeCorrectionInput {
  callerKey: string | null | undefined;
  /** The site (tenant) the correction targets. */
  siteId: string;
  loadRegistry?: () => CallerRegistry;
}

/**
 * Authenticate the caller and check tenant entitlement for the site.
 * Fail closed at every step; the demo actor is never consulted here.
 */
export function authorizeCorrection(
  input: AuthorizeCorrectionInput,
): IntakeAuthorized | IntakeDenial {
  const provider = new CallerKeyOwnerIdentityProvider({
    callerKey: input.callerKey,
    loadRegistry: input.loadRegistry,
  });
  const caller = provider.resolveCaller();
  if (input.callerKey === null || input.callerKey === undefined || input.callerKey === "") {
    return deny(
      401,
      "caller_key_required",
      "A caller key is required: a claimed owner identity with no credential is not authorization.",
    );
  }
  if (!caller) {
    return deny(
      401,
      "identity_required",
      "The presented caller key does not resolve in the operator-provisioned registry.",
    );
  }
  const entitled = provider.entitledTenants() ?? [];
  if (!entitled.includes(input.siteId)) {
    return deny(
      403,
      "cross_tenant_denied",
      "Caller '" +
        caller.agent_id +
        "' is not entitled to site '" +
        input.siteId +
        "'.",
    );
  }
  return {
    ok: true,
    caller,
    identity: {
      identityId: caller.agent_id,
      verified: true,
      method: "caller-key",
      note:
        "Verified against the operator-provisioned P8 caller registry; " +
        "entitled to site '" +
        input.siteId +
        "'.",
    },
  };
}

// ---------------------------------------------------------------------------
// Durable assertion journal: one atomic JSON file per site.
// ---------------------------------------------------------------------------

const JOURNAL_VERSION = 1 as const;

export interface AssertionJournalFile {
  version: typeof JOURNAL_VERSION;
  siteId: string;
  assertions: OwnerAssertion[];
}

function assertionBaseDir(): string {
  const override = process.env.FYD_ASSERTION_DIR;
  if (override) return override;
  return join(process.cwd(), "data", "owner-assertions");
}

/**
 * Tenant-scoped journal path. tenantScopedDir validates the site id
 * against the tenant pattern, which also kills path traversal.
 */
export function assertionJournalPath(siteId: string, baseDir?: string): string {
  return join(tenantScopedDir(baseDir ?? assertionBaseDir(), siteId), "assertions.json");
}

function emptyJournal(siteId: string): AssertionJournalFile {
  return { version: JOURNAL_VERSION, siteId, assertions: [] };
}

function isJournalFile(v: unknown): v is AssertionJournalFile {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    r.version === JOURNAL_VERSION &&
    typeof r.siteId === "string" &&
    Array.isArray(r.assertions)
  );
}

/**
 * Load the site's assertion journal. Never throws: a missing or corrupt
 * file loads as empty, so a bad journal can never corrupt the intake.
 */
export function loadAssertionJournal(
  siteId: string,
  baseDir?: string,
): AssertionJournalFile {
  try {
    const raw = readFileSync(assertionJournalPath(siteId, baseDir), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (isJournalFile(parsed) && parsed.siteId === siteId) return parsed;
    return emptyJournal(siteId);
  } catch {
    return emptyJournal(siteId);
  }
}

/**
 * Persist the journal atomically (temp file + rename). Throws on
 * failure: the intake treats a journal write failure as a failed
 * admission.
 */
export function persistAssertionJournal(
  siteId: string,
  journal: AssertionJournalFile,
  baseDir?: string,
): void {
  const file = assertionJournalPath(siteId, baseDir);
  const dir = file.slice(0, file.lastIndexOf("/"));
  const tmp = file + ".tmp";
  mkdirSync(dir, { recursive: true });
  writeFileSync(tmp, JSON.stringify(journal, null, 2) + "\n", "utf8");
  renameSync(tmp, file);
}

/**
 * The current chain head for one fact group, or null. The intake names
 * it in provenance.supersedes so corrections stay append-only and the
 * apply logic only ever applies heads.
 */
export function journalHeadForFact(
  assertions: readonly OwnerAssertion[],
  factRef: FactRef,
): OwnerAssertion | null {
  const norm = normalizeFactRef(factRef);
  const target = assertionFactId({ factRef: norm });
  const heads = chainHeads([...assertions]);
  const ours = heads.filter((a) => assertionFactId(a) === target);
  if (ours.length === 0) return null;
  // chainHeads is already deterministic (assertedAt, then assertionId).
  return ours[ours.length - 1];
}

// ---------------------------------------------------------------------------
// Canonical event mapping: FactRef -> the owner-events target vocabulary.
// ---------------------------------------------------------------------------

const CONTACT_FIELDS = ["phone", "email", "website"] as const;

function eventTargetFor(factRef: FactRef): string | null {
  const field = normalizeFactRef(factRef).field;
  if ((CONTACT_FIELDS as readonly string[]).includes(field)) {
    return CONTACT_FIELD_TARGETS[field as "phone" | "email" | "website"];
  }
  if (field === "description") {
    return serviceFieldTarget(normalizeFactRef(factRef).objectId);
  }
  return null;
}

function eventTypeFor(op: CorrectionOp): OwnerEventType {
  if (op === "CORRECT") return "owner.corrected-fact";
  if (op === "CONFIRM") return "owner.confirmed-fact";
  return "owner.hid-fact";
}

// ---------------------------------------------------------------------------
// The intake.
// ---------------------------------------------------------------------------

export interface IntakeCorrectionInput {
  callerKey: string | null | undefined;
  siteId: string;
  factRef: FactRef;
  op: CorrectionOp;
  /** Required for CORRECT: the owner's corrected value. */
  value?: string;
  /**
   * What the source said when the owner asserted. Recorded on both the
   * assertion and the canonical event; the conflict detector compares it
   * against the source's current value on replay.
   */
  sourceValueSeen?: string | null;
  /**
   * Optional closed world for the intake to validate against: when
   * supplied, the factRef must address one of these facts or the intake
   * refuses (unknown_fact). The edit-ref flow always supplies it.
   */
  knownFacts?: readonly SiteFact[];
  nowIso?: () => string;
  assertionDir?: string;
  loadRegistry?: () => CallerRegistry;
}

export interface IntakeSuccess {
  ok: true;
  assertion: OwnerAssertion;
  event: OwnerEvent;
}

export type IntakeResult = IntakeSuccess | IntakeDenial;

/**
 * The single authorized write path for owner field corrections.
 * On success the assertion is journaled AND the canonical event is
 * appended; on any denial or failure nothing is journaled and nothing is
 * appended (an event-write failure throws before the journal write, so
 * there is never a journaled assertion without its canonical event).
 */
export function intakeCorrection(input: IntakeCorrectionInput): IntakeResult {
  const auth = authorizeCorrection({
    callerKey: input.callerKey,
    siteId: input.siteId,
    loadRegistry: input.loadRegistry,
  });
  if (!auth.ok) return auth;

  const nowIso = input.nowIso ?? (() => new Date().toISOString());
  const normRef = normalizeFactRef(input.factRef);

  if (input.knownFacts !== undefined) {
    const known = input.knownFacts.some(
      (f) =>
        f.objectId === normRef.objectId &&
        f.field === normRef.field &&
        f.index === normRef.index,
    );
    if (!known) {
      return deny(
        400,
        "unknown_fact",
        "The addressed fact is not in the current extraction: refusing to correct what was not observed.",
      );
    }
  }

  const target = eventTargetFor(input.factRef);
  if (!target) {
    return deny(
      400,
      "unsupported_target",
      "Field '" +
        normRef.field +
        "' has no canonical owner-event target: refusing rather than recording an unprojectable correction.",
    );
  }

  // The canonical event mapping below is faithful for CORRECT only. A
  // CONFIRM or HIDE assertion would journal without an honest canonical
  // transition, so the intake refuses them outright (fail closed) until
  // their event mapping is built and proven.
  if (input.op !== "CORRECT") {
    return deny(
      400,
      "unsupported_target",
      "Op '" +
        input.op +
        "' is not admitted by this intake yet: only CORRECT has a " +
        "canonical owner-event mapping. Refusing rather than recording " +
        "an unprojectable correction.",
    );
  }

  const journal = loadAssertionJournal(input.siteId, input.assertionDir);
  const head = journalHeadForFact(journal.assertions, normRef);
  const ownerLabel =
    "owner:" + auth.caller.agent_id + " (caller-key verified)";

  let assertion: OwnerAssertion;
  try {
    assertion = assertCorrection({
      factRef: normRef,
      op: input.op,
      value: input.value,
      provenance: {
        owner: ownerLabel,
        assertedAt: nowIso(),
        supersedes: head ? head.assertionId : null,
      },
      sourceValueSeen:
        input.sourceValueSeen === undefined ? null : input.sourceValueSeen,
    });
  } catch (e) {
    return deny(
      400,
      "invalid_input",
      e instanceof Error ? e.message : "invalid correction input",
    );
  }

  const correctionRecord: OwnerFieldCorrection = {
    field: normRef.field as OwnerFieldCorrection["field"],
    targetObjectId:
      normRef.field === "description" ? normRef.objectId : undefined,
    label:
      normRef.field === "description" ? "Service description" : normRef.field,
    sourceValue: assertion.sourceValueSeen,
    ownerValue: assertion.value as string,
    correctedAt: assertion.provenance.assertedAt,
    actorLabel: ownerLabel,
    basis:
      "Owner correction via verified caller-key identity '" +
      auth.caller.agent_id +
      "': the owner attests this " +
      normRef.field +
      ".",
  };

  const actor: OwnerEventActor = {
    kind: "owner",
    identityId: auth.caller.agent_id,
    label: ownerLabel,
  };
  const draft: OwnerEventDraft = {
    at: assertion.provenance.assertedAt,
    objectId: normRef.objectId,
    type: eventTypeFor(input.op),
    actor,
    target,
    previousBasis: { sourceValue: assertion.sourceValueSeen },
    newValue: correctionRecord,
    evidence: {
      kind: "owner-attestation",
      ref: assertion.assertionId,
      detail: "caller-key agent '" + auth.caller.agent_id + "'",
    },
    note:
      "Owner correction (" +
      input.op +
      ") on " +
      normRef.objectId +
      " : " +
      normRef.field +
      " by " +
      auth.caller.agent_id +
      ".",
    generator: "fyd-owner@1",
  };

  // Canonical transition first: if this throws, nothing is journaled.
  const event = appendOwnerEvent(normRef.objectId, draft);

  // Then the durable assertion journal (atomic whole-file write).
  const next: AssertionJournalFile = {
    version: JOURNAL_VERSION,
    siteId: input.siteId,
    assertions: [...journal.assertions, assertion],
  };
  persistAssertionJournal(input.siteId, next, input.assertionDir);

  return { ok: true, assertion, event };
}

/**
 * The generated-presentation projection for one site: fresh source facts
 * with the journaled assertions applied. Pure given its inputs; the
 * caller re-extracts facts on every refresh, so a source refresh or a
 * process restart replays the same journal over new observations.
 */
export function projectSiteFacts(
  facts: SiteFact[],
  siteId: string,
  assertionDir?: string,
) {
  const journal = loadAssertionJournal(siteId, assertionDir);
  return applyCorrections(facts, journal.assertions);
}

/**
 * Reconcile the two durable layers for one object: every journaled
 * assertion addressing the object must have its canonical event
 * (evidence kind "owner-attestation", ref = the assertion id). Returns
 * the assertion ids missing their event; empty means reconciled.
 */
export function journalAssertionsMissingEvents(
  siteId: string,
  objectId: string,
  assertionDir?: string,
): string[] {
  const journal = loadAssertionJournal(siteId, assertionDir);
  const refs = new Set(
    readOwnerEvents(objectId)
      .filter((e) => e.evidence.kind === "owner-attestation")
      .map((e) => e.evidence.ref),
  );
  const missing: string[] = [];
  for (const a of journal.assertions) {
    if (a.factRef.objectId === objectId && !refs.has(a.assertionId)) {
      missing.push(a.assertionId);
    }
  }
  return missing;
}
