/**
 * FYD renderer: (SiteSpec + ObjectGraph + ViewerContext) -> UI.
 *
 * The spec is data. This module resolves each section's query against the
 * graph and renders the registered component. No company-specific
 * hand-layout lives here: every business renders through the same
 * components driven by the same spec shape.
 *
 * Missing data means the section does not exist: resolveQuery returns the
 * objects a query matches, and sections with requiresData render nothing
 * when the list is empty.
 */

import type { PingObject } from "@/lib/ping/types";
import type { ReactNode } from "react";
import { getComponentDef } from "./registry";
import { resolveWebsiteUrl } from "../sitespec/graph";
import type {
  FYDPage,
  FYDQuery,
  FYDPresentation,
  FYDSection,
  FYDSiteSpec,
  FYDThemeTokens,
  ObjectGraph,
  ViewerContext,
} from "../sitespec/types";

// ---------------------------------------------------------------------------
// Query resolution. Deterministic: related sorts by id, feeds sort newest
// first with id as tie-break. Never by insertion or database order.
// ---------------------------------------------------------------------------

export function resolveQuery(
  query: FYDQuery,
  graph: ObjectGraph,
  ownerId: string,
): PingObject[] {
  const objects = new Map(graph.objects.map((o) => [o.id, o]));
  const pub = (o: PingObject) => o.visibility === "public";
  switch (query.kind) {
    case "static":
      return [];
    case "owner": {
      const owner = objects.get(ownerId);
      return owner && pub(owner) ? [owner] : [];
    }
    case "reference": {
      return query.objectIds
        .map((id) => objects.get(id))
        .filter((o): o is PingObject => !!o && pub(o));
    }
    case "related": {
      const out: PingObject[] = [];
      const predicates = query.predicates ?? [query.predicate];
      for (const r of graph.relationships) {
        if (r.subject !== query.from || r.status !== "active") continue;
        if (!predicates.includes(r.predicate)) continue;
        const target = objects.get(r.object);
        const schemaOk =
          !query.schema && !query.schemas
            ? true
            : query.schema
              ? target?.schema === query.schema
              : query.schemas?.includes(target?.schema ?? "");
        if (target && pub(target) && schemaOk) {
          out.push(target);
        }
      }
      out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      return query.limit ? out.slice(0, query.limit) : out;
    }
    case "all": {
      const out = graph.objects.filter(
        (o) => pub(o) && (!query.schema || o.schema === query.schema),
      );
      out.sort((a, b) =>
        a.updatedAt !== b.updatedAt
          ? b.updatedAt.localeCompare(a.updatedAt)
          : a.id < b.id
            ? -1
            : 1,
      );
      return query.limit ? out.slice(0, query.limit) : out;
    }
  }
}

// ---------------------------------------------------------------------------
// Section rendering.
// ---------------------------------------------------------------------------

export interface RenderContext {
  spec: FYDSiteSpec;
  graph: ObjectGraph;
  viewer: ViewerContext;
}

interface SectionProps {
  section: FYDSection;
  objects: PingObject[];
  presentation: FYDPresentation;
  theme: FYDThemeTokens;
  ctx: RenderContext;
}

function friendlySchemaLabel(schema: string): string {
  const local = schema.split(".").pop() ?? schema;
  const name = local.split("@")[0];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function ClaimBadge() {
  return (
    <span className="inline-block rounded-full border border-border-soft px-2 py-0.5 text-[11px] uppercase tracking-wide text-accent">
      Website statement
    </span>
  );
}

function fieldOf(o: PingObject, name: string): string {
  const v = o.fields[name];
  return typeof v === "string" ? v : Array.isArray(v) ? v.join(", ") : "";
}

/**
 * Website URL for display: the website field when present, otherwise the
 * url of the website object linked by has_website. Generic across graphs.
 */
function websiteUrlOf(ctx: RenderContext): string {
  return resolveWebsiteUrl(ctx.graph, ctx.spec.ownerObjectId);
}

function SectionShell({
  heading,
  copy,
  children,
  theme,
}: {
  heading?: string;
  copy?: string;
  children: ReactNode;
  theme: FYDThemeTokens;
}) {
  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      {heading && (
        <h2
          className="text-2xl font-semibold sm:text-3xl"
          style={{ fontFamily: theme.fontDisplay, color: theme.ink }}
        >
          {heading}
        </h2>
      )}
      {copy && <p className="mt-2 max-w-2xl text-base text-accent">{copy}</p>}
      <div className="mt-6">{children}</div>
    </section>
  );
}

