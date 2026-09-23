/**
 * FYD tenant graph read (server-only).
 *
 * The authorized read seam between PING state and the FYD ask/bundle lane.
 * Every Ask FYD graph read flows:
 *
 *   FYD -> PingObjectReader.queryFydSiteOverlays -> sanitized overlay ops
 *       -> fixture base graph (rebuildable projection input)
 *       -> deterministic overlay composition
 *       -> digest verification at both layers -> ObjectGraph
 *
 * This module NEVER reads:
 * - dump.py projection JSON on disk (no FYD_PROJECTION_DIR, no fs reads),
 * - Postgres (no direct reads, no second canonical object store),
 * - raw canonical journal envelopes (only sanitized op payloads cross the
 *   PingObjectReader boundary).
 *
 * Freshness: the graph is rebuilt from fixture + journal on every call.
 * There is deliberately no cache: Ask FYD re-reads on every serve, so a
 * newly journaled overlay is visible to the next question immediately.
 *
 * Tenant scoping: the site id is validated against the pinned tenant
 * registry here AND enforced inside the reader (queryFydSiteOverlays
 * filters by siteId at the authority), so a call can never observe another
 * tenant's overlays.
 *
 * Provenance vocabulary is unchanged from the dump-era contract:
 * - fixture objects keep their original provenance (procedural-fixture),
 * - overlay-added objects get { kind: "canonical-journal", ref:
 *   "ping-event:<event_id>" },
 * - overlay-touched objects accumulate "ping-event:<event_id>" in
 *   provenance.updatedRefs.
 *
 * Overlay op validation is a faithful port of the dump.py overlay engine
 * (tools/fyd-site-projection/dump.py :: apply_overlays): the same op kinds,
 * the same strictness, the same fail-closed behavior on malformed ops.
 * Moving the engine here changes WHERE the journal is read (governed
 * reader instead of a Postgres query in a script), not WHAT the journal
 * means.
 */

import { createHash } from "node:crypto";
import { canonicalize } from "@/lib/ping/ask-composer";
import {
  getPingObjectReader,
  type FydJournalOverlay,
  type PingObjectReader,
} from "@/lib/ping/ping-object-reader";
import type { ObjectGraph } from "@/fyd/sitespec/types";
import type { PingObject, PingRelationship } from "@/lib/ping/types";
import type {
  PresentationIntentBlock,
  PresentationIntentDirective,
} from "@/fyd/customize/types";
import { HAPPY_PLACE_GRAPH } from "@/fyd/proceduralize/__fixtures__/happy-place-graph";
import { COPPERSMITH_GRAPH } from "@/fyd/proceduralize/__fixtures__/coppersmith-graph";

/** Typed failure for the tenant graph seam. The ask lane maps every code to projection_unavailable. */
export class FydTenantGraphError extends Error {
  readonly code:
    | "unknown_tenant"
    | "base_digest_mismatch"
    | "overlay_malformed"
    | "reader_failed";
  constructor(
    code: FydTenantGraphError["code"],
    message: string,
    opts?: { cause?: unknown },
  ) {
    super(`fyd-tenant-graph[${code}]: ${message}`, opts);
    this.name = "FydTenantGraphError";
    this.code = code;
  }
}

export interface FydTenantGraphMeta {
  siteId: string;
  /** sha256 of the canonicalized fixture base graph (pre-overlay). */
  baseDigest: string;
  /** sha256 of the canonicalized composed graph (post-overlay). */
  graphDigest: string;
  /** Journal overlay event ids applied, in journal order. */
  eventIds: string[];
  /** Fixed per-tenant generation stamp carried from the dump-era meta. */
  generatedAt: string;
  /** Fixed per-tenant journal sequence window from the dump-era meta. */
  eventSequences: [number, number] | null;
}

export interface FydTenantGraph {
  graph: ObjectGraph;
  /** Overlay-authored presentation intents; null when the journal added none. */
  presentationIntent: PresentationIntentBlock | null;
  meta: FydTenantGraphMeta;
}

/**
 * Pinned tenant registry: fixture base graph + the base digest the dump
 * recorded. The digest pins the base the ask lane serves: if the fixture
 * module changes, the read fails closed instead of silently serving a
 * different base.
 */
