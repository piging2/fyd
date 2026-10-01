"use client";
import { useState } from "react";
import { EditorialSymbol, symbolForms, type SymbolName } from "./editorial-symbols";

import { PrimitiveArtwork } from "./primitive-artwork";

/* One record, three views. The artwork is a single continuous strip; the
 * steps are lenses onto it, not a carousel: the abstract meaning of each
 * view stays visible while the concrete example follows the active view. */
const steps = [
  {
    label: "Record",
    teach: "An observation enters the system.",
    example: "\u201cUse the side entrance.\u201d A customer request becomes a record.",
    alt: "A violet glass ring surrounding a gold core: a record is retained.",
  },
  {
    label: "Connect",
    teach: "It relates to existing knowledge.",
    example: "The request attaches to its customer and the conversation it came from.",
    alt: "Connected violet orbits around the same core: the record gains relationships.",
  },
  {
    label: "Carry forward",
    teach: "Useful context survives into future work.",
    example: "The next visit starts with that context. An illustrative workflow.",
    alt: "Nested translucent rings keep the gold core present: context carries forward.",
  },
];

export function ContinuityDrawing() {
  const [phase, setPhase] = useState(2);
  return <div className="pg-continuity" data-phase={phase}>
    <div className="pg-continuity-heading"><span className="ed-label">A customer request, carried forward</span><span className="pg-drawing-index" aria-hidden="true">0{phase + 1} / 03</span></div>
    <div className="pg-continuity-material" role="img" aria-label={steps[phase].alt}><PrimitiveArtwork concept="continuity" phase={phase} eager priority/></div>
    <ol className="pg-continuity-steps" aria-label="Three views of one record">
      {steps.map((step, index) => <li key={step.label} data-active={phase === index}>
        <button type="button" aria-pressed={phase === index} onClick={() => setPhase(index)}>
          <span className="pg-step-num" aria-hidden="true">0{index + 1}</span>
          <span className="pg-step-text"><strong>{step.label}</strong><small>{step.teach}</small></span>
        </button>
      </li>)}
    </ol>
    <p className="pg-continuity-example" aria-live="polite">{steps[phase].example}</p>
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
