/**
 * Lane D: server-side helpers for the customize API route. SERVER ONLY.
 *
 * loadCustomizedSite: projection -> generateSiteSpec -> apply the
 * presentation-intent layer. The proposal/approve path always reasons
 * over the CURRENT layered spec, so sequential customizations compose.
 *
 * emitOverlayEvent: appends a FYD_SITE_OVERLAY event to the FYD demo
 * journal (the repo-booted gateway; Bearer <FYD_JOURNAL_WRITE_TOKEN> on
 * its event route since Mission K). The
 * projection dump picks it up on the next regen. Demo-journal only;
 * nothing here touches the main deployment journal. FYD-037: the emit
 * pre-flights the journal's live-derived identity marker and fails closed
 * (typed WRONG_JOURNAL, zero POSTs) on mismatch or unreadable marker.
 * Flaw D (100H-SOVEREIGN-DIRECTIVE): approved overlays carry a stale-state
 * guard precondition (opts.staleGuard); the base-state digest, the layered
 * digest (base + the journaled directive set re-read from the live journal),
 * proposal digests, and authority context are re-verified immediately before
 * the POST and a mismatch throws a typed StaleGuardError (STALE_APPROVAL /
 * PRECONDITION_CHANGED) with no execution and no write.
 */

import { sha256Hex } from "@/lib/ping/digest";
import { canonicalize } from "@/lib/ping/ask-composer";
import { getPingObjectGraph } from "@/fyd/data/ping-object-source";
import {
  getPingObjectReader,
  type FydJournalOverlay,
} from "@/lib/ping/ping-object-reader";
import { generateSiteSpec } from "@/fyd/proceduralize/generator";
import type { FYDSiteSpec, ObjectGraph } from "@/fyd/sitespec/types";
import { applyPresentationIntent, type AppliedDirective } from "./apply-layer";
import type {
  PresentationIntentBlock,
  PresentationIntentDirective,
  PresentationIntentOverlayOp,
  SetPresentationIntentOp,
} from "./types";
import { UnknownOutcomeError } from "./write-boundary";
import { TENANT_ID_PATTERN } from "../tenant/tenant-context";
import { readFileSync } from "node:fs";

export interface CustomizedSite {
  siteId: string;
  graph: ObjectGraph;
  /** Spec as rendered: base compiled spec + approved presentation intents. */
  spec: FYDSiteSpec;
  /** Digest of the base compiled spec (before the intent layer). */
  baseSpecDigest: string;
  /** Digest of the layered spec the owner reviews and approves against. */
  specDigest: string;
  presentationIntent: PresentationIntentBlock | null;
  appliedIntentIds: string[];
  /** Applied directives in journal order, each carrying its review card. */
  applied: AppliedDirective[];
  unresolved: { intentId: string; reason: string }[];
}


export async function loadCustomizedSite(siteId: string): Promise<CustomizedSite> {
  const { graph, meta, presentationIntent } = await getPingObjectGraph(siteId);
  // generatedAt comes from the projection meta (stable per dump), never the
  // wall clock: the spec digest must be reproducible across calls.
  const base = generateSiteSpec(graph, { generatedAt: meta.generatedAt });
  const baseSpecDigest = sha256Hex(canonicalize(base));
  const layered = applyPresentationIntent(base, presentationIntent, graph);
  const specDigest = sha256Hex(canonicalize(layered.spec));
  return {
    siteId,
    graph,
    spec: layered.spec,
    baseSpecDigest,
    specDigest,
    presentationIntent,
    appliedIntentIds: layered.applied.map((a) => a.intentId),
    applied: layered.applied,
    unresolved: layered.unresolved,
  };
}

/** Deterministic directive id: "pi-" + sha256(siteId + proposalDigest)[0:16]. */
export function directiveIdFor(siteId: string, proposalDigest: string): string {
  return "pi-" + sha256Hex(siteId + "|" + proposalDigest).slice(0, 16);
}

function gatewayUrl(): string {
  return process.env.FYD_CUSTOMIZE_GATEWAY_URL ?? "http://127.0.0.1:18199/events";
}

