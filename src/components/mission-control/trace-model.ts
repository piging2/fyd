import { safeEvidenceUrl, type MissionDetail, type MissionEvent, type LineageStage } from "./evidence-model";

type Data = Record<string, unknown>;
export type TraceSubject = "mission" | "event" | "result" | "object" | "field" | "relationship" | "resource";
export type TraceState = "OBSERVED" | "DERIVED" | "NOT_RETURNED";
export interface TraceNode { id: string; label: string; state: TraceState; identity: string | null; note: string; data?: unknown }
export interface TraceLink { from: string; to: string; basis: string }
export interface TraceRecord { subject: string; nodes: TraceNode[]; links: TraceLink[] }
const record = (v: unknown): Data => v && typeof v === "object" && !Array.isArray(v) ? v as Data : {};
const string = (v: unknown): string | null => typeof v === "string" && v.length ? v : null;
const rows = (v: unknown): Data[] => Array.isArray(v) ? v.map(record) : [];
const unavailable = (id: string, label: string, note: string): TraceNode => ({ id, label, state: "NOT_RETURNED", identity: null, note });

/** Projection membership is explicit; it never establishes a missing causal edge. */
export function traceMission(mission: MissionDetail, subject: "mission" | "event" | "result", event?: MissionEvent): TraceRecord {
  const nodes: TraceNode[] = [
    unavailable("source", "Source resource", "The mission route does not return an original source resource binding."),
    unavailable("observation", "Observation / initiating source record", "An originating observation or triggering principal is not returned."),
    { id: "mission", label: "Mission", state: "OBSERVED", identity: mission.mission_id, note: "Identity in the returned mission projection.", data: { mission_id: mission.mission_id, tenant: mission.tenant, capability: mission.capability } },
    mission.execution_id ? { id: "execution", label: "Execution", state: "OBSERVED", identity: mission.execution_id, note: "Execution reference returned on this mission.", data: { executor: mission.agent, execution_id: mission.execution_id } } : unavailable("execution", "Execution", "Execution identity not returned."),
  ];
  const links: TraceLink[] = mission.execution_id ? [{ from: "mission", to: "execution", basis: "mission.execution_id" }] : [];
  if (mission.evidence.length) {
    nodes.push({ id: "evidence", label: "Evidence references", state: "OBSERVED", identity: null, note: "References returned in this mission. Original observations are not inferred from these references.", data: mission.evidence });
    links.push({ from: "mission", to: "evidence", basis: "mission.evidence membership" });
  } else nodes.push(unavailable("evidence", "Evidence", "No evidence reference is returned."));
  if (event && mission.events.some(item => item.event_id === event.event_id)) {
    nodes.push({ id: "event", label: "Selected event", state: "OBSERVED", identity: event.event_id, note: "Sanitized event summary in this mission's returned event trail.", data: event });
    links.push({ from: "mission", to: "event", basis: "mission.events membership; causation is not returned" });
  } else nodes.push(unavailable("event", "Selected event", "No returned event is selected."));
  if (mission.result.outcome || mission.result.output_digest || mission.result.error) {
    nodes.push({ id: "result", label: "Result", state: "OBSERVED", identity: mission.result.output_digest, note: "Returned result. A digest is not a witness or replay receipt.", data: mission.result });
    links.push({ from: "mission", to: "result", basis: "mission.result" });
    if (event?.event_id === mission.status_event_id && nodes.some(node => node.id === "event" && node.state === "OBSERVED")) links.push({ from: "event", to: "result", basis: "mission.status_event_id identifies the selected terminal status event" });
  } else nodes.push(unavailable("result", "Result", "No result is returned."));
  nodes.push(unavailable("witness", "Witness / replay", "A correlated witness and replay receipt are not returned by the mission route."));
  return { subject: subject === "event" ? `Event ${event?.event_id ?? "not returned"}` : subject === "result" ? `Result of ${mission.mission_id}` : `Mission ${mission.mission_id}`, nodes, links };
}

