/**
 * Unit test for the generic WhyThis step builder.
 *
 * Uses the real Plumbing service object shape from the served
 * coppersmith-plumbing projection (id + provenance + fields copied from
 * the live projection, values never invented). Verifies the chain
 * (source -> evidence -> method -> status) and the fail-closed behavior
 * for missing provenance.
 */

import { whyThisStepsFor } from "../why-this-steps";
import type { PingObject } from "@/lib/ping/types";

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
