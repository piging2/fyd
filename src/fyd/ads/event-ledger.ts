/**
 * Event ledger for the FYD objects economic loop (lane B2;
 * DESIGN.md, BOOTSTRAP-SURGE-OBJECTS-LOOP-DESIGN-20261104).
 *
 * This is the durable store the rank event contract lacked: it binds
 * the EXISTING FydObjectEventAdapter interface from
 * src/fyd/rank/object-events.ts with authority "canonical" for loop
 * surfaces. publish(draft) validates shape, runs the design's six
 * abuse checks in their numbered order, appends one hash-chained row
 * to the day's JSONL log, and returns the recorded receipt. The read
 * API below is the only source dashboards (B6) and budget state (B3)
 * may use; budget state is derived from COUNTED rows only.
 *
 * Storage: data/fyd-ads/ledger/<yyyymmdd>.jsonl (env FYD_ADS_DIR),
 * one chain per day file, genesis prevHash "". A row is the draft
 * fields verbatim plus server fields: slotId and publisherTenantId
 * (server-derived attribution, resolved from the inventory store by
 * surface), viewerScopeRef (actor session, else viewer id), receivedAt
 * (the ledger's own clock; client occurredAt is data, never truth),
 * receiptRef ("ads-receipt:<yyyymmdd>:<seq>", part of the hashed row),
 * classification + classificationReason (assigned at ingest, part of
 * the hashed row), and the chain (prevHash, rowHash) where
 * rowHash = sha256(prevHash + canonicalBytes(row without chain
 * fields)) using canonicalBytes from src/fyd/ask/envelope.ts, the
 * repo's canonicalization authority. Rows are never edited or
 * deleted; this module exposes no mutation API.
 *
 * Classification (DESIGN.md abuse controls v1, exclusion-only: a
 * check can keep a row out of counts, never put a questionable one
 * in):
 *   1. dedupe: same dedupeKey + identical payload -> the original
 *      receipt is returned, nothing appended; same key, different
 *      payload -> DUPLICATE row (tamper signal), never counted.
 *   2. render-instance replay: a second impression draft for an
 *      already-recorded renderInstanceId -> DUPLICATE.
 *   3. self-events: the server-resolved actor tenant is the
 *      campaign's payer, or the slot's publisher on its own surface
 *      -> SELF, retained, never counted.
 *   4. bot heuristics: user agent missing or matching the versioned
 *      known-bot substring list (policy.ts), or an empty
 *      renderInstanceId (no render instance the collector could have
 *      minted) -> BOT, retained, never counted.
 *   5. rate limit: more than 60 drafts per viewer scope per minute or
 *      more than 300 per slot per minute (counted over server
 *      receivedAt) -> the excess is RATE_LIMITED, retained, never
 *      counted.
 *   6. validity: sponsorship triple naming an unknown campaign, a
 *      payer or promoted-object mismatch, an ended campaign, an
 *      unknown slot, or a slot without active consent (revoked named
 *      separately), a sponsored event no eligible placement decision
 *      covers (decisions/<decisionId>.json, lane B3's store, read
 *      here per the design data model), or an impression draft that
 *      does not carry collector-minted evidence (see below) ->
 *      INVALID, never counted.
 *
 * Impression evidence: the draft carries no visibility fields; the
 * contract's proof that the 50-percent / 1-second rule ran is the
 * dedupeKey minted by createObjectImpressionTracker in
 * rank/object-events.ts, JSON.stringify(["fyd-object-impression",
 * objectId, surface, renderInstanceId, placementId ?? null]). An
 * impression whose dedupeKey is not exactly that value, or whose
 * sponsorship presence contradicts its type, never counts.
 *
 * Fail closed: structural shape failures throw LedgerValidationError
 * and append nothing (a row cannot be formed without a dedupeKey);
 * any ledger line that fails to parse or breaks the chain makes reads
 * throw LedgerCorruptError; a corrupt campaign or slot log propagates
 * out of publish rather than degrading validation. Structural
 * decisions are recorded in the lane BUILD-LOG.md.
 */

import { createHash } from "node:crypto";
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { join } from "node:path";
import { canonicalBytes } from "../ask/envelope";
import type {
  FydObjectAction,
  FydObjectEventAdapter,
  FydObjectEventDraft,
} from "../rank/object-events";
import type { ObjectExposureWindow } from "../rank/sponsored-placement";
import {
  CAMPAIGN_ENTITY_KIND,
  projectCampaign,
  type CampaignState,
} from "./campaign-store";
import {
  SLOT_ENTITY_KIND,
  projectSlot,
  type SlotState,
} from "./inventory-store";
import { adsDir, listAdsEntityIds, readAdsEvents } from "./event-log";
import {
  FREQUENCY_WINDOW_MS,
  KNOWN_BOT_UA_SUBSTRINGS,
  LEDGER_DECISION_COVERAGE_MS,
  LEDGER_MAX_DRAFTS_PER_SLOT_PER_WINDOW,
  LEDGER_MAX_DRAFTS_PER_VIEWER_PER_WINDOW,
  LEDGER_RATE_WINDOW_MS,
  utcDayKey,
} from "./policy";

export type LedgerClassification =
  | "COUNTED"
  | "SELF"
  | "BOT"
  | "DUPLICATE"
  | "RATE_LIMITED"
  | "INVALID";

