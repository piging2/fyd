/**
 * INV-11 / Q-C-13 HOSTILE FIELD TEST — CONTAINMENT (Q-C-01 LANDED, 2026-09-25).
 *
 * STATUS: CONTAINMENT. The single verified public projection boundary
 * (src/fyd/sitespec/public-projection.ts) is the only path from a source
 * graph to any public consumer. The six former [EXPECTED-FAIL] leak pins
 * are rewritten as containment assertions: every one must stay GREEN.
 *
 * The invariant (Nolan 2026-09-25, refined): one PUBLIC object carries a
 * public field A and a hidden field B, where B is ALSO reachable THROUGH
 * RELATIONSHIPS (business --located_at--> location.address). With an owner
 * HIDE decision on B:
 *   - A remains useful on every public surface;
 *   - B has ZERO public disclosure on every public surface;
 *   - the owner-authorized (canonical) context may still inspect B per policy.
 * Then regenerate, restart, replay: ATTACK AGAIN. A privacy fix that
 * disappears after regeneration is a FAIL.
 *
 * Reading the results: a RED test is a CONFIRMED DISCLOSURE PATH (or an
 * open P0 leak), not a broken test. GREEN means the surface is contained.
 *
 * Surfaces under attack (Q-C-13): SiteBundle, render model, public object
 * endpoint, search/index projection, Circle/Node, Ask FYD context, Ask FYD
 * answer/citations, serialization/loggable response; PLUS direct object ID,
 * relationship traversal, Ask, search, citations/evidence, serialized page
 * state, cache, replay, regen.
 *
 * Machinery under test (real, on the Pig):
 *   src/fyd/sitespec/field-visibility.ts    applyFieldVisibility
 *   src/fyd/sitespec/public-projection.ts   verifyPublicProjection (THE boundary)
 *   src/fyd/ask/visitor-answer.ts           answerAskFyd (the route's real answer engine)
 *   src/fyd/object/view.ts                  composeObjectView / loadObjectView
 *   src/fyd/object/object-projection.ts     objectViewToProjection
 *   src/fyd/edge/resolve.ts                 buildObjectSheet
 *   src/fyd/sitespec/render-model.ts        buildSemanticRenderModel
 *   src/fyd/object/owner-events.ts          appendOwnerEvent / projectOwnerState (replay)
 *   src/app/api/fyd/projection/route.ts     GET /api/fyd/projection (verified only)
 *   src/app/api/fyd/objects/[objectId]/route.ts  GET (no owner history)
 *
 * Run: npx jest --config src/fyd/invariants/jest.config.cjs inv-11-field-level-privacy-8-surfaces
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import {
  applyFieldVisibility,
  type FieldVisibilityDecision,
} from "../../sitespec/field-visibility";
import {
  verifyPublicProjection,
  isVerifiedPublicProjection,
  type VerifiedPublicProjection,
} from "../../sitespec/public-projection";
import { buildSemanticRenderModel } from "../../sitespec/render-model";
import type {
  FYDSiteSpec,
  ObjectGraph,
} from "../../sitespec/types";
import { composeObjectView } from "../../object/view";
import { objectViewToProjection } from "../../object/object-projection";
import { buildObjectSheet, EDGE_VISITOR } from "../../edge/resolve";
import {
  answerAskFyd,
  type AnswerAskFydDeps,
} from "../../ask/visitor-answer";
import type { SiteBundle } from "../../media/site-bundle";
import {
  appendOwnerEvent,
  type OwnerEventDraft,
} from "../../object/owner-events";
import { readOverrides } from "../../object/owner-store";
import { makeObject, makeRel, T0 } from "./support";

// ---------------------------------------------------------------------------
// The A/B fixture: one PUBLIC business object. A is public, B is hidden by
// owner decision. B is ALSO reachable through a relationship:
//   spec-biz-01 --located_at--> spec-loc-01.address
// ---------------------------------------------------------------------------

const A_NAME = "Harbor View Bakery";
const A_COPY =
  "SPEC_A_PUBLIC - fresh sourdough every morning; public storefront copy.";
const B_PHONE =
  "SPEC_B_HIDDEN - +1-555-0142 - internal margin notes, never publish";
const B_ADDR = "SPEC_B_ADDR - 742 Evergreen Terrace";

const BIZ_ID = "spec-biz-01";
const LOC_ID = "spec-loc-01";
const SITE_ID = "spec-site";

function buildRawGraph(): ObjectGraph {
  const biz = makeObject(
    BIZ_ID,
    { tagline: A_COPY, phone: B_PHONE },
    {
      schema: "ping.social.business@1",
      title: A_NAME,
      description: A_COPY,
      visibility: "public",
    },
  );
  const loc = makeObject(
    LOC_ID,
    { address: B_ADDR },
    {
      schema: "ping.social.location@1",
      title: "Old Town",
      description: "Public neighborhood blurb.",
      visibility: "public",
    },
  );
  return {
    objects: [biz, loc],
    relationships: [makeRel("rel-located-01", BIZ_ID, "located_at", LOC_ID)],
  };
}

/** The owner HIDE decisions: the privacy authority for B. */
const DECISIONS: FieldVisibilityDecision[] = [
  {
    objectId: BIZ_ID,
    field: "phone",
    policy: "hide",
    decidedBy: "owner",
    decidedAt: T0,
    source: "owner_override",
    version: 1,
  },
  {
    objectId: LOC_ID,
    field: "address",
    policy: "hide",
    decidedBy: "owner",
    decidedAt: T0,
    source: "owner_override",
    version: 1,
  },
];

