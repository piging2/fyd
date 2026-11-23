/**
 * Lane 3 composer: deterministic template compilation.
 *
 * compileTemplate(manifest, profile, options) -> { spec, report }
 *
 * Pipeline: parse + validate the manifest (fail closed), parse the
 * profile (fail closed), check tenant agreement, synthesize pages and
 * sections from the manifest against the VERIFIED-only binding view,
 * then run the existing applyArchetype as the final pass (it reorders,
 * filters, and re-tokens; it never invents content, and neither do we:
 * every emitted section is either in the frozen section map below or is
 * reported inexpressible and not emitted).
 *
 * Determinism: no wall clock (generatedAt derives from the profile
 * fetch_date), no randomness, no fs, no network, no module state.
 * Same inputs produce byte-identical canonical JSON and the same
 * determinismKey (sha256 of the canonical spec JSON).
 */

import { createHash } from "crypto";
import { applyArchetype } from "@/fyd/archetypes/apply";
import { profileForArchetype } from "@/fyd/archetypes/profiles";
import { FYD_SCHEMAS, ROLE_PREDICATES, SCHEMA_ROLES } from "@/fyd/sitespec/schemas";
import {
  DEFAULT_FYD_THEME,
  type FYDPage,
  type FYDQuery,
  type FYDSection,
  type FYDSiteArchetype,
  type FYDSiteSpec,
} from "@/fyd/sitespec/types";
import { BindingView, ComposerProfileError, parseProfile } from "./profile";
import {
  ComposerManifestError,
  parseManifest,
  type ManifestPage,
  type TemplateManifest,
} from "./manifest";
import {
  ComposerError,
  type CompileReport,
  type ComposeOptions,
  type ComposeResult,
  type FunctionalComponentRequirement,
  type InexpressibleSection,
  type PageOmission,
  type SectionOmission,
} from "./types";

/** Canonical JSON: recursively sorted object keys, stable arrays. */
export function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) {
    return "[" + value.map((v) => canonicalStringify(v)).join(",") + "]";
  }
  const rec = value as Record<string, unknown>;
  const keys = Object.keys(rec).filter((k) => rec[k] !== undefined).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalStringify(rec[k])).join(",") + "}";
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const SERVICE_SCHEMAS = [...SCHEMA_ROLES.service];
const LOCATION_SCHEMAS = [...SCHEMA_ROLES.location];

/**
 * The registered schema vocabulary (FYD_SCHEMAS): the compile-time
 * bound of the schema set a compiled spec can resolve against. The
 * validator's callers pass the schema set of the graph being
 * rendered; the composer holds no graph, only the profile, so the
 * registered set is the strongest membership fact it can state, and
 * it is the set the acceptance instruments of record pass.
 */
const REGISTERED_SCHEMAS = new Set(FYD_SCHEMAS.map((s) => s.id));

/**
 * The schema set a query explicitly names, or null when it names
 * none (owner, reference, and static queries name nothing). Mirrors
 * the validator's explicitQuerySchemas (backlog B4) so the emission
 * gate in buildPage and the validator can never drift on what
 * counts as a named set.
 */
function namedSchemaSet(query: FYDQuery): string[] | null {
  if (query.kind === "owner" || query.kind === "static" || query.kind === "reference") return null;
  if (query.schemas) return query.schemas;
  return query.schema ? [query.schema] : null;
}

interface Ctx {
  ownerObjectId: string;
  view: BindingView;
  inexpressible: InexpressibleSection[];
  omitted: SectionOmission[];
  notes: string[];
}