export const LEDGER_CLASSIFICATIONS: readonly LedgerClassification[] = [
  "COUNTED",
  "SELF",
  "BOT",
  "DUPLICATE",
  "RATE_LIMITED",
  "INVALID",
];

/** One durable ledger row: draft fields verbatim, then server fields. */
export interface LedgerEvent {
  type: string;
  objectId: string;
  surface: string;
  correlationId: string;
  renderInstanceId: string;
  occurredAt: number;
  actor?: { viewerId?: string; sessionId?: string };
  action?: FydObjectAction;
  sponsorship?: { placementId: string; campaignId: string; payerId: string };
  dedupeKey: string;
  /** Server-derived: the inventory slot resolved from the surface. */
  slotId: string | null;
  /** Server-derived: publisher tenant of the resolved slot. */
  publisherTenantId: string | null;
  /** Server-derived: actor session scope, else viewer id, else null. */
  viewerScopeRef: string | null;
  /** Server receipt time (epoch ms), from the ledger's own clock. */
  receivedAt: number;
  /** Server receipt identity: "ads-receipt:<yyyymmdd>:<seq>". */
  receiptRef: string;
  classification: LedgerClassification;
  /** Named reason for the classification (the check that decided). */
  classificationReason: string;
  prevHash: string;
  rowHash: string;
}

/** Typed failure for a structurally malformed draft. Nothing is appended. */
export class LedgerValidationError extends Error {
  readonly code = "ADS_LEDGER_SHAPE" as const;
  constructor(message: string) {
    super(message);
    this.name = "LedgerValidationError";
  }
}

/** Typed failure for a ledger (or decision) file that cannot be trusted. */
export class LedgerCorruptError extends Error {
  readonly code = "ADS_LEDGER_CORRUPT" as const;
  readonly day: string;
  readonly atRow: number;
  readonly reason: string;
  constructor(day: string, atRow: number, reason: string) {
    super(
      "Ads ledger " + day + " is corrupt at row " + atRow + " (" + reason +
        "); bytes retained.",
    );
    this.name = "LedgerCorruptError";
    this.day = day;
    this.atRow = atRow;
    this.reason = reason;
  }
}

/**
 * Server-side ingest context, resolved by the caller from the
 * authenticated identity and the request headers. Never taken from
 * the draft payload (DESIGN.md security section).
 */
export interface LedgerIngestContext {
  /** Tenant of the actor, when the identity boundary resolved one. */
  actorTenantId?: string;
  /** User-Agent header exactly as the server observed it. */
  userAgent?: string;
}

export interface AdsEventLedgerOptions {
  /** Clock injection (tests); default Date.now. */
  now?: () => number;
}

const LEDGER_SUBDIR = "ledger";
const DECISIONS_SUBDIR = "decisions";
const CAMPAIGNS_SUBDIR = "campaigns";
const SLOTS_SUBDIR = "slots";
const DAY_FILE_PATTERN = /^\d{8}\.jsonl$/;
const ADS_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const UNSCOPED_VIEWER_KEY = "unscoped";

/** The rank contract's action vocabulary: action -> event type. */
const ACTION_EVENT_BY_ACTION: Record<FydObjectAction, string> = {
  OBJECT_OPEN: "FYD_OBJECT_OPENED",
  OBJECT_CLOSE: "FYD_OBJECT_CLOSED",
  WEBSITE_OPEN: "FYD_OBJECT_WEBSITE_OPENED",
  FOLLOW: "FYD_OBJECT_FOLLOW_REQUESTED",
  UNFOLLOW: "FYD_OBJECT_UNFOLLOW_REQUESTED",
  LIKE: "FYD_OBJECT_LIKE_REQUESTED",
  UNLIKE: "FYD_OBJECT_UNLIKE_REQUESTED",
  CALL: "FYD_OBJECT_CALL_REQUESTED",
  DIRECTIONS: "FYD_OBJECT_DIRECTIONS_OPENED",
  MESSAGE: "FYD_OBJECT_MESSAGE_REQUESTED",
  ASK_FYD: "FYD_OBJECT_ASK_STARTED",
  EVIDENCE_OPEN: "FYD_OBJECT_EVIDENCE_OPENED",
};
const ACTION_EVENT_TYPES: ReadonlySet<string> = new Set(
  Object.values(ACTION_EVENT_BY_ACTION),
);
const IMPRESSION_EVENT_TYPES: ReadonlySet<string> = new Set([
  "FYD_OBJECT_IMPRESSION",
  "FYD_SPONSORED_IMPRESSION",
]);

function isImpressionType(type: string): boolean {
  return IMPRESSION_EVENT_TYPES.has(type);
}

/* ------------------------------------------------------------------ */
/* Draft validation and normalization                                  */
/* ------------------------------------------------------------------ */

function requireDraftText(label: string, value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new LedgerValidationError(
      "Draft " + label + " must be a non-empty string.",
    );
  }
  return value;
}

/**
 * Validate a draft's structure and return a clean copy carrying only
 * the contract's fields. Semantic failures are NOT decided here; the
 * six abuse checks classify well-formed drafts. An empty
 * renderInstanceId is deliberately allowed through: the design
 * assigns it to the bot shape check.
 */
