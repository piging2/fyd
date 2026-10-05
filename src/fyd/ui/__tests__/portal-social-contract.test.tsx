import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parse } from "node-html-parser";
import { PortalCircle, MobileImmersivePopup } from "../portal-circle";
import { PortalWebsitePreview } from "../portal-website-preview";
import { ObjectRelationshipFeedback } from "../object-relationship-feedback";
import { explainCandidateRank } from "@/fyd/rank/object-ranker";
import { evaluateSponsoredPlacement } from "@/fyd/rank/sponsored-placement";
import type { ObjectDisplayContext } from "@/fyd/presentation/object-context";
import type { PortalProjection } from "@/fyd/preview/types";

const noOp = () => {};
const portal: PortalProjection = {
  circle: { id: "happy-place", name: "Happy Place", category: "Carpentry", locationLabel: null,
    tagline: "", topFacts: [], capabilities: [{ kind: "view" }, { kind: "follow" }, { kind: "like" }, { kind: "ask" }],
    sampleQuestions: [], provenanceLabel: "Information from the business website", provenanceDetail: "Source reference",
    background: { kind: "gradient", css: "none", digest: "", observedAt: "", basis: "" } },
  logo: null, preview: null, websiteHref: "https://example.com/",
};
function paidContext(): ObjectDisplayContext {
  const now = Date.now();
  const candidate = explainCandidateRank({ objectId: portal.circle.id, semanticProximity: .8, semanticTargetPresent: true,
    followed: false, liked: false, capabilityCount: 4, recentInteractionAt: null, slotStability: 1, slotCollisionRisk: 0 }, now);
  const result = evaluateSponsoredPlacement({ objectId: portal.circle.id, placementId: "test-placement", campaignId: "test-campaign",
    payerId: "test-payer", sponsorDisplayName: "Test sponsor", disclosure: "Sponsored", reason: "Selected for this test surface",
    targeting: { kind: "surface", sourceRef: "fixture:surface" }, surface: "test-surface", campaignStatus: "active",
    startsAt: now - 1, endsAt: now + 60000 }, candidate, {
    surface: "test-surface", now, viewerScopeRef: "test-session",
    policy: { minimumRelevance: .5, maxSponsoredPlacements: 1, maxSponsoredShare: .25, minOrganicBetweenSponsored: 2,
      maxObjectImpressionsPerWindow: 2, frequencyWindowMs: 60000, snapshotMaxAgeMs: 30000 },
    authorities: [{ placementId: "test-placement", campaignId: "test-campaign", payerId: "test-payer", surface: "test-surface",
      grant: "ad.buy", decision: "allowed", decisionRef: "fixture:decision", budgetScopeRef: "fixture:budget",
      budget: "within-scope", checkedAt: now, validUntil: now + 30000 }],
    exposures: [{ objectId: portal.circle.id, surface: "test-surface", viewerScopeRef: "test-session",
      windowStartedAt: now - 60000, observedAt: now, impressions: 0 }],
  });
  if (!result.eligible) throw Error(result.reason);
  return { surface: "test-surface", rankReasons: candidate.reasons, sponsorship: result.placement };
}
function popup(stage: "compact" | "full", displayContext?: ObjectDisplayContext) {
  return <MobileImmersivePopup portal={portal} displayContext={displayContext} stage={stage}
    following={false} liked={false} canFollow canLike canAsk webHref={portal.websiteHref}
    onToggleFollow={noOp} onToggleLike={noOp} onAskRequest={noOp} onExpand={noOp} onClose={noOp} reduceMotion />;
}

test("eligible paid context stays disclosed around the real mark on each portal surface", () => {
  const context = paidContext();
  const before = JSON.stringify(portal);
  const surfaces = [
    <PortalCircle key="rest" portal={portal} displayContext={context} slot={null} aware={false} engaged={false}
      onAware={noOp} onUnaware={noOp} onEngageRequest={noOp} onRelease={noOp} onAskRequest={noOp} />,
    <PortalWebsitePreview key="desktop" portal={portal} displayContext={context} href={portal.websiteHref!} />,
    popup("compact", context), popup("full", context),
  ];
  for (const surface of surfaces) {
    const dom = parse(renderToStaticMarkup(surface));
    expect(dom.querySelector('[data-fyd-sponsored="test-placement"]')).not.toBeNull();
    expect(dom.querySelector('img[src="/marks/happy-place-tape-measure.webp"]')).not.toBeNull();
    expect(dom.text).not.toContain("Verified");
  }
  expect(JSON.stringify(portal)).toBe(before);
});

test("deep-link/organic context has no persistent paid label; mismatched context hides the placement", () => {
  expect(parse(renderToStaticMarkup(popup("full"))).querySelector('[data-fyd-sponsored]')).toBeNull();
  const mismatch = { ...paidContext(), surface: "another-surface" };
  expect(renderToStaticMarkup(popup("compact", mismatch))).toBe("");
  expect(renderToStaticMarkup(<PortalWebsitePreview portal={portal} href={portal.websiteHref!} displayContext={mismatch} />)).toBe("");
});

test("mobile identity, evidence and individual controls survive without a nested button container", () => {
  const dom = parse(renderToStaticMarkup(popup("compact", paidContext())));
  expect(dom.querySelector('[role="dialog"]')?.getAttribute("tabindex")).toBe("-1");
  expect(dom.querySelector('button[data-object-close]')).not.toBeNull();
  expect(dom.querySelector('[role="button"] button')).toBeNull();
  expect(dom.text).toContain("Information from the business website");
  expect(dom.text).toContain("Why am I seeing this?");
  expect(dom.querySelector('button[aria-pressed="false"]')).not.toBeNull();
  expect(dom.querySelector('iframe')?.getAttribute("tabindex")).toBe("-1");
  const css = dom.querySelector('style')!.text;
  expect(css).toContain("prefers-reduced-motion");
  expect(css).not.toContain("infinite");
});

test("social failure shows a retry and does not announce a successful write", () => {
  const dom = parse(renderToStaticMarkup(<ObjectRelationshipFeedback follow={{ state: false, status: "retryable-error",
    scope: "demo-session", message: "Your choice could not be confirmed.", toggle: async () => {}, retry: async () => {} }} />));
  expect(dom.text).toContain("Private demo preferences");
  expect(dom.querySelector('[role="status"]')?.text).toContain("could not be confirmed");
  expect(dom.querySelector('button')?.text).toBe("Retry follow");
  expect(dom.text).not.toContain("Saved");
});