/**
 * K2 (2026-09-27): trusted-writer credential for the FYD demo journal
 * gateway. Mission K's patch requires `Authorization: Bearer
 * <FYD_JOURNAL_WRITE_TOKEN>` on POST /events (verified timing-safe before
 * body parsing; the gateway fails closed with 503 when no token is
 * configured server-side).
 *
 * Read at CALL TIME (never cached, never logged): a rotated token file is
 * picked up by the running :3100 server without a restart. Resolution:
 *   1. FYD_JOURNAL_WRITE_TOKEN env (explicit override, e.g. tests);
 *   2. FYD_JOURNAL_WRITE_TOKEN_FILE, else ~/.config/ping/fyd-journal-write-token.
 * Returns null when no credential is available; the gateway then refuses the
 * write (503 write_auth_not_configured) and emitOverlayEvent surfaces its
 * typed rejection below.
 */
function gatewayWriteToken(): string | null {
  const fromEnv = process.env.FYD_JOURNAL_WRITE_TOKEN;
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
  const file =
    process.env.FYD_JOURNAL_WRITE_TOKEN_FILE ||
    (home ? home + "/.config/ping/fyd-journal-write-token" : "");
  if (!file) return null;
  try {
    const t = readFileSync(file, "utf8").trim();
    return t.length > 0 ? t : null;
  } catch {
    return null;
  }
}

/**
 * FYD-037: journal identity. The FYD demo journal asserts a live-derived
 * identity marker on GET / ({"journal": "fyd-demo-journal@<derived>"}).
 * This pre-flight runs before any POST: the asserted marker must match
 * EXPECTED_OVERLAY_JOURNAL_MARKER (the derived suffix after "@" may vary),
 * otherwise the emit throws a typed WRONG_JOURNAL error and no POST is
 * attempted. A misconfigured FYD_CUSTOMIZE_GATEWAY_URL can never silently
 * write an FYD overlay into the wrong journal. No hostname/port/DB-URL
 * matching: identity comes from the journal's own assertion.
 */
const EXPECTED_OVERLAY_JOURNAL_MARKER =
  process.env.FYD_EXPECTED_OVERLAY_JOURNAL ?? "fyd-demo-journal";

function journalMarkerOk(asserted: unknown, expected: string): boolean {
  return (
    typeof asserted === "string" &&
    (asserted === expected || asserted.startsWith(expected + "@"))
  );
}

/**
 * Connection-level failures (nothing answered): there is no journal to
 * misidentify, so these are NOT WRONG_JOURNAL. Returns the errno code, or
 * null when the failure happened after bytes were sent.
 */
function isPreSendError(e: unknown): string | null {
  const code = (e as { cause?: { code?: string } })?.cause?.code;
  return typeof code === "string" &&
    ["ECONNREFUSED", "ENOTFOUND", "EHOSTUNREACH", "ENETUNREACH"].includes(code)
    ? code
    : null;
}

async function preflightJournal(): Promise<void> {
  const base = gatewayUrl()
    .replace(/\/events$/, "")
    .replace(/\/$/, "");
  let res: Response;
  try {
    res = await fetch(base + "/", { method: "GET" });
  } catch (e) {
    const preSend = isPreSendError(e);
    if (preSend) {
      // Nothing listened: the honest error is "unreachable". WRONG_JOURNAL
      // means a journal answered with the wrong identity marker.
      throw new Error("customize: demo gateway unreachable at " + base + "/: " + preSend);
    }
    throw new Error(
      "customize: WRONG_JOURNAL: journal identity unreadable at " + base + "/: " +
        (e instanceof Error ? e.message : String(e)),
    );
  }
  let doc: unknown;
  try {
    doc = await res.json();
  } catch {
    throw new Error(
      "customize: WRONG_JOURNAL: journal identity unreadable at " + base + "/ (non-JSON)",
    );
  }
  const asserted =
    doc && typeof doc === "object"
      ? (doc as Record<string, unknown>)["journal"]
      : null;
  if (!journalMarkerOk(asserted, EXPECTED_OVERLAY_JOURNAL_MARKER)) {
    throw new Error(
      "customize: WRONG_JOURNAL: expected overlay journal marker " +
        JSON.stringify(EXPECTED_OVERLAY_JOURNAL_MARKER) + " at " + base + "/, got " +
        JSON.stringify(asserted ?? null),
    );
  }
}

