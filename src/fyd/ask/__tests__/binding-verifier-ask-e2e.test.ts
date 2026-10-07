/**
 * Item 7: end-to-end proof that "no invented claims" holds through the
 * existing binding verifier for obligation-complete answers.
 *
 * For each acceptance answer:
 * - every served claim's bindings resolve to non-UNKNOWN atoms in the
 *   shared verifier receipt (the contract's machine check, per obligation);
 * - the invented-claim detector: every factual paragraph traces to >= 1
 *   binding atom whose value appears in the served text; presentational /
 *   UNKNOWN paragraphs trace to zero atoms and carry no citation markers;
 * - UNKNOWN obligation sentences contribute zero atoms to the receipt.
 *
 * No ClaimAuthority is created: the proof goes through the already-built
 * binding verifier. If an unbound factual atom is found, the integration
 * (not a new authority) is what gets fixed.
 */
import { buildAskFydContext } from '../context-builder';
import { answerVisitorConcierge } from '../visitor-concierge';
import { assertAskAnswerContract, contractClaimsFor } from '../contract';
import { answerStateFor } from '../visitor-answer';
import { decomposeObligations, type Obligation } from '../obligations';
import type { AskFydAnswer } from '../types';
import { COPPERSMITH_GRAPH } from '../../proceduralize/__fixtures__/coppersmith-graph';
import { HAPPY_PLACE_GRAPH } from '../../proceduralize/__fixtures__/happy-place-graph';
import type { ObjectGraph } from '../../sitespec/types';

function askConcierge(question: string, graph: ObjectGraph) {
  const target = graph.objects.find((o) => o.schema === 'ping.social.business@1')!;
  const ctx = buildAskFydContext({
    viewer: { id: null, displayName: null }, target,
    relatedObjects: graph.objects.filter((o) => o.id !== target.id),
    relationships: graph.relationships,
    plan: null, grants: [], siteSpec: null, question,
  });
  const out = answerVisitorConcierge(ctx, question);
  if (!out) throw new Error('concierge declined: ' + question);
  return out;
}

const COPPER = COPPERSMITH_GRAPH as unknown as ObjectGraph;
const HAPPY = HAPPY_PLACE_GRAPH as unknown as ObjectGraph;

const ACCEPTANCE: { question: string; graph: ObjectGraph }[] = [
  { question: 'Can they repair heat pumps, and how do I contact them?', graph: COPPER },
  { question: 'Do they offer emergency heat-pump repair and how do I contact them?', graph: COPPER },
  { question: 'Do you have espresso drinks, and how do I contact you?', graph: HAPPY },
];

function stripMarkers(paragraph: string): string {
  return paragraph.replace(/(\[\d+\])+/g, '').trim();
}

/**
 * Build a pipeline-grade served outcome from a concierge answer, the way
 * the ask route does (citations over the served evidence refs, classes
 * from the real classifiers), so the contract sees a real answer.
 */
function servedOutcome(out: AskFydAnswer) {
  const citations = out.evidenceRefs.map((r, i) => ({
    n: i + 1,
    id: r.id,
    label: r.label,
    claimClass: 'SUPPORTED DIRECTLY' as const,
  }));
  // The class value is incidental here (the contract only checks
  // answerState === answerStateFor(answerClass)); the obligation seam is
  // what this test exercises. answerClassFor lives in the ask route
  // module, so the test pins a valid class instead of importing the route.
  const answerClass = 'SUPPORTED DIRECTLY' as const;
  const answerState = answerStateFor(answerClass);
  return {
    outcome: {
      answer: out.answer,
      refusal: false,
      citations,
      evidenceRefs: out.evidenceRefs,
      unknowns: out.unknowns,
      proposal: null,
      bindingVerification: out.bindingVerification,
      claimClassifications: out.claimClassifications,
    },
    answerClass,
    answerState,
    claims: contractClaimsFor(out.claimClassifications as never[]),
  };
}

