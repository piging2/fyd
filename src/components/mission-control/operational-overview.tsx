"use client";

import { Activity, ArrowUpRight, CircleDot, GitBranch, Radio, ShieldQuestion } from "lucide-react";

type Data = Record<string, unknown>;
const record = (v: unknown): Data => v && typeof v === "object" && !Array.isArray(v) ? v as Data : {};
const rows = (v: unknown): Data[] => Array.isArray(v) ? v.filter(x => x && typeof x === "object") as Data[] : [];
const count = (v: unknown) => typeof v === "number" && Number.isFinite(v) ? String(v) : "—";
export function OperationalOverview({ today, agents, navigate }: {
  today: Data | null; agents: Data | null; navigate: (section: string, item: string) => void;
}) {
  const data = record(today?.today); const pipeline = record(today?.pipeline);
  const events = rows(record(data.changed).recentOverlayEvents);
  const operations = rows(agents?.operations);
  const degraded = Array.isArray(today?.degraded) ? today.degraded.filter(x => typeof x === "string") as string[] : [];
  const healthy = today?.ok === true && today.status === "PROVEN";
  const stages = [
    { label: "Observations", value: pipeline.observations, section: "system", item: "event-history", icon: Radio },
    { label: "Missions created", value: pipeline.missionsCreated, section: "missions", item: "missions", icon: CircleDot },
    { label: "Missions completed", value: pipeline.missionsCompleted, section: "missions", item: "results", icon: Activity },
    { label: "Claims created", value: pipeline.claimsCreated, section: "knowledge", item: "claims", icon: GitBranch },
  ];
  return <div className="mc-overview">
    <section className="mc-hero" aria-labelledby="mc-overview-title">
      <div><span className="mc-eyebrow">PING / operational continuity</span><h2 id="mc-overview-title">Follow the work.<br /><span>See what supports it.</span></h2>
      <p>Inspect the path from an observation to its result. Every state stays attached to the record that produced it.</p>
      <button className="mc-primary" onClick={() => navigate("missions", "missions")}>Explore executions <ArrowUpRight size={16} /></button></div>
      <div className="mc-observation-note"><Radio size={22} /><strong>{!today ? "Reading sources" : today.ok === false ? "Source unavailable" : healthy ? "Sources responding" : "Partial visibility"}</strong>
        <span>{!today ? "Waiting for the current source snapshot." : "A successful read is an observation, not verification of the underlying claims."}</span>
        {typeof today?.generatedAt === "string" && <time dateTime={today.generatedAt}>Snapshot · {new Date(today.generatedAt).toLocaleString()}</time>}
      </div>
    </section>
    <section aria-label="Today's observed pipeline" className="mc-pipeline">
      <div className="mc-section-label"><span>Today’s pipeline</span><small>UTC · returned counts</small></div>
      <div className="mc-pipeline-grid">{stages.map((s, index) => <button key={s.label} onClick={() => navigate(s.section, s.item)} className="mc-metric">
        <span className="mc-metric-label"><s.icon size={16} />{s.label}<ArrowUpRight size={13} /></span>
        <strong>{count(s.value)}</strong><small>{typeof s.value === "number" ? "Reported by the pipeline projection" : "Count not returned"}</small>
        {index < stages.length - 1 && <span className="mc-metric-connector" aria-hidden="true">→</span>}
      </button>)}</div>
    </section>
    <div className="mc-overview-columns">
      <section className="mc-panel"><div className="mc-section-label"><h3>Recent source activity</h3><button className="mc-text-button" onClick={() => navigate("system", "event-history")}>Mission events <ArrowUpRight size={14} /></button></div>
        <p className="mc-muted">FYD overlay events · latest returned sample</p>
        {events.length ? <ol className="mc-activity">{events.slice(0, 6).map((e, i) => <li key={String(e.event_id ?? i)}><span className="mc-activity-dot" aria-hidden="true" /><div><strong>{typeof e.site === "string" ? e.site : "Site overlay"}</strong><code>{String(e.event_id ?? "Event ID not returned")}</code></div><time>{typeof e.timestamp === "string" ? new Date(e.timestamp).toLocaleTimeString() : "Time unavailable"}</time></li>)}</ol> : <div className="mc-empty-inline"><GitBranch size={24} /><strong>{!today ? "Reading activity…" : record(data.changed).status === "DEGRADED" ? "Activity source unavailable" : "No overlay events returned"}</strong><p>{record(data.changed).status === "DEGRADED" ? "The journal could not supply this activity sample. Other views remain available." : "Execution evidence is available separately in Missions."}</p><button onClick={() => navigate("missions", "missions")} className="mc-text-button">Open missions →</button></div>}
      </section>
      <section className="mc-panel"><div className="mc-section-label"><h3>Executor presence</h3><button className="mc-text-button" onClick={() => navigate("missions", "agents")}>Inspect <ArrowUpRight size={14} /></button></div><p className="mc-muted">Observed worker state · authority remains separate</p>
        {operations.length ? <ul className="mc-agents">{operations.slice(0, 5).map((op, i) => <li key={String(op.mission ?? i)}><span className={String(op.currentState) === "RUNNING" ? "mc-live-dot" : "mc-quiet-dot"} /><div><strong>{String(op.mission ?? "Unnamed operation")}</strong><span>{String(op.currentState ?? "State unavailable")}</span></div></li>)}</ul> : <div className="mc-empty-inline"><CircleDot size={24} /><strong>{!agents ? "Reading worker state…" : agents.ok === false ? "Worker source unavailable" : "No active operations returned"}</strong><p>Historical execution records remain available. This is not a claim that every worker is idle.</p></div>}
      </section>
    </div>
    {degraded.length > 0 && <details className="mc-source-notice"><summary><ShieldQuestion size={16} />{degraded.length} source visibility notes</summary><ul>{degraded.map(note => <li key={note}>{note}</li>)}</ul></details>}
  </div>;
}