/**
 * Emit one FYD_SITE_OVERLAY event carrying presentation-intent ops to the
 * FYD demo journal. Returns the accepted event_id and whether the gateway
 * served a previously recorded event for this request_id. Throws on
 * rejection: an unrecorded approval is never reported as recorded.
 *
 * Write-boundary P0 failure semantics:
 *  - Gateway unreachable BEFORE any POST: throws the existing
 *    "customize: demo gateway unreachable" error. Nothing was recorded;
 *    safe to say so (the honest 502 path).
 *  - POST sent but the response lost, timed out, or unusable: throws
 *    UnknownOutcomeError. The effect MAY have been recorded. Callers must
 *    surface UNKNOWN and retry with the same requestId; the gateway
 *    dedupes on request_id so the retry converges on the original event.
 *    Timeout never means failed.
 */
export interface EmitOverlayOpts {
  /** Idempotency key, forwarded to the gateway for dedupe. */
  requestId?: string;
  /** POST timeout in ms. On timeout the outcome is UNKNOWN, never failed. */
  timeoutMs?: number;
  /**
   * Flaw D (100H-SOVEREIGN-DIRECTIVE) stale-state guard precondition,
   * captured at approval time. When present, the guard re-verifies the
   * base-state digest, the layered digest (base + the journaled directive
   * set re-read from the live journal), proposal digests, and authority
   * context immediately before the journal POST and throws a typed
   * StaleGuardError (STALE_APPROVAL / PRECONDITION_CHANGED) with NO write
   * on mismatch. Omit only for emits that carry no approval (none exist on
   * this path today; clear actions deliberately stay unguarded and
   * documented).
   */
  staleGuard?: StaleGuardPrecondition;
  /**
   * Test-only injection for the stale guard's base-state read. Production
   * callers must not set this: the default (loadCustomizedSite) reads the
   * exact base bytes the overlay applies over.
   */
  staleGuardReadBaseState?: StaleGuardBaseReader;
  /**
   * Test-only injection for the stale guard's live-journal directive read
   * (H2). Production callers must not set this: the default re-reads the
   * journaled directive set from the journal gateway via the governed
   * reader (the shared source of truth; the projection dump regen and the
   * journal gateway are separate processes that never take the Next.js
   * in-process lock).
   */
  staleGuardReadJournal?: StaleGuardJournalReader;
}

export interface EmitOverlayResult {
  eventId: string;
  /** True when the gateway served a previously recorded event for this request_id. */
  deduped: boolean;
}

/**
 * H2 (2026-09-27): layered drift key.
 *
 * One journaled presentation-intent directive, reduced to its
 * drift-relevant identity. The layered spec is a deterministic function of
 * (base compiled spec, ordered directive set), so a digest over this pair
 * covers the layered spec without re-running the apply layer.
 */
export interface JournaledDirectiveRef {
  intentId: string;
  proposalDigest: string;
  approvedBy: string;
  approvedAt: string;
  /** Journal event that recorded the directive ("" when unknown, e.g. older dumps). */
  eventId: string;
}

/**
 * Reduce a projection presentationIntent block to its directive refs, in
 * block order (the dump emits directives in journal-event order). Derive
 * time uses this: the approval was granted against the projection state
 * the owner reviewed.
 */
export function directiveRefsFromBlock(
  block: PresentationIntentBlock | null,
): JournaledDirectiveRef[] {
  if (!block) return [];
  return block.directives.map((d) => ({
    intentId: d.intentId,
    proposalDigest: d.proposal.proposalDigest,
    approvedBy: d.approval.approvedBy,
    approvedAt: d.approval.approvedAt,
    eventId: d.approval.eventId ?? "",
  }));
}

/**
 * Reduce live journal overlays to the journaled directive ref list, in
 * journal order. Mirrors the accumulation semantics of applyTenantOverlays
 * (src/fyd/data/fyd-tenant-graph.ts): set upserts by intentId with a
 * re-approved intent moving to the end (newest journal event wins
 * downstream); clear removes the intent. Non-intent op kinds (set_field,
 * add_object, ...) are not directives: they move the base graph, which
 * baseSpecDigest already covers.
 */