function validateDraft(draft: FydObjectEventDraft): FydObjectEventDraft {
  if (typeof draft !== "object" || draft === null || Array.isArray(draft)) {
    throw new LedgerValidationError("Draft must be an object.");
  }
  const d = draft as unknown as Record<string, unknown>;
  const type = requireDraftText("type", d.type);
  if (!ACTION_EVENT_TYPES.has(type) && !IMPRESSION_EVENT_TYPES.has(type)) {
    throw new LedgerValidationError(
      "Unknown draft type: " + JSON.stringify(type),
    );
  }
  const clean: FydObjectEventDraft = {
    type: type as FydObjectEventDraft["type"],
    objectId: requireDraftText("objectId", d.objectId),
    surface: requireDraftText("surface", d.surface),
    correlationId: requireDraftText("correlationId", d.correlationId),
    renderInstanceId: "",
    occurredAt: 0,
    dedupeKey: requireDraftText("dedupeKey", d.dedupeKey),
  };
  if (typeof d.renderInstanceId !== "string") {
    throw new LedgerValidationError("Draft renderInstanceId must be a string.");
  }
  clean.renderInstanceId = d.renderInstanceId;
  if (typeof d.occurredAt !== "number" || !Number.isFinite(d.occurredAt)) {
    throw new LedgerValidationError(
      "Draft occurredAt must be a finite epoch-ms number.",
    );
  }
  clean.occurredAt = d.occurredAt;
  if (d.actor !== undefined) {
    if (typeof d.actor !== "object" || d.actor === null || Array.isArray(d.actor)) {
      throw new LedgerValidationError("Draft actor must be an object.");
    }
    const a = d.actor as Record<string, unknown>;
    const actor: { viewerId?: string; sessionId?: string } = {};
    if (a.viewerId !== undefined) {
      if (typeof a.viewerId !== "string") {
        throw new LedgerValidationError("Draft actor.viewerId must be a string.");
      }
      actor.viewerId = a.viewerId;
    }
    if (a.sessionId !== undefined) {
      if (typeof a.sessionId !== "string") {
        throw new LedgerValidationError("Draft actor.sessionId must be a string.");
      }
      actor.sessionId = a.sessionId;
    }
    clean.actor = actor;
  }
  if (d.action !== undefined) {
    if (
      typeof d.action !== "string" ||
      !Object.prototype.hasOwnProperty.call(ACTION_EVENT_BY_ACTION, d.action)
    ) {
      throw new LedgerValidationError(
        "Unknown draft action: " + JSON.stringify(d.action),
      );
    }
    if (ACTION_EVENT_BY_ACTION[d.action as FydObjectAction] !== type) {
      throw new LedgerValidationError("Draft action does not match its event type.");
    }
    clean.action = d.action as FydObjectAction;
  } else if (ACTION_EVENT_TYPES.has(type)) {
    throw new LedgerValidationError("Action event draft is missing its action.");
  }
  if (d.sponsorship !== undefined && d.sponsorship !== null) {
    if (
      typeof d.sponsorship !== "object" ||
      Array.isArray(d.sponsorship)
    ) {
      throw new LedgerValidationError("Draft sponsorship must be an object.");
    }
    const s = d.sponsorship as Record<string, unknown>;
    clean.sponsorship = {
      placementId: requireDraftText("sponsorship.placementId", s.placementId),
      campaignId: requireDraftText("sponsorship.campaignId", s.campaignId),
      payerId: requireDraftText("sponsorship.payerId", s.payerId),
    };
  }
  return clean;
}

/**
 * The draft fields of a draft or a stored row, normalized to one
 * canonical presence shape so idempotency comparison is exact.
 */
function draftPortionOf(src: {
  type: string;
  objectId: string;
  surface: string;
  correlationId: string;
  renderInstanceId: string;
  occurredAt: number;
  actor?: { viewerId?: string; sessionId?: string };
  action?: FydObjectAction;
  sponsorship?: { placementId: string; campaignId: string; payerId: string };
  dedupeKey: string;
}): Record<string, unknown> {
  const portion: Record<string, unknown> = {
    type: src.type,
    objectId: src.objectId,
    surface: src.surface,
    correlationId: src.correlationId,
    renderInstanceId: src.renderInstanceId,
    occurredAt: src.occurredAt,
    dedupeKey: src.dedupeKey,
  };
  if (src.actor) {
    const actor: Record<string, unknown> = {};
    if (src.actor.viewerId !== undefined) actor.viewerId = src.actor.viewerId;
    if (src.actor.sessionId !== undefined) actor.sessionId = src.actor.sessionId;
    portion.actor = actor;
  }
  if (src.action) portion.action = src.action;
  if (src.sponsorship) {
    portion.sponsorship = {
      placementId: src.sponsorship.placementId,
      campaignId: src.sponsorship.campaignId,
      payerId: src.sponsorship.payerId,
    };
  }
  return portion;
}

/**
 * The dedupeKey the rank impression tracker mints for a draft with
 * these fields. A tracker-minted impression draft is the only
 * impression whose key equals this; anything else carries no proof
 * the 50-percent / 1-second rule ran.
 */
function expectedImpressionDedupeKey(draft: FydObjectEventDraft): string {
  return JSON.stringify([
    "fyd-object-impression",
    draft.objectId,
    draft.surface,
    draft.renderInstanceId,
    draft.sponsorship?.placementId ?? null,
  ]);
}

function viewerScopeRefOf(draft: FydObjectEventDraft): string | null {
  return draft.actor?.sessionId ?? draft.actor?.viewerId ?? null;
}

/* ------------------------------------------------------------------ */
/* Hash chain                                                          */
/* ------------------------------------------------------------------ */

