"use client";

import { useState, useRef, useCallback } from 'react';
import type { CSSProperties } from 'react';
import { resolveThemeRoles } from '../sitespec/theme-roles';
import { ArrowUpRight, MapPin, Phone, MessageCircle, ArrowRight } from 'lucide-react';
import { applyHiddenObjects, applyObjectOrder, resolveQuery, siteDeactivatedObjectIds } from './query';
import type { RenderContext } from './renderer';
import { visitorField, conciseSource, visitorCallLink, fieldExplanation } from '../sitespec/visitor-knowledge';
import { resolveSafeLink } from '../sitespec/safe-link';
import { AskFydWidget } from './ask-fyd-widget';
import { useFydDialog } from '../ui/use-fyd-dialog';
import { ObjectOverlay } from './object-overlay';
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

export function VisitorExperience({ ctx }: { ctx: RenderContext }) {
  const plan = visitorExperiencePlan(ctx);
  const [serviceQuestion, setServiceQuestion] = useState('');
  const [sequence, setSequence] = useState(0);
  const [openedObject, setOpenedObject] = useState<PingObject | null>(null);
  const overlayRegionRef = useRef<HTMLDivElement>(null);
  const closeOverlay = useCallback(() => setOpenedObject(null), []);
  // Item 2: coordinate the ObjectOverlay through the one FYD dialog
  // primitive. ObjectOverlay is a legacy div-dialog that still owns its own
  // focus and markup (its native-<dialog> migration is pending its lane's
  // commit); the hook gives it balanced Lenis scroll ownership on every
  // exit path and makes the returned focus visible.
  useFydDialog(overlayRegionRef, {
    open: openedObject !== null,
    onClose: closeOverlay,
    focus: "none",
    deferTeardown: true,
  });
  if (!plan) return null;
  const { name, summary, phoneValue, phone, emailValue, email, website, services, products, locations, people, locality, serviceArea, ask, primary, read, owner } = plan;
  const hasMedia = !!ctx.heroMedia && !!plan.section('Hero');
  const askService = (title: string) => { setServiceQuestion(`Can they help with ${title}?`); setSequence(s => s + 1); };
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
  return <div className={`ve ${hasMedia ? 've-photographic' : 've-editorial'}`} data-visitor-primary={primary} style={themeVars}>
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
      {hasMedia && ctx.heroMedia && <figure className="ve-hero-media">
        {/* Authorized pipeline derivative, served locally. No runtime hotlink. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={ctx.heroMedia.src} alt={ctx.heroMedia.alt} width={ctx.heroMedia.width} height={ctx.heroMedia.height} fetchPriority="high" />
        <figcaption><details><summary>Image source</summary><p>From the business website. {ctx.heroMedia.rightsBasis}</p><a href={ctx.heroMedia.sourceUrl} target="_blank" rel="noreferrer">View original</a></details></figcaption>
      </figure>}
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
            <div className="ve-card-actions">
              <button type="button" onClick={() => setOpenedObject(object)}>Explore {title} <ArrowUpRight size={16}/></button>
              {ask && <a href="#ask" onClick={() => askService(title)}>Ask about {title} <ArrowUpRight size={16}/></a>}
              {href.kind === 'safe' && <a href={href.href} target="_blank" rel="noreferrer">Service details <ArrowUpRight size={16}/></a>}
            </div>
            <SourceDisclosure object={object} checkpoint={ctx.projectionCheckpoint}>{plan.parents.has(object.id) && <p>The source website places this service under {plan.parents.get(object.id)}. This reflects the website navigation.</p>}</SourceDisclosure>
          </article>;
        })}
      </div>
    </section>}
    {(locality || locations.length > 0 || serviceArea || action || website.kind === 'safe') && <section className="ve-section ve-contact-grid" id="contact" style={{order:Math.max(rank("Contact"),rank("Locations"))}}>
      {(locality || locations.length > 0 || serviceArea) && <div id="locations"><p className="ve-eyebrow">Where to find them</p><h2>{locations.length > 1 ? 'Locations' : 'Location & service area'}</h2>
        {(locations.length ? locations.map(o => read(o, 'title')) : [locality]).filter(Boolean).map(label => <p className="ve-location" key={label}><MapPin size={22}/>{label}</p>)}
        {serviceArea && <p>{serviceArea}</p>}
        {ask && <a className="ve-text-action" href="#ask" onClick={() => askService('service in my area')}>Check whether they serve your area <ArrowUpRight size={16}/></a>}
        <SourceDisclosure object={locations[0] ?? owner} fields={["title","locality","address"]} checkpoint={ctx.projectionCheckpoint} />
      </div>}
      {(action || website.kind === 'safe') && <div><p className="ve-eyebrow">Let’s talk</p><h2>Contact the business</h2><div className="ve-contact-actions">{action}
        {phone.kind === 'safe' && email.kind === 'safe' && <a className="ve-text-action" href={email.href}>Email {emailValue}</a>}
        {website.kind === 'safe' && <a className="ve-text-action" href={website.href} target="_blank" rel="noreferrer">Visit original website <ArrowUpRight size={18}/></a>}
        </div><SourceDisclosure object={owner} fields={["phone","email","website"]} checkpoint={ctx.projectionCheckpoint}/>
      </div>}
    </section>}
    {!!people.length && <section className="ve-section" style={{order:rank("People")}}><p className="ve-eyebrow">People</p><h2>Meet the team</h2><div className="ve-cards">{people.map(person => <article className="ve-card" key={person.id}><h3>{read(person, 'title')}</h3>{read(person, 'description') && <p>{read(person, 'description')}</p>}<SourceDisclosure object={person} checkpoint={ctx.projectionCheckpoint}/></article>)}</div></section>}
    {ask && <section className="ve-concierge" id="ask" style={{order:rank("AskFYD")}}><div className="ve-concierge-intro"><p className="ve-eyebrow"><MessageCircle size={16}/>Ask FYD</p><h2>{phone.kind === "safe" ? <>A little help,<br/>before you call.</> : <>Your questions,<br/>answered.</>}</h2><p>Ask about services, contact details, or location. Answers use this business’s published information. Sources are there when you want them.</p></div><div className="ve-concierge-chat"><AskFydWidget pageCheckpoint={ctx.projectionCheckpoint} siteId={ctx.siteId} theme={ctx.spec.themeTokens} initialQuestion={serviceQuestion} questionSequence={sequence} prompts={[...(services[0] ? [`Can they help with ${read(services[0], 'title')}?`] : []), 'What services do they offer?', 'How do I contact them?', 'Where are they located?']}/></div></section>}
    <footer className="ve-footer" style={{order:999}}><p>{name}</p><p>Presented by FYD · <a href="#business">Back to top ↑</a></p><details><summary>About this information</summary><p>Website statements and business-provided information are not independently verified. Owner presentation preferences affect what you see. Use “Why this?” for individual sources.</p></details></footer>
    {(action || ask) && <div className="ve-mobile-actions" aria-label="Quick actions">{action}{ask && <a className="ve-action ve-action-outline" href="#ask"><MessageCircle size={18}/>Ask FYD</a>}</div>}
    {openedObject && <div ref={overlayRegionRef}><ObjectOverlay object={{...openedObject,title:read(openedObject,"title") ?? "",description:read(openedObject,"description") ?? ""}} graph={ctx.graph} siteId={ctx.siteId ?? ""} visitor onAsk={ask ? () => { askService(read(openedObject, "title") ?? "this service"); closeOverlay(); } : undefined} onClose={closeOverlay}/></div>}
  </div>;
}
