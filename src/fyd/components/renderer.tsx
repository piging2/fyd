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

import type { OwnerFieldCorrection, PingObject } from "@/lib/ping/types";
import type { ReactNode } from "react";
import { getComponentDef } from "./registry";
import { AskFydWidget } from "./ask-fyd-widget";
import { WhyThis, type EvidenceStep } from "../ui/why-this";
import { resolveBoundField } from "../sitespec/graph";
import type { BindingClassification } from "../sitespec/graph";
import {
  applyFieldVisibility,
  type FieldVisibilityDecision,
} from "../sitespec/field-visibility";
import { resolveSafeLink, type SafeLinkResult } from "../sitespec/safe-link";
// Type-only: erased at compile, so the client bundle never touches the
// server-only media store. The selector runs at the server render seam.
import type { DisplayMedia } from "../media/select";
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
      // Mirrors the "related" case: a bare "all" resolves everything public;
      // query.schema or query.schemas narrows to the listed schemas.
      const schemaOk = (o: PingObject) =>
        !query.schema && !query.schemas
          ? true
          : query.schema
            ? o.schema === query.schema
            : (query.schemas ?? []).includes(o.schema);
      const out = graph.objects.filter((o) => pub(o) && schemaOk(o));
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
  /**
   * The projected graph: source state after the owner's field-visibility
   * policy. The renderer never sees withheld fields. Always built via
   * buildRenderContext, never by hand.
   */
  graph: ObjectGraph;
  viewer: ViewerContext;
  /**
   * Public site slug (e.g. "happy-place") threaded from the page, so the
   * AskFYD widget knows which site to ask about. Optional: sections render
   * fine without it, but Ask FYD shows an honest unavailable state.
   */
  siteId?: string;
  /**
   * Hero media for the spec owner, resolved once at the server render seam
   * via the canonical media selector (heroMediaFor in src/fyd/media/select).
   * Serialized DisplayMedia: the renderer never selects media itself.
   * Null (or absent) means the owner has no acquired media, and the Hero
   * renders its honest typographic state, never an invented image.
   */
  heroMedia?: DisplayMedia | null;
}

/**
 * Build the render context at the projection seam.
 *
 * This is the ONLY supported way to obtain a RenderContext: the source
 * graph is projected through the owner's field-visibility decisions
 * first, so the renderer executes the resulting projection and never
 * touches withheld fields. Source state is never mutated; the projected
 * graph is a new value. With no decisions, the conservative defaults in
 * field-visibility.ts apply.
 */
