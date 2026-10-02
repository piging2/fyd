import type { FYDSiteSpec, FYDSection } from "@/fyd/sitespec/types";
import { WEBSITE_BUSINESS_ID } from "@/lib/ping/website-objects";
import { flowItems, primitives, principles, REPOSITORY_URL } from "./learn-content";
import { operatingIntent } from "./operating-intent";

// Visual choices belong to the presentation, separately from record truth.
const recordSymbols: Record<string, string> = {
  "web:product:ping-social": "practice",
  "web:product:ping-intelligence": "continuity",
  "web:product:ai-concierge": "coordination",
  "web:product:tenant-websites": "tenancy",
};

export const SOURCE_ORIGIN = "http://100.79.154.43:3100";

const section = (
  id: string,
  component: string,
  heading: string,
  copy: string,
  editorial: NonNullable<FYDSection["presentation"]["editorial"]>,
  query: FYDSection["query"] = { kind: "static" }
): FYDSection => ({
  id,
  component,
  query,
  presentation: {
    heading,
    copy,
    editorial: { sourceOrigin: SOURCE_ORIGIN, symbols: recordSymbols, ...editorial },
  },
});

const presentationSpec: FYDSiteSpec = {
  kind: "fyd.sitespec@1",
  version: 1,
  ownerObjectId: WEBSITE_BUSINESS_ID,
  generator: {
    name: "fyd-site-generator",
    version: "editorial-public-v2",
    generatedAt: "2026-10-01T00:00:00Z",
  },
  status: "draft",
  themeTokens: {
    accent: "#e8c875",
    accentForeground: "#151715",
    surface: "#f7f7f4",
    ink: "#151715",
    radius: "none",
    fontDisplay: "DM Sans, sans-serif",
    fontBody: "DM Sans, sans-serif",
    motionTokens: {
      motionIntensity: "SUBTLE",
      entrance: "REVEAL",
      objectTransition: "CROSSFADE",
      stagger: "NONE",
    },
  },
  navigation: [
    { label: "Explore FYD", pageSlug: "fyd" },
    { label: "The system", pageSlug: "architecture" },
    { label: "For business", pageSlug: "products" },
    { label: "Learn", pageSlug: "/docs" },
    { label: "Journal", pageSlug: "/blog" },
  ],
  provenance: {
    source: "website-ingestion",
    claimKind: "website_statement",
    note: "Public website statements retain their source and maturity. Interactive workspace and teaching diagrams are presentation, not runtime authority.",
  },
  pages: [
    {
      slug: "home",
      title: "PING — Keep what your business learns.",
      navLabel: "Home",
      sections: [
        // 1. Hero with giant wordmark, 'Your business, understood. Even as it changes.', and margin objects
        section(
          "home",
          "EditorialHero",
          "Keep what your\nbusiness learns.",
          "PING is being built to connect business knowledge, its sources, and the work it informs. Explore that idea in FYD, or put it to work with PING Social.",
          {
            eyebrow: "Continuity infrastructure for AI agents",
            wordmark: "PING",
            heroEdition: "Knowledge. Context. Continuity.",
            heroNote: "For the next conversation. The next person. The next decision.",
            heroSeal: "A record carries its context forward.",
            previewEndpoint: "/api/public-preview",
            principles: [
              "Know what happened",
              "Follow the source",
              "Keep control of the next step",
            ],
            actions: [
              { label: "Explore FYD", href: "#fyd" },
              { label: "For your business", href: "#products" },
            ],
          },
          { kind: "all" }
        ),

        // 2. Real FYD business/service exploration directly after hero
        section(
          "fyd",
          "EditorialProof",
          "A business,\nwith context attached.",
          "What does this business do? Where did that answer come from? FYD makes its published services and sources explorable. Choose a business to see it for yourself.",
          {
            eyebrow: "01 / Try it · FYD",
            previewEndpoint: "/api/public-preview",
            actions: [
              { label: "Explore with Ask", href: "/fyd" },
            ],
          }
        ),

        // 3. TenantOS / ORCA / Mission Control interface study
        section(
          "operating",
          "EditorialWorkspace",
          "The system,\nmade visible.",
          "A place for business context. A coordinator for bounded work. A view into reasons and results. Explore proposed interfaces for TenantOS, ORCA, and Mission Control.",
          {
            eyebrow: "02 / Operating environment · Interface study",
            workspace: operatingIntent,
          }
        ),

        // 4. Published PING relationship explorer
        section(
          "understanding",
          "EditorialAtlas",
          "One source.\nMore ways to understand.",
          "The same published objects can become a product page, a searchable record, or a relationship map. Select a node. Inspect its source. Keep its maturity in view.",
          { eyebrow: "03 / Published object graph" },
          { kind: "all" }
        ),

        // 5. Memory, authority, and educational story (combining Muse typography + PING substance)
        section(
          "problem",
          "EditorialLearning",
          "Your business knows.\nYour tools forget.",
          "The answer is in a call. The context is in a text. The reason is in someone’s head. A business needs a way to keep those things connected after the conversation ends.",
          {
            eyebrow: "04 / The continuity problem",
            learning: {
              kind: "problem",
              items: [
                { label: "The customer", detail: "“We talked about this last week.”", glyph: "↗" },
                { label: "The team", detail: "“Who knows why we changed it?”", glyph: "✳" },
                { label: "The next conversation", detail: "“Let’s start from the beginning…”", glyph: "↶" },
              ],
            },
          }
        ),

        section(
          "architecture",
          "EditorialLearning",
          "From what happened\nto what happens next.",
          "Follow one customer inquiry through the idea behind PING: preserve the input, connect the context, bound the work, and keep the evidence.",
          {
            eyebrow: "05 / How PING works",
            learning: {
              kind: "flow",
              items: flowItems,
              note: "A teaching model drawn from PING’s published architecture. Individual mechanisms have different maturity; this is not a claim of a fully deployed loop.",
            },
          }
        ),

        section(
          "principles",
          "EditorialLearning",
          "A history. A source.\nA boundary.",
          "Continuity is a design commitment. These principles give the system its shape.",
          {
            eyebrow: "06 / Principles, put into practice",
            learning: {
              kind: "principles",
              items: principles.map((p, i) => ({
                label: ["Continuity", "Evidence", "Human control"][i],
                title: p.title,
                detail: p.detail,
              })),
            },
          }
        ),

        section(
          "products",
          "EditorialProducts",
          "A way in,\nfor the work you do.",
          "Work with PING Social on a business workflow today. Explore the PING infrastructure in development. The labels below show what each offering is ready for.",
          { eyebrow: "07 / Product & practice" },
          { kind: "all", schema: "ping.social.product@1" }
        ),

        section(
          "people",
          "EditorialLearning",
          "Useful to the people\ndoing the work.",
          "Start with the work that needs to get easier. These are the experiences PING’s approach is designed to support.",
          {
            eyebrow: "08 / The human side",
            learning: {
              kind: "audiences",
              items: [
                {
                  label: "For the owner",
                  title: "Keep the why.",
                  detail: "Understand the context behind the next decision. PING Social starts with how your business actually operates.",
                  glyph: "↗",
                },
                {
                  label: "For the team",
                  title: "Pick up the thread.",
                  detail: "A shared history can carry the context that otherwise disappears between people, jobs, and shifts.",
                  glyph: "↶",
                },
                {
                  label: "For the customer",
                  title: "Find a useful answer.",
                  detail: "Explore actual services and their sources in FYD. Where information is missing, the product should say so.",
                  glyph: "✳",
                },
                {
                  label: "For the builder",
                  title: "Know the boundary.",
                  detail: "Build around explicit identity, evidence, and capability boundaries. Inspect the model before relying on a claim.",
                  glyph: "⌘",
                },
              ],
            },
          }
        ),

        section(
          "primitives",
          "EditorialLearning",
          "What the system\nis made of.",
          "Events are records. Missions give work a purpose. Capabilities put boundaries around action. Select a primitive to see what it means, what it connects, and what you can check.",
          {
            eyebrow: "09 / A field guide to PING",
            learning: {
              kind: "primitives",
              items: primitives
                .filter((p) =>
                  [
                    "events",
                    "evidence",
                    "identity",
                    "missions",
                    "workers",
                    "capabilities",
                    "replay",
                    "knowledge",
                  ].includes(p.id)
                )
                .map((p) => ({ ...p, source: "/docs#" + p.id })),
            },
          }
        ),

        // 6. Published knowledge search
        section(
          "knowledge",
          "EditorialKnowledge",
          "Find the record\nbehind the idea.",
          "Search the published product descriptions and build journal. Results come directly from those records, with a source attached.",
          {
            eyebrow: "10 / Evidence within reach",
            suggestedQueries: ["continuity", "concierge", "replay", "evidence"],
          },
          { kind: "all" }
        ),

        // 7. Build journal
        section(
          "journal",
          "EditorialPublications",
          "The decisions\nbehind the build.",
          "What we tried. What we learned. What still needs work. Notes from building PING.",
          {
            eyebrow: "11 / Build journal",
            sourceOrigin: "",
            actions: [{ label: "Read the whole journal", href: "/blog" }],
          },
          { kind: "all", schema: "ping.social.article@1" }
        ),

        section(
          "developers",
          "EditorialLearning",
          "Understand it.\nThen build with it.",
          "Start with the field guide. Follow a concept into the architecture, then explore the source behind it.",
          {
            eyebrow: "12 / For the technically curious",
            learning: {
              kind: "developer",
              items: [
                {
                  label: "Learn",
                  title: "The PING field guide",
                  detail: "From the first event to evidence, authority, and replay. Plain-language explanations with deeper detail.",
                  source: "/docs",
                },
                {
                  label: "Source",
                  title: "Explore the runtime",
                  detail: "Read the code, follow its history, and see how the ideas take shape.",
                  source: REPOSITORY_URL,
                },
                {
                  label: "Architecture",
                  title: "Go a layer deeper",
                  detail: "Read the original technical explanations, including maturity and unfinished work.",
                  source: SOURCE_ORIGIN + "/technology",
                },
              ],
            },
          }
        ),

        // 8. Quiet final contact action and retained navigation
        section(
          "about",
          "EditorialStory",
          "Serious about the work.\nHuman about the rest.",
          "PING Social works with independent home service businesses on practical automation. The PING infrastructure is being developed around the same needs: continuity, useful work, evidence, and human judgment.",
          {
            eyebrow: "13 / About PING",
            panels: [
              {
                label: "The practice",
                title: "Start with a real business.",
                copy: "Study the workflow before choosing the technology. Make inquiries, follow-up, and administrative work easier to keep track of.",
                href: "/about",
                linkLabel: "Meet PING Social",
              },
              {
                label: "The system",
                title: "Make the learning last.",
                copy: "Build around events, evidence, and explicit boundaries so understanding can survive the next conversation.",
                href: "/technology/continuity",
                linkLabel: "Read about continuity",
              },
            ],
          }
        ),

        section(
          "contact",
          "EditorialStory",
          "Make one workflow\nwork better.",
          "An inquiry that gets lost. An estimate that needs a follow-up. An answer only one person knows. PING Social starts with how your business works, then helps you improve it.",
          {
            eyebrow: "Talk to PING Social",
            actions: [{ label: "Talk to PING Social", href: "/contact" }],
          }
        ),
      ],
    },
  ],
};

// A visitor encounters a demonstration and a concrete offering before the deeper system.
const readingOrder = ["home", "fyd", "products", "problem", "architecture", "operating", "principles", "understanding", "people", "primitives", "knowledge", "journal", "developers", "about", "contact"];
const sectionsById = new Map(presentationSpec.pages[0].sections.map(section => [section.id, section]));
presentationSpec.pages[0].sections = readingOrder.map(id => sectionsById.get(id)!);
presentationSpec.pages[0].sections.forEach((section, index) => {
  const editorial = section.presentation.editorial;
  if (index && editorial?.eyebrow && /^\d{2} \/ /.test(editorial.eyebrow)) {
    editorial.eyebrow = editorial.eyebrow.replace(/^\d{2}/, String(index).padStart(2, "0"));
  }
});
export const spec: FYDSiteSpec = presentationSpec;