export function directiveRefsFromJournal(
  overlays: FydJournalOverlay[],
): JournaledDirectiveRef[] {
  const refs: JournaledDirectiveRef[] = [];
  const s = (v: unknown): string => (typeof v === "string" ? v : "");
  for (const overlay of overlays) {
    const eid = s(overlay.eventId);
    const ops = Array.isArray(overlay.ops) ? overlay.ops : [];
    for (const rawOp of ops) {
      if (typeof rawOp !== "object" || rawOp === null || Array.isArray(rawOp)) {
        continue;
      }
      const op = rawOp as Record<string, unknown>;
      if (op.op === "set_presentation_intent") {
        const intentId = s(op.intentId);
        if (!intentId) continue;
        const proposal = (op.proposal ?? {}) as Record<string, unknown>;
        const approval = (op.approval ?? {}) as Record<string, unknown>;
        const idx = refs.findIndex((r) => r.intentId === intentId);
        if (idx >= 0) refs.splice(idx, 1);
        refs.push({
          intentId,
          proposalDigest: s(proposal.proposalDigest),
          approvedBy: s(approval.approvedBy),
          approvedAt: s(approval.approvedAt),
          eventId: eid,
        });
      } else if (op.op === "clear_presentation_intent") {
        const intentId = s(op.intentId);
        if (!intentId) continue;
        for (let i = refs.length - 1; i >= 0; i--) {
          if (refs[i].intentId === intentId) refs.splice(i, 1);
        }
      }
    }
  }
  return refs;
}

/**
 * The layered drift key: sha256 over the canonicalized pair
 * (baseSpecDigest, ordered directive refs). Array order is preserved by
 * canonicalize: journal order is significant (a re-approval moving an
 * intent to the end changes the layered state even when the set of
 * intentIds is unchanged).
 */
export function layeredSpecDigest(
  baseSpecDigest: string,
  refs: JournaledDirectiveRef[],
): string {
  return sha256Hex(canonicalize({ baseSpecDigest, directives: refs }));
}

/** Reads the live journaled directive set for a site, in journal order. */
export type StaleGuardJournalReader = (
  siteId: string,
) => Promise<JournaledDirectiveRef[]>;

/**
 * Default journal reader: the governed PingObjectReader
 * (queryFydSiteOverlays), i.e. the journal gateway, the shared source of
 * truth. Never the cached projection.
 */
async function readJournalDirectiveRefs(
  siteId: string,
): Promise<JournaledDirectiveRef[]> {
  const overlays = await getPingObjectReader().queryFydSiteOverlays(siteId);
  return directiveRefsFromJournal(overlays);
}

/**
 * Flaw D (100H-SOVEREIGN-DIRECTIVE) stale-state guard.
 *
 * An approval is granted against a layered state S (base compiled spec +
 * the journaled directive set in journal order). Execution must verify the
 * relevant precondition state still matches S; if relevant state drifted:
 * STALE_APPROVAL / PRECONDITION_CHANGED -> NO EXECUTION. An approved
 * mutation is never silently rebased.
 *
 * The drift key is the LAYERED digest: sha256 over the canonicalized pair
 * (baseSpecDigest, journaled directive refs in journal order).
 * baseSpecDigest alone is not enough: the overlay applies over base + the
 * directive set accumulated from ALL journaled FYD_SITE_OVERLAY ops
 * (applyTenantOverlays accumulates in journal order; ops resolve targets
 * against the current compiled spec at apply time), so a concurrent
 * approve/clear landing between derive and execute changes the layered
 * spec the owner approved against without moving the base.
 *
 * Rationale reversal (H2, 2026-09-27, Falsifier-H): the old docstring held
 * that a second, independent approval landing first "must not
 * false-positive" because it does not move the base. That is wrong: the
 * owner reviewed THIS op against the OLD layered state, so a second
 * approval landing first is a TRUE positive. Refuse (or re-derive); never
 * silently rebase.
 *
 * The directive refs are re-read from the LIVE journal at execute time
 * (the shared source of truth), never from a cached projection: the
 * projection dump regen and the journal gateway are separate processes
 * that never take the Next.js in-process lock, so cross-process journal
 * movement is invisible to a projection re-read.
 *
 * The composed layered specDigest (what the owner reviewed) is recorded
 * for evidence alongside the drift key.
 */
