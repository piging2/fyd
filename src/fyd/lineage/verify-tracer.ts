/**
 * LANE-LIN tracer self-test. Asserts both proof chains resolve end to end,
 * and that a bogus claim produces the correct MISSING verdict at the
 * evidence link (not a fake pass).
 *
 * Run: npx tsx --import ./src/fyd/lineage/register-css.mjs \
 *   src/fyd/lineage/verify-tracer.ts
 */
import { strict as assert } from "node:assert";
import { traceClaim } from "./tracer";

const COPPER_CLAIM =
  "Are you working on new construction for residential homes or commercial buildings?";
const HAPPY_CLAIM =
  "A fence should stay straight, the gate should close without dragging, and it should still look good after a few Oregon winters.";

function link(chain: ReturnType<typeof traceClaim>, stage: string) {
  const l = chain.links.find((x) => x.stage === stage);
  assert.ok(l, `link ${stage} present`);
  return l!;
}

function assertResolvedChain(
  siteId: string,
  claim: string,
  question: string,
  expectations: Record<string, string>,
) {
  const chain = traceClaim(siteId, claim, question);
  assert.equal(chain.siteId, siteId);
  assert.equal(chain.claim, claim);
  for (const l of chain.links) {
    assert.equal(
      l.status,
      "resolved",
      `site ${siteId}: link ${l.stage} should be resolved, got missing (${l.needed})`,
    );
    assert.ok(l.pointer, `site ${siteId}: link ${l.stage} has a pointer`);
    assert.ok(l.excerpt, `site ${siteId}: link ${l.stage} has an excerpt`);
  }
  assert.equal(chain.complete, true, `site ${siteId}: chain complete`);

  // Source bytes: pinned digests must verify against the machine-generated
  // fixture header (no silent drift).
  const s1 = link(chain, "source_bytes");
  assert.equal(s1.detail["concatDigestMatches"], true);

  // Observation: acquisition digest must equal the raw file sha256, and the
  // byte range in sourceLocation must contain the claim in one raw file.
  const s2 = link(chain, "observation");
  assert.equal(s2.detail["acquisitionsMatchRawBytes"], true);
  assert.ok(
    s2.detail["claimByteLocatableInRawFile"],
    `site ${siteId}: claim must be byte-locatable in the pinned raw file`,
  );
  assert.ok(
    (s2.detail["claimByteOffsets"] as { offset: number }[]).every((c) => c.offset >= 0),
    `site ${siteId}: claim byte offsets are exact`,
  );

  // Evidence: object id / evidence-ref expectations.
  const s3 = link(chain, "evidence");
  assert.equal(s3.detail["objectId"], expectations.objectId);
  assert.equal(s3.detail["matchedField"], expectations.field);
  const joins = s3.detail["entityIdToEvidenceRefJoin"] as { relationshipId: string }[];
  assert.ok(
    joins.length > 0 && joins[0].relationshipId === expectations.relationshipId,
    `site ${siteId}: observation entityId must join to relationship evidenceRef`,
  );

  // Object field: projection digest verified, journal delta reported.
  const s4 = link(chain, "object_field");
  assert.equal((s4.detail["verification"] as Record<string, unknown>)["graphDigestMatches"], true);

  // Sitespec binding: real section ids.
  const s5 = link(chain, "sitespec_binding");
  const bindings = s5.detail["bindings"] as { sectionId: string }[];
  assert.ok(
    bindings.some((b) => expectations.sections.includes(b.sectionId)),
    `site ${siteId}: expected one of ${expectations.sections.join(",")}, got ${bindings.map((b) => b.sectionId).join(",")}`,
  );

  // Rendered claim: the real SSR markup contains the exact claim.
  const s6 = link(chain, "rendered_claim");
  const renders = s6.detail["renders"] as { claimPresent: boolean; claimExcerpt: string | null }[];
  assert.ok(renders.some((r) => r.claimPresent), `site ${siteId}: claim in SSR markup`);

  // Ask FYD: answer states the claim, carries claim classifications, cites
  // the object. Deterministic composer, no LLM.
  const s7 = link(chain, "ask_fyd_answer");
  const answer = String(s7.detail["answer"]);
  assert.ok(answer.includes(claim), `site ${siteId}: answer states the claim`);
  const cls = s7.detail["claimClassifications"] as unknown[];
  assert.ok(cls.length > 0, `site ${siteId}: answer carries claim classifications`);
  const refs = s7.detail["evidenceRefs"] as { id: string }[];
  assert.ok(
    refs.some((e) => e.id === expectations.objectId),
    `site ${siteId}: answer cites object ${expectations.objectId}`,
  );
  assert.equal(s7.detail["partial"], false);
  assert.equal(s7.detail["proposal"], null);

  console.log(`PASS resolved chain: ${siteId}`);
  return chain;
}

function assertMissingChain() {
  // A claim that exists nowhere: the tracer must report the exact missing
  // link (evidence) and the data needed, not fake a pass.
  const chain = traceClaim(
    "coppersmith-plumbing",
    "ZZZ-no-such-fact-anywhere-9f8e7d6c5b",
    "Tell me about this service.",
  );
  assert.equal(chain.complete, false);
  const statuses = Object.fromEntries(chain.links.map((l) => [l.stage, l.status]));
  assert.equal(statuses["source_bytes"], "resolved", "source bytes are site-level, still resolved");
  assert.equal(statuses["observation"], "missing");
  assert.equal(statuses["evidence"], "missing");
  const ev = link(chain, "evidence");
  assert.ok(
    String(ev.needed ?? "").length > 40,
    "evidence link must name the exact missing data",
  );
  assert.ok(
    /exact rendered string/i.test(String(ev.needed)),
    `evidence needed names required data: ${ev.needed}`,
  );
  console.log("PASS missing chain (correct missing-link verdict)");
}

assertResolvedChain(
  "coppersmith-plumbing",
  COPPER_CLAIM,
  "Tell me about this service.",
  {
    objectId: "website-business-2f1327c09d622175-service-139408827c27",
    field: "description",
    relationshipId: "rel-f450fdb901a6baa3",
    sections: ["home:Services:2", "services:Services:0"],
  },
);

assertResolvedChain(
  "happy-place",
  HAPPY_CLAIM,
  "What does Happy Place say about fencing?",
  {
    objectId: "website-business-6fa5ebd99d72c4cb-service-340c39513223",
    field: "description",
    relationshipId: "rel-c0fe44edf1dcfbfd",
    sections: ["home:Services:2", "services:Services:0"],
  },
);

assertMissingChain();

console.log("ALL TRACER TESTS PASSED");
