/**
 * FYD-010 CANARY BATTERY: zero private leakage into the exact Ask FYD
 * model input.
 *
 * The invariant: private canary strings are ABSENT from the serialized
 * AskFydContext (the exact model input) for EVERY viewer class: VISITOR,
 * UNAUTHENTICATED, UNKNOWN, DEMO (unverified), and verified OWNER.
 *
 * The model is never an owner: private values are excluded from the model
 * context even for a verified owner. Owners read private data through
 * owner surfaces, never through the model.
 *
 * Canary placement:
 * - _internal_notes: never on the visitor-safe allowlist -> absent always.
 * - home_address: never on the allowlist (only the public coarse
 *   `address` field is) -> absent always.
 * - phone WITH an owner HIDE decision: decisions are honored at the model
 *   boundary -> absent always.
 * - phone WITHOUT a hide decision: public contact info stays answerable
 *   (contact discoverability is kept, not broken, by the allowlist).
 *
 * Run: npx jest --config src/fyd/ask/jest.config.cjs context-projection-canary
 */

import { buildAskFydContext } from "../context-builder";
import {
  classifyAskViewer,
  projectAskContextForViewer,
} from "../context-projection";
import {
  answerAskFyd,
  type AnswerAskFydDeps,
  type AskFydOutcome,
} from "../visitor-answer";
import type { AskViewerIdentity } from "../types";
import type { FieldVisibilityDecision } from "../../sitespec/field-visibility";
import type { ObjectGraph, FYDSiteSpec } from "../../sitespec/types";
import type { SiteBundle } from "../../media/site-bundle";
import type {
  PingObject,
  PingRelationship,
} from "../../../lib/ping/types";

const SITE_ID = "canary-site";
const TS = "2026-09-26T00:00:00.000Z";

/** Private values that must never reach the model input. */
const CANARY_NOTES = "CANARY-NOTES-9X7Q2";
const CANARY_HOME_ADDRESS = "CANARY-HOME-ADDR-9X7Q2";
const CANARY_PHONE = "CANARY-PHONE-9X7Q2";
const CANARY_CUSTOM = "CANARY-CUSTOM-9X7Q2";
const ALL_CANARIES = [
  CANARY_NOTES,
  CANARY_HOME_ADDRESS,
  CANARY_PHONE,
  CANARY_CUSTOM,
];

/** Public contact info: legitimately answerable, kept by the allowlist. */
const PUBLIC_PHONE = "(970) 555-0142";

function makeObject(overrides: Partial<PingObject>): PingObject {
  return {
    id: "obj",
    schema: "ping.social.business@1",
    controllerId: "ctrl-canary",
    visibility: "public",
    title: "Canary Plumbing",
    description: "A test business.",
    fields: {},
    createdAt: TS,
    updatedAt: TS,
    provenance: {
      kind: "canonical-journal",
      ref: "evt-canary-1",
      derivedAt: TS,
    },
    ...overrides,
  };
}

function makeRel(
  id: string,
  subject: string,
  object: string,
  predicate = "located_at",
): PingRelationship {
  return {
    id,
    subject,
    predicate,
    object,
    status: "active",
    createdAt: TS,
    evidenceRef: "evt-canary-1",
  };
}

function makeSpec(ownerObjectId: string): FYDSiteSpec {
  return {
    kind: "fyd.sitespec@1",
    ownerObjectId,
    version: 1,
    generator: {
      name: "fyd-site-generator",
      version: "canary",
      generatedAt: TS,
    },
    presentation: {
      intent: "book",
      voice: "friendly",
      tone: "warm",
      copy: {
        heading: "Canary Plumbing",
        subheading: "Test services",
        ctaLabel: "Call",
      },
    },
    themeTokens: {
      accent: "#000",
      accentForeground: "#fff",
      surface: "#fff",
      ink: "#000",
      radius: "md",
      fontDisplay: "sans",
      fontBody: "sans",
    },
    navigation: [],
    pages: [],
    provenance: {
      source: "website-ingestion",
      claimKind: "website_statement",
      note: "canary fixture",
    },
  };
}

function makeBundle(graph: ObjectGraph): SiteBundle {
  return {
    siteId: SITE_ID,
    businessName: "Canary Plumbing",
    graph,
    spec: makeSpec("biz-1"),
    findings: [],
    renderable: true,
    mediaManifest: null,
  };
}

/**
 * The business object every canary test uses: public, carrying private
 * canaries in never-safe fields plus a phone canary the owner hid.
 */
