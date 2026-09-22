/**
 * Demo-content honesty (2026-09-22): overlay-authored (demo/overlay)
 * content must never be classified or presented as a recorded fact or as
 * the website's own words.
 *
 * Covers:
 * - ask-composer classificationFromProvenance: overlay-authored ->
 *   DEMO_SYNTHETIC (never DIRECT_FACT)
 * - visitor-answer claimClassFor("DEMO_SYNTHETIC") -> "supported"
 *   (evidence-backed by the adding event, source labeled in the citation)
 * - visitor-answer citationFor: source "Site record (demo addition)",
 *   basis "Demo content added by the site operator..."
 * - end to end: answerAskFyd over a bundle whose only service is
 *   overlay-authored answers the fixed services question with honest
 *   citations, never "Recorded fact from the site data"
 *
 * Run with: npx jest --config src/fyd/ask/jest.config.cjs demo-classification
 */

import { buildAskContext, composeAnswer } from "../../../lib/ping/ask-composer";
import { answerAskFyd, claimClassFor } from "../visitor-answer";
import type {
  PingObject,
  PingRelationship,
} from "../../../lib/ping/types";
import type { ObjectGraph, FYDSiteSpec } from "../../sitespec/types";
import type { SiteBundle } from "../../media/site-bundle";

const QUESTION = "What services does this business offer, and how do you know?";

function businessObject(): PingObject {
  return {
    id: "biz-1",
    schema: "ping.social.business@1",
    controllerId: "owner-test",
    visibility: "public",
    title: "Demo Shop",
    description: "A demo shop.",
    fields: {},
    provenance: {
      kind: "website-derived",
      ref: "website-ingestion:https://demo.test/",
      derivedAt: "2026-09-22T12:00:00Z",
    },
    createdAt: "2026-09-22T00:00:00.000Z",
    updatedAt: "2026-09-22T00:00:00.000Z",
  };
}

/** A service the demo operator added: not the website's words, not a fact. */
function demoServiceObject(): PingObject {
  return {
    id: "svc-demo-1",
    schema: "ping.social.service@1",
    controllerId: "owner-test",
    visibility: "public",
    title: "Pergola Design Consultations",
    description: "A demo-added service.",
    fields: { name: "Pergola Design Consultations" },
    provenance: {
      kind: "overlay-authored",
      ref: "ping-event:demo-add-service",
      derivedAt: "2026-09-22T12:00:00Z",
    },
    createdAt: "2026-09-22T00:00:00.000Z",
    updatedAt: "2026-09-22T00:00:00.000Z",
  };
}

function demoBundle(): SiteBundle {
  const business = businessObject();
  const svc = demoServiceObject();
  const rel: PingRelationship = {
    id: "rel-demo-1",
    subject: business.id,
    predicate: "provides",
    object: svc.id,
    status: "active",
    createdAt: "2026-09-22T00:00:00.000Z",
    evidenceRef: "ping-event:demo-add-service",
  };
  const graph: ObjectGraph = { objects: [business, svc], relationships: [rel] };
  const spec = { ownerObjectId: business.id, pages: [] } as unknown as FYDSiteSpec;
  return {
    siteId: "demo-test",
    businessName: "Demo Shop",
    graph,
    spec,
    findings: [],
    renderable: true,
    mediaManifest: null,
  };
}

describe("demo content classification", () => {
  test("composer classifies overlay-authored objects as DEMO_SYNTHETIC", () => {
    const business = businessObject();
    const svc = demoServiceObject();
    const ctx = buildAskContext({
      viewer: { id: null, displayName: null },
      target: business,
      relatedObjects: [svc],
      relationships: [],
      plan: null,
      fieldClasses: {},
    });
    const answer = composeAnswer(ctx, QUESTION);
    const classes = answer.claimClassifications.map((c) => c.classification);
    // The service-name claim must be DEMO_SYNTHETIC, never DIRECT_FACT.
    expect(classes).toContain("DEMO_SYNTHETIC");
    expect(classes).not.toContain("DIRECT_FACT");
  });

  test("claimClassFor keeps DEMO_SYNTHETIC supported with honest attribution", () => {
    expect(claimClassFor("DEMO_SYNTHETIC")).toBe("supported");
    expect(claimClassFor("DIRECT_FACT")).toBe("supported");
    expect(claimClassFor("INFERENCE")).toBe("derived");
  });

  test("answerAskFyd cites demo services as demo additions, not facts", () => {
    const outcome = answerAskFyd(
      { siteId: "demo-test", question: QUESTION, mode: "visitor" },
      { loadBundle: () => demoBundle() },
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error("expected ok outcome");
    expect(outcome.refusal).toBe(false);
    expect(outcome.answer).toContain("Pergola Design Consultations");
    expect(outcome.citations.length).toBeGreaterThan(0);
    const sources = outcome.citations.map((c) => c.source);
    expect(sources).toContain("Site record (demo addition)");
    const demoCitations = outcome.citations.filter(
      (c) => c.source === "Site record (demo addition)",
    );
    expect(demoCitations.length).toBeGreaterThan(0);
    for (const c of demoCitations) {
      // Demo content is never presented as a recorded fact or as the
      // website's own words.
      expect(c.source).not.toBe("Site record (canonical journal)");
      expect(c.source).not.toContain("business website");
      expect(c.basis).toContain("Demo content added by the site operator");
      expect(c.basis).not.toBe("Recorded fact from the site data");
      expect(c.claimClass).toBe("supported");
    }
    for (const c of outcome.citations) {
      expect(c.source).not.toBe("Site record (canonical journal)");
      expect(c.basis).not.toBe("Recorded fact from the site data");
      expect(c.claimClass).toBe("supported");
    }
    const bases = outcome.citations.map((c) => c.basis).join(" ");
    expect(bases).toContain("Demo content added by the site operator");
    // The laundering sentence must be gone from the whole answer surface.
    expect(outcome.answer).not.toContain("Recorded fact from the site data");
    expect(bases).not.toContain("Recorded fact from the site data");
  });
});
