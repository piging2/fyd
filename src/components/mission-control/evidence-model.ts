/** Client-side views of the existing MC read contracts. This module grants no authority. */
export type MissionStatus = "CREATED" | "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "UNKNOWN" | "DENIED";
export type EvidenceTone = "neutral" | "active" | "success" | "warning" | "danger";
export interface MissionSummary {
  mission_id: string;
  run_id: string | null;
  execution_id: string | null;
  status: MissionStatus;
  agent: string | null;
  tenant: string | null;
  capability: string | null;
  work_order_id: string | null;
  started_at: string | null;
  ended_at: string | null;
  reconciliation_state: string | null;
  artifact_count: number;
  event_count: number;
}
export interface MissionEvent {
  event_id: string;
  event_type: string;
  timestamp: string | null;
  summary: string | null;
}
export interface MissionArtifact {
  kind: string;
  path: string;
  sha256: string | null;
  event_id: string | null;
  /** File availability as reported by the projection; never cryptographic verification. */
  present: boolean | null;
}
export interface MissionDetail extends MissionSummary {
  status_event_id: string | null;
  context_pack_id: string | null;
  capabilities_granted: string[];
  result: { outcome: string | null; output_digest: string | null; output_chars: number | null; error: string | null };
  events: MissionEvent[];
  artifacts: MissionArtifact[];
  evidence: Record<string, unknown>[];
}
export type LineageSource = "LIVE" | "PROJECTED" | "DERIVED" | "MOCK" | "UNKNOWN";
export interface LineageStage { stage: string; source: LineageSource; note: string; data: unknown }

