/**
 * Page-inventory / semantic-output assertion (G1, 2026-09-24).
 *
 * Law: a refactor may change implementation; it must not silently change
 * generated product semantics. The 2026-09-23 registry convergence dropped
 * ObjectFeed eligibility for business/person/location/product at the
 * mechanism level, which silently removed the Explore page for real
 * businesses (bemis-electric: business + 5 people; gear-junction:
 * business + location + external identity). These tests pin the
 * page-level product semantics so no future refactor can repeat that.
 *
 * They also pin planner/generator agreement: whenever the generator emits
 * an Explore section, the planner's eligibility report must mark ObjectFeed
 * eligible, so the planner can never silently filter it.
 */

import type { PingObject, PingRelationship } from "@/lib/ping/types";
import { generateSiteSpec } from "../generator";
import { deriveEligibility } from "../../builder/eligibility";

const TS = "2026-09-24T12:00:00.000Z";
const OPTS = { generatedAt: TS };

const BIZ = "ping.social.business@1";
const PERSON = "ping.social.person@1";
const LOC = "ping.social.location@1";
const EXT = "ping.social.external_identity@1";

function obj(
  id: string,
  schema: string,
  title: string,
  description = "",
): PingObject {
  return {
    id,
    schema,
    controllerId: "test-controller",
    visibility: "public",
    title,
    description,
    fields: {},
    createdAt: TS,
    updatedAt: TS,
    provenance: {
      kind: "website-derived",
      ref: "website-ingestion:https://example.com/",
      derivedAt: TS,
    },
  };
}

function rel(
  id: string,
  subject: string,
  predicate: string,
  object: string,
): PingRelationship {
  return {
    id,
    subject,
    predicate,
    object,
    status: "active",
    createdAt: TS,
    evidenceRef: "website-ingestion:https://example.com/",
  };
}

/** bemis-electric shape: business + 5 team members, no posts/services. */
function bemisLikeGraph() {
  const owner = obj("biz-bemis", BIZ, "Bemis Electric", "Family-run electricians.");
  const people = [1, 2, 3, 4, 5].map((n) =>
    obj("person-" + n, PERSON, "Tech " + n),
  );
  return {
    objects: [owner, ...people],
    relationships: people.map((p, i) =>
      rel("r" + i, p.id, "works_for", owner.id),
    ),
  };
}

/** gear-junction shape: business + location + external identity + one more public object. */
function gearLikeGraph() {
  const owner = obj("biz-gear", BIZ, "Gear Junction", "Bike shop.");
  const loc = obj("loc-1", LOC, "Grand Junction");
  const ext = obj("ext-1", EXT, "Gear on Facebook");
  const person = obj("person-1", PERSON, "Owner");
  return {
    objects: [owner, loc, ext, person],
    relationships: [
      rel("r1", owner.id, "located_at", loc.id),
      rel("r2", owner.id, "links_to", ext.id),
      rel("r3", person.id, "works_for", owner.id),
    ],
  };
}

describe("page inventory: generated product semantics are pinned", () => {
  test("business + people graph keeps its Explore page (bemis-electric shape)", () => {
    const spec = generateSiteSpec(bemisLikeGraph(), OPTS);
    expect(spec.pages.map((p) => p.slug)).toEqual([
      "home",
      "about",
      "explore",
    ]);
    const explore = spec.pages.find((p) => p.slug === "explore")!;
    expect(explore.sections.map((s) => s.component)).toEqual(["ObjectFeed"]);
  });

  test("business + location graph keeps its Explore page (gear-junction shape)", () => {
    const spec = generateSiteSpec(gearLikeGraph(), OPTS);
    expect(spec.pages.map((p) => p.slug)).toContain("explore");
  });

  test("planner agrees with the generator: emitted ObjectFeed is always eligible", () => {
    for (const graph of [bemisLikeGraph(), gearLikeGraph()]) {
      const spec = generateSiteSpec(graph, OPTS);
      const emitted = new Set(
        spec.pages.flatMap((p) => p.sections.map((s) => s.component)),
      );
      const report = deriveEligibility(graph);
      for (const component of emitted) {
        expect(report.eligible[component]).toBe(true);
      }
    }
  });

  test("sparse graph still gets no Explore page (no silent invention)", () => {
    const owner = obj("biz-solo", BIZ, "Solo Shop", "One-person shop.");
    const spec = generateSiteSpec({ objects: [owner], relationships: [] }, OPTS);
    expect(spec.pages.map((p) => p.slug)).not.toContain("explore");
  });
});