/** The hashed body: every row field except the chain fields. */
function rowBodyOf(row: LedgerEvent): Record<string, unknown> {
  return {
    ...draftPortionOf(row),
    slotId: row.slotId,
    publisherTenantId: row.publisherTenantId,
    viewerScopeRef: row.viewerScopeRef,
    receivedAt: row.receivedAt,
    receiptRef: row.receiptRef,
    classification: row.classification,
    classificationReason: row.classificationReason,
  };
}

function computeRowHash(body: Record<string, unknown>, prevHash: string): string {
  return createHash("sha256")
    .update(prevHash + canonicalBytes(body), "utf8")
    .digest("hex");
}

function ledgerDirPath(): string {
  return join(adsDir(), LEDGER_SUBDIR);
}

function dayFilePath(day: string): string {
  return join(ledgerDirPath(), day + ".jsonl");
}

function listLedgerDays(): string[] {
  let names: string[];
  try {
    names = readdirSync(ledgerDirPath());
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return [];
    throw err;
  }
  return names
    .filter((n) => DAY_FILE_PATTERN.test(n))
    .map((n) => n.slice(0, -".jsonl".length))
    .sort();
}

function isValidRowShape(v: unknown): v is LedgerEvent {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.type === "string" &&
    typeof r.objectId === "string" &&
    typeof r.surface === "string" &&
    typeof r.correlationId === "string" &&
    typeof r.renderInstanceId === "string" &&
    typeof r.occurredAt === "number" &&
    Number.isFinite(r.occurredAt) &&
    typeof r.dedupeKey === "string" &&
    (r.slotId === null || typeof r.slotId === "string") &&
    (r.publisherTenantId === null || typeof r.publisherTenantId === "string") &&
    (r.viewerScopeRef === null || typeof r.viewerScopeRef === "string") &&
    typeof r.receivedAt === "number" &&
    Number.isFinite(r.receivedAt) &&
    typeof r.receiptRef === "string" &&
    typeof r.classification === "string" &&
    (LEDGER_CLASSIFICATIONS as readonly string[]).includes(r.classification) &&
    typeof r.classificationReason === "string" &&
    typeof r.prevHash === "string" &&
    typeof r.rowHash === "string"
  );
}

interface DayLoad {
  day: string;
  rows: LedgerEvent[];
  failure: { atRow: number; reason: string } | null;
}

/** Parse one day file and verify its chain. Never throws on bad rows. */
function loadDay(day: string): DayLoad {
  let raw: string;
  try {
    raw = readFileSync(dayFilePath(day), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
      return { day, rows: [], failure: null };
    }
    throw err;
  }
  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  const rows: LedgerEvent[] = [];
  let prevHash = "";
  for (let i = 0; i < lines.length; i++) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(lines[i]);
    } catch {
      return { day, rows, failure: { atRow: i, reason: "invalid-json" } };
    }
    if (!isValidRowShape(parsed)) {
      return { day, rows, failure: { atRow: i, reason: "invalid-row-shape" } };
    }
    if (parsed.prevHash !== prevHash) {
      return { day, rows, failure: { atRow: i, reason: "prev-hash-mismatch" } };
    }
    if (parsed.rowHash !== computeRowHash(rowBodyOf(parsed), prevHash)) {
      return { day, rows, failure: { atRow: i, reason: "row-hash-mismatch" } };
    }
    rows.push(parsed);
    prevHash = parsed.rowHash;
  }
  return { day, rows, failure: null };
}

/* ------------------------------------------------------------------ */
/* Reference resolution (campaign, slot, decisions)                    */
/* ------------------------------------------------------------------ */

/**
 * Campaign projection by id, unscoped: the ledger is a system
 * authority validating references, not a tenant read. Unknown or
 * malformed ids yield null; a corrupt log propagates (fail closed).
 */
function loadCampaignState(campaignId: string): CampaignState | null {
  if (!ADS_ID_PATTERN.test(campaignId)) return null;
  return projectCampaign(
    readAdsEvents(CAMPAIGNS_SUBDIR, CAMPAIGN_ENTITY_KIND, campaignId),
  );
}

/**
 * Resolve the inventory slot a surface's events attribute to:
 * non-retired slots declared for the surface; a single candidate
 * resolves; several resolve only when exactly one holds active
 * consent; otherwise attribution is null (and a sponsored draft on
 * the surface is INVALID, slot-unknown).
 */
function resolveSlotForSurface(surface: string): SlotState | null {
  const candidates: SlotState[] = [];
  for (const slotId of listAdsEntityIds(SLOTS_SUBDIR)) {
    const state = projectSlot(
      readAdsEvents(SLOTS_SUBDIR, SLOT_ENTITY_KIND, slotId),
    );
    if (state !== null && state.surface === surface && !state.retired) {
      candidates.push(state);
    }
  }
  if (candidates.length === 1) return candidates[0];
  const active = candidates.filter((s) => s.consentActive);
  if (active.length === 1) return active[0];
  return null;
}

interface DecisionRecord {
  decisionId: string | null;
  evaluatedAtMs: number;
  surface: string | null;
  slotId: string | null;
  campaignId: string | null;
  correlationId: string | null;
  eligible: boolean;
}

