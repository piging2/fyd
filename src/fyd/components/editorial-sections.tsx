/** Generic editorial presentations of the existing verified FYD graph.
 * No business names, fixture identities, network reads, or authority live here.
 * SiteSpec copy is presentation; record text still passes BindingVerifier.
 */
import type { FYDSection, ObjectGraph } from "../sitespec/types";
import type { PingObject } from "@/lib/ping/types";
import { editorialRecords, editorialHref } from "./editorial-model";
import { KnowledgeIndex } from "./editorial-interactions";
import { KnowledgeStory } from "./editorial-knowledge";
import { ProjectionPreview } from "./projection-preview";
import { EditorialLearning } from "./editorial-learning";
import { EditorialObjectMargins } from "./editorial-object-margins";
import { EditorialWorkspace } from "./editorial-workspace";
import { EditorialSymbol, articleSymbol } from "./editorial-symbols";
import { PrimitiveArtwork } from "./primitive-artwork";
import { ContinuityDrawing } from "./editorial-continuity";
import { EvidenceChain } from "./editorial-evidence";

export function EditorialSection({
  section,
  objects,
  graph,
}: {
  section: FYDSection;
  objects: PingObject[];
  graph: ObjectGraph;
}) {
  const p = section.presentation;
  const intent = p.editorial ?? {};
  const records = editorialRecords(objects, graph, intent.sourceOrigin);
  const actions = intent.actions ?? [];
  const artwork = section.component === "EditorialProof" ? "evidence" : section.component === "EditorialAtlas" ? "knowledge" : undefined;
  const intro = (
    <div className={`ed-intro${artwork ? " pg-material-intro pg-material-intro-" + artwork : ""}`}>
      <p className="ed-label">{intent.eyebrow}</p>
      <h2>{p.heading}</h2>
      {artwork && <figure className="pg-section-material">
        <PrimitiveArtwork concept={artwork} phase={2}/>
        <figcaption>{artwork === "evidence" ? "Keep the source in view." : "An idea becomes connected understanding."}</figcaption>
      </figure>}
      {p.copy && <p className="ed-copy">{p.copy}</p>}
    </div>
  );
  if (section.component === "EditorialHero")
    return (
      <section className="ed-hero" id={section.id}>
        {intent.previewEndpoint && <EditorialObjectMargins records={records} endpoint={intent.previewEndpoint} symbols={intent.symbols}/>}
        <div className="ed-hero-top">
          <p className="ed-label">{intent.eyebrow}</p>
          {intent.heroEdition && <span className="pl-hero-edition">{intent.heroEdition}</span>}
        </div>
        <div className="ed-wordmark" aria-hidden="true">
          {intent.wordmark ?? records[0]?.title}
        </div>
        {intent.heroSeal && <ContinuityDrawing/>}
        <div className="ed-hero-bottom">
          <h1>{p.heading}</h1>
          <div className="pl-hero-explanation"><p className="ed-hero-note">{p.copy}</p>{intent.heroNote && <p className="pl-caption">{intent.heroNote}</p>}</div>
          <div className="ed-hero-actions">
            {actions.map((a, i) => (
              <a
                className={i === 0 ? "ed-button" : "ed-text-link"}
                key={a.href}
                href={editorialHref(a.href, intent.sourceOrigin)}
              >
                {a.label}
                <span aria-hidden="true">↗</span>
              </a>
            ))}
          </div>
        </div>
        {intent.principles?.length ? (
          <div className="ed-hero-line">
            {intent.principles.map((principle) => (
              <span key={principle}>{principle}</span>
            ))}
          </div>
        ) : null}
      </section>
    );
  if (section.component === "EditorialLearning" && intent.learning)
    return <section className={"ed-section pl-learning pl-learning-"+intent.learning.kind} id={section.id}>{intro}<EditorialLearning intent={intent.learning}/></section>;
  if (section.component === "EditorialProducts")
    return <section className="ed-section pl-products" id={section.id}>{intro}<div className="pl-product-grid">{records.map((r,i)=><article key={r.id} className="pg-evolve"><div className="pl-product-top"><span className="pl-status">{r.status?.replace(/-/g," ")}</span><EditorialSymbol concept={intent.symbols?.[r.id]??"projection"} phase={1}/></div><h3>{r.title}</h3><p>{r.description}</p>{r.href&&<a className="ed-text-link" href={r.href}>Explore {r.title}<span aria-hidden="true">↗</span></a>}<details><summary>Published source</summary><code>{r.source}</code></details></article>)}</div></section>;
  if (section.component === "EditorialWorkspace" && intent.workspace)
    return (
      <section className="ed-section ed-operating" id={section.id}>
        {intro}
        <EditorialWorkspace intent={intent.workspace} />
      </section>
    );
  if (section.component === "EditorialAtlas")
    return (
      <section className="ed-atlas-section" id={section.id}>
        {intro}
        <KnowledgeStory
          records={records}
          relationships={graph.relationships
            .filter(
              (r) =>
                records.some((o) => o.id === r.subject) &&
                records.some((o) => o.id === r.object),
            )
            .map((r) => ({
              from: r.subject,
              to: r.object,
              label: r.predicate,
            }))}
        />
      </section>
    );
  if (section.component === "EditorialKnowledge")
    return (
      <section className="ed-knowledge-section ed-section" id={section.id}>
        {intro}
        <KnowledgeIndex
          records={records}
          suggestedQueries={intent.suggestedQueries}
        />
      </section>
    );
  if (section.component === "EditorialPublications")
    return (
      <section className="ed-publications ed-section" id={section.id}>
        {intro}
        <div className="ed-publication-list">
          {[...records].sort((a,b)=>(b.date??"").localeCompare(a.date??"")).map((r, i) => (
            <article key={r.id} className="pg-evolve">
              <div className={"pl-journal-art pl-journal-art-"+i} aria-hidden="true"><PrimitiveArtwork concept={articleSymbol(r.id)} phase={2}/><b>FIELD NOTES / 0{i+1}</b><i className="pg-art-register"/></div>
              <div>
                <p className="ed-label">{r.date?.slice(0, 10) ?? r.kind}</p>
                <h3>
                  <a href={r.href}>
                    {r.title}
                    <span aria-hidden="true">↗</span>
                  </a>
                </h3>
                <p>{r.description}</p>
              </div>
            </article>
          ))}
        </div>
        {actions.map(a=><a key={a.href} className="ed-text-link pl-journal-more" href={editorialHref(a.href,intent.sourceOrigin)}>{a.label}<span aria-hidden="true">↗</span></a>)}
      </section>
    );
  if (section.component === "EditorialProof" && intent.previewEndpoint)
    return (
      <section className="ed-section ed-proof" id={section.id}>
        {intro}
        <EvidenceChain endpoint={intent.previewEndpoint} />
        <ProjectionPreview endpoint={intent.previewEndpoint} />
        <div className="ed-section-actions">
          {actions.map((a) => (
            <a
              className="ed-text-link"
              key={a.href}
              href={editorialHref(a.href, intent.sourceOrigin)}
            >
              {a.label}
              <span aria-hidden="true">↗</span>
            </a>
          ))}
        </div>
      </section>
    );
  return (
    <section
      className={`ed-section ed-story ${section.component === "EditorialProof" ? "ed-proof" : ""}`}
      id={section.id}
    >
      {intro}
      <div className="ed-panels">
        {intent.panels?.map((panel, i) => (
          <article key={panel.title}>
            <span className="ed-label">
              {panel.label || String(i + 1).padStart(2, "0")}
            </span>
            <h3>{panel.title}</h3>
            <p>{panel.copy}</p>
            {panel.href && (
              <a
                className="ed-text-link"
                href={editorialHref(panel.href, intent.sourceOrigin)}
              >
                {panel.linkLabel ?? "Explore"}
                <span aria-hidden="true">↗</span>
              </a>
            )}
          </article>
        ))}
      </div>
      {actions.length > 0 && (
        <div className="ed-section-actions">
          {actions.map((a) => (
            <a
              className="ed-button"
              key={a.href}
              href={editorialHref(a.href, intent.sourceOrigin)}
            >
              {a.label}
              <span aria-hidden="true">↗</span>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}
