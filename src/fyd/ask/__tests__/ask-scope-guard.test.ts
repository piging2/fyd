/**
 * PROD-3 + PROD-4 (Mission PROD-3+4, 2026-09-27): Ask FYD honesty.
 *
 * PROD-3 (out-of-scope refusals): a question with no bearing on the
 * business (elections, weather, general knowledge) must return a clean
 * scope refusal ("I can only answer questions about X"), never a business
 * blurb labeled SUPPORTED DIRECTLY.
 *
 * PROD-4 (id stripping): no internal identifier (website-business-*,
 * object ids, truncated id prefixes) may appear in user-facing answer
 * text on ANY path: direct answers, refusals, proposal notes, unknowns,
 * error messages.
 *
 * The guard must not break legitimate business questions: anchored
 * questions ("What are your hours on election day?") still get grounded
 * answers.
 *
 * Run with: npx jest src/fyd/ask/__tests__/ask-scope-guard.test.ts
 */

import { buildAskContext, composeAnswer, stripInternalIds } from "../../../lib/ping/ask-composer";
import { getPingObjectReader } from "../../../lib/ping/ping-object-reader";
import { answerAskFyd } from "../visitor-answer";
import type { PingObject, PingRelationship } from "../../../lib/ping/types";
import type { ObjectGraph, FYDSiteSpec } from "../../sitespec/types";
import type { SiteBundle } from "../../media/site-bundle";

const BIZ_ID = "website-business-6fa5ebd99d72c4cb";
const LOC_ID = "website-business-6fa5ebd99d72c4cb-location";
const SVC_ID = "website-business-6fa5ebd99d72c4cb-service-340c39513223";
const BIZ_NAME = "Happy Place";
const SCOPE_REFUSAL = `I can only answer questions about ${BIZ_NAME}.`;

/**
 * Any raw internal id shape that must never reach user-facing text.
 * Mirrors the canonical INTERNAL_ID_RE (hex-gated id shapes only): the
 * hex hash after the prefix is the whole gate, so legitimate business
 * copy like "website-bus-rentals", "website-business-rentals",
 * "website-business-program", "fyd-media-kit", or "Website-Business-99"
 * is not an id. The trailing guard never flags a prefix of a longer
 * hyphenated word.
 */
const RAW_ID_RE = /\bwebsite-(?:business|service|location)-[0-9a-f]{8,}(?:-[a-z0-9]+)*\b(?![-\w])|\bfyd-media-[0-9a-f]{8,}(?:-[a-z0-9]+)*\b(?![-\w])|\bwebsite-bus\b(?![-\w])/i;

function expectNoRawIds(text: string): void {
  expect(text).not.toMatch(RAW_ID_RE);
}

function businessObject(): PingObject {
  return {
    id: BIZ_ID,
    schema: "ping.social.business@1",
    controllerId: "owner-test",
    visibility: "public",
    title: BIZ_NAME,
    description: "A cheerful neighborhood gathering spot in Grand Junction.",
    fields: {
      hours: "Mon-Fri 9am-5pm",
      phone: "(970) 555-1234",
      services: "Repairs, Fencing",
    },
    provenance: {
      kind: "website-derived",
      ref: "website-ingestion:https://happy-place.test/",
      derivedAt: "2026-09-22T12:00:00Z",
    },
    createdAt: "2026-09-22T00:00:00.000Z",
    updatedAt: "2026-09-22T00:00:00.000Z",
  };
}

function serviceObject(): PingObject {
  return {
    ...businessObject(),
    id: SVC_ID,
    schema: "ping.social.service@1",
    title: "Repairs",
    description: "Small repair jobs around the house.",
    fields: {},
  };
}

function locationObject(): PingObject {
  return {
    ...businessObject(),
    id: LOC_ID,
    schema: "ping.social.location@1",
    title: "Happy Place HQ",
    description: "The main gathering hall.",
    fields: { locality: "Grand Junction" },
  };
}