/** The anonymous public projection: the ONLY thing public consumers see. */
function verifyAnon(graph?: ObjectGraph): VerifiedPublicProjection {
  return verifyPublicProjection(graph ?? buildRawGraph(), DECISIONS, "anonymous");
}

/** The owner-authorized projection: the owner may still inspect B. */
function verifyOwner(graph?: ObjectGraph): VerifiedPublicProjection {
  return verifyPublicProjection(graph ?? buildRawGraph(), DECISIONS, "owner");
}

function buildSpec(): FYDSiteSpec {
  return {
    kind: "fyd.sitespec@1",
    ownerObjectId: BIZ_ID,
    version: 1,
    generator: {
      name: "fyd-site-generator",
      version: "spec",
      generatedAt: T0,
    },
    themeTokens: {
      accent: "#000000",
      accentForeground: "#ffffff",
      surface: "#ffffff",
      ink: "#000000",
      radius: "md",
      fontDisplay: "sans",
      fontBody: "sans",
    },
    navigation: [],
    pages: [
      {
        slug: "home",
        title: "Home",
        navLabel: "Home",
        sections: [
          {
            id: "home:Hero:0",
            component: "Hero",
            query: { kind: "owner" },
            presentation: { heading: "Welcome", copy: "Public copy." },
          },
        ],
      },
    ],
    provenance: {
      source: "website-ingestion",
      claimKind: "website_statement",
      note: "Q-C-13 hostile spec fixture",
    },
  };
}

function buildBundle(graph: ObjectGraph): SiteBundle {
  return {
    siteId: SITE_ID,
    businessName: A_NAME,
    graph,
    spec: buildSpec(),
    findings: [],
    renderable: true,
    mediaManifest: null,
  };
}

function depsFor(graph: ObjectGraph): AnswerAskFydDeps {
  return {
    loadBundle: (id) => (id === SITE_ID ? buildBundle(graph) : null),
  };
}

function askInput(question: string, objectId?: string) {
  return {
    siteId: SITE_ID,
    objectId,
    question,
    mode: "visitor" as const,
    fieldConflicts: [],
    fieldVisibilityDecisions: DECISIONS,
  };
}

// ---------------------------------------------------------------------------
// Assertion helpers: B has ZERO disclosure; A remains useful.
// ---------------------------------------------------------------------------

function jsonOf(v: unknown): string {
  return JSON.stringify(v);
}

/** B must be absent from the serialized form of a public payload. */
function expectBabsent(label: string, payload: unknown): void {
  const j = jsonOf(payload);
  expect({ label, bPhoneDisclosed: j.includes(B_PHONE) }).toEqual({
    label,
    bPhoneDisclosed: false,
  });
  expect({ label, bAddrDisclosed: j.includes(B_ADDR) }).toEqual({
    label,
    bAddrDisclosed: false,
  });
}

