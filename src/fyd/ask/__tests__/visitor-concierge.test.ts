import { buildAskFydContext } from '../context-builder';
import { composeAskFyd } from '../answer';
import { PING_FYD_GRAPH } from '../../proceduralize/__fixtures__/ping-fyd-graph';
import { COPPERSMITH_GRAPH } from '../../proceduralize/__fixtures__/coppersmith-graph';
import type { ObjectGraph } from '../../sitespec/types';

function ask(question: string, graph: ObjectGraph = COPPERSMITH_GRAPH) {
  const target = graph.objects.find(o => o.schema === 'ping.social.business@1')!;
  const ctx = buildAskFydContext({ viewer: { id: null, displayName: null }, target,
    relatedObjects: graph.objects.filter(o => o.id !== target.id), relationships: graph.relationships,
    plan: null, grants: [], siteSpec: null, question });
  return composeAskFyd(ctx, question);
}

test.each(['Can they help with my AC?', 'Do they do plumbing?', 'How do I contact them?', 'Where are they located?', 'What services do they offer?'])('ordinary visitor question is bound: %s', question => {
  const out = ask(question);
  expect(out.partial).toBe(false);
  expect(out.bindingVerification?.atoms.length).toBeGreaterThan(0);
  expect(out.bindingVerification?.atoms.every(a => a.classification !== 'UNKNOWN')).toBe(true);
  expect(out.claimClassifications.every(c => c.bindings?.length)).toBe(true);
});
test('AC retrieval selects the actual air-conditioning description', () => {
  const out = ask('Can they help with my AC?');
  expect(out.answer).toContain('air conditioning units');
  expect(out.claimClassifications.some(c => c.bindings?.some(b => b.field === 'description'))).toBe(true);
});
test('a symptom does not become a diagnosis or guaranteed repair', () => {
  const out = ask('I have water leaking under my sink. Can they help?');
  expect(out.answer).toContain('can’t confirm that particular service');
  expect(out.answer).toContain('970-245-3869');
  expect(out.answer).not.toMatch(/(we|they) (can|will) (repair|fix)/i);
});
test('missing emergency evidence does not prove non-availability', () => {
  const out = ask('Do they do emergency plumbing?');
  expect(out.answer).toContain('can’t confirm emergency');
  expect(out.answer).not.toContain('does not offer emergency');
});
test('a stale source cannot supply contact or service facts', () => {
  const graph = structuredClone(COPPERSMITH_GRAPH);
  graph.objects.forEach(o => { if (o.provenance) o.provenance.derivedAt = '2020-01-01T00:00:00Z'; });
  const out = ask('What services do they offer?', graph);
  expect(out.claimClassifications).toHaveLength(0);
  expect(out.answer).not.toContain('Offers: HVAC');
});
test('a missing phone is not replaced with a dial action', () => {
  const graph = structuredClone(COPPERSMITH_GRAPH);
  delete graph.objects[0].fields.phone;
  const out = ask('What is their phone number?', graph);
  expect(out.partial).toBe(true);
  expect(out.evidenceRefs).toHaveLength(0);
  expect(out.answer).not.toContain('970-245-3869');
});

test('a phone correction does not divert an AI call-answering service question', () => {
  const graph = structuredClone(PING_FYD_GRAPH);
  const target = graph.objects[0];
  target.fields.phone = '+1 555 010 1234';
  target.ownerFieldCorrections = [{field:'phone',label:'Phone',sourceValue:'(970) 589-3309',ownerValue:'+1 555 010 1234',correctedAt:'2026-10-05T00:00:00Z',actorLabel:'Demo Owner (seeded, unverified)',basis:'Local demo correction'}];
  const out = ask('Can they help with AI call answering?', graph);
  expect(out.answer).toContain('AI call answering');
  expect(out.answer).not.toContain('Call +1 555');
  expect(out.claimClassifications.some(c => c.bindings?.some(b => b.field === 'description'))).toBe(true);
  expect(out.bindingVerification?.atoms.every(a => a.classification !== 'UNKNOWN')).toBe(true);
});