function canaryGraph(): ObjectGraph {
  return {
    objects: [
      makeObject({
        id: "biz-1",
        title: "Canary Plumbing",
        fields: {
          phone: CANARY_PHONE,
          website: "https://canary.example.com",
          _internal_notes: CANARY_NOTES,
          home_address: CANARY_HOME_ADDRESS,
          custom_secret_xyz: CANARY_CUSTOM,
        },
      }),
      makeObject({
        id: "biz-2",
        title: "Public Phone Plumbing",
        fields: { phone: PUBLIC_PHONE },
      }),
    ],
    relationships: [makeRel("rel-1", "biz-1", "biz-2", "related_to")],
  };
}

function hidePhoneDecision(): FieldVisibilityDecision {
  return {
    objectId: "biz-1",
    field: "phone",
    policy: "hide",
    decidedBy: "owner",
    decidedAt: TS,
    source: "owner_override",
    version: 1,
  };
}

/** The exact model input, serialized: canaries must be absent from this. */
function modelInputJson(
  viewer: AskViewerIdentity,
  decisions: FieldVisibilityDecision[] = [hidePhoneDecision()],
): string {
  const graph = canaryGraph();
  const ctx = buildAskFydContext({
    viewer,
    target: graph.objects[0] ?? null,
    relatedObjects: graph.objects.slice(1),
    relationships: graph.relationships,
    plan: null,
    grants: [],
    siteSpec: null,
    question: "What is the phone number?",
    fieldVisibilityDecisions: decisions,
  });
  return JSON.stringify(ctx);
}

function expectNoCanaries(json: string): void {
  for (const canary of ALL_CANARIES) {
    expect(json).not.toContain(canary);
  }
}

function ask(
  bundle: SiteBundle,
  question: string,
  decisions: FieldVisibilityDecision[] = [],
): AskFydOutcome {
  const deps: AnswerAskFydDeps = {
    loadBundle: (id) => (id === SITE_ID ? bundle : null),
  };
  return answerAskFyd(
    {
      siteId: SITE_ID,
      question,
      mode: "visitor",
      fieldVisibilityDecisions: decisions,
    },
    deps,
  );
}

function assertOk(out: AskFydOutcome): asserts out is Extract<AskFydOutcome, { ok: true }> {
  expect(out.ok).toBe(true);
}

// ---------------------------------------------------------------------------
// Viewer classification: only verified identities are owners.
// ---------------------------------------------------------------------------

describe("classifyAskViewer: only verified identities are owners", () => {
  test("null / undefined / anonymous viewers are visitors", () => {
    expect(classifyAskViewer(null)).toBe("visitor");
    expect(classifyAskViewer(undefined)).toBe("visitor");
    expect(classifyAskViewer({ id: null, displayName: null })).toBe("visitor");
  });

  test("an id without verified:true is a visitor (fail closed)", () => {
    expect(classifyAskViewer({ id: "owner-1", displayName: "Owner" })).toBe(
      "visitor",
    );
    expect(
      classifyAskViewer({ id: "owner-1", displayName: "Owner", verified: false }),
    ).toBe("visitor");
  });

  test("verified:true with an empty or null id is still a visitor", () => {
    expect(
      classifyAskViewer({ id: "", displayName: "Owner", verified: true }),
    ).toBe("visitor");
    expect(
      classifyAskViewer({ id: null, displayName: "Owner", verified: true }),
    ).toBe("visitor");
  });

  test("verified:true with a non-empty id is the owner class", () => {
    expect(
      classifyAskViewer({ id: "owner-1", displayName: "Owner", verified: true }),
    ).toBe("owner");
  });

  test("a demo viewer is never the owner class (demoOwnerContext retired)", () => {
    expect(
      classifyAskViewer({
        id: "demo-owner",
        displayName: "Demo Owner",
        verified: false,
      }),
    ).toBe("visitor");
  });
});

// ---------------------------------------------------------------------------
// The exact model input: zero canaries for every viewer class.
// ---------------------------------------------------------------------------