function ownerQuery(): FYDQuery {
  return { kind: "owner" };
}
function serviceQuery(ownerObjectId: string, limit?: number): FYDQuery {
  const q: Extract<FYDQuery, { kind: "related" }> = {
    kind: "related",
    from: ownerObjectId,
    predicate: ROLE_PREDICATES.service[0],
    predicates: [...ROLE_PREDICATES.service],
    schemas: [...SERVICE_SCHEMAS],
  };
  if (limit !== undefined) q.limit = limit;
  return q;
}
function locationQuery(ownerObjectId: string): FYDQuery {
  return {
    kind: "related",
    from: ownerObjectId,
    predicate: ROLE_PREDICATES.location[0],
    predicates: [...ROLE_PREDICATES.location],
    schemas: [...LOCATION_SCHEMAS],
  };
}
function staticQuery(): FYDQuery {
  return { kind: "static" };
}
function allServicesQuery(): FYDQuery {
  return { kind: "all", schemas: [...SERVICE_SCHEMAS] };
}

/**
 * The owner's bindable name: display name when it binds, else the legal
 * name. Both reads go through the BindingView, so a CONFLICTED display
 * name falls through to a VERIFIED legal name, and an UNKNOWN display
 * name is never guessed at.
 */
function bindOwnerName(view: BindingView): string | undefined {
  return view.bind<string>("display_name") ?? view.bind<string>("legal_name");
}

interface SectionSpec {
  component: string;
  query: FYDQuery;
  heading?: string;
  copy?: string;
}

/**
 * The frozen section map: manifest section kind -> registered component +
 * query + optional bound copy. Any manifest kind absent here (and not
 * handled in the switch) is INEXPRESSIBLE: reported, never emitted.
 * Copy bindings read ONLY through the BindingView (VERIFIED fields).
 */