export function traceObject(body: Data, subject: "object" | "field" | "relationship" | "resource", field?: string, relationship?: Data): TraceRecord {
  const trace = record(body.trace), obj = record(trace.object), evidence = record(trace.evidence);
  const fields = record(obj.fields), objectId = string(obj.id);
  const nodes: TraceNode[] = [{ id: "object", label: "Object", state: "OBSERVED", identity: objectId, note: "Returned tenant object, with its effective values.", data: obj }];
  const links: TraceLink[] = [];
  if (field && Object.hasOwn(fields, field)) {
    const bound = (Array.isArray(evidence.refs) && evidence.refs.length > 0) || !!evidence.fixtureSource || rows(evidence.journalEvidence).length > 0;
    nodes.push({ id: "field", label: "Rendered field / effective value", state: "OBSERVED", identity: field, note: `${bound ? "Object-level evidence available." : "Object provenance metadata returned; original evidence binding not returned."} Field-specific original evidence not returned.`, data: { field, value: fields[field] } });
    links.push({ from: "field", to: "object", basis: `trace.object.fields[${JSON.stringify(field)}]` });
    const correction = rows(record(trace.claims).ownerCorrections).find(c => c.field === field);
    if (correction) {
      nodes.push({ id: "correction", label: "Owner correction", state: "OBSERVED", identity: field, note: "Preserved source and owner values returned by the existing correction record. Producer/time are not inferred.", data: correction });
      links.push({ from: "field", to: "correction", basis: "trace.claims.ownerCorrections field equality" });
    }
  } else if (subject === "field" || subject === "resource") nodes.push(unavailable("field", "Selected field", "The selected field is not in the returned object fields."));
  const refs = Array.isArray(evidence.refs) ? evidence.refs.filter((r): r is string => typeof r === "string") : [];
  if (refs.length || evidence.fixtureSource || rows(evidence.journalEvidence).length) {
    nodes.push({ id: "evidence", label: "Object evidence", state: "OBSERVED", identity: refs[0] ?? null, note: "Object-level bindings from the returned trace, not per-field verification.", data: evidence });
    links.push({ from: "object", to: "evidence", basis: "trace.evidence" });
  } else nodes.push(unavailable("evidence", "Object evidence", string(evidence.unbound) ?? "No source evidence binding is returned."));
  const sourceValue = field ? fields[field] : fields.website;
  if (safeEvidenceUrl(sourceValue)) {
    nodes.push({ id: "source", label: "Source resource reference", state: "OBSERVED", identity: safeEvidenceUrl(sourceValue), note: "URL in the returned field. Fetch, observation and verification are not established by the URL.", data: { field: field ?? "website", url: sourceValue } });
    links.push({ from: field ? "field" : "object", to: "source", basis: `Returned object.fields.${field ?? "website"} value` });
  } else nodes.push(unavailable("source", "Source resource", "A retrievable source-resource reference is not returned for this subject."));
  const matched = relationship && rows(trace.relationships).find(r => (r.subject === objectId || r.object === objectId) && r.subject === relationship.subject && r.predicate === relationship.predicate && r.object === relationship.object);
  if (matched) {
    nodes.push({ id: "relationship", label: "Relationship assertion", state: "OBSERVED", identity: null, note: "Exact returned subject/predicate/object triple. No relationship ID or independent verification is invented.", data: matched });
    links.push({ from: "object", to: "relationship", basis: "Selected object is an endpoint of this returned triple" });
  } else if (subject === "relationship") nodes.push(unavailable("relationship", "Selected relationship", "The selected triple is not returned for this object. No connection is established."));
  nodes.push(unavailable("observation", "Original observation", "The current object trace does not expose a field-to-observation binding."));
  nodes.push(unavailable("mission", "Mission / execution / result", "A mission referencing this object is not returned; no mission connection is drawn."));
  return { subject: subject === "field" ? `Why this field: ${field}` : subject === "relationship" ? "Trace this relationship" : subject === "resource" ? `Source resource: ${field ?? "website"}` : `Object ${objectId ?? "not returned"}`, nodes, links };
}

export function traceStage(stage: LineageStage): TraceRecord {
  return { subject: `Lineage stage ${stage.stage}`, nodes: [{ id: "stage", label: stage.stage, state: stage.source === "UNKNOWN" || stage.source === "MOCK" ? "NOT_RETURNED" : stage.source === "DERIVED" ? "DERIVED" : "OBSERVED", identity: null, note: `${stage.source}: ${stage.note}`, data: stage.data }], links: [] };
}
