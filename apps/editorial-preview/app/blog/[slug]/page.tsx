import type {Metadata} from "next";
import {notFound} from "next/navigation";
import {getAllSlugs,getPost,renderMarkdown} from "@/lib/blog";
import {Navigation} from "../../navigation";
import {Footer} from "../../footer";
import {spec} from "../../../presentation";
import "../../reading.css";
export function generateStaticParams(){return getAllSlugs().map(slug=>({slug}))}
export async function generateMetadata({params}:{params:Promise<{slug:string}>}):Promise<Metadata>{const {slug}=await params;return {title:getPost(slug)?.title??"Article not found"}}
export default async function Article({params}:{params:Promise<{slug:string}>}){const {slug}=await params;const post=getPost(slug);if(!post)notFound();return <><a className="ed-skip" href="#main">Skip to content</a><Navigation items={spec.navigation}/><main id="main" className="article-page"><a className="ed-text-link" href="/blog">← Back to the journal</a><header><p className="ed-label"><time dateTime={post.date}>{post.date}</time> / {post.tags.join(" · ")}</p><h1>{post.title}</h1><p>{post.excerpt}</p></header><div className="article-body" dangerouslySetInnerHTML={{__html:renderMarkdown(post.body).replace(/<h1\b/g,"<h2").replace(/<\/h1>/g,"</h2>")}}/><aside className="article-note">From the published build journal. Implementation and status statements reflect the article’s date.</aside><a className="ed-button" href="/docs">Explore the field guide <span aria-hidden="true">↗</span></a></main><Footer/></>}
