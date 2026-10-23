"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, ArrowUpRight, Boxes, GitBranch, Search } from "lucide-react";
import { safeEvidenceUrl } from "./evidence-model";
import { RecordInspector, TraceBody } from "./record-inspector";
import { traceObject } from "./trace-model";
import { ViewTabs } from "./view-tabs";
import { objectViews } from "./object-views";

type Data = Record<string, unknown>;
const record = (value: unknown): Data => value && typeof value === "object" && !Array.isArray(value) ? value as Data : {};
const rows = (value: unknown): Data[] => Array.isArray(value) ? value.map(record) : [];
const text = (value: unknown): string => typeof value === "string" ? value : value == null ? "Not returned" : JSON.stringify(value);
function FieldValue({ value }: { value: unknown }) {
  const href = safeEvidenceUrl(value);
  return href ? <a href={href} target="_blank" rel="noreferrer" className="mc-object-value">{text(value)} <ArrowUpRight size={12} aria-hidden="true" /></a> : <code className="mc-object-value">{text(value)}</code>;
}
function SourceImage({ url, onTrace }: { url: string; onTrace: () => void }) {
  const [opened, setOpened] = useState(false);
  const [failed, setFailed] = useState(false);
  return <figure className="mc-object-media"><figcaption><strong>Referenced source image</strong><p>This URL is supplied by the object. A witness hash and independent image verification are not returned.</p></figcaption>{!opened ? <button type="button" className="mc-text-button" onClick={() => setOpened(true)}>Preview source image <ArrowUpRight size={12} aria-hidden="true" /></button> : failed ? <p role="status">The source image could not be loaded.</p> : <img src={url} alt="Source reference for the selected business object" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />}<button type="button" className="mc-text-button" onClick={onTrace}>Trace this resource</button><a href={url} target="_blank" rel="noreferrer">Open original source</a></figure>;
}

