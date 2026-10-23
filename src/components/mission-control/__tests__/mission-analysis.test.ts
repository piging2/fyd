import { normalizeMissionDetail, normalizeMissionList } from "../evidence-model";
import { compareCohort, explainMissionTime, groupFailures, MISSING_DIMENSION, selectCohort, timestampOrder } from "../mission-analysis";
const events = [
  { event_id: "q", event_type: "MC_RUN_QUEUED", timestamp: "2026-10-02T00:00:00Z" },
  { event_id: "s", event_type: "MC_EXECUTION_STARTED", timestamp: "2026-10-02T00:00:02Z" },
  { event_id: "a", event_type: "MC_ARTIFACT_PUBLISHED", timestamp: "2026-10-02T00:00:05Z" },
  { event_id: "t", event_type: "MC_RUN_SUCCEEDED", timestamp: "2026-10-02T00:00:06Z" },
];
const mission = (extra = {}) => normalizeMissionDetail({ ok: true, mission: { mission_id: "m", events, artifacts: [{ kind: "result", path: "result", event_id: "a" }], ...extra } })!;
test("time intervals use exact returned event endpoints, not the mission's generic start time", () => {
  expect(explainMissionTime(mission({ started_at: "2020-01-01T00:00:00Z" })).map(i => i.milliseconds)).toEqual([2000, 4000, 0, 1000]);
});
test("missing, ambiguous and reversed endpoint timestamps stay unmeasured", () => {
  expect(explainMissionTime(mission({ events: events.filter(e => e.event_id !== "q") }))[0].milliseconds).toBeNull();
  expect(explainMissionTime(mission({ events: [...events, { ...events[1], event_id: "second-start" }] }))[1].milliseconds).toBeNull();
  expect(explainMissionTime(mission({ events: [{ ...events[0], timestamp: "2026-10-03T00:00:00Z" }, ...events.slice(1)] }))[0].milliseconds).toBeNull();
  expect(explainMissionTime(mission({ artifacts: [] }))[3].missing.join()).toContain("Result artifact event_id");
});
test("timeline orders dated events stably, then retains undated journal order", () => {
  const detail = mission({ events: [{ ...events[1], event_id: "u", timestamp: null }, events[2], events[0], { ...events[0], event_id: "equal" }] });
  expect(timestampOrder(detail.events).map(e => e.event_id)).toEqual(["q", "equal", "a", "u"]);
});
const summaries = normalizeMissionList({ ok: true, missions: [
  { mission_id: "good", status: "SUCCEEDED", agent: "a", capability: "x", tenant: "t", started_at: "2026-10-02T01:00:00Z" },
  { mission_id: "bad", status: "FAILED", agent: "b", capability: "x", tenant: "t", started_at: "2026-10-02T02:00:00Z" },
  { mission_id: "bad2", status: "FAILED", agent: "b", capability: "x", tenant: "u", started_at: null },
  { mission_id: "denied", status: "DENIED", agent: "b", capability: "x", tenant: "t", started_at: "2026-10-03T02:00:00Z" },
] });
test("failure groups preserve stable returned attributes and do not group successful records", () => {
  const groups = groupFailures(summaries);
  expect(groups.map(g => g.missions.map(m => m.mission_id))).toEqual([["bad", "bad2"], ["denied"]]);
  expect(groups[0].first).toBe("2026-10-02T02:00:00.000Z");
  expect(groups[0].last).toBe(groups[0].first);
  expect(groups[0]).not.toHaveProperty("rootCause");
});
test("UTC cohort bounds exclude missing times and invalid ranges do not become all records", () => {
  expect(selectCohort(summaries, { status: "FAILED_OR_DENIED", executor: "b", from: "2026-10-02T00:00", to: "2026-10-02T23:59" }).map(m => m.mission_id)).toEqual(["bad"]);
  expect(selectCohort(summaries, { from: "invalid" })).toEqual([]);
  expect(selectCohort(summaries, { from: "2026-10-03T00:00", to: "2026-10-02T00:00" })).toEqual([]);
});
test("cohort comparison reports frequencies, including empty selected sets without fake percentages", () => {
  const cohort = selectCohort(summaries, { status: "FAILED" });
  expect(compareCohort(summaries, cohort).find(d => d.dimension === "Executor" && d.value === "b")).toMatchObject({ selected: 2, baseline: 3, selectedPercent: 100, baselinePercent: 75 });
  expect(compareCohort(summaries, []).every(d => d.selectedPercent === null)).toBe(true);
});
test("selecting a failure group with missing dimensions does not broaden to other failures", () => {
  const data = normalizeMissionList({ ok: true, missions: [{ mission_id: "absent", status: "FAILED" }, { mission_id: "present", status: "FAILED", agent: "a", capability: "x" }] });
  expect(selectCohort(data, { status: "FAILED", executor: MISSING_DIMENSION, capability: MISSING_DIMENSION }).map(m => m.mission_id)).toEqual(["absent"]);
});
