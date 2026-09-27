/**
 * Projection-boundary product tests.
 *
 * These run the REAL projection path, not a sidecar:
 *   synthetic ObjectGraph -> generateSiteSpec -> buildRenderContext
 *   (owner visibility projection) -> renderToStaticMarkup(SitePageView)
 *
 * 1. UNBOUND FACTUAL CLAIM: an object whose phone field has no evidence
 *    renders no phone number and no tel: link. No binding, no output.
 * 2. HOSTILE URL: website/phone/email values shaped like javascript:/data:
 *    URLs never become executable hrefs; the HTML contains no
 *    "javascript:" and no unsafe scheme in any href.
 * 3. OWNER ADDRESS OVERRIDE: an owner HIDE decision on the location
 *    address field removes it from the projection; the source graph still
 *    carries the observation; re-running the projection on a freshly
 *    "re-ingested" source graph with the same decisions hides it again.
 *    Owner intent survives regeneration; source truth is untouched.
 * 4. CONSERVATIVE DEFAULT: with no owner decision, an address-bearing
 *    field is coarsened in the projection, never shown raw.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { SitePageView, buildRenderContext } from "../renderer";
import { generateSiteSpec } from "../../proceduralize/generator";
import type { FieldVisibilityDecision } from "../../sitespec/field-visibility";
import type { ObjectGraph, ViewerContext } from "../../sitespec/types";
import type { PingObject } from "@/lib/ping/types";

const OBS = "2026-09-21T13:50:00Z";
const VIEWER: ViewerContext = { viewerId: null, displayName: null };

function makeObject(
  id: string,
  schema: string,
  fields: Record<string, string | string[]>,
  provenanceRef: string,
  title = "Test Business",
): PingObject {
  return {
    id,
    schema,
    controllerId: "identity_projection_test",
    visibility: "public",
    title,
    description: "A test business for the projection boundary.",
    fields,
    createdAt: OBS,
    updatedAt: OBS,
    provenance: { kind: "website-derived", ref: provenanceRef, derivedAt: OBS },
  };
}

function makeRelationship(id: string, subject: string, predicate: string, object: string) {
  return {
    id,
    subject,
    predicate,
    object,
    status: "active" as const,
    createdAt: OBS,
    evidenceRef: "website-ingestion:test",
  };
}

const STREET_ADDRESS = "630 Maldonado Street, Grand Junction, CO";
const PHONE = "+19705550100";

/** Fresh source graph, simulating one extraction run. */
function sourceGraph(opts: {
  phoneProvenanceRef: string;
  website: string;
  email: string;
}): ObjectGraph {
  return {
    objects: [
      makeObject(
        "biz-1",
        "ping.social.business@1",
        { phone: PHONE, website: opts.website, email: opts.email },
        opts.phoneProvenanceRef,
      ),
      makeObject(
        "loc-1",
        "ping.social.location@1",
        { address: STREET_ADDRESS },
        "website-ingestion:https://example.com/",
        "Grand Junction, CO",
      ),
    ],
    relationships: [makeRelationship("rel-1", "biz-1", "located_at", "loc-1")],
  };
}

function renderAllPages(graph: ObjectGraph, decisions: FieldVisibilityDecision[]): string {
  const projectedForSpec = graph;
  const spec = generateSiteSpec(projectedForSpec, { generatedAt: OBS });
  const ctx = buildRenderContext(spec, graph, VIEWER, decisions);
  return spec.pages.map((page) => renderToStaticMarkup(SitePageView({ page, ctx }))).join("\n");
}

function ownerDecision(
  objectId: string,
  field: string,
  policy: FieldVisibilityDecision["policy"],
): FieldVisibilityDecision {
  return {
    objectId,
    field,
    policy,
    decidedBy: "owner",
    decidedAt: OBS,
    source: "owner_override",
    version: 1,
  };
}

