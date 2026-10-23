/**
 * Item 10 (fyd-execution) regression: projection-derived structured data.
 *
 * INV-SD-1: the LocalBusiness JSON-LD is a pure function of the verified
 * public projection (no second fetch, no hardcoded per-site values).
 * INV-SD-2: never invents ratings/hours/licenses/availability/geography.
 * INV-SD-3: every structured value appears identically in the visible
 * render; a hidden address disappears from BOTH.
 * INV-SD-4: every emitted factual claim passes the BindingVerifier tap.
 *
 * Fixture graphs are the real both-site fixtures (INV-RG-1); the
 * projections are hand-built VerifiedPublicProjection-shaped objects
 * carrying those graphs, exactly what compilePublicSite hands the render.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { localBusinessJsonLd, type JsonLdClaim } from "../render-jsonld";
import { VisitorExperience } from "@/fyd/components/visitor-experience";
import { generateSiteSpec } from "../generator";
import { COPPERSMITH_GRAPH } from "../__fixtures__/coppersmith-graph";
import { HAPPY_PLACE_GRAPH } from "../__fixtures__/happy-place-graph";
import {
  verifyBinding,
  ownerAssertionsFromGraph,
} from "@/fyd/sitespec/binding-verifier";
import type { VerifiedPublicProjection } from "@/fyd/sitespec/public-projection";
import type { ObjectGraph } from "@/fyd/sitespec/types";
import type { PingObject } from "@/lib/ping/types";

const SITES = [
  { siteId: "coppersmith-plumbing", graph: COPPERSMITH_GRAPH },
  { siteId: "happy-place", graph: HAPPY_PLACE_GRAPH },
];

function projectionFor(graph: ObjectGraph): VerifiedPublicProjection {
  return {
    kind: "fyd-public-projection@1",
    graph,
    decisions: [],
    provenance: {
      checkpoint: "test-checkpoint",
      graphDigest: "test",
      viewerPolicyDigest: "test",
      generatedAt: "2026-10-07T00:00:00.000Z",
    },
  } as unknown as VerifiedPublicProjection;
}

function businessOf(graph: ObjectGraph): PingObject {
  const spec = generateSiteSpec(graph, { generatedAt: "2026-10-07T00:00:00.000Z" });
  const owner = graph.objects.find(
    (o) => o.id === spec.ownerObjectId && o.visibility === "public",
  );
  expect(owner).toBeTruthy();
  return owner!;
}

const FORBIDDEN_KEYS = [
  "aggregateRating",
  "review",
  "openingHours",
  "license",
  "priceRange",
  "areaServed",
  "hasOfferCatalog",
];

describe.each(SITES)("render-jsonld ($siteId)", ({ siteId, graph }) => {
  const projection = projectionFor(graph);
  const owner = businessOf(graph);
  const result = localBusinessJsonLd(projection, { ownerObjectId: owner.id });

  test("emits a LocalBusiness node from the projection only", () => {
    expect(result).not.toBeNull();
    expect(result!.node["@context"]).toBe("https://schema.org");
    expect(result!.node["@type"]).toBe("LocalBusiness");
    expect(typeof result!.node.name).toBe("string");
  });

  test("never invents ratings/hours/licenses/availability/geography", () => {
    const keys = Object.keys(result!.node);
    for (const k of FORBIDDEN_KEYS) expect(keys).not.toContain(k);
  });

  test("structured values appear identically in the visible render", () => {
    // INV-SD-3: the builder reads through visitorField — the SAME reader
    // the visible render uses — so structured values are identical to
    // visible values by construction (every claim IS a visitorField
    // read). This test anchors the end-to-end fact: the rendered HTML
    // for the same projection contains the name/phone/url/service titles
    // the JSON-LD carries. (Description is legitimately shortened by
    // conciseSource in the hero; address parts render inside "Why this?"
    // disclosures, not as headline facts.)
    const ctx = {
      graph,
      spec: generateSiteSpec(graph, { generatedAt: "2026-10-07T00:00:00.000Z" }),
      viewer: { viewerId: null, displayName: null },
      siteId,
      heroMedia: null,
    };
    const html = renderToStaticMarkup(createElement(VisitorExperience, { ctx }));
    const VISIBLE_FIELDS = new Set(["title", "phone", "website"]);
    // React HTML-escapes text; a claim value with "&" renders as "&amp;".
    // That is an encoding of the SAME value, not a divergence.
    const escapeHtml = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const checked: string[] = [];
    for (const claim of result!.claims as JsonLdClaim[]) {
      if (!VISIBLE_FIELDS.has(claim.field)) continue;
      checked.push(claim.value);
      expect(html).toContain(escapeHtml(claim.value));
    }
    expect(checked.length).toBeGreaterThan(0);
  });

  test("every factual claim passes the BindingVerifier tap", () => {
    const assertions = ownerAssertionsFromGraph(graph);
    expect(result!.claims.length).toBeGreaterThan(0);
    for (const claim of result!.claims as JsonLdClaim[]) {
      const verdict = verifyBinding(
        { objectId: claim.objectId, field: claim.field, classification: "direct" },
        graph,
        assertions,
      );
      expect(
        verdict.status === "BOUND"
          ? null
          : `UNBOUND: ${claim.objectId}::${claim.field} reason=${(verdict as { reason?: string }).reason ?? "?"}`
      ).toBeNull();
    }
  });
});

describe("visibility respected", () => {
  test("a hidden street address disappears from structured output", () => {
    const graph = structuredClone(COPPERSMITH_GRAPH) as ObjectGraph;
    const owner = businessOf(COPPERSMITH_GRAPH);
    const target = graph.objects.find((o) => o.id === owner.id)!;
    // Simulate the projection boundary: a hidden address is CUT from the
    // projection graph (EVIDENCE != VISIBILITY). The builder must then
    // emit no streetAddress — it cannot see what the projection removed.
    delete target.fields["streetAddress"];
    const result = localBusinessJsonLd(projectionFor(graph), {
      ownerObjectId: owner.id,
    });
    const address = result!.node.address as Record<string, string> | undefined;
    if (address) expect(address.streetAddress).toBeUndefined();
    expect(
      (result!.claims as JsonLdClaim[]).some((c) => c.field === "streetAddress"),
    ).toBe(false);
  });

  test("a visible street address is emitted when the projection carries it", () => {
    const owner = businessOf(COPPERSMITH_GRAPH);
    const street = owner.fields["streetAddress"];
    const result = localBusinessJsonLd(projectionFor(COPPERSMITH_GRAPH), {
      ownerObjectId: owner.id,
    });
    if (typeof street === "string" && street.trim()) {
      expect(
        (result!.node.address as Record<string, string>).streetAddress,
      ).toBe(street);
    } else {
      // The fixture projection carries no street address: the builder
      // must not invent one.
      const address = result!.node.address as Record<string, string> | undefined;
      if (address) expect(address.streetAddress).toBeUndefined();
    }
  });
});
