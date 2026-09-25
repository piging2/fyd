/**
 * Q-P0-01 PROBE (read-only): Ask FYD field-level privacy gate.
 *
 * PROBE ONLY — this file asserts the invariant; it fixes nothing and
 * modifies no product code.
 *
 * Invariant: "Public viewer cannot reach hidden address via any public
 * surface: traversal, Ask FYD, search, citations, alternate projections.
 * Owner viewer can."
 *
 * Pipeline under probe:
 *   POST /api/fyd/ask/[siteId] -> handleAskRequest
 *     (src/app/api/fyd/ask/ask-pipeline.ts)
 *     -> answerAskFyd (src/fyd/ask/visitor-answer.ts) — the exact function
 *        the route calls, invoked here with the route's own dep pattern:
 *        loadBundle: (id) => (id === siteId ? bundle : null)
 *     -> publicGraphOf (visitor-answer.ts:184, NOT exported):
 *        applyFieldVisibility(graph, [])           // owner decisions ALWAYS []
 *        then filter to visibility === "public"    // anonymous viewer, no grants
 *     -> composeAskFyd / composeAnswer (src/lib/ping/ask-composer.ts)
 *
 * Surfaces probed: (1) the projected graph's address fields, (2) traversal
 * via objectId (public / private / unknown ids), (3) the answer text and
 * (4) citations from the real answer path, (5) the owner-viewer path
 * (documented as unimplemented), (6) conservative-default boundary shapes
 * (single-comma / no-comma address values, non-"address"-named fields,
 * address-bearing titles, owner HIDE decisions vs the hardcoded []).
 *
 * Reading the results:
 * - "Q-P0-01 core" encodes the invariant on the canonical surface. It PASSes.
 * - "Q-P0-01 extended" asserts the invariant on boundary surfaces where the
 *   pipeline is believed to leak. Their FAILURES ARE THE FINDING: each names
 *   the exact leak path (surface, field, function, file:line) and the jest
 *   diff quotes the offending output.
 * - TD-002 (street-address leak on the live Ask path, open since
 *   2026-09-23): this probe may rediscover it; per the brief that is
 *   success, not failure.
 *
 * "search" and "alternate projections": the Ask pipeline has no search
 * surface and serves exactly one projection (publicGraphOf); there is no
 * alternate projection to probe here. Traversal is covered via objectId.
 *
 * Run: npx jest --config src/fyd/ask/jest.config.cjs ask-privacy-probe
 */

import {
  answerAskFyd,
  type AnswerAskFydDeps,
  type AskFydMode,
  type AskFydOutcome,
} from "../visitor-answer";
import {
  applyFieldVisibility,
  resolveFieldVisibility,
  type FieldVisibilityDecision,
} from "../../sitespec/field-visibility";
import type { ObjectGraph, FYDSiteSpec } from "../../sitespec/types";
import type { SiteBundle } from "../../media/site-bundle";
import type {
  PingObject,
  PingRelationship,
} from "../../../lib/ping/types";

// ---------------------------------------------------------------------------
// Fixture constants
// ---------------------------------------------------------------------------

const SITE_ID = "probe-site";
const TS = "2026-09-24T00:00:00.000Z";
/** The street-level segment the invariant forbids the public viewer to see. */
const STREET = "123 Main St";
const FULL_ADDRESS = "123 Main St, Grand Junction, CO 81501";

