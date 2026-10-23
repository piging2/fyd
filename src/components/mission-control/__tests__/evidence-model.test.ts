import { buildMissionTimeline, compareFields, filterMissions, missionElapsedMs, normalizeLineage, normalizeMissionDetail, normalizeMissionList, safeEvidenceUrl } from "../evidence-model";

// Isolated fixtures follow the existing GET /api/mc/missions contracts.
const mission = {
  mission_id: "fixture-mission", status: "SUCCEEDED", agent: "ollama", tenant: "tenant-a", capability: "text.transform",
  started_at: "2026-10-02T01:36:32.613Z", ended_at: "2026-10-02T01:36:35.260Z",
  result: { outcome: "completed", output_digest: "fixture-digest", output_chars: 26 },
  events: [
    { event_id: "fixture-1", event_type: "MC_MISSION_CREATED", timestamp: "2026-10-02T01:36:32.613Z", summary: "created" },
    { event_id: "fixture-2", event_type: "MC_AGENT_AUTHORIZED", timestamp: "2026-10-02T01:36:32.613Z", summary: "authorized" },
    { event_id: "fixture-3", event_type: "MC_RUN_SUCCEEDED", timestamp: "2026-10-02T01:36:35.260Z", summary: "completed" },
  ],
  artifacts: [{ path: "/fixture/result.json", kind: "result", sha256: "fixture-hash", present: true }],
};

test("normalizes known successful responses without inventing verification", () => {
  const detail = normalizeMissionDetail({ ok: true, mission });
  expect(detail?.status).toBe("SUCCEEDED");
  expect(detail?.event_count).toBe(3);
  expect(detail?.artifacts[0].present).toBe(true);
  expect(detail).not.toHaveProperty("verified");
  expect(detail?.artifacts[0]).not.toHaveProperty("verified");
  expect(detail).not.toHaveProperty("witness");
});

test("denied and malformed responses cannot masquerade as a mission", () => {
  expect(normalizeMissionDetail({ ok: false, mission })).toBeNull();
  expect(normalizeMissionDetail({ ok: true, mission: { status: "SUCCEEDED" } })).toBeNull();
  expect(normalizeMissionList({ ok: false, missions: [mission] })).toEqual([]);
});

test("unknown status, absent artifact availability and invalid counts stay honest", () => {
  const detail = normalizeMissionDetail({ ok: true, mission: { ...mission, status: "NEW_STATUS", artifacts: [{ path: "/fixture/result.json", sha256: "hash" }] } });
  expect(detail?.status).toBe("UNKNOWN");
  expect(detail?.artifacts[0].present).toBeNull();
  expect(normalizeMissionList({ ok: true, missions: [{ ...mission, event_count: -4, artifact_count: NaN }] })[0].event_count).toBe(0);
});

test("lineage source labels describe provenance availability, not verification", () => {
  const stages = normalizeLineage({ ok: true, spine: [{ stage: "RESULT", source: "LIVE", data: { outcome: "completed" } }, { stage: "WITNESS", source: "NEW_LABEL" }] });
  expect(stages[0].source).toBe("LIVE");
  expect(stages[0]).not.toHaveProperty("verified");
  expect(stages[1].source).toBe("UNKNOWN");
});

test("timeline preserves recorded ordering and invents no witness or replay stages", () => {
  const detail = normalizeMissionDetail({ ok: true, mission })!;
  const timeline = buildMissionTimeline(detail);
  expect(timeline.map((e) => e.event_id)).toEqual(["fixture-1", "fixture-2", "fixture-3"]);
  expect(timeline.map((e) => e.elapsed_ms)).toEqual([0, 0, 2647]);
  expect(timeline.some((e) => /witness|replay|verified/i.test(e.label))).toBe(false);
});

test("only valid measured terminal durations are displayed", () => {
  expect(missionElapsedMs(mission)).toBe(2647);
  expect(missionElapsedMs({ started_at: mission.started_at, ended_at: null })).toBeNull();
  expect(missionElapsedMs({ started_at: "invalid", ended_at: mission.ended_at })).toBeNull();
  expect(missionElapsedMs({ started_at: mission.ended_at, ended_at: mission.started_at })).toBeNull();
});

test("query terms match across actual identity fields, combined with status", () => {
  const rows = normalizeMissionList({ ok: true, missions: [mission, { ...mission, mission_id: "other", tenant: "tenant-b", status: "FAILED" }] });
  expect(filterMissions(rows, "tenant-a transform", "SUCCEEDED").map((m) => m.mission_id)).toEqual(["fixture-mission"]);
  expect(filterMissions(rows, "tenant-a", "FAILED")).toEqual([]);
  const outcomes = normalizeMissionList({ ok: true, missions: [mission, { ...mission, mission_id: "failed", status: "FAILED" }, { ...mission, mission_id: "denied", status: "DENIED" }] });
  expect(filterMissions(outcomes, "", "FAILED_OR_DENIED").map(m => m.mission_id)).toEqual(["failed", "denied"]);
});

test("diff keeps null distinct from missing and ignores object key ordering", () => {
  expect(compareFields({ x: 1, y: { a: 2 } }, { y: { a: 2 }, x: 1 })).toEqual([]);
  expect(compareFields({ x: null }, { y: null }).map((d) => [d.path, d.kind])).toEqual([["/x", "removed"], ["/y", "added"]]);
  expect(compareFields({ "a/b": [1, 2] }, { "a/b": [2, 1] }).map((d) => d.path)).toEqual(["/a~1b/0", "/a~1b/1"]);
});

test("source URLs never promote local paths or executable schemes into links", () => {
  for (const value of ["javascript:alert(1)", "file:///fixture/result.json", "/fixture/result.json", "https://user:password@example.com", "data:text/html,unsafe"]) expect(safeEvidenceUrl(value)).toBeNull();
  expect(safeEvidenceUrl("https://example.com/evidence")).toBe("https://example.com/evidence");
});
