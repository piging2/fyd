"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import {
  normalizeMissionList, normalizeMissionDetail, normalizeLineage,
  filterMissions, missionTone,
  type MissionSummary, type MissionDetail, type MissionEvent, type LineageStage,
} from "./evidence-model";
import styles from "./evidence-workspace.module.css";
import { RecordInspector, TraceBody } from "./record-inspector";
import { traceMission, traceStage } from "./trace-model";
import { MissionViews } from "./mission-views";
import { CohortAnalysis } from "./cohort-analysis";
import { selectCohort } from "./mission-analysis";

export type EvidenceWorkspaceMode = "missions" | "evidence" | "replay" | "events";
type Selection = { mission: string; event: string; stage: string; query: string; status: string; trace: string; inspect: string; perspective: string; executor: string; capability: string; tenant: string; from: string; to: string };
const titles: Record<EvidenceWorkspaceMode, [string, string]> = {
  missions: ["Follow the work.", "From mission to execution, with the evidence that connects them."],
  evidence: ["Every result has a trail.", "Inspect recorded evidence, source boundaries, and the events behind each result."],
  replay: ["Inspect what can be reproduced.", "Original execution evidence and the boundary to a recorded replay receipt."],
  events: ["Read the sequence.", "Timestamped mission events, connected to their execution and evidence."],
};
const emptySelection: Selection = { mission: "", event: "", stage: "", query: "", status: "", trace: "", inspect: "", perspective: "story", executor: "", capability: "", tenant: "", from: "", to: "" };
function readSelection(): Selection {
  const p = new URLSearchParams(window.location.search);
  const defaultStatus = p.get("section") === "missions" ? p.get("view") === "failures" ? "FAILED_OR_DENIED" : p.get("view") === "results" ? "SUCCEEDED" : "" : "";
  return { mission: p.get("mission") ?? "", event: p.get("event") ?? "", stage: p.get("stage") ?? "", query: p.get("q") ?? "", status: p.get("status") ?? defaultStatus, trace: p.get("trace") ?? "", inspect: p.get("inspect") ?? (p.get("trace") ? "trace" : p.get("event") ? "event" : p.get("stage") ? "stage" : ""), perspective: p.get("perspective") ?? "story", executor: p.get("executor") ?? "", capability: p.get("capability") ?? "", tenant: p.get("tenant") ?? "", from: p.get("from") ?? "", to: p.get("to") ?? "" };
}
function readable(value: string) { return value.replace(/^MC_/, "").replaceAll("_", " ").toLowerCase(); }
function stamp(value: string | null | undefined) {
  if (!value) return "Not recorded";
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }) : value;
}
function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function valueAt(value: unknown, ...keys: string[]): string | null {
  const data = object(value);
  for (const key of keys) if (typeof data[key] === "string" && data[key]) return data[key] as string;
  return null;
}
function RawRecord({ data, label = "Projected record JSON" }: { data: unknown; label?: string }) {
  return <details className={styles.raw}><summary>{label}</summary><pre>{JSON.stringify(data, null, 2)}</pre></details>;
}
function Fact({ label, value }: { label: string; value: string | null | undefined }) {
  return <div className={styles.fact}><dt>{label}</dt><dd className={!value ? styles.missing : undefined}>{value || "Not exposed by this source"}</dd></div>;
}
function Status({ status }: { status: string }) {
  return <span className={styles.badge} data-tone={missionTone(status)}><span aria-hidden="true" className={styles.dot} />{readable(status)}</span>;
}
async function loadJson(url: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { cache: "no-store", signal });
  const body = await response.json();
  if (!response.ok || object(body).ok === false) throw new Error(valueAt(body, "error") ?? `Request failed (${response.status})`);
  return body;
}