function Hero({ objects, presentation, theme, ctx }: SectionProps) {
  const o = objects[0];
  if (!o) return null;
  const website = websiteUrlOf(ctx);
  return (
    <section className="w-full px-4 py-16 sm:px-6 sm:py-24" style={{ background: theme.ink }}>
      <div className="mx-auto max-w-5xl">
        <ClaimBadge />
        <h1
          className="mt-4 text-4xl font-bold text-background sm:text-6xl"
          style={{ fontFamily: theme.fontDisplay }}
        >
          {presentation.heading ?? o.title}
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-background/80">
          {presentation.copy ?? o.description}
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          {website && (
            <a
              href={website}
              className="rounded px-6 py-3 font-semibold"
              style={{
                background: theme.accent,
                color: theme.accentForeground,
                borderRadius: theme.radius === "full" ? 9999 : 8,
              }}
            >
              Visit website
            </a>
          )}
          <a
            href="#ask"
            className="rounded border px-6 py-3 font-semibold text-background"
            style={{ borderColor: theme.accent, borderRadius: theme.radius === "full" ? 9999 : 8 }}
          >
            Ask FYD
          </a>
        </div>
      </div>
    </section>
  );
}

function BusinessSummary({ objects, presentation, theme }: SectionProps) {
  const o = objects[0];
  if (!o) return null;
  return (
    <SectionShell
      theme={theme}
      heading={presentation.heading ?? "About " + o.title}
      copy={presentation.copy ?? o.description}
    >
      <ClaimBadge />
    </SectionShell>
  );
}

function CardGrid({ objects, theme }: { objects: PingObject[]; theme: FYDThemeTokens }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {objects.map((o) => (
        <article
          key={o.id}
          className="border border-border-soft bg-background p-5"
          style={{ background: theme.surface, borderRadius: theme.radius === "none" ? 0 : 8 }}
        >
          <h3 className="text-lg font-semibold" style={{ color: theme.ink }}>
            {o.title}
          </h3>
          {o.description && <p className="mt-2 text-sm text-accent">{o.description}</p>}
          <div className="mt-3">
            <ClaimBadge />
          </div>
        </article>
      ))}
    </div>
  );
}

function ServicesSection(props: SectionProps) {
  const { objects, presentation, theme } = props;
  const featured = presentation.featuredIds?.length
    ? objects.filter((o) => presentation.featuredIds!.includes(o.id))
    : objects;
  if (featured.length === 0) return null;
  return (
    <SectionShell theme={theme} heading={presentation.heading ?? "Services"} copy={presentation.copy}>
      <CardGrid objects={featured} theme={theme} />
    </SectionShell>
  );
}

function ProductsSection(props: SectionProps) {
  const { objects, presentation, theme } = props;
  if (objects.length === 0) return null;
  return (
    <SectionShell theme={theme} heading={presentation.heading ?? "Products"} copy={presentation.copy}>
      <CardGrid objects={objects} theme={theme} />
    </SectionShell>
  );
}

function LocationsSection({ objects, presentation, theme }: SectionProps) {
  if (objects.length === 0) return null;
  return (
    <SectionShell
      theme={theme}
      heading={presentation.heading ?? "Where we work"}
      copy={presentation.copy}
    >
      <ul className="flex flex-wrap gap-2">
        {objects.map((o) => (
          <li
            key={o.id}
            className="rounded-full border border-border-soft px-4 py-2 text-sm"
            style={{ color: theme.ink }}
          >
            {o.title}
          </li>
        ))}
      </ul>
      <div className="mt-3">
        <ClaimBadge />
      </div>
    </SectionShell>
  );
}