function locatedAt(): PingRelationship {
  return {
    id: "rel-located-1",
    subject: BIZ_ID,
    predicate: "located_at",
    object: LOC_ID,
    status: "active",
    createdAt: "2026-09-22T00:00:00.000Z",
    evidenceRef: "ping-event:loc-1",
  };
}

function composerCtx() {
  return buildAskContext({
    viewer: { id: null, displayName: null },
    target: businessObject(),
    relatedObjects: [serviceObject(), locationObject()],
    relationships: [locatedAt()],
    plan: null,
    fieldClasses: {},
  });
}

function scopeBundle(): SiteBundle {
  const business = businessObject();
  const graph: ObjectGraph = {
    objects: [business, serviceObject(), locationObject()],
    relationships: [locatedAt()],
  };
  const spec = { ownerObjectId: business.id, pages: [] } as unknown as FYDSiteSpec;
  return {
    siteId: "scope-test",
    businessName: BIZ_NAME,
    graph,
    spec,
    findings: [],
    renderable: true,
    mediaManifest: null,
  };
}

const DEPS = {
  loadBundle: (id: string) => (id === "scope-test" ? scopeBundle() : null),
};

function ask(question: string) {
  const out = answerAskFyd(
    { siteId: "scope-test", question, mode: "visitor" },
    DEPS,
  );
  if (!out.ok) throw new Error(`expected ok answer, got ${out.error.kind}`);
  return out;
}

describe("PROD-3: out-of-scope questions get a scope refusal, not a blurb", () => {
  test.each([
    "Who will win the election?",
    "Who won the election last night?",
    "What is the weather today?",
    "What is the capital of Colorado?",
    "Who won the game last night?",
    "What is the population of France?",
  ])("composer refuses out-of-scope %p", (question) => {
    const ans = composeAnswer(composerCtx(), question);
    expect(ans.partial).toBe(true);
    expect(ans.answer).toBe(SCOPE_REFUSAL);
    // No business blurb: the description must not leak into a refusal.
    expect(ans.answer).not.toContain("cheerful neighborhood");
    expectNoRawIds(ans.answer);
  });

  test("end to end: election question is an UNSUPPORTED refusal", () => {
    const out = ask("Who will win the election?");
    expect(out.refusal).toBe(true);
    expect(out.citations).toHaveLength(0);
    expect(out.answer).toBe(SCOPE_REFUSAL);
    expectNoRawIds(out.answer);
  });

  test("end to end: weather question is a scope refusal", () => {
    const out = ask("What is the weather today?");
    expect(out.refusal).toBe(true);
    expect(out.answer).toBe(SCOPE_REFUSAL);
  });

  test("unanchored who/about no longer dumps the business blurb", () => {
    const ans = composeAnswer(composerCtx(), "Tell me a joke");
    expect(ans.partial).toBe(true);
    expect(ans.answer).not.toContain("cheerful neighborhood");
  });
});

describe("PROD-3: legitimate business questions still get grounded answers", () => {
  test("services question is grounded, not refused", () => {
    const ans = composeAnswer(composerCtx(), "What services do you offer?");
    expect(ans.partial).toBe(false);
    expect(ans.answer).toContain("Repairs");
  });

  test("hours question is grounded, not refused", () => {
    const ans = composeAnswer(composerCtx(), "What are your hours?");
    expect(ans.partial).toBe(false);
    expect(ans.answer).toContain("Mon-Fri 9am-5pm");
  });

  test("anchored out-of-scope word still answers the business facet", () => {
    // "election" is out-of-scope, but "hours" anchors the question to the
    // business: the hours branch must answer, not the scope guard.
    const ans = composeAnswer(composerCtx(), "What are your hours on election day?");
    expect(ans.answer).not.toBe(SCOPE_REFUSAL);
    expect(ans.answer).toContain("Mon-Fri 9am-5pm");
  });

  test("profile question about the business still works", () => {
    const ans = composeAnswer(composerCtx(), "What do you know about this business?");
    expect(ans.partial).toBe(false);
    expect(ans.answer).toContain("cheerful neighborhood");
  });

  test("end to end: services question is answered with citations", () => {
    const out = ask("What services do you offer?");
    expect(out.refusal).toBe(false);
    expect(out.citations.length).toBeGreaterThan(0);
    expect(out.answer).toContain("Repairs");
    expectNoRawIds(out.answer);
  });
});