/** A projection of the existing tenant graph and reverse-trace contracts. */
export function ObjectWorkspace({ siteId, graph, refreshSignal }: { siteId: string; graph: Data | null; refreshSignal: number }) {
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [schema, setSchema] = useState("");
  const [detail, setDetail] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState("");
  const [traceMode, setTraceMode] = useState("");
  const [traceField, setTraceField] = useState("");
  const [traceRelation, setTraceRelation] = useState<Data | null>(null);
  const [objectView, setObjectView] = useState("state");
  useEffect(() => {
    const sync = () => {
      const p = new URLSearchParams(window.location.search);
      setSelectedId(p.get("object") ?? ""); setQuery(p.get("entityQ") ?? ""); setSchema(p.get("schema") ?? "");
      setObjectView(p.get("objectView") ?? "state");
      setTraceMode(["object", "field", "relationship", "resource"].includes(p.get("trace") ?? "") ? p.get("trace")! : ""); setTraceField(p.get("field") ?? "");
      try { const values = JSON.parse(p.get("relation") ?? "null"); setTraceRelation(Array.isArray(values) && values.length === 3 && values.every(v => typeof v === "string") ? { subject: values[0], predicate: values[1], object: values[2] } : null); } catch { setTraceRelation(null); }
    };
    sync(); window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [siteId]);
  const select = useCallback((id: string) => {
    const url = new URL(window.location.href); url.searchParams.set("object", id); url.searchParams.set("site", siteId);
    for (const param of ["trace", "inspect", "field", "relation", "objectView"]) url.searchParams.delete(param);
    window.history.pushState(window.history.state, "", url); setSelectedId(id); setCopied(""); setTraceMode(""); setObjectView("state");
  }, [siteId]);
  const showTrace = (subject: "object" | "field" | "relationship" | "resource", field = "", relationship: Data | null = null) => {
    const url = new URL(window.location.href); url.searchParams.set("trace", subject); url.searchParams.set("inspect", "trace");
    if (field) url.searchParams.set("field", field); else url.searchParams.delete("field");
    if (relationship) url.searchParams.set("relation", JSON.stringify([relationship.subject, relationship.predicate, relationship.object])); else url.searchParams.delete("relation");
    window.history.pushState(window.history.state, "", url); setTraceMode(subject); setTraceField(field); setTraceRelation(relationship); setCopied("");
  };
  const closeInspector = () => {
    const url = new URL(window.location.href); for (const param of ["trace", "field", "relation"]) url.searchParams.delete(param); url.searchParams.set("inspect", "none");
    window.history.pushState(window.history.state, "", url); setTraceMode("");
  };
  const filter = (name: "entityQ" | "schema", value: string) => {
    const url = new URL(window.location.href);
    if (value) url.searchParams.set(name, value); else url.searchParams.delete(name);
    window.history.replaceState(window.history.state, "", url);
    if (name === "entityQ") setQuery(value); else setSchema(value);
  };
  useEffect(() => {
    setDetail(null); setError("");
    if (!selectedId) { setLoading(false); return; }
    const controller = new AbortController(); setLoading(true);
    void fetch(`/api/mc/object?siteId=${encodeURIComponent(siteId)}&id=${encodeURIComponent(selectedId)}`, { signal: controller.signal, cache: "no-store" })
      .then(async response => { const body = await response.json(); if (!response.ok || body.ok !== true) throw new Error(text(body.error ?? `HTTP ${response.status}`)); return body as Data; })
      .then(body => { if (!controller.signal.aborted) setDetail(body); })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Object source unavailable"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [siteId, selectedId, refreshSignal]);
  const objects = useMemo(() => rows(graph?.objects), [graph]);
  const schemas = [...new Set(objects.map(obj => text(obj.schema)))].sort();
  const filtered = objects.filter(obj => (!schema || obj.schema === schema) && [obj.title, obj.id, obj.schema].map(text).join(" ").toLowerCase().includes(query.trim().toLowerCase()));
  const trace = record(detail?.trace); const obj = record(trace.object); const evidence = record(trace.evidence);
  const corrections = rows(record(trace.claims).ownerCorrections); const relationships = rows(trace.relationships);
  const selected = objects.find(candidate => candidate.id === selectedId);
  const views = objectViews(detail);
  const activeView = views.some(view => view.id === objectView) ? objectView : "state";
  const changeView = (view: string) => {
    const url = new URL(window.location.href); url.searchParams.set("objectView", view);
    window.history.pushState(window.history.state, "", url); setObjectView(view); setCopied("");
  };
  const meta = record(graph?.meta);
  const endpoint = (id: string) => objects.find(candidate => candidate.id === id);
  return <section className="mc-object-workspace" aria-label="FYD object and provenance workspace">
    <div className="mc-object-header"><div><span className="mc-eyebrow">FYD / TENANT GRAPH</span><h2>See what the graph knows.</h2><p>Inspect the objects FYD presents for a tenant, their effective values, and the evidence behind them.</p></div><GitBranch size={28} aria-hidden="true" /></div>
    <div className="mc-object-summary"><span><strong>{graph?.ok === true ? text(graph.objectCount) : "—"}</strong> objects</span><span><strong>{graph?.ok === true ? text(graph.relationshipCount) : "—"}</strong> relationships</span><span><strong>{graph?.ok === true ? text(graph.ownerCorrectedCount) : "—"}</strong> objects with owner corrections</span><details><summary>Graph provenance</summary><dl><dt>Tenant</dt><dd>{siteId}</dd><dt>Composed digest prefix</dt><dd><code>{text(meta.graphDigest)}</code></dd><dt>Base digest prefix</dt><dd><code>{text(meta.baseDigest)}</code></dd><dt>Source generation</dt><dd>{text(meta.generatedAt)}</dd></dl><p>Digest integrity describes this projection. It does not verify every business field.</p></details></div>
    <div className="mc-object-filter"><label><Search size={15} aria-hidden="true" /><input aria-label="Search FYD objects" placeholder="Search title, object ID, schema…" value={query} onChange={e => filter("entityQ", e.target.value)} /></label><select aria-label="Object schema" value={schema} onChange={e => filter("schema", e.target.value)}><option value="">All schemas</option>{schemas.map(value => <option key={value} value={value}>{value}</option>)}</select><span role="status">{filtered.length} in view</span></div>
    {!graph && <p role="status" className="mc-panel">Reading tenant graph…</p>}
    {graph?.ok === false && <p role="alert" className="mc-panel">Graph unavailable: {text(graph.error)}</p>}
    {graph?.ok === true && <div className="mc-object-layout">
      <div className="mc-object-list" aria-label="Tenant objects">{filtered.map(candidate => <button type="button" key={text(candidate.id)} aria-pressed={selectedId === candidate.id} onClick={() => select(text(candidate.id))}><Boxes size={17} aria-hidden="true" /><span><strong>{text(candidate.title)}</strong><small>{text(candidate.schema)} · {text(candidate.provenanceKind)}</small>{Number(candidate.ownerCorrectionCount) > 0 && <small>Owner corrections: {text(candidate.ownerCorrectionCount)}</small>}</span><ArrowRight size={13} aria-hidden="true" /></button>)}{filtered.length === 0 && <p>No objects match these filters.</p>}</div>
      <div className="mc-object-detail" aria-live="polite">
        {!selectedId && <div className="mc-object-empty"><GitBranch size={34} aria-hidden="true" /><h3>Select an object to follow its evidence.</h3><p>Fields, owner corrections, source references, and connected objects appear here.</p></div>}
        {loading && <p role="status">Reading object evidence…</p>}
        {error && <p role="alert">Object unavailable: {error}</p>}
        {detail && <>
          <div className="mc-section-label"><div><span className="mc-eyebrow">{text(obj.schema)}</span><h3>{text(obj.title)}</h3><code>{text(obj.id)}</code></div><button className="mc-text-button" type="button" onClick={() => showTrace("object")}>Trace this</button><button className="mc-text-button" type="button" onClick={async () => { try { await navigator.clipboard.writeText(window.location.href); setCopied("Object link copied"); } catch { setCopied("Clipboard unavailable"); } }}>Copy object link</button></div><p role="status" className="mc-muted">{copied}</p>
          <p className="mc-muted">Object provenance: {text(evidence.provenanceKind)}. {evidence.fixtureSource ? "Pinned fixture reference returned." : rows(evidence.journalEvidence).some(item => record(item.lookup).found === true) ? "Journal evidence returned." : "Original source event not returned."}</p>
          <ViewTabs id="object-views" views={views} value={activeView} onChange={changeView} label="Object detail views" />
          <div role="tabpanel" id="object-views-panel" aria-labelledby={`object-views-${activeView}`} tabIndex={0}>
          {activeView === "state" && <>
          <h4>Effective fields</h4><div className="mc-object-fields">{Object.entries(record(obj.fields)).map(([key, value]) => {
            const correction = corrections.find(item => item.field === key);
            return <details className="mc-object-field" key={key}><summary><span>{key}<small>{correction ? "Owner correction" : "Object source"}</small></span><FieldValue value={value} /><button type="button" className="mc-text-button" onClick={event => { event.preventDefault(); event.stopPropagation(); showTrace("field", key); }}>Why this?</button></summary><div><p>{correction ? "The owner value supersedes the preserved source value." : "This route exposes object evidence; a separate field-specific source receipt is not returned."}</p>{correction && <dl><dt>Preserved source value</dt><dd><FieldValue value={correction.sourceValue} /></dd><dt>Owner value</dt><dd><FieldValue value={correction.ownerValue} /></dd><dt>Correction provenance</dt><dd><code>{text(correction.provenance)}</code></dd></dl>}<span className="mc-muted">Object evidence: {text(evidence.provenanceKind)} · Confidence and verification are not returned.</span></div></details>;
          })}</div>
          </>}
          {activeView === "evidence" && <>
          {safeEvidenceUrl(record(obj.fields).images) && <SourceImage key={text(obj.id)} url={safeEvidenceUrl(record(obj.fields).images)!} onTrace={() => showTrace("resource", "images")} />}
          <details className="mc-object-source" open><summary>Source references & original evidence</summary><p>{text(evidence.fixtureSource ?? evidence.unbound ?? "Object-level provenance references")}</p><ul>{Array.isArray(evidence.refs) && evidence.refs.map((ref, i) => <li key={i}><code>{text(ref)}</code></li>)}</ul>{rows(evidence.journalEvidence).map((entry, i) => <details key={i}><summary>{text(entry.ref)} · {record(entry.lookup).found === true ? "Event returned" : "Event unavailable"}</summary><pre>{JSON.stringify(entry.lookup, null, 2)}</pre></details>)}</details>
          </>}
          {activeView === "relationships" && <>
          <h4>Connected objects</h4><div className="mc-object-relations">{relationships.map((relationship, i) => {
            const targetId = text(relationship.subject === selectedId ? relationship.object : relationship.subject); const target = endpoint(targetId);
            return <div className="mc-object-relation" key={`${targetId}-${i}`}><span>{relationship.subject === selectedId ? text(obj.title) : text(target?.title ?? targetId)}</span><span className="mc-object-predicate">{text(relationship.predicate)} <ArrowRight size={12} aria-hidden="true" /></span>{relationship.subject === selectedId ? <span>{text(target?.title ?? targetId)}</span> : <span>{text(obj.title)}</span>}<button className="mc-text-button" type="button" onClick={() => showTrace("relationship", "", relationship)}>Trace this relationship</button>{target && <button className="mc-text-button" type="button" onClick={() => select(targetId)}>Inspect connected object <ArrowUpRight size={12} aria-hidden="true" /></button>}</div>;
          })}{relationships.length === 0 && <p className="mc-muted">No relationships are returned for this object.</p>}</div>
          </>}
          {activeView === "history" && <><h4>Returned correction and event history</h4><p className="mc-muted">The route returns current corrections and any resolved source events. It does not return a complete ordered object history or correction timestamps.</p>{corrections.map((correction, i) => <details className="mc-object-source" key={`correction-${i}`}><summary>Owner correction · {text(correction.field)}</summary><dl><dt>Preserved source value</dt><dd><FieldValue value={correction.sourceValue} /></dd><dt>Effective owner value</dt><dd><FieldValue value={correction.ownerValue} /></dd><dt>Provenance</dt><dd>{text(correction.provenance)}</dd></dl><pre>{JSON.stringify(correction, null, 2)}</pre></details>)}{rows(evidence.journalEvidence).filter(entry => record(entry.lookup).found === true).map((entry, i) => <details className="mc-object-source" key={`event-${i}`}><summary>{text(entry.ref)} · {text(record(record(entry.lookup).event).timestamp)}</summary><pre>{JSON.stringify(record(entry.lookup).event, null, 2)}</pre></details>)}</>}
          </div>
          <details className="mc-object-source"><summary>Full reverse-trace projection JSON</summary><pre>{JSON.stringify(detail, null, 2)}</pre></details>
        </>}
        {selectedId && !loading && !detail && !error && !selected && <p>Selected object is not in the current graph summary.</p>}
      </div>
    </div>}
    <RecordInspector open={!!traceMode} title={detail ? traceObject(detail, traceMode as "object" | "field" | "relationship" | "resource", traceField, traceRelation ?? undefined).subject : "Reading object trace"} onClose={closeInspector}>{detail ? <TraceBody trace={traceObject(detail, traceMode as "object" | "field" | "relationship" | "resource", traceField, traceRelation ?? undefined)} /> : <p>{loading ? "Reading object evidence…" : error || "Object evidence not returned."}</p>}<button type="button" className="mc-text-button" onClick={async () => { try { await navigator.clipboard.writeText(window.location.href); setCopied("Trace link copied"); } catch { setCopied("Clipboard unavailable"); } }}>Copy trace link</button><p role="status">{copied}</p></RecordInspector>
  </section>;
}
