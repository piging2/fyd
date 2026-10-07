/**
 * Item 8 (fyd-execution): the generated visitor page is a SERVER component.
 *
 * The audit found the core HTML already server-rendered; the defect was the
 * client BOUNDARY (the whole VisitorExperience tree hydrated). This module
 * now renders identity, business facts, services, locations, contact, static
 * evidence-bound content, navigation, and structured data with zero client
 * components of its own. Client code lives ONLY in the named islands in
 * visitor-islands.tsx (AskFydIsland, ObjectOverlayIsland via the provider),
 * pinned by the island allowlist (INV-SC-1,
 * src/app/sites/__tests__/server-client-boundary.test.ts).
 *
 * Core business utility (identity, service summaries, phone/contact,
 * navigation, service-detail destinations) survives hydration failure:
 * every business fact below is plain HTML with real hrefs (INV-SC-2).
 */

import type { CSSProperties } from 'react';
import { resolveThemeRoles } from '../sitespec/theme-roles';
import { ArrowUpRight, MapPin, Phone, MessageCircle, ArrowRight } from 'lucide-react';
import { applyHiddenObjects, applyObjectOrder, resolveQuery, siteDeactivatedObjectIds } from './query';
import type { RenderContext } from './renderer';
import { visitorField, conciseSource, visitorCallLink, fieldExplanation } from '../sitespec/visitor-knowledge';
import { resolveSafeLink } from '../sitespec/safe-link';
import {
  VisitorInteractionProvider,
  CardActionsIsland,
  AskAboutLinkIsland,
  AskFydIsland,
} from './visitor-islands';
import type { DisplayMedia } from '../media/select';
import { responsiveImgProps, heroFetchPriority } from '../media/responsive';
import type { PingObject } from '../../lib/ping/types';
import type { FYDSection } from '../sitespec/types';
import './visitor-experience.css';

/** A presentation plan over the existing spec. Owner order, hiding and
 * visibility remain inputs; URL nesting is a source navigation hint, not
 * a newly asserted business relationship. */
export function visitorExperiencePlan(ctx: RenderContext) {
  const page = ctx.spec.pages.find(p => p.slug === 'home') ?? ctx.spec.pages[0];
  const owner = ctx.graph.objects.find(o => o.id === ctx.spec.ownerObjectId && o.visibility === 'public');
  if (!page || !owner) return null;
  const read = (o: PingObject, field: string) => visitorField(ctx.graph, o, field);
  const name = read(owner, 'title');
  if (!name) return null;
  const sections = page.sections.filter(s => !s.presentation.hidden);
  const section = (kind: string) => sections.find(s => s.component === kind);
  const hidden = siteDeactivatedObjectIds(ctx.spec);
  const objectsFor = (s: FYDSection | undefined) => s ? applyHiddenObjects(applyHiddenObjects(applyObjectOrder(resolveQuery(s.query, ctx.graph, owner.id), s.presentation.objectOrder), s.presentation.hiddenObjectIds), hidden) : [];
  const services = objectsFor(section('Services')).filter(o => ctx.graph.relationships.some(r => r.status === 'active' && ((r.subject === owner.id && r.object === o.id && ['offers', 'provides'].includes(r.predicate)) || (r.object === owner.id && r.subject === o.id && r.predicate === 'provided_by')))).filter(o => read(o, 'title'));
  const products = objectsFor(section('Products')).filter(o => read(o, 'title'));
  const locations = objectsFor(section('Locations')).filter(o => read(o, 'title'));
  const people = objectsFor(section('People')).filter(o => {
    const title = read(o, 'title');
    // A publisher username alone does not identify a member of staff.
    return title && (/\s/.test(title) || !!read(o, 'job_title') || !!read(o, 'role'));
  });
  const contactVisible = !!section('Contact');
  const phoneValue = contactVisible ? read(owner, 'phone') : null;
  const phone = visitorCallLink(phoneValue);
  const emailValue = contactVisible ? read(owner, 'email') : null;
  const email = resolveSafeLink(emailValue, 'email');
  const websiteValue = contactVisible ? read(owner, 'website') : null;
  const website = resolveSafeLink(websiteValue, 'navigate');
  const summary = section('Hero') || section('BusinessSummary') ? read(owner, 'description') : null;
  const locality = section('Locations') ? read(owner, 'locality') : null;
  const serviceArea = section('Locations') ? ['area_served', 'areaServed', 'serviceArea', 'service_area'].map(f => read(owner, f)).find(Boolean) : null;
  const ask = !!ctx.siteId && !!section('AskFYD');
  const parents = new Map<string, string>();
  services.forEach(child => {
    const childHref = resolveSafeLink(read(child, 'service_href'), 'navigate');
    if (childHref.kind !== 'safe') return;
    const childUrl = new URL(childHref.href);
    const parent = services.filter(s => s.id !== child.id).find(s => {
      const href = resolveSafeLink(read(s, 'service_href'), 'navigate');
      if (href.kind !== 'safe') return false;
      const url = new URL(href.href);
      return childUrl.origin === url.origin && childUrl.pathname.startsWith(url.pathname.replace(/\/?$/, '/'));
    });
    if (parent) parents.set(child.id, read(parent, 'title')!);
  });
  const primary = products.length > services.length ? 'products' : services.length ? 'services' : locations.length > 1 ? 'locations' : 'about';
  return { page, owner, name, summary, services, products, locations, people, phoneValue, phone, emailValue, email, website, locality, serviceArea, ask, primary, parents, section, read };
}

