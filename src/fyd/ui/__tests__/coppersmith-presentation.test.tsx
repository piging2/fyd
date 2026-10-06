import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parse } from "node-html-parser";
import { resolveObjectPresentationIdentity } from "../../presentation/identity";
import { ObjectIdentityMark } from "../../presentation/object-identity-mark";
import { PortalCircle } from "../portal-circle";
import { ImmersiveWebsiteView, PortalWebsitePreview } from "../portal-website-preview";
import type { PortalProjection } from "../../preview/types";

const business = { id: "coppersmith-plumbing", name: "Coppersmith Plumbing - HVAC - Mechanical" };
const lightSrc = "/marks/coppersmith-logo-on-light.webp";
const darkSrc = "/marks/coppersmith-logo-on-dark.webp";
const portal: PortalProjection = {
  circle: {
    ...business, category: "Plumbing, HVAC, Mechanical", locationLabel: null,
    tagline: "", topFacts: [], capabilities: [{ kind: "view" }], sampleQuestions: [],
    provenanceLabel: "Information from the business website", provenanceDetail: "https://www.coppersmithplumbing.com/",
    background: { kind: "gradient", css: "none", digest: "", observedAt: "", basis: "" },
  },
  logo: resolveObjectPresentationIdentity(business).mark,
  preview: {
    src: "/website-preview.webp", thumbSrc: "/website-preview-thumb.webp", srcSet: "/website-preview.webp 1x",
    width: 800, height: 600, focalX: .5, focalY: .3, basis: "Website preview",
    provenance: { source: "website", capturedAt: "2026-10-04T00:00:00Z", captureMethod: "screenshot", digest: "preview", url: "https://www.coppersmithplumbing.com/" },
  },
  websiteHref: "https://www.coppersmithplumbing.com/",
};

describe("authorized Coppersmith logo presentation", () => {
  test("harvested artwork is a cutout without claiming an owner upload", () => {
    const identity = resolveObjectPresentationIdentity(business);
    expect(identity.mark?.ownerSupplied).toBe(false);
    expect(identity.mark?.cutout).toBe(true);
    expect(identity.shapeMode).toBe("cutout");
  });

  test("light surfaces use black lettering and dark surfaces use the official white alternate", () => {
    const light = resolveObjectPresentationIdentity(business);
    const dark = resolveObjectPresentationIdentity(business, "dark");
    expect(light.mark?.src).toBe(lightSrc);
    expect(resolveObjectPresentationIdentity(business, "light").mark).toEqual(light.mark);
    expect(dark.mark?.src).toBe(darkSrc);
    expect(dark.mark?.srcSet).toContain("coppersmith-logo-on-dark@3x.webp 3x");
    expect(dark.mark?.digest).not.toBe(light.mark?.digest);
    const image = parse(renderToStaticMarkup(<ObjectIdentityMark object={business} size={64} />)).querySelector("img")!;
    expect(image.getAttribute("src")).toBe(lightSrc);
    expect(image.getAttribute("style")).toContain("background:transparent");
  });

  test.each(["light", "dark"] as const)("slug and exact business id share the same %s artwork", (surface) => {
    const canonical = { ...business, id: "website-business-2f1327c09d622175" };
    const before = JSON.stringify(canonical);
    expect(resolveObjectPresentationIdentity(canonical, surface).mark).toEqual(resolveObjectPresentationIdentity(business, surface).mark);
    expect(JSON.stringify(canonical)).toBe(before);
  });

  test.each(["coppersmith-plumbing-service", "website-business-2f1327c09d622175-location", "other-business"])("%s never inherits the business mark through its name or id prefix", (id) => {
    expect(resolveObjectPresentationIdentity({ id, name: business.name }).mark).toBeNull();
    expect(resolveObjectPresentationIdentity({ id, name: business.name, media: [{ role: "logo", src: "/own-service-logo.webp" }] }).mark?.src).toBe("/own-service-logo.webp");
  });

  test("non-owner cutout beats the website preview and keeps its footprint without a disc or rim", () => {
    const noOp = () => {};
    const dom = parse(renderToStaticMarkup(<PortalCircle portal={portal} slot={null}
      aware={false} engaged={false} onAware={noOp} onUnaware={noOp}
      onEngageRequest={noOp} onRelease={noOp} onAskRequest={noOp} />));
    const trigger = dom.querySelector('button[aria-haspopup="dialog"]')!;
    const image = trigger.querySelector("img")!;
    expect(image.getAttribute("src")).toBe(darkSrc);
    expect(image.classNames).toContain("object-contain");
    expect(image.classNames).not.toContain("bg-white");
    expect(trigger.classNames).toContain("bg-transparent");
    expect(trigger.classNames).not.toContain("rounded-full");
    expect(trigger.classNames).not.toContain("overflow-hidden");
    expect(trigger.getAttribute("style")).toContain("box-shadow:none");
    expect(trigger.getAttribute("style")).toContain("width:64px;height:64px");
    expect(trigger.querySelector("span")).toBeNull();
    expect(trigger.text).toBe("");
    expect(trigger.querySelector('img[src="/website-preview-thumb.webp"]')).toBeNull();
  });

  test("expanded dark header retains the official white alternate and density variants", () => {
    const dom = parse(renderToStaticMarkup(<PortalWebsitePreview portal={portal} href={portal.websiteHref!} />));
    const image = dom.querySelector("header img")!;
    expect(image.getAttribute("src")).toBe(darkSrc);
    expect(image.getAttribute("srcSet")).toContain("coppersmith-logo-on-dark@3x.webp 3x");
  });

  test("immersive dark overlay retains the same white alternate", () => {
    const dom = parse(renderToStaticMarkup(<ImmersiveWebsiteView portal={portal} title={business.name} onClose={() => {}} actions={null} />));
    const image = dom.querySelector(`img[src="${darkSrc}"]`)!;
    expect(image).not.toBeNull();
    expect(image.getAttribute("srcSet")).toContain("coppersmith-logo-on-dark@3x.webp 3x");
    expect(dom.querySelector(`img[src="${lightSrc}"]`)).toBeNull();
  });
});