function normalizeDecision(raw: unknown): DecisionRecord | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const inner =
    typeof r.decision === "object" &&
    r.decision !== null &&
    !Array.isArray(r.decision)
      ? (r.decision as Record<string, unknown>)
      : r;
  let evaluatedAtMs: number | null = null;
  if (typeof inner.evaluatedAt === "number" && Number.isFinite(inner.evaluatedAt)) {
    evaluatedAtMs = inner.evaluatedAt;
  } else if (typeof inner.evaluatedAt === "string") {
    const parsed = Date.parse(inner.evaluatedAt);
    if (!Number.isNaN(parsed)) evaluatedAtMs = parsed;
  }
  if (evaluatedAtMs === null) return null;
  let eligible = false;
  const ev = inner.evaluation;
  if (typeof ev === "object" && ev !== null && !Array.isArray(ev)) {
    eligible = (ev as Record<string, unknown>).eligible === true;
  } else if (typeof ev === "string") {
    eligible = ev === "eligible";
  }
  const str = (v: unknown): string | null =>
    typeof v === "string" ? v : null;
  return {
    decisionId: str(inner.decisionId),
    evaluatedAtMs,
    surface: str(inner.surface),
    slotId: str(inner.slotId),
    campaignId: str(inner.campaignId),
    correlationId: str(inner.correlationId),
    eligible,
  };
}

/**
 * Read lane B3's placement-decision records (decisions/<decisionId>
 * .json, one object per file per the design data model; array files
 * and { decision: {...} } wrappers are tolerated). A missing
 * directory yields []; an unparseable file fails closed.
 */
function readDecisionRecords(): DecisionRecord[] {
  const dir = join(adsDir(), DECISIONS_SUBDIR);
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return [];
    throw err;
  }
  const out: DecisionRecord[] = [];
  for (const name of names.filter((n) => n.endsWith(".json")).sort()) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(join(dir, name), "utf8"));
    } catch {
      throw new LedgerCorruptError(
        DECISIONS_SUBDIR,
        out.length,
        "invalid-json in decision record " + name,
      );
    }
    const items = Array.isArray(parsed) ? parsed : [parsed];
    for (const item of items) {
      const rec = normalizeDecision(item);
      if (rec !== null) out.push(rec);
    }
  }
  return out;
}

/** An eligible decision covers an event per BUILD-LOG decision 6. */
function decisionCovers(
  decisions: readonly DecisionRecord[],
  input: {
    surface: string;
    slotId: string | null;
    campaignId: string;
    correlationId: string;
    occurredAt: number;
  },
): boolean {
  return decisions.some(
    (d) =>
      d.eligible &&
      d.campaignId === input.campaignId &&
      d.surface === input.surface &&
      (d.slotId === null ||
        (input.slotId !== null && d.slotId === input.slotId)) &&
      (d.correlationId === null || d.correlationId === input.correlationId) &&
      d.evaluatedAtMs <= input.occurredAt &&
      input.occurredAt <= d.evaluatedAtMs + LEDGER_DECISION_COVERAGE_MS,
  );
}

/* ------------------------------------------------------------------ */
/* Read API shapes                                                     */
/* ------------------------------------------------------------------ */

export interface LedgerReadFilter {
  /** Publisher view (slot attribution) OR advertiser view (payer). */
  tenantId?: string;
  campaignId?: string;
  slotId?: string;
  surface?: string;
  /** UTC day key (yyyymmdd) of server receivedAt. */
  day?: string;
}

export interface LedgerSummary {
  /** All rows matching the filter, any classification. */
  rows: number;
  /** COUNTED impression rows matching the filter. */
  impressions: number;
  /** COUNTED action (click) rows matching the filter. */
  clicks: number;
  /** Every row matching the filter, by classification. */
  byClassification: Record<LedgerClassification, number>;
}

export interface LedgerChainReport {
  ok: boolean;
  days: { day: string; rows: number; lastHash: string | null }[];
  failure?: { day: string; atRow: number; reason: string };
}

export interface LedgerRecountReport {
  /** True only when the chain verifies and both aggregations agree. */
  match: boolean;
  chainOk: boolean;
  failure?: { day: string; atRow: number; reason: string };
  rowsScanned: number;
  /** The read API's summary (null when the read path failed closed). */
  summary: LedgerSummary | null;
  /** Totals re-derived from the raw file text by the recount path. */
  recounted: LedgerSummary;
}

function emptyByClassification(): Record<LedgerClassification, number> {
  return {
    COUNTED: 0,
    SELF: 0,
    BOT: 0,
    DUPLICATE: 0,
    RATE_LIMITED: 0,
    INVALID: 0,
  };
}

function emptySummary(): LedgerSummary {
  return { rows: 0, impressions: 0, clicks: 0, byClassification: emptyByClassification() };
}

function rowMatchesFilter(row: LedgerEvent, filter: LedgerReadFilter): boolean {
  if (filter.day !== undefined && utcDayKey(row.receivedAt) !== filter.day) {
    return false;
  }
  if (
    filter.campaignId !== undefined &&
    row.sponsorship?.campaignId !== filter.campaignId
  ) {
    return false;
  }
  if (filter.slotId !== undefined && row.slotId !== filter.slotId) return false;
  if (filter.surface !== undefined && row.surface !== filter.surface) {
    return false;
  }
  if (
    filter.tenantId !== undefined &&
    row.publisherTenantId !== filter.tenantId &&
    row.sponsorship?.payerId !== filter.tenantId
  ) {
    return false;
  }
  return true;
}

