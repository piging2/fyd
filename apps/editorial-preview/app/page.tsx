import { getWebsiteObjects, getWebsiteRelationships } from "@/lib/ping/website-objects";
import { verifyPublicProjection } from "@/fyd/sitespec/public-projection";
import { buildRenderContext, SitePageView } from "@/fyd/components/renderer";
import { spec, SOURCE_ORIGIN } from "../presentation";
import { Navigation } from "./navigation";
export const dynamic="force-static";
export default function Page(){
  const projection=verifyPublicProjection({objects:getWebsiteObjects(),relationships:getWebsiteRelationships()},[],"anonymous");
  const ctx=buildRenderContext(spec,projection.graph,{viewerId:null,displayName:null});
  return <><a className="ed-skip" href="#main">Skip to content</a><Navigation items={spec.navigation}/><main id="main"><SitePageView page={spec.pages[0]} ctx={ctx}/></main><footer className="ed-footer"><a className="ed-footer-mark" href="#home" aria-label="PING home">PING</a><p>Built with FYD.<br/>A private presentation candidate.</p><nav aria-label="More from PING">{["Technology","Products","Blog","About","Contact","FAQ","Privacy","Newsletter"].map(label=><a key={label} href={`${SOURCE_ORIGIN}/${label.toLowerCase()}`}>{label}</a>)}</nav><p className="ed-footer-note">Published records retain their source and maturity. This preview makes no live runtime-health claim.</p></footer></>;
}
