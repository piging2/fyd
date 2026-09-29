import type { FYDSiteSpec, FYDSection } from "@/fyd/sitespec/types";
import { WEBSITE_BUSINESS_ID } from "@/lib/ping/website-objects";

export const SOURCE_ORIGIN = "http://100.79.154.43:3100";
const section = (id:string, component:string, heading:string, copy:string, editorial:NonNullable<FYDSection["presentation"]["editorial"]>, query:FYDSection["query"]={kind:"static"}):FYDSection => ({id,component,query,presentation:{heading,copy,editorial:{sourceOrigin:SOURCE_ORIGIN,...editorial}}});
/** Nolan's presentation direction, isolated from the published business graph.
 * No canonical owner assertion, deployment approval or live status is implied.
 */
export const spec: FYDSiteSpec = {
  kind:"fyd.sitespec@1",version:1,ownerObjectId:WEBSITE_BUSINESS_ID,
  generator:{name:"fyd-site-generator",version:"editorial-candidate-1",generatedAt:"2026-09-28T00:00:00Z"},
  status:"draft",themeTokens:{accent:"#ddf277",accentForeground:"#151715",surface:"#f5f5ef",ink:"#151715",radius:"none",fontDisplay:"DM Sans, sans-serif",fontBody:"DM Sans, sans-serif",motionTokens:{motionIntensity:"NONE",entrance:"REVEAL",objectTransition:"CROSSFADE",stagger:"NONE"}},
  navigation:[{label:"Understanding",pageSlug:"understanding"},{label:"FYD",pageSlug:"fyd"},{label:"For builders",pageSlug:"builders"}],
  provenance:{source:"website-ingestion",claimKind:"website_statement",note:"Read-only projection of the versioned website authorities. Editorial copy is proposed presentation, not business fact."},
  pages:[{slug:"home",title:"PING",navLabel:"Home",sections:[
    section("home","EditorialHero","Your business, understood.\nEven as it changes.","PING connects business knowledge, its history, and the boundaries for useful AI work.",{eyebrow:"Continuity for people & AI",wordmark:"PING",actions:[{label:"See it in FYD",href:"#fyd"},{label:"Explore PING",href:"#understanding"}]},{kind:"owner"}),
    section("understanding","EditorialAtlas","A business is more\nthan its pages.","People, products, knowledge, and the relationships between them. Explore PING’s published records, with their sources a click away.",{eyebrow:"01 / Understand"},{kind:"all"}),
    section("continuity","EditorialStory","The right context\nfollows the work.","PING is being built so understanding can outlast a conversation—and useful work can happen within clear boundaries.",{eyebrow:"02 / Remember → work",panels:[
      {label:"Memory",title:"Keep the why.",copy:"Preserve the history behind a decision, not just its latest answer. PING’s event and evidence work provides the foundation.",href:"/technology/continuity",linkLabel:"Explore continuity"},
      {label:"Authority",title:"A proposal isn’t permission.",copy:"An agent can work on a problem without gaining the right to do everything it suggests. Capabilities and approvals define the boundary.",href:"/technology/agents",linkLabel:"Explore agent boundaries"},
    ]}),
    section("fyd","EditorialProof","Understanding,\nput to work.","A real business. Its actual services. The source behind each one. Explore what FYD understands, then open the full experience.",{eyebrow:"03 / FYD · In development",previewEndpoint:"/api/public-preview",panels:[
      {label:"Home services",title:"Coppersmith",copy:"Explore services, find a contact path, and inspect the information behind the page.",href:"/sites/coppersmith-plumbing",linkLabel:"Open the FYD preview"},
      {label:"Craft & projects",title:"Happy Place",copy:"A different business, a different composition. The same FYD object and presentation system.",href:"/sites/happy-place",linkLabel:"Open the FYD preview"},
    ],actions:[{label:"Explore FYD and Ask",href:"/fyd"}]}),
    section("knowledge","EditorialKnowledge","Good answers need\nsomething to stand on.","Start with what is actually published. Follow a record to its source. Leave the unknowns open.",{eyebrow:"04 / Evidence, within reach"},{kind:"all"}),
    section("builders","EditorialStory","Depth, when\nyou want it.","The architecture is inspectable. Its maturity matters as much as its ambition.",{eyebrow:"05 / For builders",panels:[
      {label:"Built & evolving",title:"Memory with a history.",copy:"Events, evidence, and context compilation have concrete implementations. A source implementation is not a guarantee about every deployed path.",href:"/technology",linkLabel:"Read the architecture"},
      {label:"Experimental",title:"Proof before promises.",copy:"Replay and agent execution remain areas of active verification. Read the published evidence and its limits, including the dates of captured runs.",href:"/technology/replay",linkLabel:"Inspect replay evidence"},
    ]}),
    section("journal","EditorialPublications","The work, in public.","Notes from building the system.",{eyebrow:"Build journal"},{kind:"all",schema:"ping.social.article@1",limit:3}),
    section("contact","EditorialStory","Start with the\nbusiness you have.","PING Social works with home service businesses on practical automation. Start with the work that needs to get easier.",{eyebrow:"A useful next step",actions:[{label:"Talk to PING Social",href:"/contact"}]}),
  ]}],
};