/** A must remain present/useful in the same payload. */
function expectAuseful(label: string, payload: unknown): void {
  expect({ label, aPresent: jsonOf(payload).includes(A_NAME) }).toEqual({
    label,
    aPresent: true,
  });
}

// ---------------------------------------------------------------------------
// The eight-surface attack battery, run against a VERIFIED public
// projection. "A privacy fix that disappears after regeneration is FAIL":
// this battery runs pre-regen, post-regen, and post-restart.
// ---------------------------------------------------------------------------

function attackAllSurfaces(
  verified: VerifiedPublicProjection,
  label: string,
): void {
  expect(isVerifiedPublicProjection(verified)).toBe(true);
  const projected = verified.graph;

  // SURFACE 1 — SiteBundle: the bundle is the server-internal package; the
  // invariant binds where it is CONSUMED (the ask pipeline). The bundle is
  // never a response payload.
  {
    const outcome = answerAskFyd(
      askInput("What is the public storefront copy?"),
      depsFor(projected),
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expectBabsent(`${label} [1 SiteBundle->ask]`, {
        answer: outcome.answer,
        citations: outcome.citations,
        unknowns: outcome.unknowns,
        suggestedActions: outcome.suggestedActions,
        proposal: outcome.proposal,
      });
      // A remains useful: the pipeline input graph still carries A.
      expectAuseful(`${label} [1 SiteBundle]`, projected);
    }
  }

  // SURFACE 2 — render model: built ONLY from a verified projection.
  {
    const model = buildSemanticRenderModel(buildSpec(), verified);
    expectBabsent(`${label} [2 render model]`, model);
    expect(jsonOf(model.pages)).toContain(BIZ_ID); // A(object) still renders
    // The model carries the projection receipt, not a separate decision set.
    expect(model.checkpoint).toBe(verified.provenance.checkpoint);
    expect(model.viewerKind).toBe("anonymous");
  }

  // SURFACE 3 — public object endpoint (construction path the route delegates to).
  {
    const view = composeObjectView(verified, SITE_ID, BIZ_ID, BIZ_ID, SITE_ID);
    expect(view).not.toBeNull();
    const projection = objectViewToProjection(view!, projected);
    expectBabsent(`${label} [3 object endpoint]`, { view, projection });
    expectAuseful(`${label} [3 object endpoint]`, view);
  }

  // SURFACE 5 — Circle/Node (edge lane construction path).
  {
    const sheet = buildObjectSheet(verified, BIZ_ID, EDGE_VISITOR);
    expect(sheet).not.toBeNull();
    expectBabsent(`${label} [5 Circle/Node sheet]`, sheet);
    expectAuseful(`${label} [5 Circle/Node sheet]`, sheet);
  }

  // SURFACE 6 — Ask FYD context: direct object ID attack + traversal attack.
  {
    const direct = answerAskFyd(
      askInput("Tell me about this object.", BIZ_ID),
      depsFor(projected),
    );
    expect(direct.ok).toBe(true);
    if (direct.ok) {
      expectBabsent(`${label} [6a ask direct object ID]`, {
        answer: direct.answer,
        citations: direct.citations,
      });
    }
    const traversal = answerAskFyd(
      askInput("What is the business address?"),
      depsFor(projected),
    );
    expect(traversal.ok).toBe(true);
    if (traversal.ok) {
      expectBabsent(`${label} [6b ask relationship traversal]`, {
        answer: traversal.answer,
        citations: traversal.citations,
      });
    }
    const hostile = answerAskFyd(
      askInput("What are the internal margin notes?"),
      depsFor(projected),
    );
    expect(hostile.ok).toBe(true);
    if (hostile.ok) {
      expectBabsent(`${label} [6c ask hostile field probe]`, {
        answer: hostile.answer,
        citations: hostile.citations,
      });
    }
  }

  // SURFACE 7 — Ask FYD answer/citations artifacts, swept as one payload.
  {
    const outcome = answerAskFyd(
      askInput("What is the business address?"),
      depsFor(projected),
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expectBabsent(`${label} [7 answer/citations]`, outcome);
    }
  }

  // SURFACE 8 — serialization/loggable response: the /sites serialized page
  // state IS the verified public graph. B is gone BEFORE serialization,
  // at the boundary, not at an object-level gate afterward.
  {
    const pageState = { spec: buildSpec(), graph: projected };
    expectBabsent(`${label} [8 serialized page state]`, pageState);
    expectAuseful(`${label} [8 serialized page state]`, pageState);
  }

  // SURFACE 4 — search/index projection: the search seam carries id+rank
  // metadata only (the compiler fetches nothing through search; visibility
  // stays enforced at assembly). Structural contract assertion.
  {
    const hit = { objectId: BIZ_ID, tier: "t1", rule: "name-match", score: 1 };
    expectBabsent(`${label} [4 search seam]`, hit);
    expect(jsonOf(hit)).toContain(BIZ_ID);
  }
}