function mapSection(
  kind: string,
  ctx: Ctx,
  record?: { name: string; description: string },
): SectionSpec | "inexpressible" | "omit" {
  const { view } = ctx;
  switch (kind) {
    case "Hero": {
      if (record) {
        return { component: "Hero", query: ownerQuery(), heading: record.name };
      }
      const heading = view.bind<string>("tagline");
      const copy = view.bind<string>("description");
      const s: SectionSpec = { component: "Hero", query: ownerQuery() };
      if (heading !== undefined) s.heading = heading;
      if (copy !== undefined) s.copy = copy;
      return s;
    }
    case "ServicesSection":
    case "ServiceCardGrid":
      return { component: "Services", query: serviceQuery(ctx.ownerObjectId) };
    case "OtherServices":
      return { component: "Services", query: serviceQuery(ctx.ownerObjectId, 3) };
    case "AncillaryList":
      // The ancillary presentation of the same VERIFIED services list
      // on the services index: the ServiceCardGrid binding in a second
      // placement (B3 census, class b).
      return { component: "Services", query: serviceQuery(ctx.ownerObjectId) };
    case "FeaturedProjects":
    case "FeaturedTransformations":
    case "ServiceGallery":
      return { component: "Gallery", query: staticQuery() };
    case "RecentProjects":
      return { component: "RecentObjects", query: serviceQuery(ctx.ownerObjectId) };
    case "BrowseAll":
      return { component: "ObjectGrid", query: allServicesQuery() };
    case "SocialProof": {
      const claims = view.bind<string[]>("business_claims");
      const s: SectionSpec = { component: "SocialProof", query: ownerQuery() };
      if (claims !== undefined) s.copy = claims.join(" · ");
      return s;
    }
    case "Values": {
      const claims = view.bind<string[]>("business_claims");
      const s: SectionSpec = { component: "SocialProof", query: ownerQuery(), heading: "Why Choose Us" };
      if (claims !== undefined) s.copy = claims.join(" · ");
      return s;
    }
    case "TrustStrip": {
      // The trust strip is the business's own VERIFIED claims in strip
      // position (home, workIndex): the same values SocialProof binds.
      // credentials_licenses is deliberately not bound here or in
      // AttributeStrip: its value is an evidence object of provenance
      // prose, not display strings, and one Coppersmith value names a
      // team member the negative-binding battery bars from any spec
      // (the B3C receipt records this divergence from the census's
      // smallest-addition line). With no claims there is nothing to
      // strip, so the section omits.
      const claims = view.bind<string[]>("business_claims");
      if (claims === undefined || claims.length === 0) return "omit";
      return { component: "SocialProof", query: ownerQuery(), copy: claims.join(" · ") };
    }
    case "AttributeStrip": {
      // Short factual attributes, bound VERIFIED-only: years in
      // business verbatim, the founding year behind the same template
      // glue the footer uses ("Serving " + area). Each binds only
      // where the profile verifies it (Barnes both; Coppersmith
      // neither: years CONFLICTED with a DO_NOT_BIND flag, founded
      // year UNKNOWN), and when no attribute binds there is nothing
      // to state, so the section omits.
      const years = view.bind<string>("years_in_business");
      const founded = view.bind<string>("founded_year");
      const parts: string[] = [];
      if (years !== undefined) parts.push(years);
      if (founded !== undefined) parts.push("Since " + founded);
      if (parts.length === 0) return "omit";
      return { component: "SocialProof", query: ownerQuery(), copy: parts.join(" · ") };
    }
    case "ClosingCTA": {
      const phone = view.bind<string>("phone");
      const s: SectionSpec = { component: "CTA", query: ownerQuery() };
      if (phone !== undefined) s.copy = "Call " + phone;
      return s;
    }
    case "ContactCTA": {
      const phone = view.bind<string>("phone");
      const s: SectionSpec = { component: "CTA", query: ownerQuery() };
      if (phone !== undefined) s.copy = "Call " + phone + " to schedule service.";
      return s;
    }
    case "NewsletterSection": {
      // The signup itself is a functional component, not a section:
      // the manifest declares newsletterSignup with a tenant-bound
      // destination, and it reaches every compile's report as a
      // functionalComponents requirement. This section is its
      // placement on the home page, a CTA block carrying the form's
      // name. No profile data is involved, so nothing can fail to
      // bind, and the destination is never a template default.
      return { component: "CTA", query: ownerQuery(), heading: "Newsletter" };
    }
    case "ContactActionRows": {
      const phone = view.bind<string>("phone");
      const s: SectionSpec = { component: "Contact", query: ownerQuery(), heading: "Contact Us" };
      if (phone !== undefined) s.copy = "Call " + phone;
      return s;
    }
    case "Narrative": {
      const copy = view.bind<string>("description");
      const s: SectionSpec = { component: "BusinessSummary", query: ownerQuery() };
      if (copy !== undefined) s.copy = copy;
      return s;
    }
    case "Intro": {
      const s: SectionSpec = { component: "BusinessSummary", query: ownerQuery() };
      if (record) s.copy = record.description;
      return s;
    }
    case "Heading":
      return { component: "BusinessSummary", query: ownerQuery() };
    case "Guidance":
      return { component: "BusinessSummary", query: ownerQuery(), heading: "Get In Touch" };
    case "ServiceArea":
    case "ServiceAreaCards": {
      const area = view.bind<string>("service_area");
      const s: SectionSpec = { component: "Locations", query: locationQuery(ctx.ownerObjectId) };
      if (area !== undefined) s.copy = area;
      return s;
    }
    case "AskAbout":
    case "HelpBlock":
      return { component: "AskFYD", query: ownerQuery() };
    case "ZeroReviewFallback":
      return { component: "SocialProof", query: ownerQuery(), heading: "What Customers Say" };
    case "PeopleBlocks":
    case "PeopleTeaser": {
      // The component exists; the data may not bind. Team is CONFLICTED
      // for Coppersmith, so this omits with a report entry.
      if (!view.canBind("team")) return "omit";
      return { component: "People", query: { kind: "related", from: ctx.ownerObjectId, predicate: ROLE_PREDICATES.person[0], predicates: [...ROLE_PREDICATES.person], schemas: [...SCHEMA_ROLES.person] } };
    }
    case "Hours": {
      if (!view.canBind("hours")) return "omit";
      return { component: "Contact", query: ownerQuery() };
    }
    case "Eyebrow": {
      // Record pages only: the eyebrow is the parent section label above
      // the record's H1, template-structure copy in the same sense as the
      // Values and Guidance headings. Without a record there is no parent
      // label to state, so the section omits rather than inventing one.
      if (!record) return "omit";
      return { component: "BusinessSummary", query: ownerQuery(), heading: "Services" };
    }
    case "H1": {
      // The page heading: the record's name on record pages (the same
      // value Hero binds as its heading), else the owner's bindable name.
      // With neither, there is no heading the profile can state.
      const heading = record ? record.name : bindOwnerName(view);
      if (heading === undefined) return "omit";
      return { component: "BusinessSummary", query: ownerQuery(), heading };
    }
    case "Footer": {
      // The manifest declares the footer columns (brand+proof, explore,
      // serviceArea, contact). The explore column is the spec navigation,
      // which compileTemplate owns outside sections; this section carries
      // the brand and contact facts, bound VERIFIED-only. When none of
      // them bind there is no footer content to state, so it omits.
      const name = bindOwnerName(view);
      const phone = view.bind<string>("phone");
      const area = view.bind<string>("service_area");
      if (name === undefined && phone === undefined && area === undefined) return "omit";
      const s: SectionSpec = { component: "Contact", query: ownerQuery() };
      if (name !== undefined) s.heading = name;
      const parts: string[] = [];
      if (phone !== undefined) parts.push("Call " + phone);
      if (area !== undefined) parts.push("Serving " + area);
      if (parts.length > 0) s.copy = parts.join(" · ");
      return s;
    }
    default:
      return "inexpressible";
  }
}

