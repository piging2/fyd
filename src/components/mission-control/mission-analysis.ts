import type { MissionDetail, MissionEvent, MissionSummary } from "./evidence-model";
const date = (value: string | null): number | null => { const parsed = value ? Date.parse(value) : NaN; return Number.isFinite(parsed) ? parsed : null; };

export function timestampOrder(events: MissionEvent[]): MissionEvent[] {
  return events.map((event, index) => ({ event, index, time: date(event.timestamp) })).sort((a, b) => a.time === null ? b.time === null ? a.index - b.index : 1 : b.time === null ? -1 : a.time - b.time || a.index - b.index).map(item => item.event);
}
export interface TimeInterval { label: string; from: MissionEvent | null; to: MissionEvent | null; milliseconds: number | null; missing: string[] }
export function explainMissionTime(mission: MissionDetail): TimeInterval[] {
  const unique = (type: string) => { const matches = mission.events.filter(event => event.event_type === type); return matches.length === 1 ? matches[0] : null; };
  const queued = unique("MC_RUN_QUEUED"), started = unique("MC_EXECUTION_STARTED");
  const terminal = mission.status_event_id ? mission.events.find(event => event.event_id === mission.status_event_id && /MC_RUN_(SUCCEEDED|FAILED|UNKNOWN)$/.test(event.event_type)) ?? null : (() => { const matches = mission.events.filter(event => /MC_RUN_(SUCCEEDED|FAILED|UNKNOWN)$/.test(event.event_type)); return matches.length === 1 ? matches[0] : null; })();
  const publications = timestampOrder(mission.events.filter(event => event.event_type === "MC_ARTIFACT_PUBLISHED" && date(event.timestamp) !== null));
  const resultRefs = mission.artifacts.filter(artifact => artifact.kind === "result" && artifact.event_id);
  const resultEvent = resultRefs.length === 1 ? mission.events.find(event => event.event_id === resultRefs[0].event_id && event.event_type === "MC_ARTIFACT_PUBLISHED") ?? null : null;
  const interval = (label: string, from: MissionEvent | null, to: MissionEvent | null, fromLabel: string, toLabel: string): TimeInterval => {
    const a = date(from?.timestamp ?? null), b = date(to?.timestamp ?? null);
    const missing = [...(!from ? [fromLabel] : a === null ? [`${fromLabel} timestamp`] : []), ...(!to ? [toLabel] : b === null ? [`${toLabel} timestamp`] : [])];
    if (a !== null && b !== null && b < a) missing.push("Non-reversed timestamp order");
    return { label, from, to, milliseconds: missing.length || a === null || b === null ? null : b - a, missing };
  };
  return [
    interval("Waiting: queued → execution start", queued, started, "One unambiguous MC_RUN_QUEUED event", "One unambiguous MC_EXECUTION_STARTED event"),
    interval("Running: execution start → terminal event", started, terminal, "One unambiguous MC_EXECUTION_STARTED event", "A selected or unambiguous terminal run event"),
    interval("Artifact publication event span", publications[0] ?? null, publications.at(-1) ?? null, "First timestamped MC_ARTIFACT_PUBLISHED", "Last timestamped MC_ARTIFACT_PUBLISHED"),
    interval("Result publication → terminal event", resultEvent, terminal, "Result artifact event_id bound to MC_ARTIFACT_PUBLISHED", "A selected or unambiguous terminal run event"),
  ];
}

export interface CohortFilter { status?: string; executor?: string; capability?: string; tenant?: string; from?: string; to?: string }
export const MISSING_DIMENSION = "\u0000not-returned";
export function selectCohort(missions: MissionSummary[], filter: CohortFilter): MissionSummary[] {
  const from = filter.from ? date(`${filter.from}Z`) : null, to = filter.to ? date(`${filter.to}Z`) : null;
  if ((filter.from && from === null) || (filter.to && to === null) || (from !== null && to !== null && to < from)) return [];
  return missions.filter(mission => {
    const matchesStatus = !filter.status || mission.status === filter.status || (filter.status === "FAILED_OR_DENIED" && ["FAILED", "DENIED"].includes(mission.status));
    const started = date(mission.started_at);
    const matches = (value: string | null, selected?: string) => !selected || (selected === MISSING_DIMENSION ? value === null : value === selected);
    return matchesStatus && matches(mission.agent, filter.executor) && matches(mission.capability, filter.capability) && matches(mission.tenant, filter.tenant) && ((from === null && to === null) || (started !== null && (from === null || started >= from) && (to === null || started <= to)));
  });
}
export interface FailureGroup { key: string; status: string; executor: string | null; capability: string | null; missions: MissionSummary[]; first: string | null; last: string | null }
export function groupFailures(missions: MissionSummary[]): FailureGroup[] {
  const groups = new Map<string, FailureGroup>();
  for (const mission of missions.filter(item => ["FAILED", "DENIED"].includes(item.status))) {
    const key = JSON.stringify([mission.status, mission.agent, mission.capability]);
    const group = groups.get(key) ?? { key, status: mission.status, executor: mission.agent, capability: mission.capability, missions: [], first: null, last: null };
    group.missions.push(mission); groups.set(key, group);
  }
  return [...groups.values()].map(group => {
    const starts = group.missions.flatMap(mission => { const time = date(mission.started_at); return time === null ? [] : [time]; }).sort((a, b) => a - b);
    return { ...group, first: starts.length ? new Date(starts[0]).toISOString() : null, last: starts.length ? new Date(starts.at(-1)!).toISOString() : null };
  }).sort((a, b) => b.missions.length - a.missions.length || a.key.localeCompare(b.key));
}
export interface CohortDimension { dimension: string; value: string; selected: number; baseline: number; selectedPercent: number | null; baselinePercent: number | null }
export function compareCohort(baseline: MissionSummary[], cohort: MissionSummary[]): CohortDimension[] {
  const fields = [["Executor", "agent"], ["Mission capability", "capability"], ["Status", "status"], ["Tenant", "tenant"]] as const;
  return fields.flatMap(([dimension, field]) => [...new Set(baseline.map(mission => mission[field] ?? "Not returned"))].sort().map(value => {
    const count = (data: MissionSummary[]) => data.filter(mission => (mission[field] ?? "Not returned") === value).length;
    const selected = count(cohort), total = count(baseline);
    return { dimension, value, selected, baseline: total, selectedPercent: cohort.length ? selected / cohort.length * 100 : null, baselinePercent: baseline.length ? total / baseline.length * 100 : null };
  }));
}