export function SourceDisclosure({ object, fields = ['description'], checkpoint, children }: { object: PingObject; fields?: string[]; checkpoint?: string; children?: React.ReactNode }) {
  const raw = object.provenance?.ref.replace(/^website-ingestion:/, '');
  const link = resolveSafeLink(raw, 'navigate');
  const explanations = fields.map(f => fieldExplanation(object, f)).filter(e => e !== null);
  return <details className="ve-evidence" data-checkpoint={checkpoint}><summary>Why this?</summary>
    <div>{children}{explanations.map(e => <div key={e.field}>
      <p>{e.origin === 'owner' ? 'FYD uses your correction for this value.' : e.origin === 'website' ? 'From the business website; not independently verified.' : 'From the business record; not independently verified.'}</p>
      {e.origin === 'owner' && <><p>Effective value: {e.effectiveValue}</p><p>Original observation: {e.originalObservation ?? 'No value recorded'}</p><p>Correction by {e.actor}</p>
        {e.sourceDrifted && <p>The source changed. Current observation: {e.currentObservation ?? 'No value recorded'}. Your correction still applies.</p>}</>}
    </div>)}
    {link.kind === 'safe' && <a href={link.href} target="_blank" rel="noreferrer">View original source <ArrowUpRight size={14} /></a>}
    {object.provenance?.derivedAt && <p>Recorded {object.provenance.derivedAt.slice(0, 10)}</p>}</div>
  </details>;
}

/**
 * Item 9 (fyd-execution): the hero figure, rendered from manifest variants
 * only (INV-RM-1). srcset/sizes are honest: the sizes value is derived from
 * the .ve-hero-media layout in visitor-experience.css (full-bleed ≤640px,
 * ~48vw of the grid below 1360px, ~585px at max width). fetchpriority is
 * measurement-gated (heroFetchPriority): "high" only when the pinned lab
 * record names the hero as the LCP element. Provenance and rights ride as
 * machine-readable attributes (INV-RM-2); the human credit stays visible
 * in the figcaption.
 */
