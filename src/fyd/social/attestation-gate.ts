/**
 * Failure-honesty attestation gate (absorbed C4 pattern). SERVER ONLY.
 *
 * Every social action attests its named evidence preconditions FIRST: the
 * journal must actually carry the claimed relationship state before the
 * action reports success. Missing evidence -> ATTESTATION_REJECTED with the
 * missing evidence named, and success is never reported. Explicit null is
 * not evidence. This is the executable form of the law: a failed follow can
 * never report success, and missing evidence never becomes healthy.
 */

import { fydGatewayBaseUrl } from "./config";
import { asSequence } from "./readers";

export interface JournalRelationshipRow {
  event_id: string;
  sequence: number | null;
  relationship_id: string;
  subject: string;
  predicate: string;
  object: string;
  status: string;
  created_at: string;
}

export type Attestation =
  | { attested: true; relationshipId: string; eventId: string; sequence: number | null }
  | { attested: false; reason: "ATTESTATION_REJECTED"; missing: string[] };

async function readRelationshipJournalRows(): Promise<JournalRelationshipRow[]> {
  const res = await fetch(
    `${fydGatewayBaseUrl()}/events/RELATIONSHIP_CREATED?limit=1000`,
    { cache: "no-store" },
  );
  if (!res.ok) {
    throw new Error(`journal read failed: HTTP ${res.status}`);
  }
  const body = (await res.json()) as { events?: unknown[] };
  const events = Array.isArray(body.events) ? body.events : [];
  const rows: JournalRelationshipRow[] = [];
  for (const e of events) {
    const ev = e as Record<string, unknown>;
    const p = (ev.payload || {}) as Record<string, unknown>;
    if (
      typeof p.subject !== "string" ||
      typeof p.predicate !== "string" ||
      typeof p.object !== "string"
    ) {
      continue;
    }
    rows.push({
      event_id: String(ev.event_id || ""),
      sequence: asSequence(ev.sequence),
      relationship_id: String(p.relationship_id || ""),
      subject: p.subject,
      predicate: p.predicate,
      object: p.object,
      status: typeof p.status === "string" ? p.status : "active",
      created_at: String(ev.created_at || ev.timestamp || ""),
    });
  }
  return rows;
}

/**
 * Attest that the journal's latest state for (subject, predicate, object)
 * equals wantStatus. Preconditions are named and checked in order; the first
 * failure rejects the attestation with the missing evidence named.
 */
export async function attestRelationshipState(input: {  subject: string;
  predicate: string;
  object: string;
  wantStatus: "active" | "inactive";
  /** For a fresh write, the submitted event must be the latest row. */
  expectEventId?: string;
}): Promise<Attestation> {
  const missing: string[] = [];
  let rows: JournalRelationshipRow[];
  try {
    rows = await readRelationshipJournalRows();
  } catch {
    return {
      attested: false,
      reason: "ATTESTATION_REJECTED",
      missing: ["journal:RELATIONSHIP_CREATED (read failed)"],
    };
  }

  const matching = rows.filter(
    (r) =>
      r.subject === input.subject &&
      r.predicate === input.predicate &&
      r.object === input.object,
  );
  if (matching.length === 0) {
    missing.push(
      `journal_row:RELATIONSHIP_CREATED(subject=${input.subject},predicate=${input.predicate},object=${input.object})`,
    );
    return { attested: false, reason: "ATTESTATION_REJECTED", missing };
  }

  // Latest-wins by (sequence, created_at, event_id), mirroring the projector.
  matching.sort((a, b) => {
    const sa = a.sequence ?? -1;
    const sb = b.sequence ?? -1;
    if (sa !== sb) return sb - sa;
    if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1;
    return a.event_id < b.event_id ? 1 : -1;
  });
  const latest = matching[0];

  if (latest.status !== input.wantStatus) {
    missing.push(
      `journal_row_status:${input.wantStatus} (latest is ${latest.status}, event ${latest.event_id})`,
    );
    return { attested: false, reason: "ATTESTATION_REJECTED", missing };
  }

  if (input.expectEventId && latest.event_id !== input.expectEventId) {
    missing.push(
      `journal_latest_event:${input.expectEventId} (latest is ${latest.event_id})`,
    );
    return { attested: false, reason: "ATTESTATION_REJECTED", missing };
  }

  return {
    attested: true,
    relationshipId: latest.relationship_id,
    eventId: latest.event_id,
    sequence: latest.sequence,
  };
}

/**
 * Attest that a submitted OBJECT_CREATED actually landed in the journal.
 * Same failure-honesty contract: missing evidence -> ATTESTATION_REJECTED
 * with the missing evidence named; success is never reported otherwise.
 */
export async function attestObjectCreated(input: {
  eventId: string;
  schema: string;
  controller: string;
}): Promise<
  | { attested: true; objectId: string; eventId: string; sequence: number | null }
  | { attested: false; reason: "ATTESTATION_REJECTED"; missing: string[] }
> {
  const res = await fetch(`${fydGatewayBaseUrl()}/events/OBJECT_CREATED?limit=1000`, {
    cache: "no-store",
  });
  if (!res.ok) {
    return {
      attested: false,
      reason: "ATTESTATION_REJECTED",
      missing: ["journal:OBJECT_CREATED (read failed)"],
    };
  }
  const body = (await res.json()) as { events?: unknown[] };
  const events = Array.isArray(body.events) ? body.events : [];
  const hit = events
    .map((e) => e as Record<string, unknown>)
    .find((e) => String(e.event_id || "") === input.eventId);
  if (!hit) {
    return {
      attested: false,
      reason: "ATTESTATION_REJECTED",
      missing: [`journal_row:OBJECT_CREATED(event_id=${input.eventId})`],
    };
  }
  const p = (hit.payload || {}) as Record<string, unknown>;
  const missing: string[] = [];
  if (p.schema !== input.schema) {
    missing.push(`journal_row_schema:${input.schema} (found ${String(p.schema)})`);
  }
  if (p.controller !== input.controller) {
    missing.push(
      `journal_row_controller:${input.controller} (found ${String(p.controller)})`,
    );
  }
  if (missing.length > 0) {
    return { attested: false, reason: "ATTESTATION_REJECTED", missing };
  }
  return {
    attested: true,
    objectId: String(p.object_id || ""),
    eventId: String(hit.event_id || ""),
    sequence: asSequence(hit.sequence),
  };
}