export interface StaleGuardAuthority {
  approvedBy: string;
  approvedAt?: string;
}

export interface StaleGuardPrecondition {
  /** Base-state digest the approval was granted against. */
  baseSpecDigest: string;
  /**
   * H2 layered drift key: sha256 over the canonicalized pair
   * (baseSpecDigest, journaled directive refs in journal order). Covers
   * the layered spec the owner approved against: a concurrent approve or
   * clear between derive and execute changes the ref list and trips
   * STALE_APPROVAL. When absent the layered check is skipped (legacy
   * callers); the production approve path always sets it.
   */
  layeredSpecDigest?: string;
  /** Layered spec digest the owner reviewed (evidence only, not the drift key). */
  specDigest?: string;
  /**
   * Expected proposal digest per set_presentation_intent op, in op order.
   * Guards against silent rebasing: the executed op must carry exactly the
   * approved proposal digest.
   */
  proposalDigests?: string[];
  /** Authority context the approval was granted under. */
  authority?: StaleGuardAuthority;
}

/** Reads the current base-state digests for a site. */
export type StaleGuardBaseReader = (siteId: string) => Promise<{
  baseSpecDigest: string;
  specDigest: string;
}>;

/** Typed stale-guard failure. Thrown BEFORE any journal POST: no execution, no write. */
export class StaleGuardError extends Error {
  readonly code: "STALE_APPROVAL" | "PRECONDITION_CHANGED";
  constructor(code: "STALE_APPROVAL" | "PRECONDITION_CHANGED", detail: string) {
    super(
      "customize: " + code + ": " + detail +
        " Nothing was executed; no journal write was attempted.",
    );
    this.name = "StaleGuardError";
    this.code = code;
  }
}

/**
 * Re-verify the approval precondition against CURRENT state. Call
 * immediately before the journal write: the caller must not await anything
 * between this verification and the POST.
 *
 * Checks, in order:
 *  1. current baseSpecDigest === expected baseSpecDigest, else STALE_APPROVAL;
 *  2. H2: when expected.layeredSpecDigest is set, recompute the layered
 *     digest from the current base digest + the directive set re-read from
 *     the LIVE journal and compare, else STALE_APPROVAL (a concurrent
 *     approve/clear between derive and execute moved the layered state the
 *     owner approved against);
 *  3. per set_presentation_intent op: op.proposal.proposalDigest and
 *     op.approval.proposalDigest === the expected approved digest, else
 *     PRECONDITION_CHANGED (never silently rebase);
 *  4. per set_presentation_intent op: op.approval.approvedBy ===
 *     expected authority (and op.approval.approvedAt ===
 *     expected.authority.approvedAt when the precondition carries it),
 *     else PRECONDITION_CHANGED (authority context cannot be swapped
 *     under the approval; carried fields are always checked, never
 *     decorative).
 *
 * clear_presentation_intent ops carry no proposal: only the base-state and
 * layered checks apply to them.
 *
 * The journal re-read fails closed: a journal read failure throws (no
 * silent skip), so the write is refused whenever the layered precondition
 * cannot be verified.
 */