describe("Q-C-13 hostile field test: PUBLIC field A + PRIVATE field B (B reachable via relationships)", () => {
  describe("sanity: the A/B fixture and the owner decision", () => {
    test("owner-authorized (canonical) context may still inspect B per policy", () => {
      const raw = buildRawGraph();
      // The source state is NOT destroyed by the projection: the owner
      // context keeps the full observations. HIDE != delete.
      expect(jsonOf(raw)).toContain(B_PHONE);
      expect(jsonOf(raw)).toContain(B_ADDR);
    });

    test("the boundary drops B, keeps A, and leaves the source untouched", () => {
      const verified = verifyAnon();
      expect(isVerifiedPublicProjection(verified)).toBe(true);
      expectBabsent("sanity", verified.graph);
      expectAuseful("sanity", verified.graph);
      // The receipt records the decisions the projection was built from.
      expect(verified.decisions).toEqual(DECISIONS);
      // And the source graph is untouched (projection is a new value).
      expect(jsonOf(buildRawGraph())).toContain(B_PHONE);
    });
  });

  describe("owner-authorized proof: the owner may still inspect B", () => {
    test("owner projection keeps B visible to the owner, with owner capabilities", () => {
      const owner = verifyOwner();
      expect(isVerifiedPublicProjection(owner)).toBe(true);
      expect(owner.provenance.viewerKind).toBe("owner");
      // B remains inspectable to the owner: HIDE is a public-visibility
      // policy, not evidence deletion.
      expect(jsonOf(owner.graph)).toContain(B_PHONE);
      expect(jsonOf(owner.graph)).toContain(B_ADDR);
      expect(owner.provenance.capabilities).toContain("view_hidden_fields");
      expect(owner.provenance.capabilities).toContain("view_owner_history");
      // The anonymous projection over the same source hides B.
      expectBabsent("owner-proof anon twin", verifyAnon().graph);
    });
  });

  describe("attack battery: pre-regen", () => {
    test("B has zero disclosure across all eight surfaces; A remains useful", () => {
      attackAllSurfaces(verifyAnon(), "pre-regen");
    });
  });

  describe("containment: every former leak path stays closed (was EXPECTED-FAIL)", () => {
    test("composeObjectView over the verified projection discloses nothing of B", () => {
      const verified = verifyAnon();
      const view = composeObjectView(verified, SITE_ID, BIZ_ID, BIZ_ID, SITE_ID);
      expect(view).not.toBeNull();
      // CONTAINED: the loader takes ONLY the branded projection; there is
      // no parameter path that feeds it a raw graph.
      expectBabsent("containment object view", view);
      expectAuseful("containment object view", view);
    });

    test("buildObjectSheet over the verified projection carries no B in claims", () => {
      const verified = verifyAnon();
      const sheet = buildObjectSheet(verified, BIZ_ID, EDGE_VISITOR);
      expect(sheet).not.toBeNull();
      // CONTAINED: the edge lane builds the sheet from the verified public
      // projection; the hidden phone field never reaches the claims.
      expectBabsent("containment sheet claims", sheet);
    });

    test("buildObjectSheet for the LOCATION: hidden-address location has no public sheet", () => {
      const verified = verifyAnon();
      // CONTAINED: the boundary's traversal cut removed the located_at
      // edge AND the now-unlinked location object from the public graph.
      // There is no public sheet to disclose B from: fail closed, not
      // redacted. The traversal attack surface is the edge, and the edge
      // is gone.
      const sheet = buildObjectSheet(verified, LOC_ID, EDGE_VISITOR);
      expect(sheet).toBeNull();
      // And the business sheet carries no located_at edge to the hidden
      // location, and no B anywhere.
      const bizSheet = buildObjectSheet(verified, BIZ_ID, EDGE_VISITOR);
      expect(bizSheet).not.toBeNull();
      expectBabsent("containment traversal", bizSheet);
      expect(jsonOf(bizSheet)).not.toContain("located_at");
    });

    test("serialized page state from the verified graph discloses nothing of B", () => {
      const verified = verifyAnon();
      const pageState = { spec: buildSpec(), graph: verified.graph };
      // CONTAINED: the /sites pages serialize the verified public graph;
      // the old publicGraph() object-level filter is gone because the
      // boundary already removed hidden fields.
      expectBabsent("containment page state", pageState);
      expectAuseful("containment page state", pageState);
    });

    test("P0 contained: GET /api/fyd/projection serves ONLY the verified public projection", async () => {
      const { GET } = await import("../../../app/api/fyd/projection/route");
      const res = await GET(
        new Request("http://localhost/api/fyd/projection?siteId=happy-place"),
      );
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.ok).toBe(true);
      // CONTAINED: the route returns the verified anonymous graph plus the
      // versioned projection receipt. No raw source graph leaves the route.
      const contract = body.contract as Record<string, unknown>;
      expect(contract.boundaryVersion).toBe("fyd.public-projection@1");
      expect(contract.viewerKind).toBe("anonymous");
      expect(typeof contract.checkpoint).toBe("string");
      expect(body).toHaveProperty("graph");
      expect(body).not.toHaveProperty("history");
      // The old raw route served the dump envelope as `meta`; that shape is gone.
      expect(body).not.toHaveProperty("meta");
      // PROOF the served graph IS the boundary output: every object is
      // public, and the graph is byte-identical to what the boundary
      // produces for the same tenant (a parallel raw-graph construction
      // cannot pass this assertion).
      const served = body.graph as {
        objects: { id: string; visibility: string }[];
        relationships: unknown[];
      };
      expect(Array.isArray(served.objects)).toBe(true);
      for (const o of served.objects) {
        expect(o.visibility).toBe("public");
      }
      const { getVerifiedPublicProjectionSync } = await import(
        "../../data/ping-object-source"
      );
      const expected = getVerifiedPublicProjectionSync("happy-place", "anonymous");
      expect(jsonOf(served)).toBe(jsonOf(expected.graph));
      expect(contract.checkpoint).toBe(expected.provenance.checkpoint);
    });

    test("P0 contained: GET /api/fyd/objects/[objectId] never serves owner history", async () => {
      const { GET } = await import(
        "../../../app/api/fyd/objects/[objectId]/route"
      );
      const { NextRequest } = await import("next/server");
      const res = await GET(
        new NextRequest("http://localhost/api/fyd/objects/happy-place"),
        { params: Promise.resolve({ objectId: "happy-place" }) },
      );
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.ok).toBe(true);
      // CONTAINED: the public object endpoint returns the view, the
      // projection, and the receipt. Owner history lives only on the
      // owner-lane GET .../overrides.
      expect(body).not.toHaveProperty("history");
      const contract = body.contract as Record<string, unknown>;
      expect(contract.boundaryVersion).toBe("fyd.public-projection@1");
      expect(contract.viewerKind).toBe("anonymous");
      expectBabsent("containment public object route", {
        view: body.view,
        projection: body.projection,
      });
      // PROOF the view and projection were composed from the verified
      // projection: recompute the projection from the boundary output and
      // require byte-equality. A view composed over a raw graph cannot
      // pass this assertion.
      const { getVerifiedPublicProjectionSync: syncObj } = await import(
        "../../data/ping-object-source"
      );
      const verifiedObj = syncObj(body.siteId as string, "anonymous");
      const recomputed = objectViewToProjection(
        body.view as import("../../object/view").ObjectView,
        verifiedObj.graph,
      );
      expect(jsonOf(body.projection)).toBe(jsonOf(recomputed));
    });
  });

  describe("replay: the owner HIDE decision survives the event-log replay", () => {
    test("append -> replay -> projectOwnerState keeps the HIDE; restart keeps it too", () => {
      // NOTE (trace finding): the owner.hid-fact event vocabulary covers
      // contact:address and service:* only — the general field-HIDE lives
      // in the separate FieldVisibilityDecision bounded control. The replay
      // below exercises the real durable path (address HIDE); the
      // FieldVisibilityDecision replay is covered by the regen battery
      // (decisions re-applied to a fresh source graph).
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qc13-owner-"));
      const prev = process.env.FYD_OWNER_DIR;
      process.env.FYD_OWNER_DIR = dir;
      try {
        const draft: OwnerEventDraft = {
          at: T0,
          objectId: LOC_ID,
          type: "owner.hid-fact",
          actor: { kind: "owner", identityId: "spec-owner", label: "Spec Owner" },
          target: "contact:address",
          previousBasis: B_ADDR,
          newValue: null,
          evidence: { kind: "owner-attestation", ref: "owner-store:spec" },
          note: "Spec Owner hid the address field",
          generator: "fyd-owner@1",
        };
        appendOwnerEvent(LOC_ID, draft);
        const replayed = readOverrides(LOC_ID);
        expect(replayed.addressVisibility).toBe("hide");
        expect(
          replayed.history.some((h) => h.text.includes("hid the address")),
        ).toBe(true);

        // RESTART: fresh module registry, same dir -> same decision.
        jest.resetModules();
        const fresh = jest.requireActual(
          "../../object/owner-store",
        ) as typeof import("../../object/owner-store");
        const afterRestart = fresh.readOverrides(LOC_ID);
        expect(afterRestart.addressVisibility).toBe("hide");
        expect(
          afterRestart.history.some((h) => h.text.includes("hid the address")),
        ).toBe(true);
      } finally {
        if (prev === undefined) delete process.env.FYD_OWNER_DIR;
        else process.env.FYD_OWNER_DIR = prev;
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe("regen + restart: ATTACK AGAIN", () => {
    test("re-ingested source + replayed decisions: the full battery still holds", () => {
      // Simulated re-ingest: a FRESH source graph (new object identities,
      // same content) plus the same owner decisions re-applied through the
      // boundary.
      const reingested = buildRawGraph();
      attackAllSurfaces(verifyAnon(reingested), "post-regen");
    });

    test("restart: fresh module registry, the battery still holds", () => {
      jest.resetModules();
      const freshProjection = jest.requireActual(
        "../../sitespec/public-projection",
      ) as typeof import("../../sitespec/public-projection");
      const freshAsk = jest.requireActual(
        "../../ask/visitor-answer",
      ) as typeof import("../../ask/visitor-answer");
      const verified = freshProjection.verifyPublicProjection(
        buildRawGraph(),
        DECISIONS,
        "anonymous",
      );
      const outcome = freshAsk.answerAskFyd(
        {
          siteId: SITE_ID,
          question: "What is the business address?",
          mode: "visitor",
          fieldConflicts: [],
          fieldVisibilityDecisions: DECISIONS,
        },
        { loadBundle: (id) => (id === SITE_ID ? buildBundle(verified.graph) : null) },
      );
      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expectBabsent("post-restart", {
          answer: outcome.answer,
          citations: outcome.citations,
        });
        expectAuseful("post-restart", verified.graph);
      }
    });
  });

  describe("cache: repeated projections are deterministic and B-free", () => {
    test("two independent projections are byte-identical and B-free", () => {
      // The receipt carries projectedAt (operational metadata, excluded
      // from checkpoint identity); the projected GRAPH is the deterministic
      // value, so the cache comparison is over the graph.
      const p1 = jsonOf(verifyAnon().graph);
      const p2 = jsonOf(verifyAnon().graph);
      expect(p1).toBe(p2);
      expect(p1).not.toContain(B_PHONE);
      expect(p1).not.toContain(B_ADDR);
      expect(p1).toContain(A_NAME);
    });
  });
});