describe("PROD-3+4-REPAIR-R3: profile branch strictness + trades vocabulary", () => {
  test.each([
    "Who will win the election, fix this?",
    "Tell me about this company's election predictions",
    "What does this service think about the election?",
  ])("profile branch refuses out-of-scope topic, never blurbs: %p", (question) => {
    // The trades guard in the general scope check ("fix", "service") must
    // not let the profile branch answer an out-of-scope subject with a
    // business blurb.
    const ans = composeAnswer(composerCtx(), question);
    expect(ans.partial).toBe(true);
    expect(ans.answer).toBe(SCOPE_REFUSAL);
    expect(ans.answer).not.toContain("cheerful neighborhood");
    expectNoRawIds(ans.answer);
  });

  test("end to end: trades-word election question is an UNSUPPORTED refusal", () => {
    const out = ask("Who will win the election, fix this?");
    expect(out.refusal).toBe(true);
    expect(out.answer).toBe(SCOPE_REFUSAL);
    expect(out.answer).not.toContain("cheerful neighborhood");
    expectNoRawIds(out.answer);
  });

  test("maintenance visit question is answered, not refused", () => {
    // "weather" + "tomorrow" names a forecast topic, but "maintenance" and
    // "visit" are trades words: the general scope check must not refuse.
    const ans = composeAnswer(composerCtx(), "Will tomorrow's weather affect the maintenance visit?");
    expect(ans.answer).not.toBe(SCOPE_REFUSAL);
  });

  test("tune-up question is answered, not refused", () => {
    // "temperature" + "tomorrow" names a forecast topic, but "tune-up" is a
    // trades word: the general scope check must not refuse.
    const ans = composeAnswer(composerCtx(), "What temperature will it be outside during my tune-up tomorrow?");
    expect(ans.answer).not.toBe(SCOPE_REFUSAL);
  });
});

describe("PROD-4: no raw ids in user-facing text on any path", () => {
  test("honest refusal consulted-line carries no raw ids", () => {
    // The relationship evidence label embeds full endpoint ids
    // (evidence-transparency surface); the rendered refusal text must not.
    const out = ask("What is the owner's favorite food?");
    expect(out.refusal).toBe(true);
    expect(out.answer).toContain("I consulted:");
    expectNoRawIds(out.answer);
    // The ids resolve to titles where known.
    expect(out.answer).toContain(BIZ_NAME);
  });

  test("composer consulted-line raw ids are stripped at the visitor layer", () => {
    const raw = composeAnswer(composerCtx(), "What is the owner's favorite food?");
    // Documents the leak vector the strip closes: the composer-level text
    // still names full endpoint ids in the consulted line.
    expect(raw.answer).toMatch(/website-business-6fa5ebd99d72c4cb/);
    const out = ask("What is the owner's favorite food?");
    expectNoRawIds(out.answer);
  });

  test("non-owner proposal refusal names the title, never an id", () => {
    const ans = composeAnswer(composerCtx(), "Propose updating the website to: https://newsite.test");
    expect(ans.partial).toBe(true);
    expect(ans.answer).toContain(`Only the controlling identity of ${BIZ_NAME} can update it.`);
    expectNoRawIds(ans.answer);
  });

  test("owner proposal note carries no raw id", () => {
    const ctx = buildAskContext({
      viewer: { id: "owner-test", displayName: "Owner" },
      target: businessObject(),
      relatedObjects: [serviceObject()],
      relationships: [],
      plan: null,
      fieldClasses: {},
    });
    const ans = composeAnswer(ctx, "Propose updating the website to: https://newsite.test");
    expect(ans.proposal).not.toBeNull();
    expect(ans.proposal!.note).toContain(BIZ_NAME);
    expectNoRawIds(ans.proposal!.note);
  });

  test("unknowns and error messages carry no raw ids", () => {
    const out = ask("What is the owner's favorite food?");
    for (const u of out.unknowns) expectNoRawIds(u);
    const bad = answerAskFyd({ siteId: "nope", question: "What services?", mode: "visitor" }, DEPS);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expectNoRawIds(bad.error.message);
  });

  test("every answer text in this file is id-free (sweep)", () => {
    const questions = [
      "Who will win the election?",
      "What is the weather today?",
      "What services do you offer?",
      "What are your hours?",
      "Where are you located?",
      "What is the owner's favorite food?",
      "Tell me a joke",
      "How do you know?",
    ];
    for (const q of questions) {
      const out = ask(q);
      expectNoRawIds(out.answer);
      for (const c of out.citations) expectNoRawIds(c.label);
      for (const u of out.unknowns) expectNoRawIds(u);
      if (out.proposal) expectNoRawIds(out.proposal.note);
    }
  });
});

