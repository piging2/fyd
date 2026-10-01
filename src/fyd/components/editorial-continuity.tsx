"use client";
import { useState } from "react";
import { EditorialSymbol, symbolForms, type SymbolName } from "./editorial-symbols";

import { PrimitiveArtwork } from "./primitive-artwork";

const phases = ["Record", "Connect", "Carry forward"];

export function ContinuityDrawing() {
  const [phase, setPhase] = useState(2);
  return <div className="pg-continuity" data-phase={phase}>
    <div className="pg-continuity-heading"><span className="ed-label">A customer request, carried forward</span><span className="pg-drawing-index">01 → 03</span></div>
    <div className="pg-continuity-material" role="img" aria-label={[
      "A violet glass ring surrounding a gold core: a record is retained.",
      "Connected violet orbits surrounding the same core: records gain relationships.",
      "Nested translucent rings keep the gold core present: context carries forward.",
    ][phase]}><PrimitiveArtwork concept="continuity" phase={phase} eager priority/></div>
    <div className="pg-continuity-controls" role="group" aria-label="Explore the continuity drawing">
      {phases.map((label, index) => <button key={label} aria-pressed={phase===index} onClick={()=>setPhase(index)}><span>0{index+1}</span>{label}</button>)}
    </div>
    <p className="pg-drawing-caption" aria-live="polite">{[
      "“Use the side entrance.” A customer request becomes a record.",
      "Attach the request to its customer and the conversation it came from.",
      "The next visit can start with that context. An illustrative workflow.",
    ][phase]}</p>
    <a className="pg-material-link" href="/design">Explore the evolving forms <span aria-hidden="true">↗</span></a>
  </div>;
}

export function SymbolAtlas() {
  const [phase, setPhase] = useState(2);
  const [selected, setSelected] = useState<SymbolName>("continuity");
  const form = symbolForms[selected];
  return <div className="pg-atlas-lab">
    <div className="pg-atlas-toolbar"><p>Every form retains its origin as it develops.</p><div aria-label="Drawing phase">{["Origin","Relationship","Context"].map((label,index)=><button key={label} aria-pressed={phase===index} onClick={()=>setPhase(index)}><span>0{index+1}</span>{label}</button>)}</div></div>
    <div className="pg-symbol-grid">{Object.entries(symbolForms).map(([name, item], index)=><button className="pg-symbol-tile" key={name} aria-pressed={selected===name} onClick={()=>setSelected(name as SymbolName)}><span className="pg-tile-number">{String(index+1).padStart(2,"0")}</span><EditorialSymbol concept={name} phase={phase}/><strong>{item.label}</strong><span className="pg-tile-stage">{item.stages[phase]}</span></button>)}</div>
    <div className="pg-symbol-inspector" aria-live="polite" aria-atomic="true"><EditorialSymbol concept={selected} phase={phase}/><div><p className="ed-label">{form.label} / Anatomy of a symbol</p><h2>{form.meaning}</h2><ol>{form.stages.map((stage,index)=><li key={stage} data-selected={index===phase}><span>0{index+1}</span>{stage}</li>)}</ol><p className="pl-caption">Conceptual stages, not live status.</p><div className="pg-scale-strip" aria-label="Symbol at small sizes">{[24,32,64].map(size=><figure key={size}><div style={{width:size,height:size}}><EditorialSymbol concept={selected}/></div><figcaption>{size} px</figcaption></figure>)}</div></div><div className="pg-evolution" aria-label={`${form.label}: all three stages`}>{form.stages.map((stage,index)=><figure key={stage}><EditorialSymbol concept={selected} phase={index}/><figcaption><span>0{index+1}</span>{stage}</figcaption></figure>)}</div></div>
  </div>;
}
