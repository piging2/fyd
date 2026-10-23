import { safeEvidenceUrl } from "./evidence-model";
type Data = Record<string, unknown>;
const record = (v: unknown): Data => v && typeof v === "object" && !Array.isArray(v) ? v as Data : {};
const rows = (v: unknown): Data[] => Array.isArray(v) ? v.map(record) : [];
/** Only tabs backed by the existing reverse-trace response. */
export function objectViews(body: unknown): { id: string; label: string }[] {
  const trace = record(record(body).trace), obj = record(trace.object), evidence = record(trace.evidence);
  if (typeof obj.id !== "string") return [];
  const views = [{ id: "state", label: "State" }];
  const journal = rows(evidence.journalEvidence);
  if (evidence.fixtureSource || (Array.isArray(evidence.refs) && evidence.refs.length) || journal.length || safeEvidenceUrl(record(obj.fields).images)) views.push({ id: "evidence", label: "Evidence" });
  if (rows(trace.relationships).length) views.push({ id: "relationships", label: "Relationships" });
  if (rows(record(trace.claims).ownerCorrections).length || journal.some(entry => record(entry.lookup).found === true && Object.keys(record(record(entry.lookup).event)).length > 0)) views.push({ id: "history", label: "History" });
  return views;
}
