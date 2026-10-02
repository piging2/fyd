from pathlib import Path
root=Path(__file__).resolve().parents[3]
p=root/"src/fyd/sitespec/types.ts"
s=p.read_text().replace('  eyebrow?: string;','  learning?: import("../components/editorial-learning").LearningIntent;\n  eyebrow?: string;',1);p.write_text(s)
p=root/"src/fyd/components/registry.ts";s=p.read_text().replace('"EditorialWorkspace"].map','"EditorialWorkspace", "EditorialLearning", "EditorialProducts"].map').replace('"EditorialPublications"].includes','"EditorialPublications", "EditorialProducts"].includes');p.write_text(s)
p=root/"src/fyd/components/renderer.tsx";s=p.read_text().replace('    case "EditorialWorkspace":','    case "EditorialLearning":\n    case "EditorialProducts":\n    case "EditorialWorkspace":');p.write_text(s)
p=root/"src/fyd/components/editorial-sections.tsx";s=p.read_text().replace('import { EditorialWorkspace }', 'import { EditorialLearning } from "./editorial-learning";\nimport { EditorialObjectMargins } from "./editorial-object-margins";\nimport { EditorialWorkspace }')
s=s.replace('<section className="ed-hero" id={section.id}>','<section className="ed-hero" id={section.id}>\n        {intent.previewEndpoint && <EditorialObjectMargins records={records} endpoint={intent.previewEndpoint}/>}').replace('<p className="ed-hero-note">{p.copy}</p>','<span className="pl-hero-edition">A system in the making. A different way to think.</span>')
s=s.replace('<h1>{p.heading}</h1>','<h1>{p.heading}</h1>\n          <div className="pl-hero-explanation"><p className="ed-hero-note">{p.copy}</p><p className="pl-caption">For people building businesses. And the agents working with them.</p></div>')
s=s.replace('  if (section.component === "EditorialWorkspace"', '''  if (section.component === "EditorialLearning" && intent.learning)
    return <section className={"ed-section pl-learning pl-learning-"+intent.learning.kind} id={section.id}>{intro}<EditorialLearning intent={intent.learning}/></section>;
  if (section.component === "EditorialProducts")
    return <section className="ed-section pl-products" id={section.id}>{intro}<div className="pl-product-grid">{records.map((r,i)=><article key={r.id}><div className="pl-product-top"><span className="pl-status">{r.status?.replace(/-/g," ")}</span><span aria-hidden="true">{["↗","◎","✳","⌘"][i%4]}</span></div><h3>{r.title}</h3><p>{r.description}</p>{r.href&&<a className="ed-text-link" href={r.href}>Explore {r.title}<span aria-hidden="true">↗</span></a>}<details><summary>Published source</summary><code>{r.source}</code></details></article>)}</div></section>;
  if (section.component === "EditorialWorkspace"''')
s=s.replace('{records.map((r, i) => (','{[...records].sort((a,b)=>(b.date??"").localeCompare(a.date??"")).slice(0,3).map((r, i) => (',1)
s=s.replace('<span className="ed-label">{String(i + 1).padStart(2, "0")}</span>', '<div className={"pl-journal-art pl-journal-art-"+i} aria-hidden="true"><span>{["⌘","↗","◎"][i]}</span><b>FIELD NOTES / 0{i+1}</b></div>',1)
s=s.replace('      </section>\n    );\n  if (section.component === "EditorialProof"', '        <a className="ed-text-link pl-journal-more" href="/blog">Read the whole journal <span aria-hidden="true">↗</span></a>\n      </section>\n    );\n  if (section.component === "EditorialProof"')
p.write_text(s)
p=root/".gitignore";s=p.read_text();s+="\n# Local dependency symlinks as well as directories\n/node_modules\n/apps/editorial-preview/node_modules\n";p.write_text(s)
