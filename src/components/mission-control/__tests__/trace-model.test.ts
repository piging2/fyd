import { normalizeMissionDetail } from "../evidence-model";
import { traceMission, traceObject } from "../trace-model";

test("mission trace draws only returned projection bindings, with missing causal source separated", () => {
  const mission = normalizeMissionDetail({ ok: true, mission: { mission_id: "m", execution_id: "x", result: { outcome: "completed" }, events: [{ event_id: "e", event_type: "MC_MISSION_CREATED" }] } })!;
  const trace = traceMission(mission, "event", mission.events[0]);
  expect(trace.links.map(l => [l.from, l.to])).toEqual([["mission", "execution"], ["mission", "event"], ["mission", "result"]]);
  expect(trace.nodes.find(n => n.id === "source")?.state).toBe("NOT_RETURNED");
  expect(trace.links.some(l => l.from === "source" || l.from === "observation")).toBe(false);
  expect(trace.links.some(l => l.from === "event" && l.to === "result")).toBe(false);
});
test("unbound object field does not become field evidence or a mission relationship", () => {
  const trace = traceObject({ trace: { object: { id: "o", fields: { phone: "123" } }, evidence: { provenanceKind: "website-derived", refs: [] } } }, "field", "phone");
  expect(trace.links).toEqual([{ from: "field", to: "object", basis: 'trace.object.fields["phone"]' }]);
  expect(trace.nodes.find(n => n.id === "field")?.note).toContain("Field-specific original evidence not returned");
  expect(trace.nodes.find(n => n.id === "mission")?.state).toBe("NOT_RETURNED");
});
test("owner corrections and exact triples retain returned data without inventing identities", () => {
  const relationship = { subject: "o", predicate: "offers", object: "s" };
  const body = { trace: { object: { id: "o", fields: { phone: "new" } }, claims: { ownerCorrections: [{ field: "phone", sourceValue: "old", ownerValue: "new" }] }, evidence: { refs: ["ping-event:e"] }, relationships: [relationship] } };
  expect(traceObject(body, "field", "phone").nodes.find(n => n.id === "correction")?.data).toEqual({ field: "phone", sourceValue: "old", ownerValue: "new" });
  const trace = traceObject(body, "relationship", undefined, relationship);
  expect(trace.nodes.find(n => n.id === "relationship")?.identity).toBeNull();
  const missing = traceObject(body, "relationship", undefined, { ...relationship, object: "wrong" });
  expect(missing.nodes.find(n => n.id === "relationship")?.state).toBe("NOT_RETURNED");
  expect(missing.links.some(l => l.to === "relationship")).toBe(false);
});
test("invalid field and event selections stay disconnected even if a terminal ID matches", () => {
  const object = traceObject({ trace: { object: { id: "o", fields: {} } } }, "field", "absent");
  expect(object.nodes.find(n => n.id === "field")?.state).toBe("NOT_RETURNED");
  expect(object.links).toEqual([]);
  const mission = normalizeMissionDetail({ ok: true, mission: { mission_id: "m", status_event_id: "e", result: { outcome: "completed" }, events: [] } })!;
  const foreign = { event_id: "e", event_type: "MC_RUN_SUCCEEDED", timestamp: null, summary: null };
  expect(traceMission(mission, "event", foreign).links.some(l => l.from === "event")).toBe(false);
});
