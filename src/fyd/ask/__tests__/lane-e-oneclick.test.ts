/**
 * LANE E one-click proof (scratch): a FRESHLY GENERATED synthetic tenant
 * ("Desert Rose Plumbing", Moab) goes through the SAME generic ask API
 * path (answerAskFyd + synthetic bundle + generateSiteSpec) with zero
 * per-tenant wiring in the ask lane. No registry change, no new authority.
 *
 * Scratch only: /home/nolan/worktrees/lane-e-ask.
 */

import { answerAskFyd, type AnswerAskFydInput } from "../visitor-answer";
import type { SiteBundle } from "../../media/site-bundle";
import { generateSiteSpec } from "../../proceduralize/generator";
import type { ObjectGraph } from "../sitespec/types";
import type { AskFieldConflict } from "../field-conflicts";

const BIZ = "syn-rose-biz";
const SVC1 = "syn-rose-svc-drain";
const SVC2 = "syn-rose-svc-water";
const LOC = "syn-rose-loc";

function syntheticGraph(): ObjectGraph {
  const at = "2026-09-24T12:00:00Z";
  return {
    objects: [
      {
        id: BIZ,
        schema: "ping.social.business@1",
        controllerId: "lane-e-oneclick",
        visibility: "public",
        title: "Desert Rose Plumbing",
        description: "Desert Rose Plumbing serves Moab homes.",
        fields: {
          phone: "435-555-0119",
          website: "https://desertroseplumbing.example",
          locality: "Moab, Utah, 84532, United States",
          hours: "Mo,Tu,We,Th,Fr 08:00-17:00",
        },
        createdAt: at,
        updatedAt: at,
        provenance: {
          kind: "website-derived",
          ref: "website-ingestion:https://desertroseplumbing.example/",
          derivedAt: at,
        },
      },
      {
        id: SVC1,
        schema: "ping.social.service@1",
        controllerId: "lane-e-oneclick",
        visibility: "public",
        title: "Drain Cleaning",
        description: "Drain cleaning service.",
        fields: {},
        createdAt: at,
        updatedAt: at,
        provenance: { kind: "website-derived", ref: "website-ingestion:https://desertroseplumbing.example/", derivedAt: at },
      },
      {
        id: SVC2,
        schema: "ping.social.service@1",
        controllerId: "lane-e-oneclick",
        visibility: "public",
        title: "Water Heaters",
        description: "Water heater install and repair.",
        fields: {},
        createdAt: at,
        updatedAt: at,
        provenance: { kind: "website-derived", ref: "website-ingestion:https://desertroseplumbing.example/", derivedAt: at },
      },
      {
        id: LOC,
        schema: "ping.social.location@1",
        controllerId: "lane-e-oneclick",
        visibility: "public",
        title: "Moab, Utah, 84532, United States",
        description: "",
        fields: { locality: "Moab, Utah, 84532, United States" },
        createdAt: at,
        updatedAt: at,
        provenance: { kind: "website-derived", ref: "website-ingestion:https://desertroseplumbing.example/", derivedAt: at },
      },
    ],
    relationships: [
      {
        id: "syn-r1", predicate: "offers", subject: BIZ, object: SVC1,
        status: "active", createdAt: at, evidenceRef: "syn",
      },
      {
        id: "syn-r2", predicate: "offers", subject: BIZ, object: SVC2,
        status: "active", createdAt: at, evidenceRef: "syn",
      },
      {
        id: "syn-r3", predicate: "located_at", subject: BIZ, object: LOC,
        status: "active", createdAt: at, evidenceRef: "syn",
      },
    ],
  };
}

function bundle(): SiteBundle {
  const graph = syntheticGraph();
  const spec = generateSiteSpec(graph, { generatedAt: "2026-09-24T00:00:00.000Z" });
  return {
    siteId: "desert-rose-plumbing",
    businessName: "Desert Rose Plumbing",
    graph, spec, findings: [], renderable: true, mediaManifest: null,
  };
}

function ask(question: string, input?: Partial<AnswerAskFydInput>, b?: SiteBundle) {
  const bb = b ?? bundle();
  const out = answerAskFyd(
    { siteId: "desert-rose-plumbing", question, mode: "visitor", ...input },
    { loadBundle: (id) => (id === "desert-rose-plumbing" ? bb : null) },
  );
  if (!out.ok) throw new Error(`ask failed: ${out.error.kind}`);
  return out;
}

describe("LANE E one-click proof (synthetic tenant, zero wiring)", () => {
  test("generated spec routes to the business; questions answer from the graph", () => {
    const services = ask("What services do you offer?");
    expect(services.refusal).toBe(false);
    expect(services.answer).toContain("Drain Cleaning");
    expect(services.answer).toContain("Water Heaters");

    const contact = ask("How can I contact you?");
    expect(contact.answer).toContain("435-555-0119");

    const where = ask("Where are you located?");
    expect(where.answer).toContain("Moab");

    const emergency = ask("Do you offer emergency service?");
        expect(emergency.answer).toContain("does not offer emergency service");
    expect(emergency.unknowns).toContain("emergency");

    const coverage = ask("What don't you know?");
    expect(coverage.answer).toContain("Not on record");
  });

  test("FYD-Q1 on the synthetic tenant: conflicted phone is verified-copy", () => {
    const conflict: AskFieldConflict = {
      objectId: BIZ, field: "phone", status: "unresolved",
      observations: [
        { value: "435-555-0119", provenanceKind: "website-ingestion", provenanceRef: "website-ingestion:https://desertroseplumbing.example/", derivedAt: "2026-09-24T12:00:00Z" },
        { value: "435-555-0199", provenanceKind: "canonical-journal", provenanceRef: "canonical-journal:evt-9", derivedAt: "2026-09-24T13:00:00Z" },
      ],
    };
    const out = ask("What is your phone number?", { fieldConflicts: [conflict] });
    expect(out.answer).toContain("Contact information is being verified.");
    expect(out.answer).not.toContain("435-555-0119");
    expect(out.answer).not.toContain("435-555-0199");
  });

  test("FYD-Q2 on the synthetic tenant: hidden address, zero disclosure", () => {
    const out = ask("Where are you located?", {
      fieldVisibilityDecisions: [
        {
          objectId: BIZ, field: "address", policy: "hide", decidedBy: "owner",
          decidedAt: "2026-09-24T15:00:00.000Z", source: "owner_override", version: 1,
        },
      ],
    });
    expect(out.answer).toContain("No public location is on record");
    expect(out.answer).not.toContain("Moab");
    expect(out.answer).not.toContain("84532");
  });
});