describe('binding-verifier ask end-to-end (no invented claims)', () => {
  test.each(ACCEPTANCE.map((a) => a.question))(
    'every served claim binds to a non-UNKNOWN verifier atom: %s',
    (question) => {
      const { graph } = ACCEPTANCE.find((a) => a.question === question)!;
      const out = askConcierge(question, graph);
      expect(out.bindingVerification).toBeDefined();
      const atoms = out.bindingVerification!.atoms;
      expect(atoms.length).toBeGreaterThan(0);
      for (const cc of out.claimClassifications) {
        expect(cc.bindings?.length).toBeGreaterThan(0);
        for (const b of cc.bindings!) {
          const atom = atoms.find(
            (a) => a.id.startsWith(`${b.objectId}#${b.field}#`) && a.classification !== 'UNKNOWN',
          );
          expect(atom).toBeDefined();
          // The atom's factual value is literally in the served answer text.
          expect(out.answer).toContain(String((atom as { value: unknown }).value));
        }
      }
      // No UNKNOWN atoms leak into the receipt.
      expect(atoms.every((a) => a.classification !== 'UNKNOWN')).toBe(true);
    },
  );

  test.each(ACCEPTANCE.map((a) => a.question))(
    'invented-claim detector: factual paragraphs trace to atoms, presentational ones to zero: %s',
    (question) => {
      const { graph } = ACCEPTANCE.find((a) => a.question === question)!;
      const out = askConcierge(question, graph);
      const paragraphs = out.answer.split('\n\n');
      const claimParagraphs = paragraphs.filter((p) => /\[\d+\]/.test(p));
      const presentational = paragraphs.filter((p) => !/\[\d+\]/.test(p));
      // Every cited paragraph is one of the served claims, verbatim.
      expect(claimParagraphs).toHaveLength(out.claimClassifications.length);
      claimParagraphs.forEach((p, i) => {
        expect(stripMarkers(p)).toBe(out.claimClassifications[i].claim);
      });
      // Every uncited paragraph is a served unknown (honest uncertainty,
      // first-person, zero factual atoms, zero citation markers). (Q1 has
      // none: every obligation resolved to claims.)
      for (const p of presentational) {
        expect(out.unknowns).toContain(p);
        expect(p).not.toMatch(/\[\d+\]/);
      }
      // UNKNOWN sentences contribute zero atoms: every receipt atom id
      // belongs to a claim binding.
      const bindingPrefixes = new Set(
        (out.claimClassifications.flatMap((c) => c.bindings ?? []) as { objectId: string; field: string }[]).map(
          (b) => `${b.objectId}#${b.field}#`,
        ),
      );
      for (const atom of out.bindingVerification!.atoms) {
        expect([...bindingPrefixes].some((pre) => atom.id.startsWith(pre))).toBe(true);
      }
    },
  );

  test.each(ACCEPTANCE.map((a) => a.question))(
    'the contract seam enforces obligation coverage on the served answer: %s',
    (question) => {
      const { graph } = ACCEPTANCE.find((a) => a.question === question)!;
      const out = askConcierge(question, graph);
      const obligations = decomposeObligations(question);
      expect(obligations.length).toBeGreaterThan(1);
      const args = servedOutcome(out);
      // Without obligations: passes (existing behavior). With the real
      // obligations: passes only because every obligation is covered.
      expect(() => assertAskAnswerContract(args as never)).not.toThrow();
      expect(() => assertAskAnswerContract({ ...(args as object), obligations } as never)).not.toThrow();
      // And an uncovered obligation fails the seam: the same answer
      // against obligations plus a topic it never addresses throws.
      const dropped: Obligation = {
        id: 'ob-x',
        kind: 'repair',
        segment: 'swimming pools',
        text: 'swimming pools',
        topic: 'swimming pools',
        keywords: ['swimming'],
      };
      expect(() =>
        assertAskAnswerContract({ ...(args as object), obligations: [...obligations, dropped] } as never),
      ).toThrow(/not covered by the served answer/);
    },
  );
});
