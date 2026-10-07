/** Customer questions composed from the already projected graph. No new
 * retrieval authority: every returned fact passes the shared binding gate.
 *
 * Obligation model (EXECUTION MODE item 7): QUESTION -> OBLIGATIONS ->
 * EVIDENCE RESOLUTION -> COVERAGE CHECK -> ANSWER. Each obligation
 * resolves through one of the branch resolvers below; the coverage check
 * is fail-safe (an obligation that produced neither a claim nor an
 * unknown surfaces as an honest UNKNOWN, never as silence) and then hard
 * (assertObligationCoverage throws if anything is still uncovered: a
 * pipeline bug, fail closed).
 *
 * Single-intent questions decompose to exactly one obligation over the
 * original question text, so their answers are byte-identical to the
 * pre-obligation branch chain. The old multi-topic bail-out is gone: its
 * job moved into decomposition.
 */
import type { PingObject, PingRelationship } from '../../lib/ping/types';
import type { AskFydAnswer, AskFydContext } from './types';
import type { ObjectGraph } from '../sitespec/types';
import { buildVerifiedRenderModel, ownerAssertionsFromGraph, type PresentationBinding } from '../sitespec/binding-verifier';
import { resolveSafeLink } from '../sitespec/safe-link';
import { SCHEMA_ROLES } from '../sitespec/schemas';
import { namesOutOfScopeTopic } from '../../lib/ping/ask-composer';
import { valueLooksLikeAddress } from '../sitespec/field-visibility';

import { visitorBinding, visitorField, conciseSource, visitorCallLink } from '../sitespec/visitor-knowledge';
import {
  assertObligationCoverage,
  decomposeObligations,
  forcedUnknownFor,
  missingObligations,
  normalizeQuestion,
  type Obligation,
  type ObligationKind,
  type ObligationResolution,
  type ObligationStatus,
} from './obligations';

type Claim = { text: string; bindings: PresentationBinding[]; relationships: PingRelationship[] };

interface ConciergeState {
  target: PingObject;
  graph: ObjectGraph;
  name: string;
  serviceEdges: PingRelationship[];
  services: PingObject[];
}

/** One obligation's resolution workspace. Null = the resolver declines (existing fallback owns it). */
interface Acc {
  claims: Claim[];
  unknowns: string[];
}

/** The top guard, unchanged: out-of-scope, conflicts, non-business, or no name -> null. */
function buildState(ctx: AskFydContext, question: string): ConciergeState | null {
  const target = ctx.base.target;
  if (!target) return null;
  const q = normalizeQuestion(question);
  const contactQuestion = /\b(contact|phone|telephone|email|reach|call)\b/.test(q) && !/\b(answer|answering|automate|automation)\b/.test(q);
  // Keep contact disagreements on their existing comparison path. They
  // must not divert unrelated service questions into contact answers.
  if (!SCHEMA_ROLES.business.includes(target.schema) || namesOutOfScopeTopic(q) || ctx.fieldConflicts.length || (contactQuestion && target.ownerFieldCorrections?.length)) return null;
  const graph = { objects: [target, ...ctx.base.relatedObjects].filter(o => o.visibility === 'public'), relationships: ctx.base.relationships.filter(r => r.status === 'active') };
  const name = visitorField(graph, target, 'title');
  if (!name) return null;
  const serviceEdges = graph.relationships.filter(r => r.subject === target.id && ['offers', 'provides'].includes(r.predicate));
  const services = graph.objects.filter(o => SCHEMA_ROLES.service.includes(o.schema) && serviceEdges.some(r => r.object === o.id) && visitorField(graph, o, 'title'));
  return { target, graph, name, serviceEdges, services };
}

function makeAcc(): Acc {
  return { claims: [], unknowns: [] };
}

function claimInto(acc: Acc, st: ConciergeState, text: string, object: PingObject, fields: string[], relationships: PingRelationship[] = []) {
  acc.claims.push({ text, bindings: fields.map(field => visitorBinding(st.graph, object, field)), relationships });
}