function makeObject(overrides: Partial<PingObject>): PingObject {
  return {
    id: "obj",
    schema: "ping.social.business@1",
    controllerId: "ctrl-probe",
    visibility: "public",
    title: "Probe Object",
    description: "",
    fields: {},
    createdAt: TS,
    updatedAt: TS,
    provenance: {
      kind: "canonical-journal",
      ref: "evt-probe-1",
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
    evidenceRef: "evt-probe-1",
  };
}

function makeSpec(ownerObjectId: string): FYDSiteSpec {
  return {
    kind: "fyd.sitespec@1",
    ownerObjectId,
    version: 1,
    generator: {
      name: "fyd-site-generator",
      version: "probe",
      generatedAt: TS,
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
      note: "probe fixture",
    },
  };
}

function makeBundle(graph: ObjectGraph, ownerObjectId = "biz-1"): SiteBundle {
  return {
    siteId: SITE_ID,
    businessName: "Acme Plumbing",
    graph,
    spec: makeSpec(ownerObjectId),
    findings: [],
    renderable: true,
    mediaManifest: null,
  };
}

/**
 * Faithful mirror of publicGraphOf (src/fyd/ask/visitor-answer.ts:184),
 * which is not exported: applyFieldVisibility with EMPTY owner decisions
 * (the Ask pipeline never consults owner decisions), then the
 * visibility === "public" filter, then the active-relationship filter with
 * both endpoints public. If this mirror ever drifts from publicGraphOf,
 * the probe is invalid — the answerAskFyd probes below exercise the REAL
 * publicGraphOf and are the authoritative check.
 */
function projectForVisitor(graph: ObjectGraph): ObjectGraph {
  const projected = applyFieldVisibility(graph, []);
  const publicObjects = projected.objects.filter(
    (o) => o.visibility === "public",
  );
  const publicIds = new Set(publicObjects.map((o) => o.id));
  const publicRelationships = projected.relationships.filter(
    (r) =>
      r.status === "active" &&
      publicIds.has(r.subject) &&
      publicIds.has(r.object),
  );
  return { objects: publicObjects, relationships: publicRelationships };
}

/**
 * The real answer path: the same function
 * src/app/api/fyd/ask/[siteId]/route.ts calls (via handleAskRequest), with
 * the route's own dep pattern (ask-pipeline.ts: loadBundle resolves ONLY
 * this request's tenant bundle, never another tenant's graph).
 */
function ask(
  bundle: SiteBundle,
  question: string,
  opts: { objectId?: string; mode?: AskFydMode } = {},
): AskFydOutcome {
  const deps: AnswerAskFydDeps = {
    loadBundle: (id) => (id === SITE_ID ? bundle : null),
  };
  return answerAskFyd(
    {
      siteId: SITE_ID,
      question,
      mode: opts.mode ?? "visitor",
      ...(opts.objectId ? { objectId: opts.objectId } : {}),
    },
    deps,
  );
}

function assertOk(out: AskFydOutcome): asserts out is Extract<AskFydOutcome, { ok: true }> {
  expect(out.ok).toBe(true);
}

/** Canonical fixture: PUBLIC location object carrying a street-level address field. */
function coreGraph(): ObjectGraph {
  return {
    objects: [
      makeObject({
        id: "biz-1",
        schema: "ping.social.business@1",
        title: "Acme Plumbing",
        fields: { phone: "(970) 555-0100" },
      }),
      makeObject({
        id: "loc-1",
        schema: "ping.social.location@1",
        title: "Downtown Grand Junction",
        fields: { address: FULL_ADDRESS, locality: "Grand Junction, CO" },
      }),
      makeObject({
        id: "priv-1",
        schema: "ping.social.business@1",
        visibility: "private",
        title: "Secret Warehouse",
        fields: { address: "999 Secret Rd, Grand Junction, CO 81501" },
      }),
    ],
    relationships: [makeRel("rel-1", "biz-1", "loc-1")],
  };
}

/** Every value of every address-named field on every projected object. */
function projectedAddressValues(projected: ObjectGraph): Array<{
  objectId: string;
  field: string;
  value: string;
}> {
  const out: Array<{ objectId: string; field: string; value: string }> = [];
  for (const o of projected.objects) {
    for (const [k, v] of Object.entries(o.fields)) {
      if (k.toLowerCase().includes("address")) {
        out.push({
          objectId: o.id,
          field: k,
          value: Array.isArray(v) ? v.join(", ") : v,
        });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Q-P0-01 core: the invariant on the canonical surface
// ---------------------------------------------------------------------------

describe("Q-P0-01 core: public viewer cannot reach the street-level address", () => {
  test("projected graph: street segment appears in NO address field (conservative-default path)", () => {
    const projected = projectForVisitor(coreGraph());
    const addressValues = projectedAddressValues(projected);
    // The probe must actually observe address fields, or it proves nothing.
    expect(addressValues.length).toBeGreaterThan(0);
    for (const { objectId, field, value } of addressValues) {
      expect(
        `${objectId}.${field} = ${JSON.stringify(value)}`,
      ).not.toContain(STREET);
    }
    // What the pipeline ACTUALLY does with decisions=[]: the conservative
    // default for "address"-named fields is "coarse" (NOT "hide"): the
    // street-level first segment is dropped, city/region/postal survives.
    // An owner HIDE decision is out of scope here — publicGraphOf hardcodes
    // [], so owner intent never reaches the Ask path (see the gap probe).
    const loc = projected.objects.find((o) => o.id === "loc-1");
    expect(loc?.fields["address"]).toBe("Grand Junction, CO 81501");
  });

  test("traversal: the private object (with its own street address) never enters the public projection", () => {
    const projected = projectForVisitor(coreGraph());
    const ids = projected.objects.map((o) => o.id).sort();
    expect(ids).toEqual(["biz-1", "loc-1"]);
    expect(ids).not.toContain("priv-1");
  });

  test("traversal: objectId targeting the private object fails closed (unknown_object), never serves its address", () => {
    const out = ask(makeBundle(coreGraph()), "What is your address?", {
      objectId: "priv-1",
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.kind).toBe("unknown_object");
    }
  });

  test("Ask FYD: address-seeking question — street segment in NEITHER answer text NOR citations", () => {
    const out = ask(
      makeBundle(coreGraph()),
      "Where are you located? What is your street address?",
    );
    assertOk(out);
    expect(out.answer).not.toContain(STREET);
    const citationText = out.citations
      .map((c) => `label=${c.label} | source=${c.source} | id=${c.id}`)
      .join("\n");
    expect(citationText).not.toContain(STREET);
    // Privacy must not nuke utility: the coarse, public location still answers.
    expect(out.answer).toContain("Downtown Grand Junction");
    expect(out.refusal).toBe(false);
  });

  test("Ask FYD: object-scoped ask on the location object — no street segment in answer or citations", () => {
    const out = ask(makeBundle(coreGraph()), "What is the address of this place?", {
      objectId: "loc-1",
    });
    assertOk(out);
    expect(out.answer).not.toContain(STREET);
    const citationText = out.citations
      .map((c) => `label=${c.label} | source=${c.source} | id=${c.id}`)
      .join("\n");
    expect(citationText).not.toContain(STREET);
  });

  test("OWNER-VIEWER PATH: mode 'owner' grants nothing — the invariant's second half has NO implementation", () => {
    const bundle = makeBundle(coreGraph());
    const question = "Where are you located? What is your street address?";
    const visitor = ask(bundle, question, { mode: "visitor" });
    const owner = ask(bundle, question, { mode: "owner" });
    assertOk(visitor);
    assertOk(owner);
    // DOCUMENTED GAP (not a bug in this probe's scope): the Ask pipeline
    // accepts mode "owner" for a future authenticated lane, but until that
    // lane exists it is treated as visitor-safe — "it grants nothing and
    // changes nothing" (src/app/api/fyd/ask/ask-pipeline.ts). The answer
    // context is built with viewer { id: null, displayName: null } and
    // grants: [] regardless of mode (src/fyd/ask/visitor-answer.ts), and
    // publicGraphOf always passes [] owner decisions. There is deliberately
    // no code path in the Ask pipeline that serves owner-private facts.
    // => "owner viewer CAN [reach the hidden address]" is UNIMPLEMENTED.
    // If a future authenticated owner lane lands, THIS TEST MUST CHANGE.
    expect(owner).toEqual(visitor);
    expect(owner.answer).not.toContain(STREET);
  });
});

// ---------------------------------------------------------------------------
// Q-P0-01 extended: conservative-default boundary probing.
// Each probe below asserts the invariant on a boundary surface where the
// pipeline is believed to leak. A FAILURE IS THE FINDING: it names the
// exact leak path (surface, field, function, file:line) and the jest diff
// quotes the offending output.
// ---------------------------------------------------------------------------

describe("Q-P0-01 extended: boundary surfaces (failures are leak findings)", () => {
  test("PROBE (expected leak): single-comma address value survives coarsening verbatim", () => {
    // coarsenAddress splits on commas and keeps the LAST TWO segments.
    // With a single comma the street segment is one of the kept two, so it
    // survives the "privacy gate" verbatim.
    const graph: ObjectGraph = {
      objects: [
        makeObject({
          id: "biz-1",
          title: "Acme Plumbing",
          fields: { address: "123 Main St, Grand Junction CO 81501" },
        }),
      ],
      relationships: [],
    };
    const projected = projectForVisitor(graph);
    const value = projected.objects[0]?.fields["address"];
    // LEAK PATH (when this fails): the projected address field still
    // carries the street segment. Function: coarsenAddress,
    // src/fyd/sitespec/field-visibility.ts ("Fewer than two segments ->
    // the value is returned unchanged"; with exactly two segments,
    // slice(-2) keeps both, street included). Surface: projected graph
    // address fields -> Ask FYD answer text via fieldOf(target,
    // "location","address",...) at src/lib/ping/ask-composer.ts.
    expect(String(value)).not.toContain(STREET);
  });

  test("PROBE (expected leak): no-comma address value is returned unchanged", () => {
    // The schema.org streetAddress shape: a single segment with no commas.
    const graph: ObjectGraph = {
      objects: [
        makeObject({
          id: "biz-1",
          title: "Acme Plumbing",
          fields: { address: "123 Main St" },
        }),
      ],
      relationships: [],
    };
    const projected = projectForVisitor(graph);
    const value = projected.objects[0]?.fields["address"];
    // LEAK PATH (when this fails): coarsenAddress returns the value
    // unchanged ("Fewer than two segments -> the value is returned
    // unchanged", src/fyd/sitespec/field-visibility.ts) — the entire value
    // IS the street segment. Same answer-text surface as above.
    expect(String(value)).not.toContain(STREET);
  });

  test("PROBE (expected leak): street address in a non-'address'-named field is shown verbatim", () => {
    // The conservative default keys on the FIELD NAME: only names containing
    // "address" coarsen; everything else defaults to "show". A field named
    // "location" carrying a street address is served verbatim, and the
    // composer reads "location" FIRST (fieldOf priority).
    const graph: ObjectGraph = {
      objects: [
        makeObject({
          id: "biz-1",
          title: "Acme Plumbing",
          fields: { location: FULL_ADDRESS },
        }),
      ],
      relationships: [],
    };
    const out = ask(makeBundle(graph), "Where are you located? What is your address?");
    assertOk(out);
    // LEAK PATH (when this fails): answer text contains the full street
    // address. Functions: resolveFieldVisibility conservative default
    // ("show" for non-"address" names), src/fyd/sitespec/field-visibility.ts;
    // fieldOf(target, "location", "address", ...) reads the verbatim value,
    // src/lib/ping/ask-composer.ts (location branch).
    // Offending output is quoted in the jest diff of out.answer.
    expect(out.answer).not.toContain(STREET);
  });

  test("PROBE (expected leak): street address in the location object's TITLE is echoed verbatim via located_at", () => {
    // Field visibility is applied to FIELDS only. The located_at answer
    // branch names the location object by its TITLE verbatim.
    const graph: ObjectGraph = {
      objects: [
        makeObject({ id: "biz-1", title: "Acme Plumbing", fields: {} }),
        makeObject({
          id: "loc-1",
          schema: "ping.social.location@1",
          title: "123 Main St, Grand Junction, CO",
          fields: { locality: "Grand Junction, CO" },
        }),
      ],
      relationships: [makeRel("rel-1", "biz-1", "loc-1")],
    };
    const out = ask(makeBundle(graph), "Where are you located?");
    assertOk(out);
    // LEAK PATH (when this fails): answer text echoes the title verbatim:
    // "Acme Plumbing is listed at: 123 Main St, Grand Junction, CO."
    // Function: the located_at branch sets locationName = o.title ||
    // fieldOf(o, "locality") with no visibility treatment of the title,
    // src/lib/ping/ask-composer.ts. Titles never pass through
    // applyFieldVisibility.
    expect(out.answer).not.toContain(STREET);
  });

  test("PROBE (documented gap): an owner HIDE decision is honored by the mechanism but never consulted by the Ask pipeline", () => {
    const hide: FieldVisibilityDecision = {
      objectId: "loc-1",
      field: "address",
      policy: "hide",
      decidedBy: "owner",
      decidedAt: TS,
      source: "owner_override",
      version: 1,
    };
    // The mechanism honors it when given the decision...
    expect(resolveFieldVisibility("loc-1", "address", [hide]).policy).toBe("hide");
    const withDecision = applyFieldVisibility(coreGraph(), [hide]);
    expect(
      withDecision.objects.find((o) => o.id === "loc-1")?.fields["address"],
    ).toBeUndefined();
    // ...but the Ask pipeline never passes it: publicGraphOf hardcodes []
    // (src/fyd/ask/visitor-answer.ts:184), so on the Ask path the field is
    // merely coarsened, never hidden. This assertion documents the ACTUAL
    // behavior; it passes today and must keep passing until owner decisions
    // are wired into the Ask projection.
    const pipelineView = applyFieldVisibility(coreGraph(), []);
    expect(pipelineView.objects.find((o) => o.id === "loc-1")?.fields["address"]).toBe(
      "Grand Junction, CO 81501",
    );
  });
});