function accumulate(summary: LedgerSummary, row: LedgerEvent): void {
  summary.rows += 1;
  summary.byClassification[row.classification] += 1;
  if (row.classification === "COUNTED") {
    if (isImpressionType(row.type)) summary.impressions += 1;
    else if (ACTION_EVENT_TYPES.has(row.type)) summary.clicks += 1;
  }
}

/* ------------------------------------------------------------------ */
/* The ledger                                                          */
/* ------------------------------------------------------------------ */

export class AdsEventLedger implements FydObjectEventAdapter {
  readonly authority = "canonical" as const;
  private readonly nowFn: () => number;

  constructor(options: AdsEventLedgerOptions = {}) {
    this.nowFn = options.now ?? (() => Date.now());
  }

  /**
   * The rank adapter's publish, bound. Validates shape, runs abuse
   * checks 1 to 6 in order, appends the classified row, and returns
   * the recorded receipt. Idempotent on dedupeKey: an identical
   * re-publish returns the original receipt and appends nothing.
   */
  async publish(
    draft: FydObjectEventDraft,
    ingest: LedgerIngestContext = {},
  ): Promise<{ status: "recorded"; receiptRef: string }> {
    const clean = validateDraft(draft);
    const receivedAt = this.nowFn();
    if (!Number.isFinite(receivedAt)) {
      throw new LedgerValidationError("Ledger clock returned a non-finite time.");
    }
    const day = utcDayKey(receivedAt);
    const rows = this.loadAllRows();
    const portion = draftPortionOf(clean);
    const scopeRef = viewerScopeRefOf(clean);
    const slot = resolveSlotForSurface(clean.surface);
    const campaign = clean.sponsorship
      ? loadCampaignState(clean.sponsorship.campaignId)
      : null;

    const append = (
      classification: LedgerClassification,
      reason: string,
    ): LedgerEvent =>
      this.appendRow({
        day,
        dayRowCount: rows.filter((r) => utcDayKey(r.receivedAt) === day).length,
        lastDayRowHash:
          rows.filter((r) => utcDayKey(r.receivedAt) === day).slice(-1)[0]
            ?.rowHash ?? "",
        draft: clean,
        slot,
        viewerScopeRef: scopeRef,
        receivedAt,
        classification,
        reason,
      });
    const recorded = (row: LedgerEvent): { status: "recorded"; receiptRef: string } => ({
      status: "recorded",
      receiptRef: row.receiptRef,
    });

    // Check 1: dedupe. Identical payload under the same key is an
    // idempotent retry; a different payload under the same key is a
    // tamper signal and is retained as a DUPLICATE row.
    const prior = rows.find((r) => r.dedupeKey === clean.dedupeKey);
    if (prior) {
      if (canonicalBytes(draftPortionOf(prior)) === canonicalBytes(portion)) {
        return { status: "recorded", receiptRef: prior.receiptRef };
      }
      return recorded(append("DUPLICATE", "dedupe-key-payload-mismatch"));
    }

    // Check 2: render-instance replay. At most one impression may
    // ever be recorded per rendered instance.
    if (
      isImpressionType(clean.type) &&
      clean.renderInstanceId.trim().length > 0 &&
      rows.some(
        (r) =>
          isImpressionType(r.type) &&
          r.renderInstanceId === clean.renderInstanceId,
      )
    ) {
      return recorded(append("DUPLICATE", "render-instance-replay"));
    }

    // Check 3: self-events. The actor tenant comes from the
    // server-resolved ingest context, never from the payload.
    const actorTenantId =
      typeof ingest.actorTenantId === "string" &&
      ingest.actorTenantId.trim().length > 0
        ? ingest.actorTenantId
        : null;
    if (actorTenantId !== null) {
      if (
        clean.sponsorship &&
        (actorTenantId === clean.sponsorship.payerId ||
          (campaign !== null && actorTenantId === campaign.payerId))
      ) {
        return recorded(append("SELF", "self-actor-payer"));
      }
      if (slot !== null && actorTenantId === slot.publisherTenantId) {
        return recorded(append("SELF", "self-actor-publisher"));
      }
    }

    // Check 4: bot heuristics.
    const ua = typeof ingest.userAgent === "string" ? ingest.userAgent : "";
    if (ua.trim().length === 0) {
      return recorded(append("BOT", "user-agent-missing"));
    }
    const uaLower = ua.toLowerCase();
    if (KNOWN_BOT_UA_SUBSTRINGS.some((s) => uaLower.includes(s))) {
      return recorded(append("BOT", "user-agent-known-bot"));
    }
    if (clean.renderInstanceId.trim().length === 0) {
      return recorded(append("BOT", "render-instance-missing"));
    }

    // Check 5: rate limits, over server receivedAt in the trailing
    // rate window. Appended rows of every classification count: the
    // limit is on drafts received, not on counted events.
    const windowStart = receivedAt - LEDGER_RATE_WINDOW_MS;
    const viewerKey = scopeRef ?? UNSCOPED_VIEWER_KEY;
    const viewerCount = rows.filter(
      (r) =>
        r.receivedAt > windowStart &&
        (r.viewerScopeRef ?? UNSCOPED_VIEWER_KEY) === viewerKey,
    ).length;
    if (viewerCount >= LEDGER_MAX_DRAFTS_PER_VIEWER_PER_WINDOW) {
      return recorded(append("RATE_LIMITED", "rate-limit-viewer"));
    }
    if (slot !== null) {
      const slotCount = rows.filter(
        (r) => r.receivedAt > windowStart && r.slotId === slot.slotId,
      ).length;
      if (slotCount >= LEDGER_MAX_DRAFTS_PER_SLOT_PER_WINDOW) {
        return recorded(append("RATE_LIMITED", "rate-limit-slot"));
      }
    }

    // Check 6: validity (references, consent, decision coverage,
    // impression evidence).
    const invalid = this.validityFailure(clean, campaign, slot);
    if (invalid !== null) {
      return recorded(append("INVALID", invalid));
    }

    return recorded(append("COUNTED", "counted"));
  }