function contactInto(acc: Acc, st: ConciergeState, segQ: string, all = true) {
  const { target, graph } = st;
  for (const kind of ['phone', 'email'] as const) {
    if (!all && kind !== (/email/.test(segQ) ? 'email' : 'phone')) continue;
    const value = visitorField(graph, target, kind);
    // Unresolved contact conflicts are already withheld by context projection.
    const safe = kind === 'phone' ? visitorCallLink(value) : resolveSafeLink(value, 'email');
    if (value && safe.kind === 'safe') claimInto(acc, st, `${kind === 'phone' ? 'Call' : 'Email'} ${value} to discuss your needs.`, target, [kind]);
  }
  if (all) {
    const website = visitorField(graph, target, 'website');
    if (website && resolveSafeLink(website, 'navigate').kind === 'safe') claimInto(acc, st, `Their website is ${website}.`, target, ['website']);
  }
}

function resolveContact(text: string, st: ConciergeState): Acc | null {
  const acc = makeAcc();
  const segQ = normalizeQuestion(text);
  contactInto(acc, st, segQ, !/\b(phone|telephone|email)\b/.test(segQ));
  if (!acc.claims.length) acc.unknowns.push('I don’t have a published contact method for this business.');
  return acc;
}

function resolveLocation(text: string, st: ConciergeState): Acc | null {
  const acc = makeAcc();
  const segQ = normalizeQuestion(text);
  const { target, graph } = st;
  const areaField = ['area_served', 'areaServed', 'serviceArea', 'service_area'].find(f => visitorField(graph, target, f));
  const locality = visitorField(graph, target, 'locality');
  if (areaField) claimInto(acc, st, `Their stated service area is ${visitorField(graph, target, areaField)}.`, target, [areaField]);
  else if (/\b(area|serve|serves|serving)\b/.test(segQ)) {
    const description = visitorField(graph, target, 'description');
    if (description && /\b(serviced|serves|serving|service area)\b/i.test(description)) claimInto(acc, st, `Their website says: “${conciseSource(description)}”`, target, ['description']);
    acc.unknowns.push('I can’t confirm coverage for a particular address. Contact the business to check.');
  }
  if (locality) claimInto(acc, st, `They are based in ${locality}.`, target, ['locality']);
  else {
    const location = graph.objects.find(o => SCHEMA_ROLES.location.includes(o.schema) && graph.relationships.some(r => r.subject === target.id && r.object === o.id && ['located_at', 'has_location'].includes(r.predicate)) && visitorField(graph, o, 'title'));
    if (location && !valueLooksLikeAddress(visitorField(graph, location, 'title') ?? '')) claimInto(acc, st, `Their listed location is ${visitorField(graph, location, 'title')}.`, location, ['title'], graph.relationships.filter(r => r.subject === target.id && r.object === location.id));
  }
  if (!acc.claims.length) return null; // Existing location coarsening and HIDE wording.
  return acc;
}

function resolveEmergency(text: string, st: ConciergeState): Acc | null {
  const acc = makeAcc();
  const segQ = normalizeQuestion(text);
  // The emergency wording is an honest unknown, never an invented
  // availability and never the fallback's "does not offer" inference.
  acc.unknowns.push('I can’t confirm emergency or after-hours availability from the published information I have.');
  contactInto(acc, st, segQ);
  return acc;
}

function resolveHours(text: string, st: ConciergeState): Acc | null {
  const acc = makeAcc();
  const segQ = normalizeQuestion(text);
  const { target, graph, name } = st;
  if (/\b(emergency|24|weekend)\b/.test(segQ)) {
    acc.unknowns.push('I can’t confirm emergency or after-hours availability from the published information I have.');
  } else {
    const hoursField = ['hours', 'business_hours', 'opening_hours'].find(f => visitorField(graph, target, f));
    if (hoursField) claimInto(acc, st, `Their published hours are ${visitorField(graph, target, hoursField)}.`, target, [hoursField]);
    else acc.unknowns.push(`No hours are on record for ${name}.`);
  }
  contactInto(acc, st, segQ);
  return acc;
}

