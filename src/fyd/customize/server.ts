/**
 * Lane D: server-side helpers for the customize API route. SERVER ONLY.
 *
 * loadCustomizedSite: projection -> generateSiteSpec -> apply the
 * presentation-intent layer. The proposal/approve path always reasons
 * over the CURRENT layered spec, so sequential customizations compose.
 *
 * emitOverlayEvent: appends a FYD_SITE_OVERLAY event to the FYD demo
 * journal (the repo-booted gateway; no auth on its event route). The
 * projection dump picks it up on the next regen. Demo-journal only;
 * nothing here touches the main deployment journal. FYD-037: the emit
 * pre-flights the journal's live-derived identity marker and fails closed
 * (typed WRONG_JOURNAL, zero POSTs) on mismatch or unreadable marker.
 */

import { createHash } from "node:crypto";
import { getPingObjectGraph } from "@/fyd/data/ping-object-source";
import { generateSiteSpec } from "@/fyd/proceduralize/generator";
import type { FYDSiteSpec, ObjectGraph } from "@/fyd/sitespec/types";
import { applyPresentationIntent } from "./apply-layer";
import type {
  PresentationIntentBlock,
  PresentationIntentDirective,
  PresentationIntentOverlayOp,
} from "./types";
import { UnknownOutcomeError } from "./write-boundary";

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
  unresolved: { intentId: string; reason: string }[];
}

function sha256Hex(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

export async function loadCustomizedSite(siteId: string): Promise<CustomizedSite> {
  const { graph, meta, presentationIntent } = await getPingObjectGraph(siteId);
  // generatedAt comes from the projection meta (stable per dump), never the
  // wall clock: the spec digest must be reproducible across calls.
  const base = generateSiteSpec(graph, { generatedAt: meta.generatedAt });
  const { canonicalize } = await import("@/lib/ping/ask-composer");
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

async function preflightJournal(): Promise<void> {
  const base = gatewayUrl()
    .replace(/\/events$/, "")
    .replace(/\/$/, "");
  let res: Response;
  try {
    res = await fetch(base + "/", { method: "GET" });
  } catch (e) {
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
}

export interface EmitOverlayResult {
  eventId: string;
  /** True when the gateway served a previously recorded event for this request_id. */
  deduped: boolean;
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
  const envelope: Record<string, unknown> = {
    event_type: "FYD_SITE_OVERLAY",
    aggregate_id: "fyd-site:" + siteId,
    aggregate_type: "fyd_site",
    event_data: { siteId, ops },
  };
  if (requestId) envelope.request_id = requestId;
  let res: Response;
  try {
    res = await fetch(gatewayUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(envelope),
      signal: controller.signal,
    });
  } catch (e) {
    // The request never reached the gateway (connection refused / DNS):
    // nothing was recorded, so the honest 502 path still applies.
    const cause = (e as { cause?: { code?: string } })?.cause;
    const code = typeof cause?.code === "string" ? cause.code : "";
    const preSend = ["ECONNREFUSED", "ENOTFOUND", "EHOSTUNREACH", "ENETUNREACH"].includes(code);
    if (preSend) {
      throw new Error("customize: demo gateway unreachable at " + gatewayUrl() + ": " + code);
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

export function buildDirective(
  siteId: string,
  siteIntent: PresentationIntentDirective["siteIntent"],
  proposal: PresentationIntentDirective["proposal"],
  approvedAt: string,
): PresentationIntentOverlayOp {
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