describe("PROD-3+4-REPAIR: falsified breaks stay fixed", () => {
  // BREAK 1: the scope lexicon no longer over-fires on ambiguous words.
  test.each([
    "Do you have this part in stock?",
    "What temperature should my water heater be set to?",
    "Any news on my repair?",
    "Do you repair weather damage?",
    "How tall is your building?",
    "lottery winner testimonial",
  ])("not a scope refusal: %p", (question) => {
    expect(composeAnswer(composerCtx(), question).answer).not.toBe(SCOPE_REFUSAL);
  });

  // Genuine out-of-scope uses of the same words still refuse.
  test.each([
    "How is the stock market doing?",
    "What is the temperature outside today?",
    "Any news headlines today?",
    "What will the weather be tomorrow?",
    "How tall is the Eiffel Tower?",
  ])("still a scope refusal: %p", (question) => {
    expect(composeAnswer(composerCtx(), question).answer).toBe(SCOPE_REFUSAL);
  });

  // Election-day business questions keep working.
  test.each([
    "Do you close for elections?",
    "What are your hours on election day?",
  ])("election-day business question still answers: %p", (question) => {
    expect(composeAnswer(composerCtx(), question).answer).not.toBe(SCOPE_REFUSAL);
  });

  // BREAK 4: bare "this" is not business anchoring.
  test("this fall does not anchor to the business", () => {
    const ans = composeAnswer(composerCtx(), "Tell me about the big race this fall");
    expect(ans.partial).toBe(true);
    expect(ans.answer).not.toContain("cheerful neighborhood");
  });

  test.each([
    "Tell me about this business",
    "Tell me about this shop",
  ])("explicit this-phrases still anchor: %p", (question) => {
    expect(composeAnswer(composerCtx(), question).answer).not.toBe(SCOPE_REFUSAL);
  });

  // BREAK 2: the id strip never eats legitimate hyphenated copy.
  test("stripInternalIds keeps website-bus-rentals and Website-Business-99 intact", () => {
    const labels = new Map([[BIZ_ID, BIZ_NAME]]);
    const copy =
      "Ask about our website-bus-rentals for group tours and our Website-Business-99 loyalty plan.";
    expect(stripInternalIds(copy, labels)).toBe(copy);
  });

  // BREAK 2 (R2): the hex gate is the whole id test. Plain English words
  // after the prefix are never ids, no matter the shape.
  test.each([
    "website-business-rentals",
    "website-business-program",
    "fyd-media-kit",
    "Website-Business-99",
  ])("stripInternalIds keeps legitimate copy intact: %p", (copy) => {
    const labels = new Map([[BIZ_ID, BIZ_NAME]]);
    expect(stripInternalIds(`Ask about ${copy} today.`, labels)).toBe(
      `Ask about ${copy} today.`,
    );
  });

  test("stripInternalIds still strips real hex ids and their suffixed forms", () => {
    const labels = new Map([[BIZ_ID, BIZ_NAME]]);
    expect(stripInternalIds(`See ${BIZ_ID} today.`, labels)).toBe(
      "See Happy Place today.",
    );
    expect(stripInternalIds(`rel ${LOC_ID} here`, new Map())).toBe(
      "rel the site record here",
    );
    expect(stripInternalIds(`rel ${SVC_ID} here`, labels)).toBe(
      "rel the site record here",
    );
    expect(
      stripInternalIds("id website-service-51de038c1d here", new Map()),
    ).toBe("id the site record here");
    expect(
      stripInternalIds(
        `id website-business-6fa5ebd99d72c4cb-post-9f8e7d6c5b4a here`,
        new Map(),
      ),
    ).toBe("id the site record here");
  });

  test("stripInternalIds still strips real ids and the standalone prefix", () => {
    const labels = new Map([[BIZ_ID, BIZ_NAME]]);
    expect(stripInternalIds(`See ${BIZ_ID} today.`, labels)).toBe("See Happy Place today.");
    expect(stripInternalIds("the website-bus prefix alone", labels)).toBe(
      "the the site record prefix alone",
    );
    expect(stripInternalIds(`rel ${LOC_ID} here`, new Map())).toBe(
      "rel the site record here",
    );
  });

  test("answerAskFyd keeps website-bus-rentals copy intact end to end", () => {
    const biz = {
      ...businessObject(),
      description:
        "A cheerful neighborhood gathering spot in Grand Junction. Ask about our website-bus-rentals for group tours and our Website-Business-99 loyalty plan.",
    };
    const graph: ObjectGraph = {
      objects: [biz, serviceObject(), locationObject()],
      relationships: [locatedAt()],
    };
    const spec = { ownerObjectId: biz.id, pages: [] } as unknown as FYDSiteSpec;
    const deps = {
      loadBundle: (id: string) =>
        id === "scope-test" ? { ...scopeBundle(), graph, spec } : null,
    };
    const out = answerAskFyd(
      { siteId: "scope-test", question: "Tell me about Happy Place", mode: "visitor" },
      deps,
    );
    if (!out.ok) throw new Error(`expected ok answer, got ${out.error.kind}`);
    expect(out.answer).toContain("website-bus-rentals");
    expect(out.answer).toContain("Website-Business-99");
    expect(out.answer).not.toContain("the site record-rentals");
  });

  // BREAK 3: the PingObjectReader ask path strips ids like the visitor path.
  // The relationship evidence labels carry raw subject/object ids, so this
  // is non-vacuous: the strip must fire on them.
  test("reader ask() returns no raw ids on any user-facing surface", async () => {
    const reader = getPingObjectReader() as any;
    const biz = businessObject();
    const objects = [biz, serviceObject(), locationObject()];
    const spies = [
      jest.spyOn(reader, "getObject").mockResolvedValue(biz),
      jest.spyOn(reader, "getRelationships").mockResolvedValue([locatedAt()]),
      jest.spyOn(reader, "planActions").mockResolvedValue(null),
      jest.spyOn(reader, "listIdentities").mockResolvedValue([]),
      jest.spyOn(reader, "allObjects").mockResolvedValue({ objects, gatewayAvailable: true }),
    ];
    try {
      const out = await reader.ask("What are your hours?", null, biz.id);
      expect(out.evidenceRefs.length).toBeGreaterThan(0);
      expectNoRawIds(out.answer);
      for (const e of out.evidenceRefs) expectNoRawIds(e.label);
      for (const u of out.unknowns) expectNoRawIds(u);
      if (out.proposal) expectNoRawIds(out.proposal.note);
    } finally {
      for (const s of spies) s.mockRestore();
    }
  });

  // BREAK 3: the reply proposal's rendered target never shows the raw id.
  test("reader ask() reply-draft proposal labels the reply target for display", async () => {
    const reader = getPingObjectReader() as any;
    const post = {
      ...businessObject(),
      id: "website-business-6fa5ebd99d72c4cb-post-9f8e7d6c5b4a",
      schema: "ping.social.post@1",
      title: "Spring Fair Post",
      controllerId: "owner-test",
    };
    const spies = [
      jest.spyOn(reader, "getObject").mockResolvedValue(post),
      jest.spyOn(reader, "getRelationships").mockResolvedValue([]),
      jest.spyOn(reader, "planActions").mockResolvedValue(null),
      jest.spyOn(reader, "listIdentities").mockResolvedValue([
        {
          id: "owner-test",
          displayName: "Owner",
          handle: "owner",
          verified: false,
          facebookConnected: false,
          followerCount: 0,
          followingCount: 0,
        },
      ]),
      jest.spyOn(reader, "allObjects").mockResolvedValue({ objects: [post], gatewayAvailable: true }),
    ];
    try {
      const out = await reader.ask(
        "Draft a reply to this post: Thanks for the update.",
        "owner-test",
        post.id,
      );
      expect(out.proposal).not.toBeNull();
      const proposal = out.proposal!;
      // The executable binding keeps the raw id (governed write + reply edge).
      expect(proposal.changes.replyTo).toBe(post.id);
      // The user-facing label renders the display title, never the id.
      expect(proposal.displayChangeLabels?.replyTo).toBe("Spring Fair Post");
      expectNoRawIds(proposal.displayChangeLabels?.replyTo ?? "");
      expectNoRawIds(proposal.note);
    } finally {
      for (const s of spies) s.mockRestore();
    }
  });
});