function PeopleSection({ objects, presentation, theme }: SectionProps) {
  if (objects.length === 0) return null;
  return (
    <SectionShell theme={theme} heading={presentation.heading ?? "The people"} copy={presentation.copy}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {objects.map((o) => (
          <article
            key={o.id}
            className="border border-border-soft p-5"
            style={{ background: theme.surface, borderRadius: theme.radius === "none" ? 0 : 8 }}
          >
            <h3 className="text-lg font-semibold" style={{ color: theme.ink }}>
              {o.title}
            </h3>
            {fieldOf(o, "role") && (
              <p className="text-sm font-medium" style={{ color: theme.accent }}>
                {fieldOf(o, "role")}
              </p>
            )}
            {o.description && <p className="mt-2 text-sm text-accent">{o.description}</p>}
          </article>
        ))}
      </div>
    </SectionShell>
  );
}

function PostsSection({ objects, presentation, theme }: SectionProps) {
  if (objects.length === 0) return null;
  const sorted = objects.slice().sort((a, b) =>
    fieldOf(b, "date").localeCompare(fieldOf(a, "date")),
  );
  return (
    <SectionShell theme={theme} heading={presentation.heading ?? "Latest"} copy={presentation.copy}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {sorted.map((o) => (
          <article
            key={o.id}
            className="border border-border-soft p-5"
            style={{ background: theme.surface, borderRadius: theme.radius === "none" ? 0 : 8 }}
          >
            {fieldOf(o, "date") && (
              <p className="text-xs uppercase tracking-wide text-accent">{fieldOf(o, "date")}</p>
            )}
            <h3 className="mt-1 text-lg font-semibold" style={{ color: theme.ink }}>
              {o.title}
            </h3>
            {o.description && <p className="mt-2 text-sm text-accent">{o.description}</p>}
            <div className="mt-3">
              <ClaimBadge />
            </div>
          </article>
        ))}
      </div>
    </SectionShell>
  );
}

function ObjectGridSection(props: SectionProps) {
  const { objects, presentation, theme } = props;
  if (objects.length === 0) return null;
  return (
    <SectionShell theme={theme} heading={presentation.heading ?? "Browse"} copy={presentation.copy}>
      <CardGrid objects={objects} theme={theme} />
    </SectionShell>
  );
}

function FeedList({ objects, theme }: { objects: PingObject[]; theme: FYDThemeTokens }) {
  return (
    <ol className="flex flex-col gap-4">
      {objects.map((o) => (
        <li
          key={o.id}
          className="border border-border-soft p-5"
          style={{ background: theme.surface, borderRadius: theme.radius === "none" ? 0 : 8 }}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-lg font-semibold" style={{ color: theme.ink }}>
              {o.title}
            </h3>
            <span className="text-xs uppercase tracking-wide text-accent">{friendlySchemaLabel(o.schema)}</span>
          </div>
          {o.description && <p className="mt-2 text-sm text-accent">{o.description}</p>}
          <div className="mt-3">
            <ClaimBadge />
          </div>
        </li>
      ))}
    </ol>
  );
}

function ObjectFeedSection({ objects, presentation, theme }: SectionProps) {
  if (objects.length === 0) return null;
  return (
    <SectionShell theme={theme} heading={presentation.heading ?? "Explore"} copy={presentation.copy}>
      <FeedList objects={objects} theme={theme} />
    </SectionShell>
  );
}

function RecentObjectsSection({ objects, presentation, theme }: SectionProps) {
  if (objects.length === 0) return null;
  const sorted = objects
    .slice()
    .sort((a, b) =>
      a.updatedAt !== b.updatedAt
        ? b.updatedAt.localeCompare(a.updatedAt)
        : a.id < b.id
          ? -1
          : 1,
    );
  return (
    <SectionShell theme={theme} heading={presentation.heading ?? "Recent"} copy={presentation.copy}>
      <FeedList objects={sorted} theme={theme} />
    </SectionShell>
  );
}