const FYD_TENANT_PINS = {
  "happy-place": {
    graph: HAPPY_PLACE_GRAPH,
    baseDigest:
      "eacaa6113180f2cf601e7d592f10dfa1a783da25c8e0f86004d5922e65510679",
    generatedAt: "2026-09-21T12:00:00.000Z",
    eventSequences: [65, 83] as [number, number],
  },
  "coppersmith-plumbing": {
    graph: COPPERSMITH_GRAPH,
    baseDigest:
      "8eaf11fc761a49ff51e52844ac610c993f43b7443c173e3b2d7d6f73f3cc5d8b",
    generatedAt: "2026-09-21T12:01:10.844Z",
    eventSequences: null,
  },
} as const;

export type FydTenantId = keyof typeof FYD_TENANT_PINS;

/** Site ids the authorized tenant graph seam can serve. */
export function getFydTenantIds(): string[] {
  return Object.keys(FYD_TENANT_PINS);
}

function sha256Hex(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isStr(v: unknown): v is string {
  return typeof v === "string";
}

function isNonEmptyStr(v: unknown): v is string {
  return isStr(v) && v.length > 0;
}

/**
 * Reader override for tests: anything with the one overlay method.
 * Production always uses the governed reader from getPingObjectReader().
 */
export type FydOverlayReader = Pick<PingObjectReader, "queryFydSiteOverlays">;

export interface GetFydTenantGraphOpts {
  reader?: FydOverlayReader;
}

/**
 * Read the tenant graph through the authorized seam: pinned fixture base
 * + journal overlays via the governed PingObjectReader.
 *
 * Throws FydTenantGraphError on unknown tenant, base digest mismatch,
 * malformed overlay ops, or reader failure. Never returns a partial or
 * unverified graph.
 */
export async function getFydTenantGraph(
  siteId: string,
  opts?: GetFydTenantGraphOpts,
): Promise<FydTenantGraph> {
  const pin = (FYD_TENANT_PINS as Record<string, (typeof FYD_TENANT_PINS)[FydTenantId] | undefined>)[siteId];
  if (!pin) {
    throw new FydTenantGraphError("unknown_tenant", `unknown FYD tenant "${siteId}"`);
  }

  // Deep-clone the pinned fixture: overlay application mutates, and the
  // module-level fixture must never be polluted across reads.
  const base = structuredClone(pin.graph) as ObjectGraph;

  const baseDigest = sha256Hex(canonicalize(base));
  if (baseDigest !== pin.baseDigest) {
    throw new FydTenantGraphError(
      "base_digest_mismatch",
      `fixture base digest mismatch for "${siteId}" (expected ${pin.baseDigest.slice(0, 12)}..., got ${baseDigest.slice(0, 12)}...)`,
    );
  }

  const reader = opts?.reader ?? getPingObjectReader();
  let overlays: FydJournalOverlay[];
  try {
    overlays = await reader.queryFydSiteOverlays(siteId);
  } catch (err) {
    throw new FydTenantGraphError(
      "reader_failed",
      `overlay read failed for "${siteId}": ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }

  const { eventIds, directives } = applyTenantOverlays(base, overlays);

  return {
    graph: base,
    presentationIntent: buildPresentationIntentBlock(directives, eventIds),
    meta: {
      siteId,
      baseDigest,
      graphDigest: sha256Hex(canonicalize(base)),
      eventIds,
      generatedAt: pin.generatedAt,
      eventSequences: pin.eventSequences,
    },
  };
}

function buildPresentationIntentBlock(
  directives: PresentationIntentDirective[],
  eventIds: string[],
): PresentationIntentBlock | null {
  if (directives.length === 0) return null;
  return {
    directives,
    provenance: {
      kind: "owner-presentation-intent",
      note:
        "Owner-approved presentation intents (PRESENTATION INTENT " +
        "layer). Not source facts; re-applied over the base graph on " +
        "every read. Journaled via FYD_SITE_OVERLAY events.",
      eventIds,
    },
  };
}

/**
 * Deterministic overlay application, ported op-for-op from the dump.py
 * overlay engine. Unknown or malformed ops abort the whole read (fail
 * closed): a tenant graph with partially applied corrections is never
 * served.
 */
function applyTenantOverlays(
  graph: ObjectGraph,
  overlays: FydJournalOverlay[],
): { eventIds: string[]; directives: PresentationIntentDirective[] } {
  const objects = new Map<string, PingObject>();
  for (const o of graph.objects) objects.set(o.id, o);
  const relIds = new Set<string>(graph.relationships.map((r) => r.id));
  const eventIds: string[] = [];
  const directives: PresentationIntentDirective[] = [];

  const malformed = (eid: string, op: unknown, why: string): FydTenantGraphError =>
    new FydTenantGraphError(
      "overlay_malformed",
      `overlay ${eid}: ${why} ${JSON.stringify(op)?.slice(0, 200)}`,
    );

  const touch = (o: PingObject, eid: string) => {
    const refs = (o.provenance.updatedRefs ??= []);
    const ref = `ping-event:${eid}`;
    if (!refs.includes(ref)) refs.push(ref);
  };

  for (const overlay of overlays) {
    const eid = overlay.eventId;
    const ops = overlay.ops;
    if (!Array.isArray(ops)) {
      throw new FydTenantGraphError("overlay_malformed", `overlay ${eid}: ops is not a list`);
    }
    for (const rawOp of ops) {
      const op = isRecord(rawOp) ? rawOp : null;
      const kind = op && isStr(op.op) ? op.op : null;
      switch (kind) {
        case "set_field": {
          const oid = op!.objectId;
          const field = op!.field;
          const value = op!.value;
          const target = isStr(oid) ? objects.get(oid) : undefined;
          const valueOk =
            isStr(value) || (Array.isArray(value) && value.every(isStr));
          if (!target || !isStr(field) || !valueOk) {
            throw malformed(eid, rawOp, "bad set_field");
          }
          if (field === "title" || field === "description") {
            if (!isStr(value)) throw malformed(eid, rawOp, "bad set_field");
            target[field] = value;
          } else {
            target.fields[field] = value as string | string[];
          }
          touch(target, eid);
          break;
        }
        case "add_object": {
          const o = op!.object;
          if (!isRecord(o) || !isStr(o.id) || objects.has(o.id)) {
            throw malformed(eid, rawOp, "bad add_object");
          }
          const added = structuredClone(o) as unknown as PingObject;
          added.provenance = {
            kind: "canonical-journal",
            ref: `ping-event:${eid}`,
            derivedAt: overlay.timestamp,
          };
          objects.set(added.id, added);
          graph.objects.push(added);
          break;
        }
        case "add_relationship": {
          const r = op!.relationship;
          if (!isRecord(r) || !isStr(r.id) || relIds.has(r.id)) {
            throw malformed(eid, rawOp, "bad add_relationship");
          }
          const added = structuredClone(r) as unknown as PingRelationship;
          added.evidenceRef = `ping-event:${eid}`;
          relIds.add(added.id);
          graph.relationships.push(added);
          break;
        }
        case "deactivate_object": {
          const oid = op!.objectId;
          const target = isStr(oid) ? objects.get(oid) : undefined;
          if (!target) throw malformed(eid, rawOp, "bad deactivate_object");
          target.visibility = "private";
          touch(target, eid);
          break;
        }
        case "set_presentation_intent": {
          const intentId = op!.intentId;
          const siteIntent = op!.siteIntent;
          const proposal = op!.proposal;
          const approval = op!.approval;
          const ok =
            isNonEmptyStr(intentId) &&
            isRecord(siteIntent) &&
            isStr(siteIntent.kind) &&
            isRecord(proposal) &&
            isNonEmptyStr(proposal.proposalDigest) &&
            isRecord(approval) &&
            ["proposalDigest", "approvedBy", "approvedAt", "note"].every((k) =>
              isNonEmptyStr(approval[k]),
            ) &&
            (approval as Record<string, unknown>).proposalDigest ===
              proposal.proposalDigest &&
            ((approval as Record<string, unknown>).note as string).includes(
              "DEMO OWNER MODE",
            );
          if (!ok) throw malformed(eid, rawOp, "bad set_presentation_intent");
          const a = approval as Record<string, string>;
          const p = proposal as unknown as PresentationIntentDirective["proposal"];
          const directive: PresentationIntentDirective = {
            intentId,
            siteIntent: siteIntent as unknown as PresentationIntentDirective["siteIntent"],
            proposal: p,
            approval: {
              proposalDigest: a.proposalDigest,
              approvedBy: a.approvedBy,
              approvedAt: a.approvedAt,
              note: a.note,
              eventId: eid,
            },
          };
          const idx = directives.findIndex((d) => d.intentId === intentId);
          if (idx >= 0) directives[idx] = directive;
          else directives.push(directive);
          break;
        }
        case "clear_presentation_intent": {
          const intentId = op!.intentId;
          if (!isNonEmptyStr(intentId)) {
            throw malformed(eid, rawOp, "bad clear_presentation_intent");
          }
          for (let i = directives.length - 1; i >= 0; i--) {
            if (directives[i].intentId === intentId) directives.splice(i, 1);
          }
          break;
        }
        default:
          throw malformed(eid, rawOp, `unknown op kind ${JSON.stringify(kind)}`);
      }
    }
    eventIds.push(eid);
  }

  return { eventIds, directives };
}