describe("FYD-010: zero canary leakage into the exact model input", () => {
  test("VISITOR (anonymous): no canary in the model input", () => {
    expectNoCanaries(modelInputJson({ id: null, displayName: null }));
  });

  test("UNAUTHENTICATED (no verified flag at all): no canary", () => {
    expectNoCanaries(modelInputJson({ id: null, displayName: null }));
  });

  test("UNKNOWN VIEWER (unverified id): no canary", () => {
    expectNoCanaries(
      modelInputJson({ id: "stranger-9", displayName: "Stranger" }),
    );
  });

  test("DEMO viewer (demoOwnerContext must grant nothing): no canary", () => {
    const json = modelInputJson({
      id: "demo-owner",
      displayName: "Demo Owner",
      verified: false,
    });
    expectNoCanaries(json);
    const graph = canaryGraph();
    const ctx = buildAskFydContext({
      viewer: { id: "demo-owner", displayName: "Demo Owner", verified: false },
      target: graph.objects[0] ?? null,
      relatedObjects: [],
      relationships: [],
      plan: null,
      grants: [],
      siteSpec: null,
      question: "q",
      fieldVisibilityDecisions: [hidePhoneDecision()],
    });
    expect(ctx.viewerClass).toBe("visitor");
  });

  test("verified OWNER: classified owner, still zero canaries in model input", () => {
    const graph = canaryGraph();
    const ctx = buildAskFydContext({
      viewer: { id: "owner-1", displayName: "Owner", verified: true },
      target: graph.objects[0] ?? null,
      relatedObjects: graph.objects.slice(1),
      relationships: graph.relationships,
      plan: null,
      grants: [],
      siteSpec: null,
      question: "What is the phone number?",
      fieldVisibilityDecisions: [hidePhoneDecision()],
    });
    expect(ctx.viewerClass).toBe("owner");
    expectNoCanaries(JSON.stringify(ctx));
  });

  test("owner HIDE on phone is honored at the model boundary (no decision gap)", () => {
    const json = modelInputJson(
      { id: null, displayName: null },
      [hidePhoneDecision()],
    );
    expect(json).not.toContain(CANARY_PHONE);
  });

  test("public phone without a HIDE stays answerable (contact discoverability kept)", () => {
    const graph = canaryGraph();
    const ctx = buildAskFydContext({
      viewer: { id: null, displayName: null },
      target: graph.objects[1] ?? null,
      relatedObjects: [],
      relationships: [],
      plan: null,
      grants: [],
      siteSpec: null,
      question: "What is the phone number?",
      fieldVisibilityDecisions: [],
    });
    expect(JSON.stringify(ctx)).toContain(PUBLIC_PHONE);
  });

  test("projection drops unknown field names and never mutates the input", () => {
    const graph = canaryGraph();
    const before = JSON.stringify(graph);
    const { graph: projected } = projectAskContextForViewer(
      graph,
      { id: null, displayName: null },
      [hidePhoneDecision()],
    );
    expect(JSON.stringify(graph)).toBe(before);
    const biz = projected.objects.find((o) => o.id === "biz-1");
    expect(biz).toBeDefined();
    expect(biz?.fields["_internal_notes"]).toBeUndefined();
    expect(biz?.fields["home_address"]).toBeUndefined();
    expect(biz?.fields["custom_secret_xyz"]).toBeUndefined();
    expect(biz?.fields["phone"]).toBeUndefined();
    expect(biz?.fields["website"]).toBe("https://canary.example.com");
  });
});

// ---------------------------------------------------------------------------
// The real answer path: no canary in answer text or citations.
// ---------------------------------------------------------------------------

describe("FYD-010: the answer path never surfaces canaries", () => {
  test("visitor question: no canary in answer text or citations", () => {
    const bundle = makeBundle(canaryGraph());
    const out = ask(
      bundle,
      "What is the phone number and where is the business located?",
      [hidePhoneDecision()],
    );
    assertOk(out);
    const haystack = JSON.stringify({
      answer: out.answer,
      citations: out.citations,
    });
    expectNoCanaries(haystack);
  });

  test("STEP-04 refusal battery stays green: ungrounded claims are refused", () => {
    // The no-evidence refusal path must survive the projection change: a
    // question no branch can ground refuses with the locked phrasing and
    // zero citations, and the refusal carries no canary either.
    const out = ask(makeBundle(canaryGraph()), "What is the meaning of life?");
    assertOk(out);
    expect(out.answer).toContain("I do not have evidence for that");
    expect(out.citations).toEqual([]);
    expectNoCanaries(JSON.stringify(out));
  });

  test("holiday-hours question: no canary whatever the answer shape", () => {
    // "holiday hours Thanksgiving 2027": the current composer answers
    // hours-word questions with a grounded on-record statement ("No hours
    // are on record") rather than the no-evidence refusal; that composer
    // behavior predates this lane and is unchanged by it. What this lane
    // guarantees on that path is zero canary leakage.
    const out = ask(makeBundle(canaryGraph()), "holiday hours Thanksgiving 2027", [
      hidePhoneDecision(),
    ]);
    assertOk(out);
    expectNoCanaries(JSON.stringify({ answer: out.answer, citations: out.citations }));
  });
});