function HeroFigure({ media, siteId }: { media: DisplayMedia; siteId: string }) {
  const img = responsiveImgProps(media, {
    sizes: "(max-width: 640px) 100vw, (max-width: 1360px) 48vw, 585px",
    eager: true,
    priorityMeasured: heroFetchPriority(siteId) === "high",
  });
  return <figure className="ve-hero-media">
    {/* Authorized pipeline derivative, served locally. No runtime hotlink. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img
      src={img.src}
      {...(img.srcSet ? { srcSet: img.srcSet } : {})}
      sizes={img.sizes}
      alt={media.alt}
      width={img.width}
      height={img.height}
      loading={img.loading}
      decoding={img.decoding}
      fetchPriority={img.fetchPriority}
      data-provenance={img["data-provenance"]}
      data-rights-source={img["data-rights-source"]}
    />
    <figcaption><details><summary>Image source</summary><p>From the business website. {media.rightsBasis}</p><a href={media.sourceUrl} target="_blank" rel="noreferrer">View original</a></details></figcaption>
  </figure>;
}

export function VisitorExperience({ ctx }: { ctx: RenderContext }) {
  const plan = visitorExperiencePlan(ctx);
  if (!plan) return null;
  const { name, summary, phoneValue, phone, emailValue, email, website, services, products, locations, people, locality, serviceArea, ask, primary, read, owner } = plan;
  const hasMedia = !!ctx.heroMedia && !!plan.section('Hero');
  const action = phone.kind === 'safe' ? <a className="ve-action ve-action-primary" href={phone.href}><Phone size={18} /><span>Call {phoneValue}</span></a>
    : email.kind === 'safe' ? <a className="ve-action ve-action-primary" href={email.href}>Email {emailValue}</a> : null;
  const catalog = primary === 'products' ? products : services;
  const rank = (component: string) => plan.page.sections.findIndex(s => s.component === component);
  const catalogId = primary === 'products' ? 'products' : 'services';
  // Item 5 (fyd-execution): THEME AUTHORITY. SiteSpec-approved presentation
  // state is authoritative: this component binds ONLY to ctx.spec.themeTokens.
  // The silent palette replacement (ink/accent/accentForeground overrides)
  // is removed. The --fyd-* role vars below are emitted from the spec's
  // tokens at this render root; visitor-experience.css consumes only these
  // vars and carries no literal palette or font stack of its own.
  const roles = resolveThemeRoles(ctx.spec.themeTokens);
  const themeVars = {
    '--fyd-surface': roles.surface,
    '--fyd-surface-elevated': roles.surfaceForeground,
    '--fyd-foreground': roles.foreground,
    '--fyd-muted-foreground': roles.mutedForeground,
    '--fyd-accent': ctx.spec.themeTokens.accent,
    '--fyd-accent-decorative': roles.accentDecorative,
    '--fyd-accent-text': roles.accentText,
    '--fyd-on-accent': roles.onAccent,
    '--fyd-font-display': ctx.spec.themeTokens.fontDisplay,
    '--fyd-font-body': ctx.spec.themeTokens.fontBody,
  } as CSSProperties;
  return <VisitorInteractionProvider graph={ctx.graph} siteId={ctx.siteId ?? ""} askEnabled={ask}>
    <div className={`ve ${hasMedia ? 've-photographic' : 've-editorial'}`} data-visitor-primary={primary} style={themeVars}>
    <header className="ve-header" style={{order:-1}}>
      <a className="ve-wordmark" href="#business">{name}</a>
      <nav aria-label="Business navigation">
        {!!catalog.length && <a href={`#${catalogId}`}>{primary === 'products' ? 'Products' : 'Services'}</a>}
        {(locality || locations.length > 0 || serviceArea) && <a href="#locations">Location</a>}
        {(action || website.kind === 'safe') && <a href="#contact">Contact</a>}
        {ask && <a href="#ask">Ask FYD</a>}
      </nav>
      {action && <div className="ve-header-action">{action}</div>}
    </header>
    <section className="ve-hero" id="business" style={{order:rank("Hero")}}>
      <div className="ve-hero-copy">
        {locality && <p className="ve-eyebrow"><MapPin size={14} />{locality}</p>}
        <h1>{name}</h1>
        {summary && <p className="ve-summary">{conciseSource(summary)}</p>}
        <div className="ve-actions">{action}{catalog.length > 0 && <a className="ve-action ve-action-outline" href={`#${catalogId}`}>Explore {catalogId}<ArrowRight size={18} /></a>}{ask && <a className="ve-text-action" href="#ask"><MessageCircle size={18} />Ask a question</a>}</div>
        {summary && <SourceDisclosure object={owner} checkpoint={ctx.projectionCheckpoint}><p>“{summary}”</p></SourceDisclosure>}
      </div>
      {hasMedia && ctx.heroMedia && <HeroFigure media={ctx.heroMedia} siteId={ctx.siteId ?? ""} />}
    </section>
    {!!catalog.length && <section className="ve-section ve-catalog" id={catalogId} style={{order:rank(primary === "products" ? "Products" : "Services")}}>
      <div className="ve-section-heading"><div><p className="ve-eyebrow">{primary === 'products' ? 'Discover' : 'What they do'}</p><h2>{plan.section(primary === 'products' ? 'Products' : 'Services')?.presentation.heading ?? (primary === 'products' ? 'Explore products' : 'Find the right service')}</h2></div>{ask && <a href="#ask">Not sure? Ask FYD <ArrowUpRight size={18}/></a>}</div>
      <div className="ve-cards">
        {catalog.map((object, i) => {
          const title = read(object, 'title')!;
          const description = read(object, 'description');
          const href = resolveSafeLink(read(object, 'service_href') ?? read(object, 'url'), 'navigate');
          return <article className="ve-card" data-service-id={object.id} key={object.id}>
            <span className="ve-card-number">{String(i + 1).padStart(2, '0')}</span>
            <h3>{plan.parents.has(object.id) && <span className="ve-parent-label">{plan.parents.get(object.id)} / </span>}{title}</h3>{description && <p>{description}</p>}
            <CardActionsIsland object={object} title={title} description={description ?? ""} ask={ask} serviceHref={href.kind === 'safe' ? href.href : null} />
            <SourceDisclosure object={object} checkpoint={ctx.projectionCheckpoint}>{plan.parents.has(object.id) && <p>The source website places this service under {plan.parents.get(object.id)}. This reflects the website navigation.</p>}</SourceDisclosure>
          </article>;
        })}
      </div>
    </section>}
    {(locality || locations.length > 0 || serviceArea || action || website.kind === 'safe') && <section className="ve-section ve-contact-grid" id="contact" style={{order:Math.max(rank("Contact"),rank("Locations"))}}>
      {(locality || locations.length > 0 || serviceArea) && <div id="locations"><p className="ve-eyebrow">Where to find them</p><h2>{locations.length > 1 ? 'Locations' : 'Location & service area'}</h2>
        {(locations.length ? locations.map(o => read(o, 'title')) : [locality]).filter(Boolean).map(label => <p className="ve-location" key={label}><MapPin size={22}/>{label}</p>)}
        {serviceArea && <p>{serviceArea}</p>}
        {ask && <AskAboutLinkIsland title="service in my area" className="ve-text-action">Check whether they serve your area <ArrowUpRight size={16}/></AskAboutLinkIsland>}
        <SourceDisclosure object={locations[0] ?? owner} fields={["title","locality","address"]} checkpoint={ctx.projectionCheckpoint} />
      </div>}
      {(action || website.kind === 'safe') && <div><p className="ve-eyebrow">Let’s talk</p><h2>Contact the business</h2><div className="ve-contact-actions">{action}
        {phone.kind === 'safe' && email.kind === 'safe' && <a className="ve-text-action" href={email.href}>Email {emailValue}</a>}
        {website.kind === 'safe' && <a className="ve-text-action" href={website.href} target="_blank" rel="noreferrer">Visit original website <ArrowUpRight size={18}/></a>}
        </div><SourceDisclosure object={owner} fields={["phone","email","website"]} checkpoint={ctx.projectionCheckpoint}/>
      </div>}
    </section>}
    {!!people.length && <section className="ve-section" style={{order:rank("People")}}><p className="ve-eyebrow">People</p><h2>Meet the team</h2><div className="ve-cards">{people.map(person => <article className="ve-card" key={person.id}><h3>{read(person, 'title')}</h3>{read(person, 'description') && <p>{read(person, 'description')}</p>}<SourceDisclosure object={person} checkpoint={ctx.projectionCheckpoint}/></article>)}</div></section>}
    {ask && <section className="ve-concierge" id="ask" style={{order:rank("AskFYD")}}><div className="ve-concierge-intro"><p className="ve-eyebrow"><MessageCircle size={16}/>Ask FYD</p><h2>{phone.kind === "safe" ? <>A little help,<br/>before you call.</> : <>Your questions,<br/>answered.</>}</h2><p>Ask about services, contact details, or location. Answers use this business’s published information. Sources are there when you want them.</p><noscript><p>Ask FYD requires JavaScript to run. Call or email the business directly instead.</p></noscript></div><div className="ve-concierge-chat"><AskFydIsland pageCheckpoint={ctx.projectionCheckpoint} siteId={ctx.siteId} theme={ctx.spec.themeTokens} prompts={[...(services[0] ? [`Can they help with ${read(services[0], 'title')}?`] : []), 'What services do they offer?', 'How do I contact them?', 'Where are they located?']}/></div></section>}
    <footer className="ve-footer" style={{order:999}}><p>{name}</p><p>Presented by FYD · <a href="#business">Back to top ↑</a></p><details><summary>About this information</summary><p>Website statements and business-provided information are not independently verified. Owner presentation preferences affect what you see. Use “Why this?” for individual sources.</p></details></footer>
    {(action || ask) && <div className="ve-mobile-actions" aria-label="Quick actions">{action}{ask && <a className="ve-action ve-action-outline" href="#ask"><MessageCircle size={18}/>Ask FYD</a>}</div>}
    </div>
  </VisitorInteractionProvider>;
}
