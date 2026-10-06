import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parse } from "node-html-parser";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { PingWordmark } from "@/components/ping-wordmark";
import { resolveObjectPresentationIdentity } from "../../presentation/identity";
import { HOMEPAGE_CIRCLE_SITE_IDS } from "../../preview/pipeline";
import { PortalCircle } from "../portal-circle";
import type { PortalProjection } from "../../preview/types";

const ping = { id: "ping-fyd", name: "PING Social" };
const markPath = "/marks/ping-social-cutout.webp";

describe("shared transparent PING artwork", () => {
  test("header and exact business identities share the same extracted asset", () => {
    const header = parse(renderToStaticMarkup(<PingWordmark />)).querySelector("img")!;
    const identity = resolveObjectPresentationIdentity(ping);
    expect(header.getAttribute("src")).toBe(markPath);
    expect(header.getAttribute("srcSet")).toBe(identity.mark?.srcSet);
    expect(header.classNames).toContain("h-10");
    expect(header.classNames).toContain("w-auto");
    expect(header.getAttribute("style")).toContain("background:transparent");
    expect(header.getAttribute("width")).toBe("96");
    expect(header.getAttribute("height")).toBe("62");
    for (const id of ["ping-fyd-business", "web:business:ping-social"]) {
      expect(resolveObjectPresentationIdentity({ ...ping, id }).mark).toEqual(identity.mark);
    }
    expect(identity.shapeMode).toBe("cutout");
    expect(identity.mark?.ownerSupplied).toBe(false);
    const bytes = readFileSync(join(process.cwd(), "public", markPath));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(identity.mark?.digest);
  });

  test("services and synthetic tenants do not inherit PING artwork by name", () => {
    for (const id of ["ping-fyd-svc-calls", "ping-fyd-business-location", "tenant-e2e-synth"]) {
      expect(resolveObjectPresentationIdentity({ ...ping, id }).mark).toBeNull();
    }
  });

  test("the resting PING object displays the header artwork without a badge", () => {
    const portal: PortalProjection = {
      circle: {
        ...ping, category: null, locationLabel: null, tagline: "", topFacts: [],
        capabilities: [{ kind: "view" }], sampleQuestions: [], provenanceLabel: "Owner-supplied information",
        provenanceDetail: "", background: { kind: "gradient", css: "none", digest: "", observedAt: "", basis: "" },
      },
      logo: null, preview: null, websiteHref: null,
    };
    const noOp = () => {};
    const dom = parse(renderToStaticMarkup(<PortalCircle portal={portal} slot={null}
      aware={false} engaged={false} onAware={noOp} onUnaware={noOp}
      onEngageRequest={noOp} onRelease={noOp} onAskRequest={noOp} />));
    const trigger = dom.querySelector('button[aria-haspopup="dialog"]')!;
    expect(trigger.querySelector("img")?.getAttribute("src")).toBe(markPath);
    expect(trigger.classNames).toContain("bg-transparent");
    expect(trigger.classNames).not.toContain("rounded-full");
    expect(trigger.classNames).not.toContain("overflow-hidden");
    expect(trigger.getAttribute("style")).toContain("box-shadow:none");
    expect(trigger.querySelector("span")).toBeNull();
  });

  test("homepage placements contain each approved business once and exclude synthetic projections", () => {
    expect(HOMEPAGE_CIRCLE_SITE_IDS).toEqual(["happy-place", "coppersmith-plumbing", "ping-fyd"]);
    expect(new Set(HOMEPAGE_CIRCLE_SITE_IDS).size).toBe(HOMEPAGE_CIRCLE_SITE_IDS.length);
  });
});