export function buildRenderContext(
  spec: FYDSiteSpec,
  sourceGraph: ObjectGraph,
  viewer: ViewerContext,
  ownerDecisions: FieldVisibilityDecision[] = [],
): RenderContext {
  return {
    spec,
    graph: applyFieldVisibility(sourceGraph, ownerDecisions),
    viewer,
  };
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

/**
 * The owner correction attached to the composed object for a field, if the
 * owner corrected it. The read seam (owner-overlay.ts) attaches these; the
 * renderer reads them generically, never per-surface special-cased.
 */
function correctionFor(
  o: PingObject,
  field: string,
): OwnerFieldCorrection | null {
  const list = o.ownerFieldCorrections;
  if (!list) return null;
  return list.find((c) => c.field === field) ?? null;
}

/**
 * Honest SOURCE SAYS X / OWNER SAYS Y note under a corrected value.
 * Customer-appropriate and contextual: it names both values and says the
 * number came from the owner, without engineering language.
 */
function CorrectionNote({
  correction,
  theme,
}: {
  correction: OwnerFieldCorrection;
  theme: FYDThemeTokens;
}) {
  return (
    <p className="mt-1 text-xs" style={{ color: theme.ink, opacity: 0.65 }}>
      Owner-corrected: the owner says this is the {correction.label.toLowerCase()}
      {correction.sourceValue
        ? ` (the site lists ${correction.sourceValue})`
        : " (the site listed no " + correction.label.toLowerCase() + ")"}
      .
    </p>
  );
}

function fieldOf(o: PingObject, name: string): string {
  const v = o.fields[name];
  return typeof v === "string" ? v : Array.isArray(v) ? v.join(", ") : "";
}

// ---------------------------------------------------------------------------
// Projection seam: binding verification + safe links.
//
// Every FACTUAL value rendered below is read through boundField /
// boundTitle / boundDescription, which resolve the value via the
// presentation-binding verifier (resolveBoundField). A value whose binding
// does not verify returns undefined, and the caller OMITS it: no binding,
// no factual output. This is the verifier wired into the actual
// projection path, not a sidecar.
//
// Labels, action text ("Visit website", "Ask FYD"), section headings that
// come from presentation (generated copy), and structural text are not
// factual claims and do not go through the verifier.
//
// Every EXTERNAL href is resolved through resolveSafeLink. Only a
// { kind: "safe" } result becomes an anchor element; anything else renders
// no link at all. The renderer never interpolates a raw observed string
// into href/src. Internal anchors ("#ask") are presentation state, not
// untrusted external data, and are unaffected.
// ---------------------------------------------------------------------------

/**
 * Verified factual field read. Returns the value only when the binding
 * verifies; undefined means the caller must OMIT the value, never guess.
 */
function boundField(
  ctx: RenderContext,
  o: PingObject,
  field: string,
  classification: BindingClassification = "direct",
): string | undefined {
  return resolveBoundField(ctx.graph, { objectId: o.id, field, classification });
}

/** Verified title read (object-level factual identity). */
function boundTitle(ctx: RenderContext, o: PingObject): string | undefined {
  return boundField(ctx, o, "title");
}

/** Verified description read (object-level factual identity). */
function boundDescription(ctx: RenderContext, o: PingObject): string | undefined {
  return boundField(ctx, o, "description");
}

/** Owner website URL gated to a safe navigable href. Never a raw string. */
function safeWebsite(ctx: RenderContext): SafeLinkResult {
  return resolveSafeLink(boundWebsite(ctx), "navigate");
}

/**
 * Website URL through the binding verifier: the owner's "website" field,
 * else the first "url" of a related website object. Mirrors
 * resolveWebsiteUrl's lookup order, but every hop is a verified binding;
 * an unverified website is not a linkable fact.
 */
function boundWebsite(ctx: RenderContext): string | undefined {
  const graph = ctx.graph;
  const objects = new Map(graph.objects.map((o) => [o.id, o]));
  const owner = objects.get(ctx.spec.ownerObjectId);
  if (owner && owner.visibility === "public") {
    const direct = boundField(ctx, owner, "website");
    if (direct !== undefined) return direct;
  }
  for (const r of graph.relationships) {
    if (r.subject !== ctx.spec.ownerObjectId) continue;
    if (r.status !== "active" || r.predicate !== "has_website") continue;
    const target = objects.get(r.object);
    if (target && target.visibility === "public") {
      const url = boundField(ctx, target, "url");
      if (url !== undefined) return url;
    }
  }
  return undefined;
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

/**
 * Contextual provenance for the hero photo: the generic WhyThis
 * drill-down fed ONLY with the media's own provenance fields. No
 * invented copy; the affordance shows what the pipeline recorded and
 * nothing else. Steps with empty values are omitted, and WhyThis renders
 * nothing at all when the lineage is empty.
 */
function HeroMediaWhyThis({ media }: { media: DisplayMedia }) {
  const steps: EvidenceStep[] = [];
  if (media.sourceUrl) {
    steps.push({
      step: "Photo source",
      detail: media.sourceUrl,
      state: "observed",
    });
  }
  if (media.rightsBasis) {
    steps.push({
      step: "Rights basis",
      detail: media.rightsBasis,
      state: "observed",
    });
  }
  if (media.observedAt) {
    steps.push({
      step: "Observed",
      detail: media.observedAt,
      state: "observed",
    });
  }
  if (media.digest) {
    steps.push({
      step: "Content digest",
      detail: media.digest.slice(0, 16) + "...",
      state: "inferred",
    });
  }
  return (
    <WhyThis
      claim={media.alt || "Hero photo"}
      steps={steps}
      className="[&_summary]:text-white"
    />
  );
}

function Hero({ objects, presentation, theme, ctx }: SectionProps) {
  const o = objects[0];
  if (!o) return null;
  const website = safeWebsite(ctx);
  const heading = presentation.heading ?? boundTitle(ctx, o);
  const copy = presentation.copy ?? boundDescription(ctx, o);
  // Media is threaded through RenderContext from the server render seam;
  // the renderer never selects it. Null keeps the honest typographic hero.
  const hero = ctx.heroMedia ?? null;
  return (
    <section className="w-full" style={{ background: theme.ink }}>
      {hero ? (
        <div
          className="relative h-64 w-full overflow-hidden sm:h-80"
          data-hero-media={hero.id}
        >
          {hero.blurUrl ? (
            <img
              src={hero.blurUrl}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 h-full w-full scale-110 object-cover blur-md"
            />
          ) : null}
          <img
            src={hero.src}
            alt={hero.alt}
            width={hero.width}
            height={hero.height}
            loading="eager"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute bottom-2 right-2 rounded bg-black/55 px-2 py-1">
            <HeroMediaWhyThis media={hero} />
          </div>
        </div>
      ) : null}
      <div className="px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-5xl">
        <ClaimBadge />
        <h1
          className="mt-4 text-4xl font-bold text-background sm:text-6xl"
          style={{ fontFamily: theme.fontDisplay }}
        >
          {heading}
        </h1>
        {copy ? (
          <p className="mt-4 max-w-2xl text-lg text-background/80">{copy}</p>
        ) : null}
        <div className="mt-8 flex flex-wrap gap-3">
          {website.kind === "safe" ? (
            <a
              href={website.href}
              className="rounded px-6 py-3 font-semibold"
              style={{
                background: theme.accent,
                color: theme.accentForeground,
                borderRadius: theme.radius === "full" ? 9999 : 8,
              }}
            >
              Visit website
            </a>
          ) : null}
          <a
            href="#ask"
            className="rounded border px-6 py-3 font-semibold text-background"
            style={{ borderColor: theme.accent, borderRadius: theme.radius === "full" ? 9999 : 8 }}
          >
            Ask FYD
          </a>
        </div>
      </div>
      </div>
    </section>
  );
}

function BusinessSummary({ objects, presentation, theme, ctx }: SectionProps) {
  const o = objects[0];
  if (!o) return null;
  const title = boundTitle(ctx, o);
  return (
    <SectionShell
      theme={theme}
      heading={presentation.heading ?? (title ? "About " + title : undefined)}
      copy={presentation.copy ?? boundDescription(ctx, o)}
    >
      <ClaimBadge />
    </SectionShell>
  );
}

function CardGrid({
  objects,
  theme,
  ctx,
}: {
  objects: PingObject[];
  theme: FYDThemeTokens;
  ctx: RenderContext;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {objects.map((o) => {
        const title = boundTitle(ctx, o);
        const description = boundDescription(ctx, o);
        return (
          <article
            key={o.id}
            className="border border-border-soft bg-background p-5"
            style={{ background: theme.surface, borderRadius: theme.radius === "none" ? 0 : 8 }}
          >
            {title ? (
              <h3 className="text-lg font-semibold" style={{ color: theme.ink }}>
                {title}
              </h3>
            ) : null}
            {description ? <p className="mt-2 text-sm text-accent">{description}</p> : null}
            <div className="mt-3">
              <ClaimBadge />
            </div>
          </article>
        );
      })}
    </div>
  );
}

function ServicesSection(props: SectionProps) {
  const { objects, presentation, theme, ctx } = props;
  const featured = presentation.featuredIds?.length
    ? objects.filter((o) => presentation.featuredIds!.includes(o.id))
    : objects;
  if (featured.length === 0) return null;
  return (
    <SectionShell theme={theme} heading={presentation.heading ?? "Services"} copy={presentation.copy}>
      <CardGrid objects={featured} theme={theme} ctx={ctx} />
    </SectionShell>
  );
}

function ProductsSection(props: SectionProps) {
  const { objects, presentation, theme, ctx } = props;
  if (objects.length === 0) return null;
  return (
    <SectionShell theme={theme} heading={presentation.heading ?? "Products"} copy={presentation.copy}>
      <CardGrid objects={objects} theme={theme} ctx={ctx} />
    </SectionShell>
  );
}

function LocationsSection({ objects, presentation, theme, ctx }: SectionProps) {
  if (objects.length === 0) return null;
  return (
    <SectionShell
      theme={theme}
      heading={presentation.heading ?? "Where we work"}
      copy={presentation.copy}
    >
      <ul className="flex flex-wrap gap-2">
        {objects.map((o) => {
          const title = boundTitle(ctx, o);
          return title ? (
            <li
              key={o.id}
              className="rounded-full border border-border-soft px-4 py-2 text-sm"
              style={{ color: theme.ink }}
            >
              {title}
            </li>
          ) : null;
        })}
      </ul>
      <div className="mt-3">
        <ClaimBadge />
      </div>
    </SectionShell>
  );
}

function PeopleSection({ objects, presentation, theme, ctx }: SectionProps) {
  if (objects.length === 0) return null;
  return (
    <SectionShell theme={theme} heading={presentation.heading ?? "The people"} copy={presentation.copy}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {objects.map((o) => {
          const title = boundTitle(ctx, o);
          const role = boundField(ctx, o, "role");
          const description = boundDescription(ctx, o);
          return (
            <article
              key={o.id}
              className="border border-border-soft p-5"
              style={{ background: theme.surface, borderRadius: theme.radius === "none" ? 0 : 8 }}
            >
              {title ? (
                <h3 className="text-lg font-semibold" style={{ color: theme.ink }}>
                  {title}
                </h3>
              ) : null}
              {role ? (
                <p className="text-sm font-medium" style={{ color: theme.accent }}>
                  {role}
                </p>
              ) : null}
              {description ? <p className="mt-2 text-sm text-accent">{description}</p> : null}
            </article>
          );
        })}
      </div>
    </SectionShell>
  );
}

function PostsSection({ objects, presentation, theme, ctx }: SectionProps) {
  if (objects.length === 0) return null;
  // Sorting uses the raw value (deterministic ordering input, never rendered).
  const sorted = objects.slice().sort((a, b) =>
    fieldOf(b, "date").localeCompare(fieldOf(a, "date")),
  );
  return (
    <SectionShell theme={theme} heading={presentation.heading ?? "Latest"} copy={presentation.copy}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {sorted.map((o) => {
          const date = boundField(ctx, o, "date");
          const title = boundTitle(ctx, o);
          const description = boundDescription(ctx, o);
          return (
            <article
              key={o.id}
              className="border border-border-soft p-5"
              style={{ background: theme.surface, borderRadius: theme.radius === "none" ? 0 : 8 }}
            >
              {date ? (
                <p className="text-xs uppercase tracking-wide text-accent">{date}</p>
              ) : null}
              {title ? (
                <h3 className="mt-1 text-lg font-semibold" style={{ color: theme.ink }}>
                  {title}
                </h3>
              ) : null}
              {description ? <p className="mt-2 text-sm text-accent">{description}</p> : null}
              <div className="mt-3">
                <ClaimBadge />
              </div>
            </article>
          );
        })}
      </div>
    </SectionShell>
  );
}

function ObjectGridSection(props: SectionProps) {
  const { objects, presentation, theme, ctx } = props;
  if (objects.length === 0) return null;
  return (
    <SectionShell theme={theme} heading={presentation.heading ?? "Browse"} copy={presentation.copy}>
      <CardGrid objects={objects} theme={theme} ctx={ctx} />
    </SectionShell>
  );
}

function FeedList({
  objects,
  theme,
  ctx,
}: {
  objects: PingObject[];
  theme: FYDThemeTokens;
  ctx: RenderContext;
}) {
  return (
    <ol className="flex flex-col gap-4">
      {objects.map((o) => {
        const title = boundTitle(ctx, o);
        const description = boundDescription(ctx, o);
        return (
          <li
            key={o.id}
            className="border border-border-soft p-5"
            style={{ background: theme.surface, borderRadius: theme.radius === "none" ? 0 : 8 }}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              {title ? (
                <h3 className="text-lg font-semibold" style={{ color: theme.ink }}>
                  {title}
                </h3>
              ) : null}
              <span className="text-xs uppercase tracking-wide text-accent">{friendlySchemaLabel(o.schema)}</span>
            </div>
            {description ? <p className="mt-2 text-sm text-accent">{description}</p> : null}
            <div className="mt-3">
              <ClaimBadge />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function ObjectFeedSection({ objects, presentation, theme, ctx }: SectionProps) {
  if (objects.length === 0) return null;
  return (
    <SectionShell theme={theme} heading={presentation.heading ?? "Explore"} copy={presentation.copy}>
      <FeedList objects={objects} theme={theme} ctx={ctx} />
    </SectionShell>
  );
}

function RecentObjectsSection({ objects, presentation, theme, ctx }: SectionProps) {
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
      <FeedList objects={sorted} theme={theme} ctx={ctx} />
    </SectionShell>
  );
}

function ContactSection({ objects, presentation, theme, ctx }: SectionProps) {
  const o = objects[0];
  if (!o) return null;
  // Owner-corrected fields are read with the owner_authored
  // classification: the displayed value is owner state (durable, survives
  // re-ingestion), not a website statement. The correction record stays
  // on the object so the section can name both values honestly.
  const phoneCorrection = correctionFor(o, "phone");
  const emailCorrection = correctionFor(o, "email");
  const phone = boundField(ctx, o, "phone", phoneCorrection ? "owner_authored" : "direct");
  const email = boundField(ctx, o, "email", emailCorrection ? "owner_authored" : "direct");
  const phoneLink = resolveSafeLink(phone, "call");
  const emailLink = resolveSafeLink(email, "email");
  const website = safeWebsite(ctx);
  const showPhone = phone !== undefined && phoneLink.kind === "safe";
  const showEmail = email !== undefined && emailLink.kind === "safe";
  const showWebsite = website.kind === "safe";
  if (!showPhone && !showEmail && !showWebsite) return null;
  return (
    <SectionShell theme={theme} heading={presentation.heading ?? "Contact"} copy={presentation.copy}>
      <ul className="flex flex-col gap-2 text-base">
        {showPhone && phoneLink.kind === "safe" ? (
          <li>
            <a href={phoneLink.href} className="underline inline-block min-h-[44px] py-2" style={{ color: theme.ink }}>
              {phone}
            </a>
            {phoneCorrection ? <CorrectionNote correction={phoneCorrection} theme={theme} /> : null}
          </li>
        ) : null}
        {showEmail && emailLink.kind === "safe" ? (
          <li>
            <a href={emailLink.href} className="underline inline-block min-h-[44px] py-2" style={{ color: theme.ink }}>
              {email}
            </a>
            {emailCorrection ? <CorrectionNote correction={emailCorrection} theme={theme} /> : null}
          </li>
        ) : null}
        {showWebsite && website.kind === "safe" ? (
          <li>
            <a href={website.href} className="underline inline-block min-h-[44px] py-2" style={{ color: theme.ink }}>
              {website.href}
            </a>
          </li>
        ) : null}
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
  // Fail closed: social links only render when the socials binding verifies.
  const socialsBound = boundField(ctx, o, "socials") !== undefined;
  const website = safeWebsite(ctx);
  const links: { href: string; label: string }[] = [];
  if (website.kind === "safe") links.push({ href: website.href, label: hostOf(website.href) });
  if (socialsBound) {
    for (const url of socials) {
      const link = resolveSafeLink(url, "navigate");
      if (link.kind === "safe") links.push({ href: link.href, label: hostOf(link.href) });
    }
  }
  if (links.length === 0) return null;
  return (
    <SectionShell theme={theme} heading={presentation.heading ?? "Find us"} copy={presentation.copy}>
      <ul className="flex flex-wrap gap-3">
        {links.map((link) => (
          <li key={link.href}>
            <a
              href={link.href}
              className="inline-block border px-4 py-2 text-sm underline"
              style={{ borderColor: theme.accent, color: theme.ink, borderRadius: theme.radius === "full" ? 9999 : 8 }}
            >
              {link.label}
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

function SocialProofSection({ objects, presentation, theme, ctx }: SectionProps) {
  const o = objects[0];
  if (!o) return null;
  const fieldName = o.fields["reviews"] !== undefined ? "reviews" : "testimonials";
  const raw = o.fields[fieldName];
  const items: string[] = Array.isArray(raw) ? raw : typeof raw === "string" && raw ? [raw] : [];
  // Fail closed: quotes only render when the field binding verifies.
  if (items.length === 0 || boundField(ctx, o, fieldName) === undefined) return null;
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
  const website = o ? safeWebsite(ctx) : { kind: "non_navigable" as const };
  return (
    <section className="w-full px-4 py-12 sm:px-6" style={{ background: theme.surface }}>
      <div className="mx-auto max-w-5xl text-center">
        <h2 className="text-2xl font-semibold" style={{ fontFamily: theme.fontDisplay, color: theme.ink }}>
          {presentation.heading ?? "Start the conversation"}
        </h2>
        {presentation.copy && <p className="mt-2 text-accent">{presentation.copy}</p>}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {website.kind === "safe" ? (
            <a
              href={website.href}
              className="rounded px-6 py-3 font-semibold"
              style={{ background: theme.accent, color: theme.accentForeground, borderRadius: theme.radius === "full" ? 9999 : 8 }}
            >
              Visit website
            </a>
          ) : null}
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

function IdentityCardSection({ objects, presentation, theme, ctx }: SectionProps) {
  const o = objects[0];
  if (!o) return null;
  const title = boundTitle(ctx, o);
  const description = boundDescription(ctx, o);
  return (
    <SectionShell theme={theme} heading={presentation.heading} copy={presentation.copy}>
      <div
        className="flex flex-col gap-2 border border-border-soft p-6 sm:flex-row sm:items-center sm:justify-between"
        style={{ background: theme.surface, borderRadius: theme.radius === "none" ? 0 : 12 }}
      >
        <div>
          {title ? (
            <h3 className="text-xl font-semibold" style={{ color: theme.ink }}>
              {title}
            </h3>
          ) : null}
          {description ? <p className="mt-1 text-sm text-accent">{description}</p> : null}
        </div>
        <ClaimBadge />
      </div>
    </SectionShell>
  );
}

function AskFYDSection({ presentation, theme, ctx }: SectionProps) {
  const ownerName = boundOwnerTitle(ctx);
  return (
    <section id="ask" className="w-full px-4 py-12 sm:px-6" style={{ background: theme.ink }}>
      <div className="mx-auto max-w-3xl text-center">
        <h2
          className="text-2xl font-semibold text-background sm:text-3xl"
          style={{ fontFamily: theme.fontDisplay }}
        >
          {presentation.heading ?? "Ask FYD about " + ownerName}
        </h2>
        <p className="mt-2 text-background/70">
          {presentation.copy ?? "Questions go to FYD Social. Answers cite website statements, never verified fact."}
        </p>
        <div className="text-left">
          <AskFydWidget siteId={ctx.siteId} theme={theme} />
        </div>
      </div>
    </section>
  );
}

/**
 * Owner name for the Ask FYD heading. The heading is a label, not a factual
 * claim, so it falls back to "this business" when the title binding does
 * not verify; the fallback is honest precisely because it claims nothing.
 */
function boundOwnerTitle(ctx: RenderContext): string {
  const owner = ctx.graph.objects.find((o) => o.id === ctx.spec.ownerObjectId);
  if (!owner) return "this business";
  return boundTitle(ctx, owner) ?? "this business";
}

function GenericObjectCardSection({ objects, presentation, theme, ctx }: SectionProps) {
  if (objects.length === 0) return null;
  return (
    <SectionShell theme={theme} heading={presentation.heading ?? "More"} copy={presentation.copy}>
      <CardGrid objects={objects} theme={theme} ctx={ctx} />
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
