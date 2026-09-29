"use client";
import { useState } from "react";
import type { EditorialRecord } from "./editorial-sections";

function Source({record}:{record:EditorialRecord}) { return <details className="ed-source"><summary>Why this?</summary><p>This is a published website statement. It is not independent verification or a live runtime reading.</p><code>{record.source}</code>{record.href && <a href={record.href}>Read the published source ↗</a>}</details>; }
const statusLabel = (status?:string) => status === "available" ? "Available" : status === "future" ? "Direction" : status === "in-development" ? "In development" : "Published";

export function EditorialAtlas({records,relationships}:{records:EditorialRecord[];relationships:{from:string;to:string;label:string}[]}) {
  const [selected,setSelected] = useState(records.find(r=>r.kind==="product")?.id ?? records[0]?.id);
  const record = records.find(r=>r.id===selected) ?? records[0];
  if(!record) return null;
  const nodes=records.filter(r=>r.kind!=="article").slice(0,5);
  const related=relationships.filter(r=>r.to===record.id||r.from===record.id).map(r=>({label:r.label,other:records.find(o=>o.id===(r.to===record.id?r.from:r.to))})).filter(r=>r.other);
  return <div className="ed-atlas"><div className="ed-map"><div className="ed-map-caption"><span className="ed-label">Published business knowledge</span><span className="ed-label">Select a connection ↙</span></div><div className="ed-network">
    <svg viewBox="0 0 600 390" aria-hidden="true" className="ed-connections"><path d="M300 195V48M300 195L70 145M300 195L530 145M300 195L150 330M300 195L450 330"/></svg>
    <div className="ed-map-center" aria-hidden="true"><span>One</span><strong>understanding.</strong></div>
    {nodes.map((r,i)=><button className={`ed-node ed-node-${i}`} key={r.id} aria-pressed={r.id===record.id} onClick={()=>setSelected(r.id)}><span className="ed-node-mark" aria-hidden="true">{r.kind==="business"?"◉":"↗"}</span><span><small>{r.kind}</small><strong>{r.title}</strong></span></button>)}
  </div><p className="ed-map-foot">One published graph. Different ways to explore it.</p></div><div className="ed-record" aria-live="polite" aria-atomic="true"><div className="ed-record-meta"><span className="ed-label">{record.kind}</span><span className="ed-status">{statusLabel(record.status)}</span></div><h3>{record.title}</h3><p>{record.description}</p><dl className="ed-relations">{related.slice(0,2).map((r,i)=><div key={i}><dt>{r.label.replace(/_/g," ")}</dt><dd>{r.other?.title}</dd></div>)}</dl><Source key={record.id} record={record}/>{record.href && <a className="ed-text-link" href={record.href}>Explore {record.title}<span aria-hidden="true">↗</span></a>}</div></div>;
}

export function KnowledgeIndex({records}:{records:EditorialRecord[]}) {
  const [query,setQuery]=useState("");
  const [submitted,setSubmitted]=useState("");
  const matches=submitted.trim()?records.filter(r=>(r.title+" "+r.description).toLowerCase().includes(submitted.trim().toLowerCase())).slice(0,3):[];
  return <div className="ed-knowledge"><div className="ed-knowledge-title"><span className="ed-label">Explore published knowledge</span><span className="ed-label">Read-only index</span></div><form onSubmit={e=>{e.preventDefault();setSubmitted(query);}}><label htmlFor="knowledge-query">Find a product, capability, or article</label><div className="ed-search"><input id="knowledge-query" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Try “continuity”" maxLength={100}/><button type="submit" aria-label="Search published knowledge">↗</button></div></form><div className="ed-suggestions">{["continuity","concierge","replay"].map(q=><button key={q} onClick={()=>{setQuery(q);setSubmitted(q);}}>{q}<span aria-hidden="true">↗</span></button>)}</div><div className="ed-results" aria-live="polite">{submitted && (matches.length ? matches.map(r=><article key={r.id}><span className="ed-label">{r.kind} · {statusLabel(r.status)}</span><h3>{r.title}</h3><p>{r.description}</p><Source record={r}/></article>):<p>No published record matches “{submitted}”. This index cannot establish pricing, availability, or other missing business facts.</p>)}</div><p className="ed-knowledge-note">Direct excerpts from the same records shown above. Search only; no AI-generated answers.</p></div>;
}
