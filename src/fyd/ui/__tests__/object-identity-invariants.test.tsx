import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parse } from "node-html-parser";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { resolveObjectPresentationIdentity } from "../../presentation/identity";
import { ObjectIdentityMark } from "../../presentation/object-identity-mark";
import type { ObjectDisplayContext } from "../../presentation/object-context";
import { ObjectCard } from "../../object/card";
import { ObjectNode } from "../../object/node";
import { ObjectNodeView } from "@/app/o/[objectId]/object-node-view";
import { objectViewToProjection } from "../../object/object-projection";
import type { ObjectView } from "../../object/types";
import { evaluateSponsoredPlacement } from "../../rank/sponsored-placement";
import { explainCandidateRank } from "../../rank/object-ranker";

const markPath = "/marks/happy-place-tape-measure.webp";
const view: ObjectView = {
  id: "happy-place", schema: "ping.social.business@1", name: "Happy Place",
  category: null, locationLabel: null, summary: "Existing business description", media: [],
  services: [{ id: "service-1", name: "Existing service", basis: "structured", basisLabel: "Source", visible: true }],
  serviceArea: [], contact: { phone: null, email: null, website: null, locality: null, addressVisibility: "public" },
  capabilities: [], provenance: { kind: "observed", ref: "https://example.com", derivedAt: "2026-10-01T00:00:00Z", label: "Existing evidence" },
  ownerUpdatedAt: null, sampleQuestions: [], fieldCorrections: [],
};
const projection = objectViewToProjection(view);
const renderers = [
  ["card", (displayContext?: ObjectDisplayContext) => <ObjectCard projection={projection} displayContext={displayContext} />],
  ["node", (displayContext?: ObjectDisplayContext) => <ObjectNode projection={projection} displayContext={displayContext} />],
  ["deep object view", (displayContext?: ObjectDisplayContext) => <ObjectNodeView view={view} tenantId={null} displayContext={displayContext} />],
] as const;

function paidContext(): ObjectDisplayContext {
  const now = Date.now();
  const result = evaluateSponsoredPlacement({
    placementId: "placement-1", objectId: view.id, campaignId: "campaign-1", payerId: "payer-1",
    sponsorDisplayName: "Example sponsor", disclosure: "Sponsored", reason: "Related to this page.",
    targeting: { kind: "surface", sourceRef: "context-1" }, surface: "test", campaignStatus: "active", startsAt: now - 1000, endsAt: now + 60000,
  }, explainCandidateRank({ objectId: view.id, semanticProximity: .8, semanticTargetPresent: true, followed: false, liked: false,
    capabilityCount: 1, recentInteractionAt: null, slotStability: 1, slotCollisionRisk: 0 }, now), {
    surface: "test", now, viewerScopeRef: "viewer-1", policy: { minimumRelevance: .5, maxSponsoredPlacements: 1,
      maxSponsoredShare: .5, minOrganicBetweenSponsored: 1, maxObjectImpressionsPerWindow: 4, frequencyWindowMs: 60000, snapshotMaxAgeMs: 60000 },
    authorities: [{ placementId: "placement-1", campaignId: "campaign-1", payerId: "payer-1", surface: "test", grant: "ad.buy",
      decision: "allowed", decisionRef: "decision-1", budgetScopeRef: "budget-1", budget: "within-scope", checkedAt: now, validUntil: now + 60000 }],
    exposures: [{ objectId: view.id, surface: "test", viewerScopeRef: "viewer-1", windowStartedAt: now - 60000, observedAt: now, impressions: 0 }],
  });
  if (!result.eligible) throw new Error(result.reason);
  return { surface: "test", sponsorship: result.placement };
}

describe("shared presentation identity", () => {
  test("keeps the existing WebP bytes unchanged", () => {
    const bytes = readFileSync(join(process.cwd(), "public", markPath));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe("fb5e2ba8e6f6ea772c42e29605b276bfc9e4cae117e0af96e742e486b931ae88");
  });
  test("slug and exact business id resolve the same cutout without mutating data", () => {
    const original = JSON.stringify(view);
    const slug = resolveObjectPresentationIdentity(view);
    const canonical = resolveObjectPresentationIdentity({ ...view, id: "website-business-6fa5ebd99d72c4cb" });
    expect(slug.mark).toEqual(canonical.mark);
    expect(slug.mark?.src).toBe(markPath);
    expect(slug.shapeMode).toBe("cutout");
    expect(JSON.stringify(view)).toBe(original);
  });
  test.each(["happy-place-service", "website-business-6fa5ebd99d72c4cb-location", "other-business"])("does not infer owner identity for %s", (id) => {
    expect(resolveObjectPresentationIdentity({ id, name: "Happy Place" }).mark).toBeNull();
  });
  test("logo wins over gallery and supplied image, while a service keeps its own media", () => {
    const media = [{ role: "gallery", src: "/photo.webp" }, { role: "logo", src: "/service-logo.webp" }];
    const service = resolveObjectPresentationIdentity({ id: "service-1", name: "Service", media, image: { src: "/alternate.webp" } });
    expect(service.mark?.src).toBe("/service-logo.webp");
    const business = resolveObjectPresentationIdentity({ ...view, media });
    expect(business.mark?.src).toBe(markPath);
    expect(business.image?.src).toBe("/photo.webp");
  });
  test("mark cannot gain a disc or crop from generic avatar styles", () => {
    const dom = parse(renderToStaticMarkup(<ObjectIdentityMark object={view} size={64}
      style={{ background: "white", borderRadius: "50%", padding: 4, objectFit: "cover", clipPath: "circle(50%)" }} />));
    const img = dom.querySelector("img")!;
    expect(img.getAttribute("src")).toBe(markPath);
    expect(img.getAttribute("style")).toContain("border-radius:0");
    expect(img.getAttribute("style")).toContain("background:transparent");
    expect(img.getAttribute("style")).toContain("object-fit:contain");
    expect(img.getAttribute("style")).toContain("clip-path:none");
    expect(img.getAttribute("alt")).toBe(view.name);
    expect(dom.text).not.toContain("HP");
  });
  test.each(renderers)("%s retains the same mark and defaults to organic", (_name, render) => {
    const dom = parse(renderToStaticMarkup(render()));
    expect(dom.querySelector(`img[src="${markPath}"]`)).not.toBeNull();
    expect(dom.querySelector("[data-fyd-sponsored]")).toBeNull();
    expect(dom.text).toContain(view.summary);
  });
  test.each(renderers)("%s displays paid disclosure and explanation only for eligible context", (_name, render) => {
    const dom = parse(renderToStaticMarkup(render(paidContext())));
    expect(dom.querySelector("[data-fyd-sponsored]")?.text).toContain("Sponsored");
    expect(dom.text).toContain("Example sponsor");
    expect(dom.text).toContain("Why am I seeing this?");
    expect(dom.text).toContain("Related to this page.");
  });
  test.each(renderers)("%s suppresses an expired supplied paid placement entirely", (_name, render) => {
    const context = paidContext();
    context.sponsorship = { ...context.sponsorship!, validUntil: Date.now() - 1 };
    expect(renderToStaticMarkup(render(context))).toBe("");
  });
  test.each(renderers)("%s suppresses paid context for another object or surface", (_name, render) => {
    const context = paidContext();
    expect(renderToStaticMarkup(render({ ...context, surface: "elsewhere" }))).toBe("");
    context.sponsorship = { ...context.sponsorship!, objectId: "other-business" };
    expect(renderToStaticMarkup(render(context))).toBe("");
  });
});
