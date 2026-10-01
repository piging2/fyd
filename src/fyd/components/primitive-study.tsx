"use client";

import { Component, lazy, Suspense, useCallback, useRef, useState, type ReactNode } from "react";
import { PrimitiveArtwork as Artwork } from "./primitive-artwork";
const PrimitiveScene=lazy(()=>import("./primitive-scene").then(module=>({default:module.PrimitiveScene})));

class SceneBoundary extends Component<{children:ReactNode;onError:()=>void},{failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  componentDidCatch(){this.props.onError();}
  render(){return this.state.failed?null:this.props.children;}
}

type Concept="continuity"|"evidence"|"knowledge";
type Primitive={id:Concept; index:string; name:string; meaning:string; stages:[string,string,string]; detail:string; phaseDetail:[string,string,string]; source:string; path:{name:string;href:string}[]};
// Presentation descriptors only. These concepts do not create or mutate PING state.
export const studyPrimitives:Primitive[]=[
  {id:"continuity",index:"01",name:"Continuity",meaning:"Keep the thread",stages:["Record","Link","Persist"],detail:"Every new piece of work can carry the context that came before it. A record becomes a relationship. A relationship becomes a memory you can return to.",phaseDetail:["Keep the original record. Give the next interaction somewhere to begin.","Connect the new record to what came before. The earlier form stays present.","Keep the connected history available across conversations, people, and work."],source:"/docs#persistence",path:[{name:"Events",href:"/docs#events"},{name:"Knowledge",href:"/docs#knowledge"},{name:"Persistence",href:"/docs#persistence"}]},
  {id:"evidence",index:"03",name:"Evidence",meaning:"Ground truth",stages:["Collect","Verify","Preserve"],detail:"Understanding needs a source. Keep what was observed, examine what it supports, and preserve the connection so the next person can inspect it.",phaseDetail:["Collect the observation with its source, before interpretation changes its meaning.","Check what the source supports. Keep its limits visible alongside the claim.","Preserve the source and its relationships so the conclusion remains inspectable."],source:"/docs#evidence",path:[{name:"Observation",href:"/docs#model"},{name:"Claims",href:"/docs#knowledge"},{name:"Verification",href:"/docs#evidence"},{name:"Witness",href:"/docs#witness"},{name:"Lineage",href:"/docs#lineage"},{name:"Replay",href:"/docs#replay"}]},
  {id:"knowledge",index:"09",name:"Knowledge",meaning:"Connected understanding",stages:["Ingest","Connect","Evolve"],detail:"An isolated fact is a beginning. Connect it to its sources and the ideas around it, and understanding becomes something the whole system can build on.",phaseDetail:["Bring a source into view. Preserve where each piece of understanding began.","Link the ideas without losing their sources. Relationships give facts context.","Let the connected model grow as evidence arrives. Earlier knowledge remains traceable."],source:"/docs#knowledge",path:[{name:"Evidence",href:"/docs#evidence"},{name:"Relationships",href:"/docs#knowledge"},{name:"Lineage",href:"/docs#lineage"}]},
];