/** Read-only operations workspace. All state is projected from the existing MC routes. */
export function EvidenceWorkspace({ mode, refreshSignal = 0 }: { mode: EvidenceWorkspaceMode; refreshSignal?: number }) {
  const [selection, setSelection] = useState<Selection>(emptySelection);
  const [ready, setReady] = useState(false);
  const [missions, setMissions] = useState<MissionSummary[]>([]);
  const [mission, setMission] = useState<MissionDetail | null>(null);
  const [missionRaw, setMissionRaw] = useState<unknown>(null);
  const [spine, setSpine] = useState<LineageStage[]>([]);
  const [listError, setListError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [lineageError, setLineageError] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [asOf, setAsOf] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [polling, setPolling] = useState(false);
  const [dense, setDense] = useState(false);
  const [notice, setNotice] = useState("");
  const region = useRef<HTMLElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const sync = () => setSelection(readSelection());
    sync(); setReady(true);
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  const navigate = useCallback((changes: Partial<Selection>, replace = false) => {
    const next = { ...readSelection(), ...changes };
    const url = new URL(window.location.href);
    for (const [field, param] of [["mission", "mission"], ["event", "event"], ["stage", "stage"], ["query", "q"], ["status", "status"], ["trace", "trace"], ["inspect", "inspect"], ["perspective", "perspective"], ["executor", "executor"], ["capability", "capability"], ["tenant", "tenant"], ["from", "from"], ["to", "to"]] as const) {
      if (next[field] || field === "status") url.searchParams.set(param, next[field]); else url.searchParams.delete(param);
    }
    window.history[replace ? "replaceState" : "pushState"](window.history.state, "", url);
    setSelection(next);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    setLoading(true); setListError("");
    loadJson("/api/mc/missions", controller.signal).then((data) => {
      setMissions(normalizeMissionList(data)); setAsOf(valueAt(data, "as_of"));
    }).catch((e: Error) => { if (!controller.signal.aborted) setListError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [ready, refreshKey, refreshSignal]);
  useEffect(() => {
    if (!ready || loading || listError || selection.mission || !missions.length) return;
    const first = selectCohort(filterMissions(missions, selection.query, selection.status), selection)[0];
    if (first) navigate({ mission: first.mission_id }, true);
  }, [ready, loading, listError, selection, missions, navigate]);
  useEffect(() => {
    if (!ready || !selection.mission) { setMission(null); setMissionRaw(null); setSpine([]); return; }
    const controller = new AbortController();
    setMission(null); setMissionRaw(null); setSpine([]); setDetailLoading(true); setDetailError(""); setLineageError("");
    loadJson(`/api/mc/missions/${encodeURIComponent(selection.mission)}`, controller.signal).then((data) => {
      const record = normalizeMissionDetail(data);
      if (!record) throw new Error("The mission response did not contain a valid record.");
      if (!controller.signal.aborted) { setMission(record); setMissionRaw(data); }
    }).catch((e: Error) => { if (!controller.signal.aborted) setDetailError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setDetailLoading(false); });
    loadJson(`/api/mc/lineage?missionId=${encodeURIComponent(selection.mission)}`, controller.signal)
      .then((data) => setSpine(normalizeLineage(data)))
      .catch((e: Error) => { if (!controller.signal.aborted) setLineageError(e.message); });
    return () => controller.abort();
  }, [ready, selection.mission, refreshKey, refreshSignal]);
  useEffect(() => {
    if (!polling) return;
    const timer = setInterval(() => { if (document.visibilityState === "visible") setRefreshKey((key) => key + 1); }, 15000);
    return () => clearInterval(timer);
  }, [polling]);
  useEffect(() => () => { if (noticeTimer.current) clearTimeout(noticeTimer.current); }, []);

  const visibleMissions = useMemo(() => selectCohort(filterMissions(missions, selection.query, selection.status || undefined), selection), [missions, selection]);
  const events = useMemo(() => mission?.events ?? [], [mission]);
  const selectedEvent = events.find((event) => event.event_id === selection.event);
  const selectedStage = spine.find((stage) => stage.stage === selection.stage);
  const inspectorOpen = ["event", "stage", "trace"].includes(selection.inspect);
  const closeInspector = () => navigate({ inspect: "none", trace: "", stage: "" });
  const chooseEvent = (event: MissionEvent) => navigate({ event: event.event_id, stage: "", trace: "", inspect: "event" });
  const showTrace = (subject: "mission" | "event" | "result" | "stage") => navigate({ trace: subject, inspect: "trace" });
  const traced = selection.trace === "stage" && selectedStage ? traceStage(selectedStage) : mission && ["mission", "event", "result"].includes(selection.trace) ? traceMission(mission, selection.trace as "mission" | "event" | "result", selectedEvent) : null;
  const copy = async (text: string, label: string) => {
    try { await navigator.clipboard.writeText(text); setNotice(`${label} copied`); }
    catch { setNotice("Clipboard unavailable. Select and copy the displayed value."); }
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 3000);
  };
  const keyboard = (event: KeyboardEvent<HTMLElement>) => {
    if (event.ctrlKey || event.metaKey || event.altKey || inspectorOpen) return;
    if ((event.target as HTMLElement).closest("input, textarea, select, [contenteditable=true]")) return;
    if (event.key === "/") { event.preventDefault(); search.current?.focus(); return; }
    if (event.key !== "j" && event.key !== "k") return;
    const index = visibleMissions.findIndex((record) => record.mission_id === selection.mission);
    const next = visibleMissions[Math.max(0, Math.min(visibleMissions.length - 1, index + (event.key === "j" ? 1 : -1)))];
    if (!next) return;
    event.preventDefault(); navigate({ mission: next.mission_id, event: "", stage: "", trace: "", inspect: "none" });
    requestAnimationFrame(() => region.current?.querySelector<HTMLButtonElement>(`[data-mission-index="${visibleMissions.indexOf(next)}"]`)?.focus());
  };
  const active = missions.filter((m) => ["RUNNING", "QUEUED", "CREATED"].includes(m.status)).length;
  const completed = missions.filter((m) => m.status === "SUCCEEDED").length;
  const failed = missions.filter((m) => ["FAILED", "DENIED"].includes(m.status)).length;
  const inspectorData = selectedEvent ?? selectedStage?.data;
  const inspectorTitle = selectedEvent ? readable(selectedEvent.event_type) : selectedStage ? readable(selectedStage.stage) : "Record unavailable";
  const recordFields = object(inspectorData);
  const metadata = object(recordFields.metadata);
  const principal = valueAt(recordFields, "principal", "originator") ?? valueAt(metadata, "originator", "principal");
  const namespace = valueAt(recordFields, "namespace") ?? valueAt(metadata, "namespace");

  return <section ref={region} className={styles.workspace} aria-label={`${mode} operations workspace`}>
    <header className={styles.header}>
      <div><div className={styles.eyebrow}><span className={styles.pingMark} aria-hidden="true">P</span> PING / OPERATIONAL EVIDENCE</div><h2>{titles[mode][0]}</h2><p>{titles[mode][1]}</p></div>
      <div className={styles.headerActions}><button type="button" className={styles.button} disabled={loading} onClick={() => setRefreshKey((key) => key + 1)}>{loading ? "Reading journal…" : "Refresh"}</button><label className={styles.poll}><input type="checkbox" checked={polling} onChange={(e) => setPolling(e.target.checked)} /> Poll every 15s</label></div>
    </header>
    <div className={styles.sourceLine}><span className={styles.sourceBadge}>JOURNAL PROJECTION</span><span>{asOf ? `Read ${stamp(asOf)}` : "Waiting for source"}</span><span>Operator view</span></div>
    <div className={styles.metrics}>
      <button type="button" className={styles.metric} aria-pressed={!selection.status} onClick={() => navigate({ status: "", mission: "", event: "", stage: "", trace: "", inspect: "none" })}><span>Recorded missions</span><strong>{loading || listError ? "—" : missions.length}</strong><small>Browse the journal</small></button>
      <div className={styles.metric}><span>In progress</span><strong data-active={active > 0}>{loading || listError ? "—" : active}</strong><small>Created, queued, running</small></div>
      <button type="button" className={styles.metric} aria-pressed={selection.status === "SUCCEEDED"} onClick={() => navigate({ status: selection.status === "SUCCEEDED" ? "" : "SUCCEEDED", mission: "", event: "", stage: "", trace: "", inspect: "none" })}><span>Succeeded</span><strong>{loading || listError ? "—" : completed}</strong><small>Recorded run outcome</small></button>
      <div className={styles.metric}><span>Failed or denied</span><strong>{loading || listError ? "—" : failed}</strong><small>Separate from missing records</small></div>
    </div>
    <div className={styles.toolbar}>
      <label className={styles.search}><span className={styles.srOnly}>Search missions</span><span aria-hidden="true">⌕</span><input ref={search} value={selection.query} onChange={(e) => navigate({ query: e.target.value, mission: "", event: "", stage: "", trace: "", inspect: "none" }, true)} placeholder="Search mission, tenant, executor…" /><kbd>/</kbd></label>
      <label><span className={styles.srOnly}>Mission status</span><select aria-label="Mission status" value={selection.status} onChange={(e) => navigate({ status: e.target.value, mission: "", event: "", stage: "", trace: "", inspect: "none" })}><option value="">All outcomes</option><option value="FAILED_OR_DENIED">Failed or denied</option>{["CREATED", "QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "DENIED", "UNKNOWN"].map((state) => <option key={state} value={state}>{readable(state)}</option>)}</select></label>
      <button type="button" className={styles.button} aria-pressed={dense} onClick={() => setDense((value) => !value)}>{dense ? "Comfortable rows" : "Compact rows"}</button>
    </div>
    {!loading && !listError && <CohortAnalysis baseline={missions} cohort={visibleMissions} filters={{ query: selection.query, status: selection.status, executor: selection.executor, capability: selection.capability, tenant: selection.tenant, from: selection.from, to: selection.to }} changeFilter={changes => navigate({ ...changes, mission: "", event: "", stage: "", trace: "", inspect: "none" })} selectMission={missionId => navigate({ mission: missionId, event: "", stage: "", trace: "", inspect: "none" })} />}
    <p className={styles.keyboardHelp}><kbd>j</kbd> <kbd>k</kbd> move between missions · <kbd>Enter</kbd> select · select an event to inspect · <kbd>Esc</kbd> closes inspector</p>
    {listError && <div role="alert" className={styles.error}>Journal unavailable: {listError}. <button type="button" onClick={() => setRefreshKey((key) => key + 1)}>Try again</button></div>}
    <div className={styles.tableWrap}>
      <table className={styles.table} data-dense={dense}><caption className={styles.srOnly}>Mission journal records. Select a mission to inspect its lineage.</caption><thead><tr><th scope="col">Mission / capability</th><th scope="col">Outcome</th><th scope="col">Executor</th><th scope="col">Tenant</th><th scope="col">Evidence</th></tr></thead><tbody>
        {loading && !missions.length ? <tr><td colSpan={5}><div className={styles.skeleton}>Reading mission records…</div></td></tr> : visibleMissions.map((record, index) => <tr key={record.mission_id} data-selected={record.mission_id === selection.mission}><th scope="row"><button type="button" data-mission-index={index} onKeyDown={keyboard} className={styles.recordButton} aria-current={record.mission_id === selection.mission ? "true" : undefined} onClick={() => navigate({ mission: record.mission_id, event: "", stage: "", trace: "", inspect: "none" })}><strong>{record.capability || "Unspecified capability"}</strong><code>{record.mission_id}</code></button></th><td><Status status={record.status} /></td><td>{record.agent || "Not recorded"}</td><td>{record.tenant || "Not recorded"}</td><td><span className={styles.count}>{record.event_count} events</span><small>{record.artifact_count} artifacts</small></td></tr>)}
        {!loading && !visibleMissions.length && !listError && <tr><td colSpan={5}><div className={styles.empty}><strong>{missions.length ? "No missions match this view." : "No missions are recorded in this journal."}</strong><p>{missions.length ? "Clear the search or choose another outcome." : "A dispatched mission will bring its execution, event trail, and published artifacts here."}</p>{missions.length > 0 && <button type="button" className={styles.button} onClick={() => navigate({ query: "", status: "", executor: "", capability: "", tenant: "", from: "", to: "", mission: "", event: "", stage: "", trace: "", inspect: "none" })}>Clear filters</button>}</div></td></tr>}
      </tbody></table>
    </div>
    <div aria-live="polite" className={styles.srOnly}>{loading ? "Loading missions" : `${visibleMissions.length} missions in view`}</div>
    {detailLoading && <div className={styles.skeleton}>Loading execution and lineage…</div>}
    {detailError && <div role="alert" className={styles.error}>Mission detail unavailable: {detailError}</div>}
    {mission && visibleMissions.some(record => record.mission_id === mission.mission_id) && <div className={styles.detail}>
      <div className={styles.sectionHeading}><div><span className={styles.eyebrow}>SELECTED MISSION</span><h3>{mission.capability || "Execution record"}</h3><code className={styles.identifier}>{mission.mission_id}</code></div><div className={styles.actions}><Status status={mission.status} /><button className={styles.button} type="button" onClick={() => showTrace("mission")}>Trace this</button><button className={styles.button} type="button" onClick={() => copy(window.location.href, "Deep link")}>Copy link</button></div></div>
      <dl className={styles.facts}><Fact label="Executor" value={mission.agent} /><Fact label="Commissioning tenant" value={mission.tenant} /><Fact label="Started" value={stamp(mission.started_at)} /><Fact label="Reconciliation" value={mission.reconciliation_state} /></dl>
      <MissionViews mission={mission} raw={missionRaw} perspective={selection.perspective} selectedEventId={selection.event} selectEvent={chooseEvent} setPerspective={perspective => navigate({ perspective })} />
      <div className={styles.sectionHeading}><div><span className={styles.eyebrow}>CAUSAL RECORD</span><h3>Follow the evidence chain</h3></div><span className={styles.subtle}>Select a stage to inspect its source</span></div>
      {lineageError ? <div className={styles.error}>Lineage unavailable: {lineageError}</div> : <ol className={styles.chain} aria-label="Mission lineage">{spine.map((stage, index) => <li key={stage.stage}><button className={styles.chainNode} type="button" data-active={mission.status === "RUNNING" && stage.stage === "EXECUTION"} onClick={() => navigate({ stage: stage.stage, event: "", trace: "", inspect: "stage" })}><span className={styles.nodeIndex}>{String(index + 1).padStart(2, "0")}</span><strong>{readable(stage.stage)}</strong><span className={styles.nodeSource}>{stage.source}</span></button></li>)}</ol>}
      <div className={styles.columns}>
        <section className={styles.panel}><div className={styles.sectionHeading}><h3>Selected event</h3><span className={styles.sourceBadge}>{events.length} RECORDED EVENTS</span></div>{selectedEvent ? <><dl className={styles.facts}><Fact label="Event identity" value={selectedEvent.event_id} /><Fact label="Type" value={selectedEvent.event_type} /><Fact label="Returned time" value={selectedEvent.timestamp} /><Fact label="Summary" value={selectedEvent.summary} /></dl><div className={styles.actions}><button type="button" className={styles.button} onClick={() => chooseEvent(selectedEvent)}>Inspect selected event</button><button type="button" className={styles.button} onClick={() => showTrace("event")}>Trace this event</button></div></> : <p className={styles.subtle}>Select a returned event in Story, Timeline or History. The same event identity remains selected across views.</p>}</section>
        <div className={styles.sideStack}>
          <section className={styles.panel}><div className={styles.sectionHeading}><h3>Executor & authority</h3><span className={styles.avatar} aria-hidden="true">{(mission.agent || "?").slice(0, 2).toUpperCase()}</span></div><dl className={styles.facts}><Fact label="Executor" value={mission.agent} /><Fact label="Granted capabilities" value={mission.capabilities_granted.join(", ") || null} /><Fact label="Canonical authority" value={null} /><Fact label="Execution identity" value={mission.execution_id} /></dl><p className={styles.note}>An executor produces results. Its recorded identity does not establish authority over canonical facts.</p></section>
          <section className={styles.panel}><div className={styles.sectionHeading}><h3>Published artifacts</h3><span className={styles.count}>{mission.artifacts.length}</span></div>{mission.artifacts.length ? <div className={styles.artifactGrid}>{mission.artifacts.map((artifact, index) => <article className={styles.artifact} key={`${artifact.event_id}-${index}`}><div className={styles.artifactIcon} aria-hidden="true">▤</div><div><strong>{artifact.kind}</strong><span className={styles.artifactState} data-present={artifact.present}>{artifact.present === true ? "File present at read" : artifact.present === false ? "File not present" : "Availability not returned"}</span></div><code className={styles.artifactPath}>{artifact.path}</code><dl><Fact label="Recorded SHA-256" value={artifact.sha256} /></dl><button type="button" className={styles.textButton} disabled={!artifact.event_id} onClick={() => navigate({ event: artifact.event_id ?? "", stage: "", trace: "", inspect: "event" })}>Inspect publishing event ↗</button></article>)}</div> : <p className={styles.subtle}>No published artifacts are recorded for this mission.</p>}<p className={styles.note}>Presence is a file-existence observation. Hash verification and a media download URL are not exposed by this route.</p></section>
        </div>
      </div>
      <section className={`${styles.panel} ${styles.replay}`} aria-label="Replay comparison"><div className={styles.sectionHeading}><div><span className={styles.eyebrow}>REPRODUCIBILITY</span><h3>Original execution → replay</h3><button className={styles.textButton} type="button" onClick={() => showTrace("result")}>Trace this result</button></div><span className={styles.sourceBadge}>RECEIPT NOT EXPOSED</span></div><div className={styles.replayGrid}><div><span className={styles.subtle}>ORIGINAL</span><strong>{mission.result.outcome || mission.status}</strong><dl><Fact label="Output digest" value={mission.result.output_digest} /><Fact label="Execution" value={mission.execution_id} /><Fact label="Completed" value={stamp(mission.ended_at)} /></dl></div><div className={styles.replayBoundary}><span aria-hidden="true">⇢</span><span>No comparison receipt</span></div><div><span className={styles.subtle}>REPLAY</span><strong>Not available in this view</strong><p>A recorded replay hash, witness, configuration, and field comparison are required to show a match or divergence.</p><p className={styles.note}>Reconstructing this journal projection does not prove a worker replay matched.</p></div></div></section>
      {mission.evidence.length > 0 && <section className={styles.panel}><div className={styles.sectionHeading}><h3>Recorded evidence references</h3><span className={styles.count}>{mission.evidence.length}</span></div>{mission.evidence.map((evidence, index) => <RawRecord key={index} data={evidence} label={`Evidence reference ${index + 1}`} />)}</section>}
      <RawRecord data={missionRaw} label="Full returned mission response JSON" />
    </div>}
    <RecordInspector open={inspectorOpen} title={traced?.subject ?? inspectorTitle} onClose={closeInspector}>
      {traced ? <TraceBody trace={traced} /> : <>
        {detailLoading ? <p>Reading mission…</p> : !selectedEvent && !selectedStage ? <div className={styles.empty}><strong>This record is not in the current mission projection.</strong><p>Check the mission and event identifiers in the URL. No missing record has been substituted.</p></div> : <>
          <div className={styles.inspectorSource}><span className={styles.sourceBadge}>{selectedStage?.source ?? "PROJECTED EVENT"}</span><span>{selectedStage?.note ?? "Summary from the mission journal projection; full event envelope is not exposed here."}</span></div>
          <dl className={styles.inspectorFacts}><Fact label={selectedEvent ? "Event identity" : "Stage"} value={selectedEvent?.event_id ?? selectedStage?.stage} /><Fact label="Recorded time" value={selectedEvent?.timestamp ?? valueAt(inspectorData, "created_at", "queued_at", "authorized_at", "ended_at")} /><Fact label="Source" value="Mission journal projection" /><Fact label="Principal / originator" value={principal} /><Fact label="Tenant" value={mission?.tenant} /><Fact label="Namespace" value={namespace} /><Fact label="Canonical authority" value={valueAt(inspectorData, "authority")} /><Fact label="Executor" value={mission?.agent} /><Fact label="Causation" value={valueAt(inspectorData, "causation_id")} /><Fact label="Correlation" value={valueAt(inspectorData, "correlation_id")} /><Fact label="Witness hash" value={valueAt(inspectorData, "witness_hash")} /><Fact label="Replay receipt" value={valueAt(inspectorData, "replay_status")} /></dl>
          <p className={styles.note}>Recorded provenance and verification are different states. Confidence, witness, and human verification are shown only when the source exposes them.</p>
          <div className={styles.actions}><button className={styles.button} type="button" onClick={() => showTrace(selectedEvent ? "event" : "stage")}>Trace this</button>{selectedEvent && <button className={styles.button} type="button" onClick={() => copy(selectedEvent.event_id, "Event ID")}>Copy event ID</button>}</div>
          <RawRecord data={inspectorData} label={selectedEvent ? "Projected event record JSON" : "Lineage stage data JSON"} />
          {selectedEvent && <div className={styles.inspectorNavigation}><button type="button" className={styles.button} disabled={events.indexOf(selectedEvent) <= 0} onClick={() => chooseEvent(events[events.indexOf(selectedEvent) - 1])}>← Previous event</button><button type="button" className={styles.button} disabled={events.indexOf(selectedEvent) === events.length - 1} onClick={() => chooseEvent(events[events.indexOf(selectedEvent) + 1])}>Next event →</button></div>}
        </>}
        <p role="status" aria-live="polite" className={notice && inspectorOpen ? styles.note : styles.srOnly}>{inspectorOpen ? notice : ""}</p>
      </>}
      <button className={styles.button} type="button" onClick={() => copy(window.location.href, "Trace link")}>Copy inspector link</button>
      <p role="status" aria-live="polite" className={notice ? styles.note : styles.srOnly}>{notice}</p>
    </RecordInspector>
    <div role="status" aria-live="polite" className={notice && !inspectorOpen ? styles.toast : styles.srOnly}>{inspectorOpen ? "" : notice}</div>
  </section>;
}
