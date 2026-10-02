import {getWebsiteObjects,getWebsiteRelationships} from "@/lib/ping/website-objects";
import {verifyPublicProjection} from "@/fyd/sitespec/public-projection";
import {buildRenderContext,SitePageView} from "@/fyd/components/renderer";
import {spec} from "../presentation";
import {Navigation} from "./navigation";
import {Footer} from "./footer";
export const dynamic="force-static";
export default function Page(){const projection=verifyPublicProjection({objects:getWebsiteObjects(),relationships:getWebsiteRelationships()},[],"anonymous");const ctx=buildRenderContext(spec,projection.graph,{viewerId:null,displayName:null});return <><a className="ed-skip" href="#main">Skip to content</a><Navigation items={spec.navigation}/><main id="main"><SitePageView page={spec.pages[0]} ctx={ctx}/></main><Footer/></>}
