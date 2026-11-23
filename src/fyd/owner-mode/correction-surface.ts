/**
 * D3 Option B (desk ruling 2026-11-19, RULING 2): the authenticated
 * correction surface's service layer, the WP8 mechanics of the D6
 * wiring design carried onto the tenant record machinery that exists
 * in main (SiteFacts + the assertion journal + projectSiteFacts).
 *
 * What this mount is:
 * - A narrow owner surface over ONE field class: the contact fields
 *   (phone, email, website), the class the authorized intake can
 *   project canonically. Other fields render on the record view as
 *   observed facts but are not correctable here.
 * - Authenticated ONLY through the existing identity authority: the
 *   caller-key chain (CallerKeyOwnerIdentityProvider over the
 *   operator-provisioned P8 registry) with the credential-derived
 *   tenant entitlement set, exactly as owner-correction-intake
 *   enforces it. No key, an unknown key, or an unentitled key is a
 *   typed denial, never a downgrade. The demo owner context
 *   (FYD-S3-03) is never imported, consulted, or mounted here.
 * - Writes flow ONLY through intakeCorrection, the single authorized
 *   write path: canonical owner event first, durable assertion
 *   journal second, both tenant-scoped. This module adds no second
 *   write path and imports no unscoped store.
 * - Admission ships with the surface (the D9-F1 gate-at-birth
 *   lesson): a durable, tenant-keyed rate ledger modeled on the
 *   inquiry ledger (INQUIRY_RATE_POLICY's shape: 20 per site per
 *   hour, 3 per caller per hour, fixed windows, hashed caller keys,
 *   no PII) is checked BEFORE the intake runs and recorded exactly
 *   once per admitted correction. Refusals record nothing.
 *
 * The record view is the WP8 rendering contract in data form: every
 * extracted field with its status (observed facts carry their
 * question; conflicted facts carry both values and both sources with
 * the resolve action being a new correction through this same
 * surface), plus the assertion journal as the corrections history.
 *
 * Server-side only (registry reads, file writes).
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  loadCallerRegistry,
  type CallerRegistry,
} from "../../app/api/mc/_lib/mc-dispatch-identity";
import { scopedGetFydTenantGraph } from "../tenant/scoped-stores";
import { TENANT_ID_PATTERN, tenantScopedDir } from "../tenant/tenant-context";
import {
  applyCorrections,
  type CorrectionConflict,
  type OwnerAssertion,
} from "./corrections";
import { extractSiteFacts, factIdFor, factLabel, type SiteFact } from "./facts";
import {
  authorizeCorrection,
  intakeCorrection,
  loadAssertionJournal,
  type IntakeDenial,
  type IntakeSuccess,
} from "./owner-correction-intake";

// ---------------------------------------------------------------------------
// The admitted field class.
// ---------------------------------------------------------------------------

/** The one field class this mount admits: the contact fields. */
export const CORRECTION_FIELD_CLASS = ["phone", "email", "website"] as const;

const CONTACT_FIELDS: ReadonlySet<string> = new Set(CORRECTION_FIELD_CLASS);

// ---------------------------------------------------------------------------
// Denials. A denial is never a silent empty.
// ---------------------------------------------------------------------------

export type SurfaceDenial =
  | IntakeDenial
  | {
      ok: false;
      status: 400;
      code: "field_class_not_admitted";
      reason: string;
    }
  | {
      ok: false;
      status: 400;
      code: "invalid_tenant";
      reason: string;
    }
  | {
      ok: false;
      status: 404;
      code: "tenant_not_served";
      reason: string;
    }
  | {
      ok: false;
      status: 429;
      code: "rate_limited";
      scope: "site" | "caller";
      reason: string;
      retryAfterMs: number;
    };

function invalidTenant(siteId: string): SurfaceDenial {
  return {
    ok: false,
    status: 400,
    code: "invalid_tenant",
    reason:
      "Site id '" + siteId + "' is not a valid tenant id; refusing before any I/O.",
  };
}

