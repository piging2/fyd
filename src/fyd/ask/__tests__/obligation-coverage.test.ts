/**
 * Item 7: Ask FYD multi-intent obligation coverage.
 *
 * QUESTION -> OBLIGATIONS -> EVIDENCE RESOLUTION -> COVERAGE CHECK -> ANSWER.
 * Each obligation resolves to SUPPORTED / DERIVED / UNKNOWN; the final
 * response cannot silently omit an obligation.
 */
import { buildAskFydContext } from '../context-builder';
import { composeAskFyd } from '../answer';
import { answerVisitorConcierge } from '../visitor-concierge';
import {
  assertObligationCoverage,
  decomposeObligations,
  forcedUnknownFor,
  isObligationCovered,
  missingObligations,
  type Obligation,
  type ObligationResolution,
} from '../obligations';
import { COPPERSMITH_GRAPH } from '../../proceduralize/__fixtures__/coppersmith-graph';
import { HAPPY_PLACE_GRAPH } from '../../proceduralize/__fixtures__/happy-place-graph';
import { BASELINE } from './__fixtures__/visitor-concierge-baseline';
import type { ObjectGraph } from '../../sitespec/types';

const COPPER = COPPERSMITH_GRAPH as unknown as ObjectGraph;
const HAPPY = HAPPY_PLACE_GRAPH as unknown as ObjectGraph;

function askConcierge(question: string, graph: ObjectGraph = COPPER) {
  const target = graph.objects.find((o) => o.schema === 'ping.social.business@1')!;
  const ctx = buildAskFydContext({
    viewer: { id: null, displayName: null }, target,
    relatedObjects: graph.objects.filter((o) => o.id !== target.id),
    relationships: graph.relationships,
    plan: null, grants: [], siteSpec: null, question,
  });
  return answerVisitorConcierge(ctx, question);
}

function askFull(question: string, graph: ObjectGraph = COPPER) {
  const target = graph.objects.find((o) => o.schema === 'ping.social.business@1')!;
  const ctx = buildAskFydContext({
    viewer: { id: null, displayName: null }, target,
    relatedObjects: graph.objects.filter((o) => o.id !== target.id),
    relationships: graph.relationships,
    plan: null, grants: [], siteSpec: null, question,
  });
  return composeAskFyd(ctx, question);
}

/** Every obligation's topic is addressed by the served answer or its unknowns. */
function expectCovered(
  question: string,
  answer: string,
  unknowns: string[],
  claimTexts: string[] = [],
) {
  const uncovered = decomposeObligations(question)
    .filter((ob) => !isObligationCovered(ob, { answer, unknowns, claimTexts }))
    .map((o) => o.id + ' (' + o.kind + ': ' + o.topic + ')');
  expect(uncovered).toEqual([]);
}

describe('decomposeObligations', () => {
  test('single-intent questions yield exactly one obligation', () => {
    expect(decomposeObligations('How do I contact them?').map((o) => o.kind)).toEqual(['contact']);
    expect(decomposeObligations('Do they do emergency plumbing?').map((o) => o.kind)).toEqual(['emergency']);
    expect(decomposeObligations('What are their hours?').map((o) => o.kind)).toEqual(['hours']);
    expect(decomposeObligations('Where are they located?').map((o) => o.kind)).toEqual(['location']);
    const single = decomposeObligations('Can they help with my AC?');
    expect(single).toHaveLength(1);
    // Single obligations run on the original question text: single-intent
    // behavior is preserved byte-for-byte.
    expect(single[0].text).toBe('Can they help with my AC?');
  });

  test('Q1 decomposes to repair + contact', () => {
    const obs = decomposeObligations('Can they repair heat pumps, and how do I contact them?');
    expect(obs.map((o) => o.kind)).toEqual(['repair', 'contact']);
    expect(obs.map((o) => o.id)).toEqual(['ob-0', 'ob-1']);
  });

  test('Q2 decomposes to emergency + repair + contact (emergency stripped for repair)', () => {
    const obs = decomposeObligations('Do they offer emergency heat-pump repair and how do I contact them?');
    expect(obs.map((o) => o.kind)).toEqual(['emergency', 'repair', 'contact']);
    expect(obs[1].text.toLowerCase()).not.toContain('emergency');
    expect(obs[1].text.toLowerCase()).toContain('heat');
  });

  test('same-kind unclassified segments decline: "plumbing and heating" stays fallback-owned', () => {
    // Both segments match no intent kind, so decomposition yields nothing
    // and the concierge declines exactly as the old bail-out did: the
    // existing fallback owns the question. Never silent, never invented.
    expect(decomposeObligations('plumbing and heating')).toEqual([]);
    expect(askConcierge('plumbing and heating')).toBeNull();
  });

  test('unclassified segments never vanish: they become repair obligations', () => {
    const obs = decomposeObligations('How do I contact them, and blah blah');
    expect(obs.map((o) => o.kind)).toEqual(['contact', 'repair']);
  });
});