describe("PROD-3+4-REPAIR-R2: falsifier round-2 breaks stay fixed", () => {
  // BREAK 1: the trades-vocabulary guard. A question naming trades/service
  // work is never out-of-scope for the ambiguous topics (temperature /
  // weather / stock / news), regardless of context words: "outside",
  // "today", "tomorrow" are ordinary trades words too.
  test.each([
    "The outside unit shows a temperature fault, can you come look at it today?",
    "The temperature gauge on the unit is broken, can you fix it today?",
    "Is this temperature normal for the unit outside?",
    "Can you install a new unit before the weather turns tomorrow?",
  ])("trades question is not a scope refusal: %p", (question) => {
    expect(composeAnswer(composerCtx(), question).answer).not.toBe(SCOPE_REFUSAL);
  });

  test("business signal wins over a strong out-of-scope signal", () => {
    // The refusal fires only on a strong out-of-scope signal with ZERO
    // business/trades signal. With trades words present the question falls
    // through to the honest branch logic instead of the scope refusal.
    const ans = composeAnswer(
      composerCtx(),
      "Who will win the election? My unit is broken and I need a repair.",
    );
    expect(ans.answer).not.toBe(SCOPE_REFUSAL);
  });

  test.each([
    "What is the temperature outside today?",
    "What will the weather be tomorrow?",
    "How is the stock market doing?",
    "Who will win the election?",
  ])("genuine out-of-scope (zero trades signal) still refuses: %p", (question) => {
    expect(composeAnswer(composerCtx(), question).answer).toBe(SCOPE_REFUSAL);
  });

  test("end to end: trades temperature question is not a scope refusal", () => {
    const out = ask(
      "The outside unit shows a temperature fault, can you come look at it today?",
    );
    expect(out.answer).not.toBe(SCOPE_REFUSAL);
    expectNoRawIds(out.answer);
  });

  // BREAK 3 (R2): claim labels never carry raw ids, even for a blank-title
  // target. The composer degrades to a neutral noun via displayTarget; the
  // visitor path and the reader path strip claim strings at the boundary.
  function blankTitleCtx() {
    return buildAskContext({
      viewer: { id: null, displayName: null },
      target: { ...businessObject(), title: "" },
      relatedObjects: [serviceObject(), locationObject()],
      relationships: [locatedAt()],
      plan: null,
      fieldClasses: {},
    });
  }

  test("composer claim labels never carry the raw id for a blank-title target", () => {
    const ans = composeAnswer(blankTitleCtx(), "What do you know about this business?");
    expect(ans.claimClassifications.length).toBeGreaterThan(0);
    for (const c of ans.claimClassifications) {
      expect(c.claim).not.toContain(BIZ_ID);
      expectNoRawIds(c.claim);
    }
    expectNoRawIds(ans.answer);
  });

  test("visitor path: claimClassifications carry no raw ids for a blank-title target", () => {
    const noTitle = { ...businessObject(), title: "" };
    const graph: ObjectGraph = {
      objects: [noTitle, serviceObject(), locationObject()],
      relationships: [locatedAt()],
    };
    const spec = { ownerObjectId: noTitle.id, pages: [] } as unknown as FYDSiteSpec;
    const deps = {
      loadBundle: (id: string) =>
        id === "scope-test" ? { ...scopeBundle(), graph, spec } : null,
    };
    const out = answerAskFyd(
      { siteId: "scope-test", question: "What do you know about this business?", mode: "visitor" },
      deps,
    );
    if (!out.ok) throw new Error(`expected ok answer, got ${out.error.kind}`);
    expect(out.claimClassifications.length).toBeGreaterThan(0);
    for (const c of out.claimClassifications) expectNoRawIds(c.claim);
    expectNoRawIds(out.answer);
  });

  test("reader ask(): claimClassifications carry no raw ids for a blank-title target", async () => {
    const reader = getPingObjectReader() as any;
    const noTitle = { ...businessObject(), title: "" };
    const objects = [noTitle, serviceObject(), locationObject()];
    const spies = [
      jest.spyOn(reader, "getObject").mockResolvedValue(noTitle),
      jest.spyOn(reader, "getRelationships").mockResolvedValue([locatedAt()]),
      jest.spyOn(reader, "planActions").mockResolvedValue(null),
      jest.spyOn(reader, "listIdentities").mockResolvedValue([]),
      jest.spyOn(reader, "allObjects").mockResolvedValue({ objects, gatewayAvailable: true }),
    ];
    try {
      const out = await reader.ask(
        "What do you know about this business?",
        null,
        noTitle.id,
      );
      expect(out.claimClassifications.length).toBeGreaterThan(0);
      for (const c of out.claimClassifications) expectNoRawIds(c.claim);
      expectNoRawIds(out.answer);
    } finally {
      for (const s of spies) s.mockRestore();
    }
  });

  // BREAK 4 (R2): the structural "this" rule. "this" + any non-business
  // noun never anchors to the business; no time-noun enumeration to evade.
  test.each([
    "Tell me about the big race this season",
    "Tell me about the big race this quarter",
    "Tell me about the big race this semester",
    "Tell me about the big race this holiday",
    "Tell me about the big race this decade",
  ])("this + non-business noun never anchors: %p", (question) => {
    const ans = composeAnswer(composerCtx(), question);
    expect(ans.partial).toBe(true);
    expect(ans.answer).not.toContain("cheerful neighborhood");
  });

  test.each([
    "What is this?",
    "Tell me about this business",
    "Tell me about this service",
    "Tell me about this shop",
  ])("this + business noun (or bare this) still anchors: %p", (question) => {
    const ans = composeAnswer(composerCtx(), question);
    expect(ans.partial).toBe(false);
    expect(ans.answer).toContain("cheerful neighborhood");
  });
});