// ---------------------------------------------------------------------------
// Admission: the durable tenant-keyed rate ledger (inquiry-modeled).
// ---------------------------------------------------------------------------

/** The mount's admission policy, modeled on INQUIRY_RATE_POLICY. */
export const CORRECTION_RATE_POLICY = {
  /** Max admitted corrections per site per fixed hour window. */
  sitePerHour: 20,
  /** Max admitted corrections per authenticated caller per window. */
  callerPerHour: 3,
  windowMs: 3600_000,
} as const;

const RATE_VERSION = 1 as const;

interface CorrectionRateWindow {
  windowStart: number;
  count: number;
}

interface CorrectionRateLedgerFile {
  version: typeof RATE_VERSION;
  siteId: string;
  site: CorrectionRateWindow;
  callers: Record<string, CorrectionRateWindow>;
}

/**
 * The ledger lives beside the assertion journal: same base resolution
 * as the intake's journal (FYD_ASSERTION_DIR, else data/owner-assertions
 * under the working directory), tenant-scoped per site.
 */
function correctionBaseDir(): string {
  const override = process.env.FYD_ASSERTION_DIR;
  if (override) return override;
  return join(process.cwd(), "data", "owner-assertions");
}

export function correctionRatePath(siteId: string, baseDir?: string): string {
  return join(
    tenantScopedDir(baseDir ?? correctionBaseDir(), siteId),
    "correction-rate.json",
  );
}

/** Caller keys in the ledger are hashes, never agent ids in the clear. */
function correctionCallerKey(agentId: string): string {
  return createHash("sha256")
    .update("correction-caller:" + agentId, "utf8")
    .digest("hex");
}

function emptyRate(siteId: string): CorrectionRateLedgerFile {
  return {
    version: RATE_VERSION,
    siteId,
    site: { windowStart: 0, count: 0 },
    callers: {},
  };
}

function isRateWindow(v: unknown): v is CorrectionRateWindow {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return typeof r.windowStart === "number" && typeof r.count === "number";
}

function isRateFile(v: unknown): v is CorrectionRateLedgerFile {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  const callers = r.callers;
  return (
    r.version === RATE_VERSION &&
    typeof r.siteId === "string" &&
    isRateWindow(r.site) &&
    typeof callers === "object" &&
    callers !== null &&
    Object.values(callers).every(isRateWindow)
  );
}