function ContactSection({ objects, presentation, theme, ctx }: SectionProps) {
  const o = objects[0];
  if (!o) return null;
  const phone = fieldOf(o, "phone");
  const email = fieldOf(o, "email");
  const website = websiteUrlOf(ctx);
  if (!phone && !email && !website) return null;
  return (
    <SectionShell theme={theme} heading={presentation.heading ?? "Contact"} copy={presentation.copy}>
      <ul className="flex flex-col gap-2 text-base">
        {phone && (
          <li>
            <a href={"tel:" + phone} className="underline" style={{ color: theme.ink }}>
              {phone}
            </a>
          </li>
        )}
        {email && (
          <li>
            <a href={"mailto:" + email} className="underline" style={{ color: theme.ink }}>
              {email}
            </a>
          </li>
        )}
        {website && (
          <li>
            <a href={website} className="underline" style={{ color: theme.ink }}>
              {website}
            </a>
          </li>
        )}
      </ul>
      <div className="mt-3">
        <ClaimBadge />
      </div>
    </SectionShell>
  );
}

function LinksSection({ objects, presentation, theme, ctx }: SectionProps) {
  const o = objects[0];
  if (!o) return null;
  const raw = o.fields["socials"];
  const socials: string[] = Array.isArray(raw) ? raw : typeof raw === "string" && raw ? [raw] : [];
  const website = websiteUrlOf(ctx);
  const links = website ? [website, ...socials] : socials;
  if (links.length === 0) return null;
  return (
    <SectionShell theme={theme} heading={presentation.heading ?? "Find us"} copy={presentation.copy}>
      <ul className="flex flex-wrap gap-3">
        {links.map((url) => (
          <li key={url}>
            <a
              href={url}
              className="inline-block border px-4 py-2 text-sm underline"
              style={{ borderColor: theme.accent, color: theme.ink, borderRadius: theme.radius === "full" ? 9999 : 8 }}
            >
              {hostOf(url)}
            </a>
          </li>
        ))}
      </ul>
    </SectionShell>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function SocialProofSection({ objects, presentation, theme }: SectionProps) {
  const o = objects[0];
  if (!o) return null;
  const raw = o.fields["reviews"] ?? o.fields["testimonials"];
  const items: string[] = Array.isArray(raw) ? raw : typeof raw === "string" && raw ? [raw] : [];
  if (items.length === 0) return null;
  return (
    <SectionShell theme={theme} heading={presentation.heading ?? "What people say"} copy={presentation.copy}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {items.map((t, i) => (
          <blockquote
            key={i}
            className="border-l-4 p-4 italic"
            style={{ borderColor: theme.accent, background: theme.surface }}
          >
            {t}
            <div className="mt-2 not-italic">
              <ClaimBadge />
            </div>
          </blockquote>
        ))}
      </div>
    </SectionShell>
  );
}

function CTASection({ objects, presentation, theme, ctx }: SectionProps) {
  const o = objects[0];
  const website = o ? websiteUrlOf(ctx) : "";
  return (
    <section className="w-full px-4 py-12 sm:px-6" style={{ background: theme.surface }}>
      <div className="mx-auto max-w-5xl text-center">
        <h2 className="text-2xl font-semibold" style={{ fontFamily: theme.fontDisplay, color: theme.ink }}>
          {presentation.heading ?? "Start the conversation"}
        </h2>
        {presentation.copy && <p className="mt-2 text-accent">{presentation.copy}</p>}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {website && (
            <a
              href={website}
              className="rounded px-6 py-3 font-semibold"
              style={{ background: theme.accent, color: theme.accentForeground, borderRadius: theme.radius === "full" ? 9999 : 8 }}
            >
              Visit website
            </a>
          )}
          <a
            href="#ask"
            className="rounded border px-6 py-3 font-semibold"
            style={{ borderColor: theme.accent, color: theme.ink, borderRadius: theme.radius === "full" ? 9999 : 8 }}
          >
            Ask FYD
          </a>
        </div>
      </div>
    </section>
  );
}

function IdentityCardSection({ objects, presentation, theme }: SectionProps) {
  const o = objects[0];
  if (!o) return null;
  return (
    <SectionShell theme={theme} heading={presentation.heading} copy={presentation.copy}>
      <div
        className="flex flex-col gap-2 border border-border-soft p-6 sm:flex-row sm:items-center sm:justify-between"
        style={{ background: theme.surface, borderRadius: theme.radius === "none" ? 0 : 12 }}
      >
        <div>
          <h3 className="text-xl font-semibold" style={{ color: theme.ink }}>
            {o.title}
          </h3>
          {o.description && <p className="mt-1 text-sm text-accent">{o.description}</p>}
        </div>
        <ClaimBadge />
      </div>
    </SectionShell>
  );
}

function AskFYDSection({ presentation, theme, ctx }: SectionProps) {
  return (
    <section id="ask" className="w-full px-4 py-12 sm:px-6" style={{ background: theme.ink }}>
      <div className="mx-auto max-w-3xl text-center">
        <h2
          className="text-2xl font-semibold text-background sm:text-3xl"
          style={{ fontFamily: theme.fontDisplay }}
        >
          {presentation.heading ?? "Ask FYD about " + ownerTitle(ctx)}
        </h2>
        <p className="mt-2 text-background/70">
          {presentation.copy ?? "Questions go to FYD Social. Answers cite website statements, never verified fact."}
        </p>
        <form
          className="mt-6 flex flex-col gap-3 sm:flex-row"
          onSubmit={(e) => e.preventDefault()}
        >
          <input
            type="text"
            name="q"
            placeholder="What do you want to know?"
            className="flex-1 rounded border border-border-soft bg-background px-4 py-3"
            aria-label="Ask FYD a question"
          />
          <button
            type="submit"
            className="rounded px-6 py-3 font-semibold"
            style={{ background: theme.accent, color: theme.accentForeground }}
          >
            Ask
          </button>
        </form>
        <p className="mt-3 text-xs text-background/50">
          FYD Ask is built in a sibling lane; this box holds the component slot on the generated site.
        </p>
      </div>
    </section>
  );
}

function ownerTitle(ctx: RenderContext): string {
  const owner = ctx.graph.objects.find((o) => o.id === ctx.spec.ownerObjectId);
  return owner ? owner.title : "this business";
}

function GenericObjectCardSection({ objects, presentation, theme }: SectionProps) {
  if (objects.length === 0) return null;
  return (
    <SectionShell theme={theme} heading={presentation.heading ?? "More"} copy={presentation.copy}>
      <CardGrid objects={objects} theme={theme} />
    </SectionShell>
  );
}

export function renderSection(section: FYDSection, ctx: RenderContext): ReactNode {
  const def = getComponentDef(section.component);
  if (!def) return null;
  if (section.presentation.hidden) return null;
  const objects = resolveQuery(section.query, ctx.graph, ctx.spec.ownerObjectId);
  if (def.requiresData && objects.length === 0) return null;
  const props: SectionProps = {
    section,
    objects,
    presentation: section.presentation,
    theme: ctx.spec.themeTokens,
    ctx,
  };
  switch (section.component) {
    case "Hero":
      return <Hero key={section.id} {...props} />;
    case "BusinessSummary":
      return <BusinessSummary key={section.id} {...props} />;
    case "Services":
      return <ServicesSection key={section.id} {...props} />;
    case "Products":
      return <ProductsSection key={section.id} {...props} />;
    case "Locations":
      return <LocationsSection key={section.id} {...props} />;
    case "People":
      return <PeopleSection key={section.id} {...props} />;
    case "Posts":
      return <PostsSection key={section.id} {...props} />;
    case "ObjectGrid":
      return <ObjectGridSection key={section.id} {...props} />;
    case "ObjectFeed":
      return <ObjectFeedSection key={section.id} {...props} />;
    case "RecentObjects":
      return <RecentObjectsSection key={section.id} {...props} />;
    case "Contact":
      return <ContactSection key={section.id} {...props} />;
    case "Links":
      return <LinksSection key={section.id} {...props} />;
    case "SocialProof":
      return <SocialProofSection key={section.id} {...props} />;
    case "CTA":
      return <CTASection key={section.id} {...props} />;
    case "IdentityCard":
      return <IdentityCardSection key={section.id} {...props} />;
    case "AskFYD":
      return <AskFYDSection key={section.id} {...props} />;
    case "GenericObjectCard":
    default:
      return <GenericObjectCardSection key={section.id} {...props} />;
  }
}

export function SitePageView({ page, ctx }: { page: FYDPage; ctx: RenderContext }) {
  return (
    <>
      {page.sections.map((s) => renderSection(s, ctx))}
    </>
  );
}
