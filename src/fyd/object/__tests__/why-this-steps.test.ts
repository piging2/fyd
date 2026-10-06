/**
 * Unit test for the generic WhyThis step builder.
 *
 * Uses the real Plumbing service object shape from the served
 * coppersmith-plumbing projection (id + provenance + fields copied from
 * the live projection, values never invented). Verifies the chain
 * (source -> evidence -> method -> status) and the fail-closed behavior
 * for missing provenance.
 */

import {
  correctionsWhyThisFor,
  correctionWhyThisFor,
  whyThisStepsFor,
} from "../why-this-steps";
import type { OwnerFieldCorrection, PingObject } from "@/lib/ping/types";

function plumbingObject(): PingObject {
  return {
    id: "website-business-2f1327c09d622175-service-139408827c27",
    schema: "ping.social.service@1",
    controllerId: "web:www.coppersmithplumbing.com",
    visibility: "public",
    title: "Plumbing",
    provenance: {
      kind: "website-derived",
      ref: "website-ingestion:https://www.coppersmithplumbing.com/",
      derivedAt: "2026-09-21T13:50:00Z",
    },
    fields: {
      name: "Plumbing",
      description:
        "Are you working on new construction for residential homes or commercial buildings?",
      service_href: "https://coppersmithplumbing.com/services/plumbing/",
      claimKind: "website_statement",
    },
    relationships: [],
  } as PingObject;
}

describe("whyThisStepsFor", () => {
  test("Plumbing service yields the full real chain", () => {
    const steps = whyThisStepsFor(plumbingObject());
    expect(steps).toHaveLength(4);
    const names = steps.map((s) => s.step);
    expect(names).toEqual([
      "Source",
      "Observed evidence",
      "Extraction method",
      "Status",
    ]);
    expect(steps[0].detail).toBe("https://www.coppersmithplumbing.com/");
    // PROD-6: plain language, no "Provenance ref" jargon, date-only.
    expect(steps[1].detail).toBe(
      "Website content captured from https://www.coppersmithplumbing.com/. Observed 2026-09-21.",
    );
    expect(steps[1].detail).not.toContain("Provenance ref");
    expect(steps[1].detail).not.toContain("2026-09-21T13:50:00Z");
    expect(steps[2].detail).toContain("Website ingestion");
    expect(steps[3].state).toBe("unverified");
    expect(steps[3].detail).toContain("Website statement");
  });

  test("missing provenance yields no steps (fail closed)", () => {
    const o = plumbingObject();
    delete (o as unknown as { provenance?: unknown }).provenance;
    expect(whyThisStepsFor(o)).toEqual([]);
  });

  test("empty ref yields no steps", () => {
    const o = plumbingObject();
    o.provenance.ref = "";
    expect(whyThisStepsFor(o)).toEqual([]);
  });

  test("missing claim kind yields unknown status, never invented", () => {
    const o = plumbingObject();
    delete (o.fields as Record<string, unknown>)["claimKind"];
    const steps = whyThisStepsFor(o);
    expect(steps).toHaveLength(4);
    expect(steps[3].state).toBe("unknown");
    // PROD-6: plain language, no "unknown:" label prefix.
    expect(steps[3].detail).toBe("No claim kind recorded for this object.");
  });

  test("overlay-authored provenance names the demo overlay", () => {
    const o = plumbingObject();
    o.provenance.kind = "overlay-authored";
    o.provenance.ref = "overlay:demo-owner-addition";
    const steps = whyThisStepsFor(o);
    expect(steps[0].detail).toContain("Demo overlay");
    expect(steps[2].detail).toContain("Owner overlay");
  });
});

describe("correctionWhyThisFor (owner correction X/Y)", () => {
  const SOURCE_X = "Small problems usually tell you about a bigger one.";
  const OWNER_Y = "We fix small problems before they become big ones.";

  function correction(): OwnerFieldCorrection {
    return {
      field: "description",
      targetObjectId: "svc-repairs",
      label: "Description",
      sourceValue: SOURCE_X,
      ownerValue: OWNER_Y,
      correctedAt: "2026-09-29T17:00:00.000Z",
      actorLabel: "Demo Owner (seeded, unverified)",
      basis: "Owner correction: the owner says this is the description of 'Repairs'. The source record is unchanged.",
      sourceDrifted: false,
    };
  }

  test("answers WHAT did the source say / WHAT did the owner say / WHICH governs", () => {
    const c = correctionWhyThisFor(correction(), plumbingObject());
    expect(c.fact).toBe("service-field:svc-repairs:description");
    expect(c.sourceSays).toBe(SOURCE_X);
    expect(c.ownerSays).toBe(OWNER_Y);
    expect(c.governs).toBe("owner");
    expect(c.why).toContain("The source record is unchanged");
    expect(c.sourceDrifted).toBe(false);
  });

  test("the chain reuses the object's own evidence identity for X", () => {
    const c = correctionWhyThisFor(correction(), plumbingObject());
    expect(c.chain.map((s) => s.step)).toEqual(["Source", "Observed when", "Evidence", "Support"]);
    // Same website-ingestion identity Ask cites: the object's provenance ref.
    expect(c.chain[0].detail).toContain(SOURCE_X);
    expect(c.chain[0].detail).toContain("https://www.coppersmithplumbing.com/");
    expect(c.chain[0].state).toBe("observed");
    expect(c.chain[1].detail).toContain("2026-09-29");
    expect(c.chain[2].detail).toContain("Demo Owner (seeded, unverified)");
    expect(c.chain[2].state).toBe("observed");
    // OWNER-CONFIRMED with the owner-facing language law wording.
    expect(c.chain[3].detail).toContain("Confirmed by you");
    expect(c.chain[3].detail).toContain("the site, Ask, search, and all projections");
  });

  test("null source value is honest, never invented", () => {
    const k = correction();
    k.sourceValue = null;
    const c = correctionWhyThisFor(k, plumbingObject());
    expect(c.sourceSays).toBeNull();
    expect(c.chain[0].detail).toContain("no value recorded");
    expect(c.chain[0].state).toBe("unknown");
  });

  test("correctionsWhyThisFor maps every attached correction; empty when none", () => {
    const withNone = correctionsWhyThisFor(plumbingObject());
    expect(withNone).toEqual([]);
    const o = plumbingObject();
    o.ownerFieldCorrections = [correction()];
    const blocks = correctionsWhyThisFor(o);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].ownerSays).toBe(OWNER_Y);
  });
});