describe('acceptance Q1: heat-pump repair + contact (coppersmith)', () => {
  const q = 'Can they repair heat pumps, and how do I contact them?';
  test('both obligations answered with evidence, nothing dropped', () => {
    const out = askConcierge(q);
    expect(out).not.toBeNull();
    const claims = out!.claimClassifications.map((c) => c.claim);
    // Heat-pump repair SUPPORTED, citing the Heating & Cooling evidence.
    expect(claims.some((c) => c.includes('heat pumps'))).toBe(true);
    expect(claims.some((c) => c.includes('Heating & Cooling'))).toBe(true);
    // Contact SUPPORTED.
    expect(claims.some((c) => c.includes('970-245-3869'))).toBe(true);
    expect(claims.some((c) => c.includes('coppersmithplumbing.com'))).toBe(true);
    expect(out!.unknowns).toEqual([]);
    expectCovered(q, out!.answer, out!.unknowns, out!.claimClassifications.map((c) => c.claim));
  });

  test('the full pipeline serves both obligations', () => {
    const out = askFull(q);
    expect(out.answer).toContain('heat pumps');
    expect(out.answer).toContain('970-245-3869');
    expectCovered(q, out.answer, out.unknowns, out.claimClassifications.map((c) => c.claim));
  });
});

describe('acceptance Q2: emergency (UNKNOWN) + heat-pump + contact (coppersmith)', () => {
  const q = 'Do they offer emergency heat-pump repair and how do I contact them?';
  test('emergency availability is UNKNOWN with the exact honest wording; nothing invented', () => {
    const out = askConcierge(q);
    expect(out).not.toBeNull();
    expect(out!.unknowns).toContain(
      'I can’t confirm emergency or after-hours availability from the published information I have.',
    );
    const claims = out!.claimClassifications.map((c) => c.claim);
    expect(claims.some((c) => c.includes('heat pumps'))).toBe(true);
    expect(claims.some((c) => c.includes('970-245-3869'))).toBe(true);
    expect(out!.answer).not.toContain('does not offer emergency');
    expect(out!.answer).not.toMatch(/offers emergency/i);
    expectCovered(q, out!.answer, out!.unknowns, out!.claimClassifications.map((c) => c.claim));
  });
});

describe('acceptance Q3: espresso (UNKNOWN) + contact (happy place)', () => {
  const q = 'Do you have espresso drinks, and how do I contact you?';
  test('the drinks obligation is UNKNOWN; contact is SUPPORTED', () => {
    const out = askConcierge(q, HAPPY);
    expect(out).not.toBeNull();
    expect(out!.unknowns.some((u) => u.includes('espresso'))).toBe(true);
    expect(out!.claimClassifications.length).toBeGreaterThan(0);
    expectCovered(q, out!.answer, out!.unknowns, out!.claimClassifications.map((c) => c.claim));
  });
});