function loadCorrectionRateLedger(
  siteId: string,
  baseDir?: string,
): CorrectionRateLedgerFile {
  try {
    const raw = readFileSync(correctionRatePath(siteId, baseDir), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (isRateFile(parsed) && parsed.siteId === siteId) return parsed;
    return emptyRate(siteId);
  } catch {
    return emptyRate(siteId);
  }
}

function persistCorrectionRateLedger(
  siteId: string,
  ledger: CorrectionRateLedgerFile,
  baseDir?: string,
): void {
  const file = correctionRatePath(siteId, baseDir);
  const dir = file.slice(0, file.lastIndexOf("/"));
  const tmp = file + ".tmp";
  mkdirSync(dir, { recursive: true });
  writeFileSync(tmp, JSON.stringify(ledger, null, 2) + "\n", "utf8");
  renameSync(tmp, file);
}

function windowStartFor(nowMs: number): number {
  return (
    Math.floor(nowMs / CORRECTION_RATE_POLICY.windowMs) *
    CORRECTION_RATE_POLICY.windowMs
  );
}

function currentWindow(
  w: CorrectionRateWindow,
  nowMs: number,
): CorrectionRateWindow {
  const start = windowStartFor(nowMs);
  if (w.windowStart !== start) return { windowStart: start, count: 0 };
  return w;
}

export type CorrectionRateVerdict =
  | { ok: true }
  | { ok: false; scope: "site" | "caller" };

/**
 * Pure check: would this correction exceed the admission policy?
 * Reads the durable ledger; writes nothing. A refusal therefore
 * consumes no quota.
 */
export function checkCorrectionRate(
  siteId: string,
  callerAgentId: string,
  nowMs: number,
  baseDir?: string,
): CorrectionRateVerdict {
  const ledger = loadCorrectionRateLedger(siteId, baseDir);
  const site = currentWindow(ledger.site, nowMs);
  if (site.count >= CORRECTION_RATE_POLICY.sitePerHour) {
    return { ok: false, scope: "site" };
  }
  const caller = currentWindow(
    ledger.callers[correctionCallerKey(callerAgentId)] ?? {
      windowStart: 0,
      count: 0,
    },
    nowMs,
  );
  if (caller.count >= CORRECTION_RATE_POLICY.callerPerHour) {
    return { ok: false, scope: "caller" };
  }
  return { ok: true };
}

/**
 * Record one admitted correction in the durable ledger. Called only
 * after the intake has durably admitted the correction; a ledger
 * write failure throws so the surface fails closed instead of
 * silently dropping its rate accounting.
 */
export function recordCorrectionRate(
  siteId: string,
  callerAgentId: string,
  nowMs: number,
  baseDir?: string,
): void {
  const ledger = loadCorrectionRateLedger(siteId, baseDir);
  const site = currentWindow(ledger.site, nowMs);
  const key = correctionCallerKey(callerAgentId);
  const caller = currentWindow(
    ledger.callers[key] ?? { windowStart: 0, count: 0 },
    nowMs,
  );
  const next: CorrectionRateLedgerFile = {
    version: RATE_VERSION,
    siteId,
    site: { windowStart: site.windowStart, count: site.count + 1 },
    callers: {
      ...ledger.callers,
      [key]: { windowStart: caller.windowStart, count: caller.count + 1 },
    },
  };
  persistCorrectionRateLedger(siteId, next, baseDir);
}

function retryAfterMsFor(nowMs: number): number {
  return windowStartFor(nowMs) + CORRECTION_RATE_POLICY.windowMs - nowMs;
}

// ---------------------------------------------------------------------------
// Dependencies. Production defaults; tests inject fixture seams through
// the same shapes the production code already exposes (the registry
// loader seam, the assertion-dir override, the facts seam).
// ---------------------------------------------------------------------------

export interface CorrectionSurfaceDeps {
  /** Registry loader override; defaults to the P8 production loader. */
  loadRegistry?: () => CallerRegistry;
  /** Assertion journal base dir; defaults to the intake's resolution. */
  assertionDir?: string;
  /** Facts seam; defaults to the pinned tenant graph extraction. */
  loadFacts?: (siteId: string) => Promise<SiteFact[]>;
  nowMs?: () => number;
  nowIso?: () => string;
}

async function defaultLoadFacts(siteId: string): Promise<SiteFact[]> {
  // The graph read goes through the tenant-scoped wrapper (the
  // S3-01 boundary's sanctioned seam): the context is the read
  // tenant's own, and both call paths reach this loader only
  // after authorizeCorrection has authenticated the caller and
  // verified entitlement for exactly this siteId, so the
  // wrapper's key assertion binds the read to the authorized
  // tenant and to no other.
  const tenant = await scopedGetFydTenantGraph({ tenantId: siteId }, siteId);
  return extractSiteFacts(tenant.graph, new Date().toISOString());
}

async function loadFactsOrDenial(
  siteId: string,
  deps: CorrectionSurfaceDeps,
): Promise<SiteFact[] | SurfaceDenial> {
  try {
    return await (deps.loadFacts ?? defaultLoadFacts)(siteId);
  } catch {
    return {
      ok: false,
      status: 404,
      code: "tenant_not_served",
      reason:
        "The tenant graph seam cannot serve site '" +
        siteId +
        "'; no record is available for it on this surface.",
    };
  }
}

// ---------------------------------------------------------------------------
// The record view (WP8's rendering contract, in data form).
// ---------------------------------------------------------------------------

export type CorrectionFieldStatus =
  | "observed"
  | "corrected"
  | "confirmed"
  | "conflicted"
  | "hidden";

export interface CorrectionFieldView {
  factId: string;
  objectId: string;
  field: string;
  index: number;
  kind: SiteFact["kind"];
  status: CorrectionFieldStatus;
  /** The projected value: the owner's value where a correction applies. */
  value: string;
  /** What the source most recently said (the displaced value, kept). */
  sourceValue: string;
  /** True only for the admitted contact class. */
  correctable: boolean;
  /** WP8's question form for an observed fact; null once answered. */
  question: string | null;
  assertionIds: string[];
}

export interface CorrectionHistoryEntry {
  assertionId: string;
  objectId: string;
  field: string;
  index: number;
  op: OwnerAssertion["op"];
  value: string | null;
  sourceValueSeen: string | null;
  assertedAt: string;
  owner: string;
  supersedes: string | null;
}

export interface CorrectionRecordView {
  siteId: string;
  actor: { identityId: string; method: string };
  fields: CorrectionFieldView[];
  conflicts: CorrectionConflict[];
  history: CorrectionHistoryEntry[];
}

function buildRecordView(
  siteId: string,
  facts: SiteFact[],
  assertionDir?: string,
): Omit<CorrectionRecordView, "actor"> {
  const journal = loadAssertionJournal(siteId, assertionDir);
  const result = applyCorrections(facts, journal.assertions);
  const sourceById = new Map(facts.map((f) => [f.factId, f] as const));
  const appliedByFact = new Map<string, string[]>();
  const appliedOpsByFact = new Map<string, Set<string>>();
  for (const a of result.applied) {
    const ids = appliedByFact.get(a.factId) ?? [];
    ids.push(a.assertionId);
    appliedByFact.set(a.factId, ids);
    const ops = appliedOpsByFact.get(a.factId) ?? new Set<string>();
    ops.add(a.op);
    appliedOpsByFact.set(a.factId, ops);
  }
  const conflictFactIds = new Set(
    result.conflicts.map((c) =>
      factIdFor(c.factRef.objectId, c.factRef.field, c.factRef.index),
    ),
  );
  const hidden = new Set(result.hiddenFactIds);

  const titles = new Map<string, string>();
  for (const f of facts) {
    if (f.field === "name" && !titles.has(f.objectId)) {
      titles.set(f.objectId, f.value);
    }
  }

  const fields: CorrectionFieldView[] = result.facts.map((f) => {
    const ops = appliedOpsByFact.get(f.factId) ?? new Set<string>();
    let status: CorrectionFieldStatus = "observed";
    if (conflictFactIds.has(f.factId)) status = "conflicted";
    else if (ops.has("CORRECT")) status = "corrected";
    else if (f.ownerConfirmation) status = "confirmed";
    else if (hidden.has(f.factId)) status = "hidden";
    return {
      factId: f.factId,
      objectId: f.objectId,
      field: f.field,
      index: f.index,
      kind: f.kind,
      status,
      value: f.value,
      sourceValue: sourceById.get(f.factId)?.value ?? f.value,
      correctable: CONTACT_FIELDS.has(f.field),
      question:
        status === "observed"
          ? "Is this " + factLabel(titles, f) + " correct?"
          : null,
      assertionIds: appliedByFact.get(f.factId) ?? [],
    };
  });

  const history: CorrectionHistoryEntry[] = journal.assertions.map((a) => ({
    assertionId: a.assertionId,
    objectId: a.factRef.objectId,
    field: a.factRef.field,
    index: a.factRef.index ?? 0,
    op: a.op,
    value: a.value,
    sourceValueSeen: a.sourceValueSeen,
    assertedAt: a.provenance.assertedAt,
    owner: a.provenance.owner,
    supersedes: a.provenance.supersedes,
  }));

  return { siteId, fields, conflicts: result.conflicts, history };
}

// ---------------------------------------------------------------------------
// The surface operations.
// ---------------------------------------------------------------------------

export interface GetCorrectionRecordInput {
  callerKey: string | null | undefined;
  siteId: string;
}

export type GetCorrectionRecordResult =
  | { ok: true; record: CorrectionRecordView }
  | SurfaceDenial;

/**
 * Read one tenant's correction record. Authenticated and entitled
 * through the same chain the intake enforces; a caller entitled to a
 * different tenant is refused before any tenant state is read.
 */
export async function getCorrectionRecord(
  input: GetCorrectionRecordInput,
  deps: CorrectionSurfaceDeps = {},
): Promise<GetCorrectionRecordResult> {
  if (!TENANT_ID_PATTERN.test(input.siteId)) return invalidTenant(input.siteId);
  const auth = authorizeCorrection({
    callerKey: input.callerKey,
    siteId: input.siteId,
    loadRegistry: deps.loadRegistry,
  });
  if (!auth.ok) return auth;
  const facts = await loadFactsOrDenial(input.siteId, deps);
  if (!Array.isArray(facts)) return facts;
  const view = buildRecordView(input.siteId, facts, deps.assertionDir);
  return {
    ok: true,
    record: {
      ...view,
      actor: {
        identityId: auth.identity.identityId,
        method: auth.identity.method,
      },
    },
  };
}

export interface SubmitCorrectionInput {
  callerKey: string | null | undefined;
  siteId: string;
  objectId: string;
  field: string;
  index?: number;
  value: string;
  sourceValueSeen?: string | null;
}

export type SubmitCorrectionResult = IntakeSuccess | SurfaceDenial;

/**
 * Admit one owner correction. Order is the security shape: tenant id
 * validity, authentication and entitlement, the admitted field class,
 * the admission rate check, the closed fact world, and only then the
 * authorized intake write. The rate is recorded exactly once, after
 * the intake durably admits; every refusal records nothing.
 */
export async function submitCorrection(
  input: SubmitCorrectionInput,
  deps: CorrectionSurfaceDeps = {},
): Promise<SubmitCorrectionResult> {
  if (!TENANT_ID_PATTERN.test(input.siteId)) return invalidTenant(input.siteId);
  const auth = authorizeCorrection({
    callerKey: input.callerKey,
    siteId: input.siteId,
    loadRegistry: deps.loadRegistry,
  });
  if (!auth.ok) return auth;

  if (!CONTACT_FIELDS.has(input.field)) {
    return {
      ok: false,
      status: 400,
      code: "field_class_not_admitted",
      reason:
        "Field '" +
        input.field +
        "' is outside this surface's admitted class (contact: " +
        CORRECTION_FIELD_CLASS.join(", ") +
        "); refusing rather than recording an unprojectable correction.",
    };
  }

  const nowMs = (deps.nowMs ?? Date.now)();
  const verdict = checkCorrectionRate(
    input.siteId,
    auth.caller.agent_id,
    nowMs,
    deps.assertionDir,
  );
  if (!verdict.ok) {
    return {
      ok: false,
      status: 429,
      code: "rate_limited",
      scope: verdict.scope,
      reason:
        verdict.scope === "site"
          ? "This site's correction admission bound for the current hour is reached."
          : "This caller's correction admission bound for the current hour is reached.",
      retryAfterMs: retryAfterMsFor(nowMs),
    };
  }

  const facts = await loadFactsOrDenial(input.siteId, deps);
  if (!Array.isArray(facts)) return facts;

  const result = intakeCorrection({
    callerKey: input.callerKey,
    siteId: input.siteId,
    factRef: {
      objectId: input.objectId,
      field: input.field,
      index: input.index ?? 0,
    },
    op: "CORRECT",
    value: input.value,
    sourceValueSeen: input.sourceValueSeen,
    knownFacts: facts,
    nowIso: deps.nowIso,
    assertionDir: deps.assertionDir,
    loadRegistry: deps.loadRegistry,
  });
  if (!result.ok) return result;

  recordCorrectionRate(
    input.siteId,
    auth.caller.agent_id,
    nowMs,
    deps.assertionDir,
  );
  return result;
}
