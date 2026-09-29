/** Generic editorial presentations of the existing verified FYD graph.
 * No business names, fixture identities, network reads, or authority live here.
 * SiteSpec copy is presentation; record text still passes BindingVerifier.
 */
import type { FYDSection, ObjectGraph } from "../sitespec/types";
import type { PingObject } from "@/lib/ping/types";
import { resolveBoundFieldVerified, ownerAssertionsFromGraph } from "../sitespec/binding-verifier";
import { EditorialAtlas, KnowledgeIndex } from "./editorial-interactions";
import { ProjectionPreview } from "./projection-preview";

export interface EditorialIntent {
  eyebrow?: string;
  wordmark?: string;
  sourceOrigin?: string;
  previewEndpoint?: string;
  actions?: { label: string; href: string }[];
  panels?: { label: string; title: string; copy: string; href?: string; linkLabel?: string }[];
}
export interface EditorialRecord {
  id: string; title: string; description: string; kind: string;
  status?: string; href?: string; source: string; date?: string;
}
export function editorialHref(value: string | undefined, origin = ""): string | undefined {
  if (!value) return undefined;
  if (/^#[A-Za-z0-9_-]+$/.test(value)) return value;
  if (/^\/(?!\/)[^\\]*$/.test(value)) return origin + value;
  return undefined;
}
export function editorialRecords(objects: PingObject[], graph: ObjectGraph, origin = ""): EditorialRecord[] {
  const assertions = ownerAssertionsFromGraph(graph);
  return objects.flatMap(o => {
    const bound = (field: string) => resolveBoundFieldVerified(graph, {objectId:o.id, field, classification:"direct"}, assertions);
    const title = bound("title");
    if (!title) return [];
    return [{ id:o.id, title, description:bound("description") ?? "", kind:o.schema.split(".").pop()?.split("@")[0] ?? "record",
      status:bound("status"), href:editorialHref(bound("url"), origin),
      source:o.provenance?.ref ?? "Source not recorded", date:bound("date") }];
  });
}
export function EditorialSection({section, objects, graph}: {section:FYDSection; objects:PingObject[]; graph:ObjectGraph}) {
  const p = section.presentation;
  const intent = p.editorial ?? {};
  const records = editorialRecords(objects, graph, intent.sourceOrigin);
  const actions = intent.actions ?? [];
  const intro = <div className="ed-intro"><p className="ed-label">{intent.eyebrow}</p><h2>{p.heading}</h2>{p.copy && <p className="ed-copy">{p.copy}</p>}</div>;
  if(section.component === "EditorialHero") return <section className="ed-hero" id={section.id}>
    <div className="ed-hero-top"><p className="ed-label">{intent.eyebrow}</p><p className="ed-hero-note">{p.copy}</p></div>
    <div className="ed-wordmark" aria-hidden="true">{intent.wordmark ?? records[0]?.title}</div>
    <div className="ed-hero-bottom"><h1>{p.heading}</h1><div className="ed-hero-actions">{actions.map((a,i)=><a className={i === 0 ? "ed-button" : "ed-text-link"} key={a.href} href={editorialHref(a.href,intent.sourceOrigin)}>{a.label}<span aria-hidden="true">↗</span></a>)}</div></div>
    <div className="ed-hero-line"><span>Understanding</span><span>Continuity</span><span>Useful work</span><span>Human control</span></div>
  </section>;
  if(section.component === "EditorialAtlas") return <section className="ed-atlas-section" id={section.id}>{intro}<EditorialAtlas records={records} relationships={graph.relationships.filter(r=>records.some(o=>o.id===r.subject)&&records.some(o=>o.id===r.object)).map(r=>({from:r.subject,to:r.object,label:r.predicate}))}/></section>;
  if(section.component === "EditorialKnowledge") return <section className="ed-knowledge-section ed-section" id={section.id}>{intro}<KnowledgeIndex records={records}/></section>;
  if(section.component === "EditorialPublications") return <section className="ed-publications ed-section" id={section.id}>{intro}<div className="ed-publication-list">{records.map((r,i)=><article key={r.id}><span className="ed-label">{String(i+1).padStart(2,"0")}</span><div><p className="ed-label">{r.date?.slice(0,10) ?? r.kind}</p><h3><a href={r.href}>{r.title}<span aria-hidden="true">↗</span></a></h3><p>{r.description}</p></div></article>)}</div></section>;
  if(section.component === "EditorialProof" && intent.previewEndpoint) return <section className="ed-section ed-proof" id={section.id}>{intro}<ProjectionPreview endpoint={intent.previewEndpoint}/><div className="ed-section-actions">{actions.map(a=><a className="ed-text-link" key={a.href} href={editorialHref(a.href,intent.sourceOrigin)}>{a.label}<span aria-hidden="true">↗</span></a>)}</div></section>;
  return <section className={`ed-section ed-story ${section.component === "EditorialProof" ? "ed-proof" : ""}`} id={section.id}>{intro}<div className="ed-panels">{intent.panels?.map((panel,i)=><article key={panel.title}><span className="ed-label">{panel.label || String(i+1).padStart(2,"0")}</span><h3>{panel.title}</h3><p>{panel.copy}</p>{panel.href && <a className="ed-text-link" href={editorialHref(panel.href,intent.sourceOrigin)}>{panel.linkLabel ?? "Explore"}<span aria-hidden="true">↗</span></a>}</article>)}</div>{actions.length > 0 && <div className="ed-section-actions">{actions.map(a=><a className="ed-button" key={a.href} href={editorialHref(a.href,intent.sourceOrigin)}>{a.label}<span aria-hidden="true">↗</span></a>)}</div>}</section>;
}