const PAGE_TITLES: Record<string, string> = {
  home: "Home",
  servicesIndex: "Services",
  workIndex: "Our Work",
  about: "About",
  reviews: "Reviews",
  faq: "FAQ",
  contact: "Contact",
  estimate: "Get an Estimate",
  privacy: "Privacy",
  notFound: "Page Not Found",
  error: "Something Went Wrong",
};

const PAGE_SLUGS: Record<string, string> = {
  home: "home",
  servicesIndex: "services",
  workIndex: "work",
  about: "about",
  reviews: "reviews",
  faq: "faq",
  contact: "contact",
  estimate: "estimate",
  privacy: "privacy",
  notFound: "404",
  error: "error",
};

interface ServiceRecord {
  name: string;
  description: string;
}

function buildPage(
  page: ManifestPage,
  slug: string,
  title: string,
  ctx: Ctx,
  record?: ServiceRecord,
): FYDPage {
  const sections: FYDSection[] = [];
  for (const msec of page.sections) {
    const mapped = mapSection(msec.kind, ctx, record);
    if (mapped === "inexpressible") {
      ctx.inexpressible.push({ page: page.id, section: msec.raw, needsComponent: msec.kind });
      continue;
    }
    if (mapped === "omit") {
      ctx.omitted.push({
        page: page.id,
        section: msec.raw,
        reason: "binding data is not VERIFIED in the profile (see fieldsOmitted)",
      });
      continue;
    }
    // Emission gate (desk ruling 2026-11-22, option b): a section
    // whose query names a schema set with no member in the
    // registered schema set can never resolve against the graph,
    // and the validator's B4 membership rule refuses such a spec
    // outright. The composer therefore omits the section here,
    // through the same omission record every other unstatable
    // section takes, instead of emitting a spec its own validator
    // rejects. The gate is general: it reads only the query's
    // named set, never a tenant, section, or component name.
    const namedSchemas = namedSchemaSet(mapped.query);
    if (namedSchemas !== null && !namedSchemas.some((s) => REGISTERED_SCHEMAS.has(s))) {
      ctx.omitted.push({
        page: page.id,
        section: msec.raw,
        reason:
          "query schema set (" +
          namedSchemas.join(", ") +
          ") has no member in the registered schema set; the section can never resolve against this graph",
      });
      continue;
    }
    const presentation: FYDSection["presentation"] = {};
    if (mapped.heading !== undefined) presentation.heading = mapped.heading;
    if (mapped.copy !== undefined) presentation.copy = mapped.copy;
    sections.push({
      id: slug + ":" + mapped.component + ":" + sections.length,
      component: mapped.component,
      query: mapped.query,
      presentation,
    });
  }
  return { slug, title, navLabel: title, sections };
}

