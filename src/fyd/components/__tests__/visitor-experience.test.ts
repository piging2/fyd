import { visitorExperiencePlan } from '../visitor-experience';
import { generateSiteSpec } from '../../proceduralize/generator';
import { COPPERSMITH_GRAPH } from '../../proceduralize/__fixtures__/coppersmith-graph';
import { PING_FYD_GRAPH } from '../../proceduralize/__fixtures__/ping-fyd-graph';
import type { ObjectGraph } from '../../sitespec/types';
function context(graph: ObjectGraph) {
  return { graph, spec: generateSiteSpec(graph, { generatedAt: '2026-10-05T00:00:00Z' }), viewer: {viewerId:null,displayName:null}, siteId:'test' };
}
test('public presentation preserves owner order and deactivation', () => {
  const ctx = context(COPPERSMITH_GRAPH);
  const section = ctx.spec.pages[0].sections.find(s => s.component === 'Services')!;
  const hvac = ctx.graph.objects.find(o => o.title === 'HVAC')!;
  section.presentation.objectOrder = [hvac.id];
  expect(visitorExperiencePlan(ctx)?.services[0].id).toBe(hvac.id);
  section.presentation.hiddenObjectIds = [hvac.id];
  expect(visitorExperiencePlan(ctx)?.services.some(o => o.id === hvac.id)).toBe(false);
});
test('a website account label is not promoted as staff identity', () => {
  expect(visitorExperiencePlan(context(COPPERSMITH_GRAPH))?.people).toHaveLength(0);
});
test('unavailable or unsafe contact data creates no capability', () => {
  const graph = structuredClone(COPPERSMITH_GRAPH);
  graph.objects[0].fields.phone = 'javascript:alert(1)';
  expect(visitorExperiencePlan(context(graph))?.phone.kind).toBe('non_navigable');
  delete graph.objects[0].fields.phone;
  expect(visitorExperiencePlan(context(graph))?.phone.kind).toBe('non_navigable');
});
test('hiding contact removes every call action from the visitor plan', () => {
  const ctx = context(COPPERSMITH_GRAPH);
  ctx.spec.pages[0].sections.find(s => s.component === 'Contact')!.presentation.hidden = true;
  expect(visitorExperiencePlan(ctx)?.phone.kind).toBe('non_navigable');
  expect(visitorExperiencePlan(ctx)?.website.kind).toBe('non_navigable');
});
test('unrelated software business uses its own knowledge and owner evidence', () => {
  const plan = visitorExperiencePlan(context(PING_FYD_GRAPH))!;
  expect(plan.name).toBe('PING Social');
  expect(plan.services.map(o => o.title)).toContain('AI call answering');
  expect(plan.services.map(o => o.title)).not.toContain('Plumbing');
  expect(plan.serviceArea).toContain('Mesa County');
  expect(plan.parents.size).toBe(0);
});

test('a malformed demo phone stays in the source without becoming a Call action', () => {
  const graph = structuredClone(PING_FYD_GRAPH);
  graph.objects[0].fields.phone = '+1 555 010 1234';
  const original = graph.objects[0].fields.phone;
  expect(visitorExperiencePlan(context(graph))?.phone.kind).toBe('non_navigable');
  expect(graph.objects[0].fields.phone).toBe(original);
  graph.objects[0].fields.phone = '+1 970 245 3869';
  expect(visitorExperiencePlan(context(graph))?.phone.kind).toBe('safe');
  graph.objects[0].fields.phone = '+44 20 7946 0000';
  expect(visitorExperiencePlan(context(graph))?.phone.kind).toBe('safe');
});