export async function verifyStaleGuard(
  siteId: string,
  ops: PresentationIntentOverlayOp[],
  expected: StaleGuardPrecondition,
  readBaseState: StaleGuardBaseReader = (sid) => loadCustomizedSite(sid),
  readJournal: StaleGuardJournalReader = (sid) => readJournalDirectiveRefs(sid),
): Promise<{ baseSpecDigest: string; specDigest: string }> {
  const current = await readBaseState(siteId);
  if (current.baseSpecDigest !== expected.baseSpecDigest) {
    throw new StaleGuardError(
      "STALE_APPROVAL",
      "base state moved since approval (expected base " +
        expected.baseSpecDigest.slice(0, 16) + "..., current " +
        current.baseSpecDigest.slice(0, 16) + "...).",
    );
  }
  if (expected.layeredSpecDigest !== undefined) {
    // H2: the layered state is base + the journaled directive set. Re-read
    // the directive set from the LIVE journal (the shared source of
    // truth), never from a cached projection: the projection dump regen
    // and the journal gateway are separate processes that never take the
    // Next.js in-process lock, so cross-process journal movement is
    // invisible to a projection re-read.
    const journalRefs = await readJournal(siteId);
    const currentLayered = layeredSpecDigest(current.baseSpecDigest, journalRefs);
    if (currentLayered !== expected.layeredSpecDigest) {
      throw new StaleGuardError(
        "STALE_APPROVAL",
        "journaled directive set moved since approval (an approve or clear " +
          "landed between approval and execution; expected layered " +
          expected.layeredSpecDigest.slice(0, 16) + "..., current " +
          currentLayered.slice(0, 16) + "...).",
      );
    }
  }
  const setOps = ops.filter(
    (o): o is SetPresentationIntentOp => o.op === "set_presentation_intent",
  );
  if (expected.proposalDigests) {
    if (expected.proposalDigests.length !== setOps.length) {
      throw new StaleGuardError(
        "PRECONDITION_CHANGED",
        "approved op count changed since approval (expected " +
          expected.proposalDigests.length + " set ops, executing " +
          setOps.length + ").",
      );
    }
    for (let i = 0; i < setOps.length; i++) {
      const want = expected.proposalDigests[i];
      const op = setOps[i];
      if (op.proposal.proposalDigest !== want || op.approval.proposalDigest !== want) {
        throw new StaleGuardError(
          "PRECONDITION_CHANGED",
          "op " + i + " (" + op.intentId + ") no longer carries the approved " +
            "proposal digest; refusing to silently rebase an approved mutation.",
        );
      }
    }
  }
  if (expected.authority) {
    for (const op of setOps) {
      if (op.approval.approvedBy !== expected.authority.approvedBy) {
        throw new StaleGuardError(
          "PRECONDITION_CHANGED",
          "op " + op.intentId + " authority context changed since approval " +
            "(expected " + JSON.stringify(expected.authority.approvedBy) +
            ", got " + JSON.stringify(op.approval.approvedBy) + ").",
        );
      }
      // H2: approvedAt is carried in the authority precondition, so it is
      // checked too (a carried-but-unchecked field is a lie about what the
      // guard verifies). Absent approvedAt keeps the old behavior.
      if (
        expected.authority.approvedAt !== undefined &&
        op.approval.approvedAt !== expected.authority.approvedAt
      ) {
        throw new StaleGuardError(
          "PRECONDITION_CHANGED",
          "op " + op.intentId + " approval timestamp changed since approval " +
            "(expected " + JSON.stringify(expected.authority.approvedAt) +
            ", got " + JSON.stringify(op.approval.approvedAt) + ").",
        );
      }
    }
  }
  return current;
}