const statuses = new Set<MissionStatus>(["CREATED", "QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "UNKNOWN", "DENIED"]);
const sources = new Set<LineageSource>(["LIVE", "PROJECTED", "DERIVED", "MOCK", "UNKNOWN"]);
const record = (v: unknown): Record<string, unknown> | null => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
const text = (v: unknown): string | null => typeof v === "string" && v.trim() ? v : null;
const count = (v: unknown): number => typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
const records = (v: unknown): Record<string, unknown>[] => Array.isArray(v) ? v.map(record).filter((x): x is Record<string, unknown> => x !== null) : [];

function summary(value: unknown): MissionSummary | null {
  const row = record(value);
  const id = text(row?.mission_id);
  if (!row || !id) return null;
  return {
    mission_id: id, run_id: text(row.run_id), execution_id: text(row.execution_id),
    status: statuses.has(row.status as MissionStatus) ? row.status as MissionStatus : "UNKNOWN",
    agent: text(row.agent), tenant: text(row.tenant), capability: text(row.capability),
    work_order_id: text(row.work_order_id), started_at: text(row.started_at), ended_at: text(row.ended_at),
    reconciliation_state: text(row.reconciliation_state), artifact_count: count(row.artifact_count), event_count: count(row.event_count),
  };
}

/** Accept only the successful list response; a degraded/error payload is not an empty success. */
export function normalizeMissionList(value: unknown): MissionSummary[] {
  const body = record(value);
  if (body?.ok !== true) return [];
  return records(body.missions).map(summary).filter((x): x is MissionSummary => x !== null);
}

export function normalizeMissionDetail(value: unknown): MissionDetail | null {
  const body = record(value);
  if (body?.ok !== true) return null;
  const row = record(body.mission);
  const base = summary(row);
  if (!row || !base) return null;
  const result = record(row.result);
  const events = records(row.events).flatMap((e): MissionEvent[] => {
    const id = text(e.event_id), type = text(e.event_type);
    return id && type ? [{ event_id: id, event_type: type, timestamp: text(e.timestamp), summary: text(e.summary) }] : [];
  });
  const artifacts = records(row.artifacts).flatMap((a): MissionArtifact[] => {
    const path = text(a.path);
    return path ? [{ kind: text(a.kind) ?? "artifact", path, sha256: text(a.sha256), event_id: text(a.event_id), present: typeof a.present === "boolean" ? a.present : null }] : [];
  });
  return {
    ...base, event_count: events.length, artifact_count: artifacts.length,
    status_event_id: text(row.status_event_id), context_pack_id: text(row.context_pack_id),
    capabilities_granted: Array.isArray(row.capabilities_granted) ? row.capabilities_granted.filter((x): x is string => typeof x === "string") : [],
    result: { outcome: text(result?.outcome), output_digest: text(result?.output_digest), output_chars: typeof result?.output_chars === "number" && Number.isFinite(result.output_chars) && result.output_chars >= 0 ? result.output_chars : null, error: text(result?.error) },
    events, artifacts, evidence: records(row.evidence),
  };
}

export function normalizeLineage(value: unknown): LineageStage[] {
  const body = record(value);
  if (body?.ok !== true) return [];
  return records(body.spine).flatMap((s): LineageStage[] => {
    const name = text(s.stage);
    return name ? [{ stage: name, source: sources.has(s.source as LineageSource) ? s.source as LineageSource : "UNKNOWN", note: text(s.note) ?? "No source explanation recorded.", data: s.data ?? null }] : [];
  });
}

/** Execution outcome colors do not imply evidence verification. */
export function missionTone(status: string): EvidenceTone {
  if (status === "RUNNING" || status === "QUEUED") return "active";
  if (status === "SUCCEEDED") return "success";
  if (status === "FAILED" || status === "DENIED") return "danger";
  if (status === "UNKNOWN") return "warning";
  return "neutral";
}

/** Only measured terminal duration; never manufacture a live timer from an uncertain timestamp. */
export function missionElapsedMs(mission: Pick<MissionSummary, "started_at" | "ended_at">): number | null {
  if (!mission.started_at || !mission.ended_at) return null;
  const elapsed = Date.parse(mission.ended_at) - Date.parse(mission.started_at);
  return Number.isFinite(elapsed) && elapsed >= 0 ? elapsed : null;
}

export function filterMissions(missions: MissionSummary[], query: string, status?: string): MissionSummary[] {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return missions.filter((m) => (!status || status === "ALL" || m.status === status || (status === "FAILED_OR_DENIED" && ["FAILED", "DENIED"].includes(m.status))) && terms.every((term) => [m.mission_id, m.agent, m.tenant, m.capability, m.run_id, m.execution_id].some((v) => v?.toLowerCase().includes(term))));
}

const eventLabels: Record<string, string> = {
  MC_MISSION_CREATED: "Mission created", MC_RUN_QUEUED: "Run queued", MC_EXECUTION_STARTED: "Execution started",
  MC_AGENT_AUTHORIZED: "Agent authorized", MC_AGENT_DENIED: "Agent denied", MC_ARTIFACT_PUBLISHED: "Artifact recorded",
  MC_RUN_SUCCEEDED: "Run succeeded", MC_RUN_FAILED: "Run failed", MC_RUN_UNKNOWN: "Run outcome unknown",
};
export interface TimelineEntry extends MissionEvent { label: string; tone: EvidenceTone; elapsed_ms: number | null }
/** Keep journal order (including equal timestamps), not a synthesized lifecycle. */
export function buildMissionTimeline(mission: MissionDetail): TimelineEntry[] {
  const start = mission.started_at ? Date.parse(mission.started_at) : NaN;
  return mission.events.map((event) => {
    const elapsed = event.timestamp ? Date.parse(event.timestamp) - start : NaN;
    const tone: EvidenceTone = /FAILED|DENIED/.test(event.event_type) ? "danger" : /UNKNOWN/.test(event.event_type) ? "warning" : "neutral";
    return { ...event, label: eventLabels[event.event_type] ?? event.event_type, tone, elapsed_ms: Number.isFinite(elapsed) && elapsed >= 0 ? elapsed : null };
  });
}

export interface FieldDifference { path: string; kind: "added" | "removed" | "changed"; before: unknown; after: unknown }
/** Structural field comparison. Array order is significant, object key order is not. */
export function compareFields(before: unknown, after: unknown): FieldDifference[] {
  const changes: FieldDifference[] = [];
  function visit(a: unknown, b: unknown, path: string): void {
    if (Object.is(a, b)) return;
    const ao = record(a), bo = record(b);
    if (ao && bo) {
      for (const key of [...new Set([...Object.keys(ao), ...Object.keys(bo)])].sort()) {
        const next = `${path}/${key.replace(/~/g, "~0").replace(/\//g, "~1")}`;
        if (!Object.prototype.hasOwnProperty.call(bo, key)) changes.push({ path: next, kind: "removed", before: ao[key], after: undefined });
        else if (!Object.prototype.hasOwnProperty.call(ao, key)) changes.push({ path: next, kind: "added", before: undefined, after: bo[key] });
        else visit(ao[key], bo[key], next);
      }
      return;
    }
    if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
      a.forEach((item, i) => visit(item, b[i], `${path}/${i}`));
      return;
    }
    changes.push({ path: path || "/", kind: "changed", before: a, after: b });
  }
  visit(before, after, "");
  return changes;
}

/** Only browser-retrievable source references become links; disk paths are evidence text. */
export function safeEvidenceUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; }
}