describe("projection boundary", () => {
  test("unbound factual claim is omitted: phone without evidence renders no number and no tel: link", () => {
    const graph = sourceGraph({
      phoneProvenanceRef: "",
      website: "https://example.com/",
      email: "hello@example.com",
    });
    // Strip the evidence ref: the phone binding can no longer verify.
    graph.objects[0] = {
      ...graph.objects[0],
      provenance: { ...graph.objects[0].provenance, ref: "" },
    };
    const html = renderAllPages(graph, []);
    expect(html).not.toContain(PHONE);
    expect(html).not.toContain("tel:");
  });

  test("hostile URLs never become executable hrefs", () => {
    const hostiles = [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(document.domain)",
      "   javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
    ];
    for (const hostile of hostiles) {
      const graph = sourceGraph({
        phoneProvenanceRef: "website-ingestion:https://example.com/",
        website: hostile,
        email: hostile,
      });
      const html = renderAllPages(graph, []);
      expect(html).not.toContain("javascript:");
      expect(html).not.toContain("data:text/html");
      expect(html).not.toContain("vbscript:");
      // No href carries an executable scheme.
      const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
      for (const href of hrefs) {
        expect(href).not.toMatch(/^(javascript|data|vbscript|file|blob):/i);
      }
    }
  });

  test("safe URLs still render as links", () => {
    const graph = sourceGraph({
      phoneProvenanceRef: "website-ingestion:https://example.com/",
      website: "https://example.com/",
      email: "hello@example.com",
    });
    const html = renderAllPages(graph, []);
    expect(html).toContain('href="https://example.com/"');
    expect(html).toContain('href="tel:+19705550100"');
    expect(html).toContain('href="mailto:hello@example.com"');
    expect(html).toContain(PHONE);
  });

  test("owner address HIDE override: withheld from projection, source untouched, survives re-ingestion", () => {
    const decisions = [ownerDecision("loc-1", "address", "hide")];

    // First projection.
    const first = sourceGraph({
      phoneProvenanceRef: "website-ingestion:https://example.com/",
      website: "https://example.com/",
      email: "hello@example.com",
    });
    const spec = generateSiteSpec(first, { generatedAt: OBS });
    const ctx = buildRenderContext(spec, first, VIEWER, decisions);
    const projectedLoc = ctx.graph.objects.find((o) => o.id === "loc-1");
    expect(projectedLoc).toBeDefined();
    expect(projectedLoc!.fields["address"]).toBeUndefined();
    // Source observations are unchanged.
    const sourceLoc = first.objects.find((o) => o.id === "loc-1");
    expect(sourceLoc!.fields["address"]).toBe(STREET_ADDRESS);
    // Rendered output carries no street address.
    const html = spec.pages
      .map((page) => renderToStaticMarkup(SitePageView({ page, ctx })))
      .join("\n");
    expect(html).not.toContain("Maldonado Street");

    // Re-ingestion: a FRESH source graph (new object identities, same
    // observations) with the same owner decisions.
    const second = sourceGraph({
      phoneProvenanceRef: "website-ingestion:https://example.com/",
      website: "https://example.com/",
      email: "hello@example.com",
    });
    const spec2 = generateSiteSpec(second, { generatedAt: OBS });
    const ctx2 = buildRenderContext(spec2, second, VIEWER, decisions);
    const projectedLoc2 = ctx2.graph.objects.find((o) => o.id === "loc-1");
    expect(projectedLoc2!.fields["address"]).toBeUndefined();
    expect(second.objects.find((o) => o.id === "loc-1")!.fields["address"]).toBe(
      STREET_ADDRESS,
    );
  });

  test("conservative default: address is coarsened with no owner decision", () => {
    const graph = sourceGraph({
      phoneProvenanceRef: "website-ingestion:https://example.com/",
      website: "https://example.com/",
      email: "hello@example.com",
    });
    const spec = generateSiteSpec(graph, { generatedAt: OBS });
    const ctx = buildRenderContext(spec, graph, VIEWER, []);
    const projectedLoc = ctx.graph.objects.find((o) => o.id === "loc-1");
    expect(projectedLoc!.fields["address"]).toBe("Grand Junction, CO");
    expect(projectedLoc!.fields["address"]).not.toBe(STREET_ADDRESS);
  });

  test("contact renders direct tel:/mailto: anchors with Why-disclosures carrying provenance", () => {
    const graph = sourceGraph({
      phoneProvenanceRef: "website-ingestion:https://example.com/",
      website: "https://example.com/",
      email: "hello@example.com",
    });
    const html = renderAllPages(graph, []);

    // The FYD affordances exist for phone and email.
    expect(html).toContain('data-fyd-contact="phone"');
    expect(html).toContain('data-fyd-contact="email"');
    // Polish lane (2026-09-26): the values ARE the anchors now. Direct
    // conversion is the primary action, not a disclosure toggle.
    expect(html).toContain(">" + PHONE + "</a>");
    expect(html).toContain('href="tel:' + PHONE + '"');
    expect(html).toContain('href="mailto:hello@example.com"');
    // The Why-disclosures sit beside the actions carrying provenance.
    expect(html).toContain("Why this number?");
    expect(html).toContain("Why this email?");
    expect(html).toContain("Observed example.com");
  });

  test("hero with no safe website renders the direct phone action as primary", () => {
    const graph = sourceGraph({
      phoneProvenanceRef: "website-ingestion:https://example.com/",
      website: "javascript:alert(1)",
      email: "hello@example.com",
    });
    const html = renderAllPages(graph, []);
    // No safe website: the hero falls back to the phone affordance.
    expect(html).not.toContain("javascript:");
    expect(html).toContain('data-fyd-contact="phone"');
    expect(html).toContain("Call " + PHONE);
    expect(html).toContain('href="tel:' + PHONE + '"');
    expect(html).toContain(">" + PHONE + "</a>");
  });
});