function resolveServices(text: string, st: ConciergeState): Acc | null {
  const acc = makeAcc();
  const { target, graph } = st;
  // Scalar service lists also carry source bindings; traversal cannot
  // turn an unrelated/inverse edge into an offering.
  const scalar = visitorField(graph, target, 'services');
  const services = st.services;
  if (!services.length && scalar) claimInto(acc, st, `Their listed services are ${scalar}.`, target, ['services']);
  else return null;
  return acc;
}

function resolveRepair(text: string, st: ConciergeState): Acc | null {
  const acc = makeAcc();
  const segQ = normalizeQuestion(text);
  const { serviceEdges, services } = st;
  const noise = new Set('can could would they you help me my with do does offer provide need needs a an the is are broken working not have has i we our please this that them business'.split(' '));
  // The old multi-topic bail-out lived here; decomposition now owns it.
  const terms = segQ.split(' ').filter(t => t.length > 2 && !noise.has(t));
  const matches = services.map(o => ({ o, title: visitorField(st.graph, o, 'title')!, description: visitorField(st.graph, o, 'description') }))
    .filter(s => terms.some(t => normalizeQuestion(s.title + ' ' + (s.description ?? '')).split(' ').includes(t)));
  for (const s of matches.slice(0, 2)) {
    const rels = serviceEdges.filter(r => r.object === s.o.id);
    claimInto(acc, st, s.description ? `Their ${s.title} service says: “${s.description}”` : `They offer ${s.title}.`, s.o, s.description ? ['title', 'description'] : ['title'], rels);
  }
  if (!matches.length && !/\b(help|problem|broken|repair|fix|need|leak|leaking)\b/.test(segQ)) return null;
  if (!matches.length) acc.unknowns.push('I can’t confirm that particular service from the published information I have.');
  // A symptom is not a diagnosis and a broad category is not a promise to fix it.
  if (/\b(leak|leaking|broken|problem|fix)\b/.test(segQ) || (matches.length && terms.some(t => !matches.some(s => normalizeQuestion(s.title + ' ' + (s.description ?? '')).split(' ').includes(t))))) {
    acc.unknowns.push('The business will need to confirm whether it can help with your specific problem.');
  }
  contactInto(acc, st, segQ);
  return acc;
}

function resolveProfile(text: string, st: ConciergeState): Acc | null {
  const acc = makeAcc();
  const { target, graph } = st;
  const description = visitorField(graph, target, 'description');
  if (description) claimInto(acc, st, description, target, ['description']);
  else acc.unknowns.push('I don’t have a published business description.');
  return acc;
}

const RESOLVERS: Record<ObligationKind, (text: string, st: ConciergeState) => Acc | null> = {
  contact: resolveContact,
  location: resolveLocation,
  emergency: resolveEmergency,
  hours: resolveHours,
  services: resolveServices,
  coverage: resolveServices,
  repair: resolveRepair,
  profile: resolveProfile,
};