export function compileTemplate(
  manifestRaw: unknown,
  profileRaw: unknown,
  options: ComposeOptions,
): ComposeResult {
  let manifest: TemplateManifest;
  try {
    manifest = parseManifest(manifestRaw, options.templateRef);
  } catch (e) {
    if (e instanceof ComposerManifestError) throw new ComposerError("MANIFEST_INVALID", e.message);
    throw e;
  }
  let profile;
  try {
    profile = parseProfile(profileRaw);
  } catch (e) {
    if (e instanceof ComposerProfileError) throw new ComposerError("PROFILE_INVALID", e.message);
    throw e;
  }
  if (profile.tenant !== options.tenant) {
    throw new ComposerError(
      "TENANT_MISMATCH",
      "profile tenant '" + profile.tenant + "' does not match requested tenant '" + options.tenant + "'",
    );
  }

  const view = new BindingView(profile);
  const ctx: Ctx = {
    ownerObjectId: options.ownerObjectId,
    view,
    inexpressible: [],
    omitted: [],
    notes: [],
  };

  const services = view.bind<ServiceRecord[]>("services");
  const serviceRecords: ServiceRecord[] = Array.isArray(services)
    ? services
        .filter((s): s is ServiceRecord => !!s && typeof s === "object" && typeof (s as ServiceRecord).name === "string" && typeof (s as ServiceRecord).description === "string")
        .map((s) => ({ name: s.name, description: s.description }))
    : [];

  const pages: FYDPage[] = [];
  const pagesEmitted: string[] = [];
  const pagesOmitted: PageOmission[] = [];

  for (const page of manifest.pages) {
    if (page.perRecord === "service") {
      if (serviceRecords.length === 0) {
        pagesOmitted.push({ id: page.id, reason: "REQUIRED_PAGE_NO_RECORDS: no VERIFIED service records in profile" });
        continue;
      }
      for (const rec of serviceRecords) {
        const slug = "services/" + slugify(rec.name);
        pages.push(buildPage(page, slug, rec.name, ctx, rec));
        pagesEmitted.push(page.id + ":" + slug);
      }
      continue;
    }
    if (page.perRecord !== undefined) {
      // project / article records do not exist in a TenantOS profile yet.
      pagesOmitted.push({
        id: page.id,
        reason: page.required
          ? "REQUIRED_PAGE_NO_RECORDS: no " + page.perRecord + " records exist in the profile; the composer never fabricates a record to fill a required page"
          : "OPTIONAL_PAGE_NO_RECORDS: no " + page.perRecord + " records exist in the profile",
      });
      continue;
    }
    if (!page.required && (page.id === "blogIndex" || page.id === "newsletterArchive")) {
      pagesOmitted.push({ id: page.id, reason: "OPTIONAL_PAGE_NO_RECORDS: no post or archive records exist in the profile" });
      continue;
    }
    const slug = PAGE_SLUGS[page.id] ?? page.id;
    const title = PAGE_TITLES[page.id] ?? page.id;
    pages.push(buildPage(page, slug, title, ctx));
    pagesEmitted.push(page.id);
  }

  // The manifest navigation pattern names page SLUGS (home, services,
  // work, about, reviews), not manifest page ids; match them against the
  // emitted slugs directly so nav can never point at an omitted page.
  const emittedSlugs = new Set(pages.map((p) => p.slug));
  const navigation: FYDSiteSpec["navigation"] = [];
  const navLabelFor = (slug: string): string | undefined => {
    const p = pages.find((x) => x.slug === slug);
    return p ? p.navLabel : undefined;
  };
  for (const slug of manifest.navigationPattern) {
    if (emittedSlugs.has(slug) && !navigation.some((n) => n.pageSlug === slug)) {
      navigation.push({ label: navLabelFor(slug) ?? slug, pageSlug: slug });
    }
  }
  if (manifest.navigationSecondaryAction) {
    const slug = manifest.navigationSecondaryAction;
    if (emittedSlugs.has(slug) && !navigation.some((n) => n.pageSlug === slug)) {
      navigation.push({ label: navLabelFor(slug) ?? slug, pageSlug: slug });
    }
  }

  const generatedAt = profile.fetchDate + "T00:00:00.000Z";
  const baseSpec: FYDSiteSpec = {
    kind: "fyd.sitespec@1",
    ownerObjectId: options.ownerObjectId,
    version: 1,
    generator: {
      name: "fyd-site-generator",
      version: "composer-0.1.0+template-" + manifest.templateId + "@" + manifest.version,
      generatedAt,
    },
    themeTokens: { ...DEFAULT_FYD_THEME },
    navigation,
    pages,
    provenance: {
      source: "website-ingestion",
      claimKind: "website_statement",
      note: "Compiled by the Lane 3 template composer from template " + manifest.templateId + "@" + manifest.version + " against a TenantOS verified profile. Only VERIFIED profile fields bind; conflicts and unknowns are omitted, never guessed.",
    },
  };

  // Complete the omission audit: every profile field that cannot bind is
  // named in the report, even if no section happened to attempt it.
  view.recordAllOmissions();

  const archetypeName = (manifest.archetypeName || "TRADES") as FYDSiteArchetype;
  const archetypeProfile = profileForArchetype(archetypeName);
  const spec = applyArchetype(baseSpec, archetypeProfile);

  const determinismKey = createHash("sha256").update(canonicalStringify(spec)).digest("hex");

  const functionalComponents: FunctionalComponentRequirement[] = manifest.forms.map((f) => ({
    kind: f.kind,
    properties: f.properties,
    destinationBinding: f.destination,
  }));

  const sectionsEmitted = spec.pages.reduce((n, p) => n + p.sections.length, 0);

  const report: CompileReport = {
    tenant: profile.tenant,
    templateId: manifest.templateId,
    templateVersion: manifest.version,
    archetype: archetypeName,
    pagesEmitted,
    pagesOmitted,
    sectionsEmitted,
    sectionsInexpressible: ctx.inexpressible,
    sectionsOmitted: ctx.omitted,
    fieldsBound: view.boundFields(),
    fieldsOmitted: view.omittedFields(),
    functionalComponents,
    ratingsConsumed: manifest.ratingsConsumed,
    ratingsRecord: "Pig:/home/nolan/website-lane-records/harvest/RATINGS.md (consumed via the Lane 1 manifest ratingsConsumed block; not re-derived)",
    determinismKey,
    notes: [
      "applyArchetype ran as the final pass with the profiles.ts " + archetypeName + " profile; where the manifest archetype block and profiles.ts disagree, profiles.ts wins (no forked archetype data).",
      "Testimonials nested inside reviews_summary are not bound: the field status is CONFLICTED and field status governs, exactly as for team. Ratings and review counts carry DO_NOT_BIND and never bind.",
      "The VERIFIED description binds verbatim, including the business's own About wording; the years_in_business field itself (DO_NOT_BIND) never binds as a claim, and its variants are never read.",
      "Forms (estimate wizard, newsletter) are declared as functionalComponents with tenant-bound destinations. The newsletter form also has a section placement (NewsletterSection, a CTA block) marking where the signup sits; the form itself is never a section.",
    ],
  };

  return { spec, report };
}
