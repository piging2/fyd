import {PrimitiveArtwork} from "@/fyd/components/primitive-artwork";
import {articleSymbol} from "@/fyd/components/editorial-symbols";
import type {Metadata} from "next";
import {getAllPosts} from "@/lib/blog";
import {Navigation} from "../navigation";
import {Footer} from "../footer";
import {spec} from "../../presentation";
import "../reading.css";
export const metadata:Metadata={title:"PING — Build journal",description:"Notes on continuity, evidence, execution boundaries, and building PING."};
export default function Journal(){const posts=getAllPosts();return <><a className="ed-skip" href="#main">Skip to content</a><Navigation items={spec.navigation}/><main id="main" className="journal-page"><header className="journal-hero"><p className="ed-label">PING / Build journal</p><h1>The work.<br/>The thinking.<br/>The next question.</h1><p>Notes from building a system that remembers. Read the decisions, the constraints, and what the work is teaching us.</p></header><div className="journal-grid">{posts.map((p,i)=><article key={p.slug} className="pg-evolve"><a className={"pl-journal-art pl-journal-art-"+i%3} href={"/blog/"+p.slug} aria-label={"Read "+p.title}><PrimitiveArtwork concept={articleSymbol(p.slug)} phase={2}/><b>FIELD NOTES / {String(i+1).padStart(2,"0")}</b></a><div className="journal-card-copy"><div className="ed-label"><time dateTime={p.date}>{p.date}</time>{p.tags[0]&&" / "+p.tags[0]}</div><h2><a href={"/blog/"+p.slug}>{p.title} <span aria-hidden="true">↗</span></a></h2><p>{p.excerpt}</p></div></article>)}</div></main><Footer/></>}