export async function emitOverlayEvent(
  siteId: string,
  ops: PresentationIntentOverlayOp[],
  opts: EmitOverlayOpts = {},
): Promise<EmitOverlayResult> {
  await preflightJournal(); // FYD-037: fail closed before any POST.
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const requestId = opts.requestId;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // Tenant identity is immutable on the envelope: in this runtime the
  // tenant id IS the site id. The journal gateway re-validates it on
  // append (tenant_id vs aggregate_id vs event_data.siteId).
  if (!TENANT_ID_PATTERN.test(siteId)) {
    throw new Error(
      "customize: refusing to emit overlay for invalid site id " + JSON.stringify(siteId),
    );
  }
  if (opts.staleGuard) {
    // Flaw D (+H2): re-verify the approval precondition against current
    // state immediately before the write: base digest, then the layered
    // digest (base + the directive set re-read from the LIVE journal via
    // the governed reader), then proposal digests and authority. No awaits
    // between this check and the POST below, so the event loop cannot
    // interleave a change in between. Residual risk past the POST (state
    // moves after the event is appended, before the next projection
    // regen) belongs to the projection/reconciler layer, which this guard
    // does not own.
    await verifyStaleGuard(
      siteId,
      ops,
      opts.staleGuard,
      opts.staleGuardReadBaseState,
      opts.staleGuardReadJournal,
    );
  }
  const envelope: Record<string, unknown> = {
    event_type: "FYD_SITE_OVERLAY",
    tenant_id: siteId,
    aggregate_id: "fyd-site:" + siteId,
    aggregate_type: "fyd_site",
    event_data: { siteId, ops },
  };
  if (requestId) envelope.request_id = requestId;
  let res: Response;
  try {
    const writeToken = gatewayWriteToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (writeToken) headers["Authorization"] = "Bearer " + writeToken;
    res = await fetch(gatewayUrl(), {
      method: "POST",
      headers,
      body: JSON.stringify(envelope),
      signal: controller.signal,
    });
  } catch (e) {
    // The request never reached the gateway (connection refused / DNS):
    // nothing was recorded, so the honest 502 path still applies.
    const preSend = isPreSendError(e);
    if (preSend) {
      throw new Error("customize: demo gateway unreachable at " + gatewayUrl() + ": " + preSend);
    }
    // Anything else (abort/timeout, socket destroyed mid-flight): the POST
    // may have been recorded. UNKNOWN, never failed.
    const tag =
      e instanceof Error && e.name === "AbortError"
        ? "timeout after " + timeoutMs + "ms"
        : "network error: " + (e instanceof Error ? e.message : String(e));
    throw new UnknownOutcomeError(requestId ?? "unknown", tag);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      "customize: demo gateway rejected the overlay event (" + res.status + "): " + text.slice(0, 300),
    );
  }
  let doc: unknown;
  try {
    doc = await res.json();
  } catch {
    // The gateway appends before responding: a 200 with an unreadable body
    // most likely recorded the event. UNKNOWN, not failure.
    throw new UnknownOutcomeError(
      requestId ?? "unknown",
      "gateway returned non-JSON on event emit",
    );
  }
  const eid =
    doc && typeof doc === "object"
      ? ((doc as Record<string, unknown>)["event_id"] ??
        (doc as Record<string, unknown>)["id"])
      : null;
  if (typeof eid !== "string" || eid.length === 0) {
    // Accepted (HTTP 200) but no usable event_id: UNKNOWN, not failure.
    // Retry with the same request_id converges via gateway dedupe.
    throw new UnknownOutcomeError(
      requestId ?? "unknown",
      "gateway accepted the event but returned no event_id",
    );
  }
  const deduped =
    doc !== null &&
    typeof doc === "object" &&
    (doc as Record<string, unknown>)["deduped"] === true;
  return { eventId: eid, deduped };
}

/**
 * Readiness probe for /readyz: the journal gateway is reachable and its
 * live-derived identity marker matches. Never throws.
 */
export async function journalReadiness(): Promise<{ ready: boolean; reason?: string }> {
  try {
    await preflightJournal();
    return { ready: true };
  } catch (e) {
    return { ready: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Build the set_presentation_intent overlay op for an approved directive.
 *
 * Digest law (see the DIGEST LAW note on PresentationIntentOverlayOp in
 * ./types.ts): approval.proposalDigest is copied verbatim from
 * proposal.proposalDigest, which MUST be the TS overlay-canonicalizer
 * digest (src/fyd/proceduralize/patch.ts) over the overlay-format
 * SitePatchBody. It is never the MC approval digest; the MC digest is
 * cited in approval.note prose only.
 */
export function buildDirective(
  siteId: string,
  siteIntent: PresentationIntentDirective["siteIntent"],
  proposal: PresentationIntentDirective["proposal"],
  approvedAt: string,
): SetPresentationIntentOp {
  return {
    op: "set_presentation_intent",
    intentId: directiveIdFor(siteId, proposal.proposalDigest),
    siteIntent,
    proposal,
    approval: {
      proposalDigest: proposal.proposalDigest,
      approvedBy: "demo-owner (seeded, unverified)",
      approvedAt,
      note: "DEMO OWNER MODE - not real authentication. No identity was verified.",
    },
  };
}
