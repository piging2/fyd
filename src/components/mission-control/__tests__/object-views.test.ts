import { objectViews } from "../object-views";
const body = (trace: Record<string, unknown>) => ({ trace: { object: { id: "object-a", fields: {} }, ...trace } });
test("omits unsupported and missing-data object tabs", () => {
  expect(objectViews(null)).toEqual([]);
  expect(objectViews(body({ evidence: { provenanceKind: "unbound", unbound: "UNKNOWN" } })).map(v => v.id)).toEqual(["state"]);
});
test("shows evidence references without treating a failed lookup as history", () => {
  expect(objectViews(body({ evidence: { refs: ["ping-event:missing"], journalEvidence: [{ lookup: { found: false } }] } })).map(v => v.id)).toEqual(["state", "evidence"]);
});
test("shows only relationships and history backed by returned records", () => {
  expect(objectViews(body({ evidence: { fixtureSource: "pinned fixture" }, relationships: [{ subject: "object-a", predicate: "has", object: "b" }], claims: { ownerCorrections: [{ field: "name" }] } })).map(v => v.id)).toEqual(["state", "evidence", "relationships", "history"]);
  expect(objectViews(body({ evidence: { journalEvidence: [{ lookup: { found: true, event: { event_id: "event-a" } } }] } })).map(v => v.id)).toEqual(["state", "evidence", "history"]);
});
test("source media requires a safe returned URL", () => {
  expect(objectViews(body({ object: { id: "a", fields: { images: "file:///private/image.png" } } })).map(v => v.id)).toEqual(["state"]);
  expect(objectViews(body({ object: { id: "a", fields: { images: "https://example.test/image.png" } } })).map(v => v.id)).toEqual(["state", "evidence"]);
});