  /** All rows matching the filter, chain-verified, in append order. */
  readRows(filter: LedgerReadFilter = {}): LedgerEvent[] {
    return this.loadAllRows().filter((r) => rowMatchesFilter(r, filter));
  }

  /** Aggregates over the filter. The dashboards' only totals source. */
  summarize(filter: LedgerReadFilter = {}): LedgerSummary {
    const summary = emptySummary();
    for (const row of this.loadAllRows()) {
      if (rowMatchesFilter(row, filter)) accumulate(summary, row);
    }
    return summary;
  }

  /** Counted impressions/clicks for one campaign on one UTC day. */
  countedTotalsByCampaign(
    campaignId: string,
    day: string,
  ): { impressions: number; clicks: number } {
    const s = this.summarize({ campaignId, day });
    return { impressions: s.impressions, clicks: s.clicks };
  }

  /** Counted impressions/clicks attributed to one slot. */
  countedTotalsBySlot(
    slotId: string,
    day?: string,
  ): { impressions: number; clicks: number } {
    const s = this.summarize(day ? { slotId, day } : { slotId });
    return { impressions: s.impressions, clicks: s.clicks };
  }

  /** Counted impressions/clicks on one surface. */
  countedTotalsBySurface(
    surface: string,
    day?: string,
  ): { impressions: number; clicks: number } {
    const s = this.summarize(day ? { surface, day } : { surface });
    return { impressions: s.impressions, clicks: s.clicks };
  }

  /** Every row (optionally one day), by classification. */
  totalsByClassification(
    day?: string,
  ): Record<LedgerClassification, number> {
    return this.summarize(day ? { day } : {}).byClassification;
  }

  /**
   * Lane B3's exposure-window query: COUNTED impressions of one
   * object on one surface for one viewer scope in the trailing
   * window ending at observedAt, in the rank contract's
   * ObjectExposureWindow shape. Windows run over server receivedAt.
   */
  exposureWindow(input: {
    objectId: string;
    surface: string;
    viewerScopeRef: string;
    observedAt: number;
    windowMs?: number;
  }): ObjectExposureWindow {
    const windowMs = input.windowMs ?? FREQUENCY_WINDOW_MS;
    const windowStartedAt = input.observedAt - windowMs;
    const impressions = this.loadAllRows().filter(
      (r) =>
        r.classification === "COUNTED" &&
        isImpressionType(r.type) &&
        r.objectId === input.objectId &&
        r.surface === input.surface &&
        r.viewerScopeRef === input.viewerScopeRef &&
        r.receivedAt > windowStartedAt &&
        r.receivedAt <= input.observedAt,
    ).length;
    return {
      objectId: input.objectId,
      surface: input.surface,
      viewerScopeRef: input.viewerScopeRef,
      windowStartedAt,
      observedAt: input.observedAt,
      impressions,
    };
  }

  /** Structural chain verification; reports instead of throwing. */
  verifyChain(day?: string): LedgerChainReport {
    const days = day !== undefined ? [day] : listLedgerDays();
    const report: LedgerChainReport = { ok: true, days: [] };
    for (const d of days) {
      const load = loadDay(d);
      report.days.push({
        day: d,
        rows: load.rows.length,
        lastHash:
          load.rows.length > 0
            ? load.rows[load.rows.length - 1].rowHash
            : null,
      });
      if (load.failure && report.failure === undefined) {
        report.ok = false;
        report.failure = {
          day: d,
          atRow: load.failure.atRow,
          reason: load.failure.reason,
        };
      }
    }
    return report;
  }

