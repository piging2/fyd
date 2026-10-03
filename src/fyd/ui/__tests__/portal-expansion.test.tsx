import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parse } from "node-html-parser";
import { compactEngagedDiameter, FIRST_STAGE_MAX_D, portalOriginTransform } from "../portal-motion";
import { ImmersiveWebsiteView, PortalWebsitePreview } from "../portal-website-preview";
import { MobileImmersivePopup, PortalCircle } from "../portal-circle";
import type { PortalProjection } from "../../preview/types";

const portal: PortalProjection = {
  circle: {
    id: "happy-place", name: "Happy Place", category: "Carpentry", locationLabel: null,
    tagline: "", topFacts: [], capabilities: [{ kind: "view" }], sampleQuestions: [],
    provenanceLabel: "Information from the business website", provenanceDetail: "https://example.com/",
    background: { kind: "gradient", css: "none", digest: "", observedAt: "", basis: "" },
  },
  logo: { src: "/marks/happy-place-tape-measure.webp", digest: "", basis: "Owner asset", ownerSupplied: true },
  preview: null,
  websiteHref: "https://example.com/",
};

describe("portal expansion continuity", () => {
  test.each([
    [{ x: 40, y: 300, width: 64, height: 64 }, { x: 210, y: 300 }, 240],
    [{ x: 1420, y: 110, width: 112, height: 112 }, { x: 1260, y: 160 }, 320],
    [{ x: 1200, y: 850, width: 91, height: 91 }, { x: 1130, y: 650 }, 400],
  ])("starts exactly at the visible mark, including interrupted hover scale", (origin, center, d) => {
    const t = portalOriginTransform(origin, center, d);
    expect(center.x + t.x - d * t.scaleX / 2).toBeCloseTo(origin.x - origin.width / 2);
    expect(center.y + t.y - d * t.scaleY / 2).toBeCloseTo(origin.y - origin.height / 2);
    expect(d * t.scaleX).toBeCloseTo(origin.width);
    expect(d * t.scaleY).toBeCloseTo(origin.height);
  });

  test("resting owner object keeps the actual WebP without a disc or initials", () => {
    const noOp = () => {};
    const dom = parse(renderToStaticMarkup(<PortalCircle portal={portal} slot={null}
      aware={false} engaged={false} onAware={noOp} onUnaware={noOp}
      onEngageRequest={noOp} onRelease={noOp} onAskRequest={noOp} />));
    const trigger = dom.querySelector('button[aria-haspopup="dialog"]')!;
    expect(trigger.querySelector('img')?.getAttribute('src')).toBe(portal.logo!.src);
    expect(trigger.classNames).not.toContain('rounded-full');
    expect(trigger.classNames).not.toContain('overflow-hidden');
    expect(trigger.text).toBe("");
    expect(trigger.getAttribute('style')).toContain('box-shadow:none');
  });

  test("expanded preview retains the same logo, evidence, and safe external escape", () => {
    const html = renderToStaticMarkup(<PortalWebsitePreview portal={portal} href={portal.websiteHref!} />);
    const dom = parse(html);
    expect(dom.querySelector('header img')?.getAttribute('src')).toBe(portal.logo!.src);
    expect(dom.querySelector('header img')?.classNames).not.toContain('rounded-full');
    expect(dom.querySelector('button[aria-label="About this object"]')).not.toBeNull();
    expect(dom.querySelector('iframe')?.getAttribute('sandbox')).toBe('allow-scripts allow-forms allow-popups');
    expect(dom.querySelector('iframe')?.parentNode).not.toBe(dom.querySelector('header'));
    expect(dom.querySelector('a')?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(dom.querySelector('a')?.getAttribute('href')).toBe(portal.websiteHref);
    expect(dom.text).toContain('Loading website');
    expect(dom.text).not.toContain('Live');
  });
});

describe("two-stage expansion (Nolan 2026-10-02)", () => {
  test("first-stage desktop expansion is compact, never page-filling", () => {
    expect(FIRST_STAGE_MAX_D).toBe(300);
    expect(compactEngagedDiameter(480)).toBe(300);
    expect(compactEngagedDiameter(320)).toBe(300);
    expect(compactEngagedDiameter(240)).toBe(240);
    expect(compactEngagedDiameter(200)).toBe(200);
  });

  const popupProps = (stage: "compact" | "full") => ({
    portal,
    stage,
    following: false as boolean | null,
    liked: false as boolean | null,
    canFollow: true,
    canLike: true,
    canAsk: true,
    webHref: portal.websiteHref,
    onToggleFollow: () => {},
    onToggleLike: () => {},
    onAskRequest: () => {},
    onExpand: () => {},
    onClose: () => {},
    reduceMotion: false,
  });

  test("mobile first tap: compact object popup, not a full screen", () => {
    const dom = parse(renderToStaticMarkup(<MobileImmersivePopup {...popupProps("compact")} />));
    expect(dom.querySelector(".fyd-popup-compact")).not.toBeNull();
    expect(dom.querySelector(".fyd-popup-full")).toBeNull();
    // Second-tap affordance: explicit expand button and tappable preview.
    expect(dom.querySelector('button[aria-label="Expand to full screen"]')).not.toBeNull();
    // The live website fills the popup.
    expect(dom.querySelector("iframe")).not.toBeNull();
    // Compact frame is a rounded object, never a circle and never the screen.
    const frame = dom.querySelector(".fyd-popup-compact")!;
    expect(frame.classNames).not.toContain("rounded-full");
    expect(frame.classNames).not.toContain("inset-0");
  });

  test("mobile second tap: full screen, no expand affordance", () => {
    const dom = parse(renderToStaticMarkup(<MobileImmersivePopup {...popupProps("full")} />));
    expect(dom.querySelector(".fyd-popup-full")).not.toBeNull();
    expect(dom.querySelector(".fyd-popup-compact")).toBeNull();
    expect(dom.querySelector('button[aria-label="Expand to full screen"]')).toBeNull();
    expect(dom.querySelector("iframe")).not.toBeNull();
    // Still closable.
    expect(dom.querySelector('button[aria-label="Close Happy Place"]')).not.toBeNull();
  });

  test("overlay text is outlined shiny, never drop shadow", () => {
    const dom = parse(renderToStaticMarkup(<MobileImmersivePopup {...popupProps("compact")} />));
    const name = dom.querySelector(".fyd-shiny-text");
    expect(name).not.toBeNull();
    expect(name!.text).toContain("Happy Place");
    const styleText = dom.querySelectorAll("style").map((s) => s.text).join("\n");
    expect(styleText).toContain("-webkit-text-stroke");
    expect(styleText).toContain("@keyframes fyd-sheen");
    expect(styleText).not.toContain("text-shadow");
    // No circles anywhere in the popup chrome.
    expect(dom.querySelector(".fyd-popup-compact")!.classNames).not.toContain("rounded-full");
  });

  test("live view drifts, with a reduced-motion guard", () => {
    const dom = parse(renderToStaticMarkup(<MobileImmersivePopup {...popupProps("compact")} />));
    const styleText = dom.querySelectorAll("style").map((s) => s.text).join("\n");
    expect(styleText).toContain("@keyframes fyd-drift");
    expect(styleText).toContain("@media (prefers-reduced-motion: reduce)");
    // SSR has no reduced-motion preference: drift is on by default.
    expect(dom.querySelector(".fyd-drift")).not.toBeNull();
  });

  test("immersive view keeps the sandboxed live iframe and safe escape", () => {
    const dom = parse(
      renderToStaticMarkup(
        <ImmersiveWebsiteView portal={portal} title="Happy Place" onClose={() => {}} actions={null} />,
      ),
    );
    const iframe = dom.querySelector("iframe")!;
    expect(iframe.getAttribute("sandbox")).toBe("allow-scripts allow-forms allow-popups");
    expect(iframe.getAttribute("src")).toBe(`/api/live/${encodeURIComponent("happy-place")}`);
    // Non-interactive: the overlay owns taps.
    expect(iframe.getAttribute("class")).toContain("pointer-events-none");
  });
});