describe('coverage invariance battery', () => {
  const questions = [
    'What are your hours, and where are you located?',
    'Do they do emergency plumbing, and what is their phone number?',
    'Tell me about this business, and how do I contact them?',
    'Do they repair heat pumps or install furnaces, and what are your hours?',
    'What services do they offer, and how do I contact them?',
  ];
  test.each(questions)('every obligation covered, none silently omitted: %s', (q) => {
    const out = askConcierge(q);
    // The concierge may still decline the whole question (existing
    // fallbacks own it); when it commits, coverage is total: every
    // obligation's topic appears in the answer or the unknowns.
    if (out === null) {
      expect(decomposeObligations(q).length).toBeGreaterThan(0);
      return;
    }
    expectCovered(q, out.answer, out.unknowns, out.claimClassifications.map((c) => c.claim));
  });

  test('a declined obligation in a committed answer surfaces as forced UNKNOWN', () => {
    // Coppersmith has no scalar services field: the services obligation
    // declines, contact resolves, and the answer commits with a forced
    // UNKNOWN instead of silence.
    const out = askConcierge('What services do they offer, and how do I contact them?');
    expect(out).not.toBeNull();
    expect(out!.answer).toContain('970-245-3869');
    expect(out!.unknowns.some((u) => u.includes('the services offered'))).toBe(true);
  });
});

describe('assertObligationCoverage / missingObligations units', () => {
  const ob = (id: string, kind: Obligation['kind']): Obligation => ({
    id, kind, segment: id, text: id, topic: 'topic-' + id, keywords: ['topic-' + id],
  });
  const res = (o: Obligation, claimCount: number, unknowns: string[] = [], declined = false): ObligationResolution => ({
    obligation: o, status: declined ? 'declined' : claimCount > 0 ? 'supported' : 'unknown', claimCount, unknowns,
  });
  test('a resolver that produced neither claims nor unknowns is missing', () => {
    const o1 = ob('ob-0', 'repair');
    const o2 = ob('ob-1', 'contact');
    expect(missingObligations([o1, o2], [res(o1, 0), res(o2, 1)])).toEqual([o1]);
    expect(() => assertObligationCoverage([o1, o2], [res(o1, 0), res(o2, 1)])).toThrow(/ob-0/);
    expect(() => assertObligationCoverage([o1, o2], [res(o1, 0, ['u']), res(o2, 1)])).not.toThrow();
  });
  test('forcedUnknownFor carries the topic and no factual atoms', () => {
    const u = forcedUnknownFor(ob('ob-0', 'repair'));
    expect(u).toContain('topic-ob-0');
    expect(u).not.toMatch(/\[\d+\]/);
  });
});

describe('single-intent byte-identity (guards the obligation refactor)', () => {
  test.each(Object.keys(BASELINE))('unchanged single-intent answer: %s', (question) => {
    const expected = BASELINE[question] as null | {
      answer: string; unknowns: string[]; partial: boolean;
      claims: { claim: string; classification: string; evidenceRefIds: string[] }[];
    };
    const out = askConcierge(question);
    if (expected === null) {
      expect(out).toBeNull();
      return;
    }
    expect(out).not.toBeNull();
    expect(out!.answer).toBe(expected.answer);
    expect(out!.unknowns).toEqual(expected.unknowns);
    expect(out!.partial).toBe(expected.partial);
    expect(
      out!.claimClassifications.map((c) => ({
        claim: c.claim,
        classification: c.classification,
        evidenceRefIds: c.evidenceRefIds,
      })),
    ).toEqual(expected.claims);
  });

  test('"or"-compounds now resolve instead of bailing (decompose instead of bail)', () => {
    const out = askConcierge('Do they repair heat pumps or install furnaces?');
    expect(out).not.toBeNull();
    expect(out!.answer).toContain('heat pumps');
  });
});