  /**
   * Reconciliation recount: re-derive the summary from the raw file
   * text with an independent aggregation path (raw lines, own chain
   * verification, own filter application) and compare it against the
   * read API's summarize. The dashboards render this as their stamp.
   */
  recount(filter: LedgerReadFilter = {}): LedgerRecountReport {
    const recounted = emptySummary();
    let rowsScanned = 0;
    let chainOk = true;
    let failure: LedgerRecountReport["failure"];
    for (const day of listLedgerDays()) {
      let raw: string;
      try {
        raw = readFileSync(dayFilePath(day), "utf8");
      } catch (err) {
        if ((err as NodeJS.ErrnoException)?.code === "ENOENT") continue;
        throw err;
      }
      const lines = raw.split("\n").filter((l) => l.trim().length > 0);
      let prevHash = "";
      for (let i = 0; i < lines.length; i++) {
        rowsScanned += 1;
        let parsed: LedgerEvent | null = null;
        try {
          const candidate: unknown = JSON.parse(lines[i]);
          if (isValidRowShape(candidate)) parsed = candidate;
        } catch {
          parsed = null;
        }
        if (
          parsed === null ||
          parsed.prevHash !== prevHash ||
          parsed.rowHash !== computeRowHash(rowBodyOf(parsed), prevHash)
        ) {
          chainOk = false;
          if (failure === undefined) {
            failure = { day, atRow: i, reason: "recount-chain-mismatch" };
          }
          break;
        }
        prevHash = parsed.rowHash;
        // Independent filter application (duplicated on purpose: the
        // recount must not share the read path's matching code).
        const dayOk =
          filter.day === undefined || utcDayKey(parsed.receivedAt) === filter.day;
        const campaignOk =
          filter.campaignId === undefined ||
          parsed.sponsorship?.campaignId === filter.campaignId;
        const slotOk = filter.slotId === undefined || parsed.slotId === filter.slotId;
        const surfaceOk =
          filter.surface === undefined || parsed.surface === filter.surface;
        const tenantOk =
          filter.tenantId === undefined ||
          parsed.publisherTenantId === filter.tenantId ||
          parsed.sponsorship?.payerId === filter.tenantId;
        if (dayOk && campaignOk && slotOk && surfaceOk && tenantOk) {
          accumulate(recounted, parsed);
        }
      }
      if (!chainOk) break;
    }
    let summary: LedgerSummary | null = null;
    try {
      summary = this.summarize(filter);
    } catch (err) {
      if (err instanceof LedgerCorruptError) {
        summary = null;
      } else {
        throw err;
      }
    }
    const match =
      chainOk &&
      summary !== null &&
      canonicalBytes(summary) === canonicalBytes(recounted);
    return {
      match,
      chainOk,
      ...(failure !== undefined ? { failure } : {}),
      rowsScanned,
      summary,
      recounted,
    };
  }

  /** Every row in every day file, chain-verified or a typed throw. */
  private loadAllRows(): LedgerEvent[] {
    const out: LedgerEvent[] = [];
    for (const day of listLedgerDays()) {
      const load = loadDay(day);
      if (load.failure) {
        throw new LedgerCorruptError(
          day,
          load.failure.atRow,
          load.failure.reason,
        );
      }
      out.push(...load.rows);
    }
    return out;
  }

  /** Abuse check 6. Returns the named INVALID reason, or null. */
  private validityFailure(
    clean: FydObjectEventDraft,
    campaign: CampaignState | null,
    slot: SlotState | null,
  ): string | null {
    if (isImpressionType(clean.type)) {
      if (clean.type === "FYD_SPONSORED_IMPRESSION" && !clean.sponsorship) {
        return "impression-sponsorship-shape";
      }
      if (clean.type === "FYD_OBJECT_IMPRESSION" && clean.sponsorship) {
        return "impression-sponsorship-shape";
      }
    }
    if (clean.sponsorship) {
      if (campaign === null) return "campaign-unknown";
      if (clean.sponsorship.payerId !== campaign.payerId) {
        return "payer-mismatch";
      }
      if (clean.objectId !== campaign.objectId) {
        return "campaign-object-mismatch";
      }
      if (campaign.status === "ended") return "campaign-ended";
      if (slot === null) return "slot-unknown";
      if (!slot.consentActive) {
        return slot.consent !== null && slot.consent.revokedAt !== null
          ? "consent-revoked"
          : "consent-inactive";
      }
      const decisions = readDecisionRecords();
      if (
        !decisionCovers(decisions, {
          surface: clean.surface,
          slotId: slot.slotId,
          campaignId: clean.sponsorship.campaignId,
          correlationId: clean.correlationId,
          occurredAt: clean.occurredAt,
        })
      ) {
        return "decision-not-covering";
      }
    }
    if (
      isImpressionType(clean.type) &&
      clean.dedupeKey !== expectedImpressionDedupeKey(clean)
    ) {
      return "impression-evidence-missing";
    }
    return null;
  }

  /** Form and append one row. The only write path in this module. */
  private appendRow(input: {
    day: string;
    dayRowCount: number;
    lastDayRowHash: string;
    draft: FydObjectEventDraft;
    slot: SlotState | null;
    viewerScopeRef: string | null;
    receivedAt: number;
    classification: LedgerClassification;
    reason: string;
  }): LedgerEvent {
    const receiptRef = "ads-receipt:" + input.day + ":" + input.dayRowCount;
    const row: LedgerEvent = {
      type: input.draft.type,
      objectId: input.draft.objectId,
      surface: input.draft.surface,
      correlationId: input.draft.correlationId,
      renderInstanceId: input.draft.renderInstanceId,
      occurredAt: input.draft.occurredAt,
      ...(input.draft.actor ? { actor: input.draft.actor } : {}),
      ...(input.draft.action ? { action: input.draft.action } : {}),
      ...(input.draft.sponsorship
        ? { sponsorship: input.draft.sponsorship }
        : {}),
      dedupeKey: input.draft.dedupeKey,
      slotId: input.slot ? input.slot.slotId : null,
      publisherTenantId: input.slot ? input.slot.publisherTenantId : null,
      viewerScopeRef: input.viewerScopeRef,
      receivedAt: input.receivedAt,
      receiptRef,
      classification: input.classification,
      classificationReason: input.reason,
      prevHash: input.lastDayRowHash,
      rowHash: "",
    };
    row.rowHash = computeRowHash(rowBodyOf(row), input.lastDayRowHash);
    mkdirSync(ledgerDirPath(), { recursive: true });
    appendFileSync(dayFilePath(input.day), JSON.stringify(row) + "\n", "utf8");
    return row;
  }
}

export function createAdsEventLedger(
  options: AdsEventLedgerOptions = {},
): AdsEventLedger {
  return new AdsEventLedger(options);
}