export function answerVisitorConcierge(ctx: AskFydContext, question: string): AskFydAnswer | null {
  const st = buildState(ctx, question);
  if (!st) return null;
  const obligations = decomposeObligations(question);
  if (obligations.length === 0) return null;

  const perObligation = obligations.map((obligation) => ({
    obligation,
    acc: RESOLVERS[obligation.kind](obligation.text, st),
  }));
  // Every resolver declined: the concierge does not own this question;
  // the existing fallbacks (service enumeration, composer) keep it.
  if (perObligation.every((p) => p.acc === null)) return null;

  // Merge in deterministic obligation order. Identical claim/unknown text
  // (the trailing contact() calls converge) keeps its first occurrence.
  const claims: Claim[] = [];
  const unknowns: string[] = [];
  const seenClaims = new Set<string>();
  const seenUnknowns = new Set<string>();
  for (const { acc } of perObligation) {
    if (!acc) continue;
    for (const u of acc.unknowns) {
      if (!seenUnknowns.has(u)) { seenUnknowns.add(u); unknowns.push(u); }
    }
    for (const c of acc.claims) {
      if (!seenClaims.has(c.text)) { seenClaims.add(c.text); claims.push(c); }
    }
  }

  // Coverage: fail-safe first (declined obligations in a committed answer
  // surface as honest UNKNOWNs), then hard (anything still uncovered is a
  // pipeline bug and fails closed before serving).
  const resolutions: ObligationResolution[] = perObligation.map(({ obligation, acc }) => ({
    obligation,
    status: (acc === null ? "declined" : acc.claims.length > 0 ? "supported" : "unknown") as ObligationStatus,
    claimCount: acc ? acc.claims.length : 0,
    unknowns: acc ? [...acc.unknowns] : [],
  }));
  for (const ob of missingObligations(obligations, resolutions)) {
    const u = forcedUnknownFor(ob);
    if (!seenUnknowns.has(u)) { seenUnknowns.add(u); unknowns.push(u); }
  }
  const covered: ObligationResolution[] = resolutions.map((r) => {
    const forced = missingObligations([r.obligation], [r]).length > 0;
    return forced
      ? { ...r, status: "unknown" as ObligationStatus, unknowns: [...r.unknowns, forcedUnknownFor(r.obligation)] }
      : r;
  });
  assertObligationCoverage(obligations, covered);

  const refs: AskFydAnswer['evidenceRefs'] = [];
  const classifications: AskFydAnswer['claimClassifications'] = [];
  const marker = (ref: AskFydAnswer['evidenceRefs'][number]) => {
    let n = refs.findIndex(r => r.id === ref.id);
    if (n < 0) { n = refs.length; refs.push(ref); }
    return `[${n + 1}]`;
  };
  const paragraphs = claims.map(c => {
    const ids: string[] = [];
    const tags = c.bindings.map(b => {
      const object = st.graph.objects.find(o => o.id === b.objectId)!;
      const ref = { kind: 'field' as const, id: `${b.objectId}#${b.field}`, label: `${object.title}: ${b.field}`, detail: object.provenance?.ref ?? '' };
      ids.push(ref.id); return marker(ref);
    });
    c.relationships.forEach(r => {
      const ref = { kind: 'relationship' as const, id: r.id, label: `${st.name} ${r.predicate.replace(/_/g, ' ')} ${st.graph.objects.find(o => o.id === r.object)?.title ?? ''}`, detail: r.evidenceRef };
      ids.push(ref.id); tags.push(marker(ref));
    });
    classifications.push({ claim: c.text, classification: c.bindings.some(b => st.graph.objects.find(o => o.id === b.objectId)?.fields.claimKind === 'DERIVED_FACT') ? 'DERIVED_FACT' : c.bindings.some(b => b.classification === 'owner_authored') ? 'owner_authorship' : 'website_statement', evidenceRefIds: ids, bindings: c.bindings, relationshipIds: c.relationships.map(r => r.id) });
    return `${c.text} ${tags.join('')}`;
  });
  const bindingVerification = buildVerifiedRenderModel(claims.flatMap(c => c.bindings), st.graph, ownerAssertionsFromGraph(st.graph), { rendererVersion: 'fyd.ask-visitor@1', viewerId: null });
  return { answer: [...unknowns, ...paragraphs].join('\n\n'), evidenceRefs: refs, claimClassifications: classifications, unknowns, bindingVerification, sourceUrls: ctx.base.sourceUrls, relatedObjects: [], suggestedActions: [], proposal: null, partial: !claims.length, sitePatchCard: null };
}