export function PrimitiveStudy(){
  const [selected,setSelected]=useState<Primitive>(studyPrimitives[0]);
  const [phase,setPhase]=useState(2);
  const [live,setLive]=useState(false);
  const [ready,setReady]=useState(false);
  const [failed,setFailed]=useState(false);
  const [focused,setFocused]=useState(false);
  const inspection=useRef<HTMLElement>(null);
  const origin=useRef<HTMLButtonElement|null>(null);
  const sceneReady=useCallback(()=>setReady(true),[]);
  const sceneError=useCallback(()=>{setFailed(true);setReady(false);setLive(false)},[]);
  const select=(item:Primitive,index:number,button?:HTMLButtonElement)=>{
    if(selected.id!==item.id){setReady(false);setLive(false);setFailed(false)}
    setSelected(item);setPhase(index);
    if(button){origin.current=button;setFocused(true);requestAnimationFrame(()=>inspection.current?.focus({preventScroll:true}));inspection.current?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'nearest'});}
  };
  return <>
    <section className="pg-study-matrix" aria-label="Three foundational primitives, each in three evolving stages">
      <div className="pg-study-grid">
        {studyPrimitives.map(item=><article key={item.id} id={`primitive-${item.id}`} className="pg-study-card" data-selected={selected.id===item.id}>
          <header><span className="pg-study-index">{item.index}</span><div><h2>{item.name}</h2><p>{item.meaning}</p></div></header>
          <ol className="pg-study-sequence" aria-label={`${item.name}: three evolving stages`}>
            {item.stages.map((stage,i)=><li key={stage}><button aria-label={`Inspect ${item.name}: ${stage}`} aria-controls="primitive-inspection" onClick={e=>select(item,i,e.currentTarget)}><Artwork concept={item.id} phase={i} eager/><span className="pg-study-stage"><small>{i+1}</small><span>{stage}</span></span></button></li>)}
          </ol>
        </article>)}
        <aside className="pg-study-thesis"><div><p className="pg-study-eyebrow">The PING visual language</p><p className="pg-study-thesis-copy">The next shape<br/>keeps the <em>earlier one.</em></p><p className="pg-study-thesis-note">Each primitive evolves.<br/>The meaning endures.</p></div><Artwork concept="continuity" phase={2}/></aside>
      </div>
      <div className="pg-study-board-caption"><p><span className="pg-status-dot"/>Form studies <span className="pg-separator">/</span> 01 · 03 · 09</p><p>Select a stage. Follow what it becomes. <span aria-hidden="true">↓</span></p></div>
    </section>

    <section id="primitive-inspection" ref={inspection} tabIndex={-1} className="pg-study-inspection" aria-labelledby="inspection-title" data-focused={focused} onKeyDown={e=>{if(e.key==="Escape"){setFocused(false);origin.current?.focus()}}}>
      <div className="pg-study-inspection-top"><p className="pg-study-eyebrow"><span>{selected.index}</span> / An evolving system</p><div role="group" aria-label="Choose a primitive" className="pg-study-concepts">{studyPrimitives.map(item=><button key={item.id} aria-pressed={selected.id===item.id} onClick={()=>select(item,phase)}>{item.name}</button>)}</div></div>
      <div className="pg-study-inspection-body">
        <div className="pg-study-specimen" data-live={live&&ready}>
          <span className="pg-specimen-axis pg-specimen-axis-x" aria-hidden="true"/><span className="pg-specimen-axis pg-specimen-axis-y" aria-hidden="true"/>
          <span className="pg-specimen-coordinate" aria-hidden="true">{selected.index} / 0{phase+1}</span>
          <div className="pg-study-poster"><Artwork concept={selected.id} phase={phase} eager/></div>
          {live&&<SceneBoundary onError={sceneError}><Suspense fallback={null}><PrimitiveScene key={selected.id} concept={selected.id} phase={phase} className="pg-study-scene" onReady={sceneReady} onError={sceneError}/></Suspense></SceneBoundary>}
          <div className="pg-study-specimen-foot"><span>Explanatory form <i aria-hidden="true">·</i> {selected.name}</span><button className="pg-study-render-toggle" onClick={()=>{setLive(!live);setReady(false);setFailed(false)}} aria-pressed={live}>{live?"Still artwork":"Explore in 3D"}<span aria-hidden="true">{live?"↙":"↗"}</span></button></div>
          {failed&&<p className="pg-study-render-status" role="status">The artwork is available. This browser could not open the 3D view.</p>}
          {live&&!ready&&<p className="pg-study-render-status" role="status">Preparing the form…</p>}
        </div>
        <div className="pg-study-explanation">
          <p className="pg-study-eyebrow">{selected.name} <span className="pg-separator">/</span> {String(phase+1).padStart(2,"0")} — {selected.stages[phase]}</p>
          <h2 id="inspection-title">{selected.id==="continuity"?<>Keep<br/>the thread<span>.</span></>:selected.id==="evidence"?<>Give truth<br/>a source<span>.</span></>:<>Let knowledge<br/>compound<span>.</span></>}</h2>
          <p className="pg-study-detail">{selected.detail}</p>
          <div className="pg-study-stage-selector" role="group" aria-label={`${selected.name} stage`}>{selected.stages.map((stage,i)=><button key={stage} aria-pressed={phase===i} onClick={()=>setPhase(i)}><small>0{i+1}</small><span>{stage}</span><span className="pg-stage-signal" aria-hidden="true"/></button>)}</div>
          <p className="pg-study-phase-detail" aria-live="polite">{selected.phaseDetail[phase]}</p>
          <a href={selected.source} className="pg-study-guide">Enter the {selected.name.toLowerCase()} field guide <span aria-hidden="true">↗</span></a>
        </div>
      </div>
      <nav className="pg-study-path" aria-label={`${selected.name} learning path`}><p>Follow the connection</p><ol>{selected.path.map((step,i)=><li key={step.name}><a href={step.href}><span>{step.name}</span><span aria-hidden="true">{i<selected.path.length-1?"→":"↗"}</span></a></li>)}</ol></nav>
    </section>

    <section className="pg-study-product" aria-labelledby="product-heading"><div className="pg-study-product-title"><p className="pg-study-eyebrow">One intelligence. Carried forward.</p><h2 id="product-heading">PING</h2><p>The intelligence core</p></div><div className="pg-study-product-description"><p>Events become evidence.<br/>Evidence becomes understanding.<br/><strong>Understanding shapes what comes next.</strong></p><a href="/#architecture">Explore the living system <span aria-hidden="true">↗</span></a></div><div className="pg-study-product-art"><Artwork concept="evidence" phase={2}/><Artwork concept="knowledge" phase={2}/></div><div className="pg-study-product-next"><p className="pg-study-eyebrow">Meet the public interface</p><a href="/#fyd">FYD <span aria-hidden="true">↗</span></a><p>Real business records.<br/>Explainable context.<br/>A living conversation.</p></div></section>
    <div className="pg-study-colophon"><span>Continuity · Context · Capability · Compounding</span><span>Visual language / Three-form study</span></div>
  </>;
}
