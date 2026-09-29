/**
 * PROD-5/PROD-6 (2026-09-27): site page content cleanup.
 *
 * PROD-5 (human captions): photo captions show human-readable
 * descriptions, never rights-basis memos, digests, or timestamps. The
 * legal/technical metadata stays accessible behind the "Why this?"
 * disclosure or in non-visible data-media-* attributes.
 *
 * PROD-6 (provenance noise): phone/email values render once per
 * affordance; "Why this?" explanations use plain language a
 * non-technical business owner understands (no "provenance:",
 * "verified:", "binding:" jargon, no DIRECT:/ref labels, no raw
 * digests or ISO timestamps in visible text).
 *
 * Run: npx jest --config src/fyd/components/jest.config.cjs site-content-cleanup
 */

import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mediaWhyThisSteps, WhyThis } from "../../ui/why-this";
import { HeroPhotoBlock } from "../hero-section";
import { FydContactLink, ContactFlow } from "../contact-link";
import { whyThisClaimChainFor } from "../../object/why-this-steps";
import {
  contactMethodFor,
  type ClaimEvidence,
} from "../../object/object-projection";
import { DEFAULT_FYD_THEME } from "../../sitespec/types";
import type { DisplayMedia } from "../../media/select";
import type { PingObject } from "@/lib/ping/types";

const PHONE = "+19705550100";
const ALT = "Happy Place Carpentry project photo 4";
const RIGHTS_BASIS =
  "Demo authorization (Nolan 2026-09-25): public marketing imagery of the authorized demo business.";
const DIGEST =
  "77bad689a7812c3381526933bae967e3ef86ec1deefbd15612768e1b5d214d91";
const OBSERVED_AT = "2026-09-25T17:55:06.761Z";
const SOURCE_URL = "https://example.blob.vercel-storage.com/f3272a08.webp";

/** Visible text only: data attributes, tags, and their values are not visible. */
function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/data-[a-z-]+="[^"]*"/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function testMedia(): DisplayMedia {
  return {
    id: "media-1",
    role: "gallery",
    src: "/fyd-media/abc/card-768w.webp",
    blurUrl: null,
    width: 768,
    height: 1024,
    alt: ALT,
    rightsSource: "public-demo-source",
    rightsBasis: RIGHTS_BASIS,
    sourceUrl: SOURCE_URL,
    digest: DIGEST,
    observedAt: OBSERVED_AT,
  };
}

function phoneEvidence(): ClaimEvidence {
  return {
    state: "observed",
    receipt: "example.com",
    asOf: "2026-09-21",
    steps: [
      { step: "Object field", detail: "phone", state: "observed" },
      {
        step: "Source",
        detail: "website-ingestion:https://example.com/",
        state: "observed",
      },
    ],
  };
}

function serviceObject(): PingObject {
  return {
    id: "website-business-1-service-1",
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
      claimKind: "website_statement",
    },
    relationships: [],
  } as PingObject;
}

describe("PROD-5: human photo captions", () => {
  test("mediaWhyThisSteps uses plain labels, no technical jargon", () => {
    const steps = mediaWhyThisSteps(testMedia());
    expect(steps.map((s) => s.step)).toEqual([
      "Photo source",
      "Why we can show this photo",
    ]);
    const text = steps.map((s) => s.step + ": " + s.detail).join(" ");
    expect(text).not.toMatch(/rights-basis/i);
    expect(text).not.toContain("digest:");
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
    expect(text).not.toMatch(/provenance:/i);
    expect(text).not.toMatch(/verified:/i);
    expect(text).not.toMatch(/binding:/i);
  });

  test("mediaWhyThisSteps omits empty values; empty lineage yields no steps", () => {
    expect(mediaWhyThisSteps({})).toEqual([]);
    expect(
      mediaWhyThisSteps({ sourceUrl: "", rightsBasis: "" }).map((s) => s.step),
    ).toEqual([]);
  });

  test("HeroPhotoBlock shows the human caption, never metadata", () => {
    const html = renderToStaticMarkup(
      React.createElement(HeroPhotoBlock, {
        hero: testMedia(),
        failed: false,
        onMediaError: () => {},
      }),
    );
    const text = visibleText(html);
    // The visible caption describes the photo.
    expect(text).toContain(ALT);
    // No legal/technical metadata in visible text.
    expect(text).not.toMatch(/rights-basis/i);
    expect(text).not.toContain("digest:");
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
    expect(text).not.toContain(DIGEST.slice(0, 16));
    // The metadata is still in the DOM for verification.
    expect(html).toContain('data-media-digest="' + DIGEST + '"');
    expect(html).toContain('data-media-observed-at="' + OBSERVED_AT + '"');
    expect(html).toContain('data-media-rights-basis="' + RIGHTS_BASIS + '"');
    expect(html).toContain('data-media-source-url="' + SOURCE_URL + '"');
  });

  test("HeroPhotoBlock omits the caption when there is no alt text", () => {
    const media = testMedia();
    media.alt = "   ";
    const html = renderToStaticMarkup(
      React.createElement(HeroPhotoBlock, {
        hero: media,
        failed: false,
        onMediaError: () => {},
      }),
    );
    expect(visibleText(html)).not.toContain(ALT);
  });
});

describe("PROD-6: provenance noise", () => {
  test("FydContactLink renders the phone value exactly once", () => {
    const method = contactMethodFor("phone", PHONE, phoneEvidence());
    if (!method) throw new Error("expected a phone method");
    const html = renderToStaticMarkup(
      React.createElement(FydContactLink, {
        method,
        theme: DEFAULT_FYD_THEME,
        variant: "row",
      }),
    );
    const occurrences = visibleText(html).split(PHONE).length - 1;
    expect(occurrences).toBe(1);
  });

  test("FydContactLink renders the email value exactly once", () => {
    const method = contactMethodFor(
      "email",
      "hello@example.com",
      phoneEvidence(),
    );
    if (!method) throw new Error("expected an email method");
    const html = renderToStaticMarkup(
      React.createElement(FydContactLink, {
        method,
        theme: DEFAULT_FYD_THEME,
        variant: "row",
      }),
    );
    const occurrences = visibleText(html).split("hello@example.com").length - 1;
    expect(occurrences).toBe(1);
  });

  test("ContactFlow keeps the value line for standalone uses", () => {
    const method = contactMethodFor("phone", PHONE, phoneEvidence());
    if (!method) throw new Error("expected a phone method");
    const html = renderToStaticMarkup(
      React.createElement(ContactFlow, {
        method,
        theme: DEFAULT_FYD_THEME,
      }),
    );
    expect(visibleText(html).split(PHONE).length - 1).toBe(1);
    expect(html).toContain("Observed example.com");
    expect(html).toContain('href="tel:' + PHONE + '"');
  });

  test("ContactFlow with showValue=false omits the repeated value", () => {
    const method = contactMethodFor("phone", PHONE, phoneEvidence());
    if (!method) throw new Error("expected a phone method");
    const html = renderToStaticMarkup(
      React.createElement(ContactFlow, {
        method,
        theme: DEFAULT_FYD_THEME,
        showValue: false,
      }),
    );
    expect(visibleText(html)).not.toContain(PHONE);
    // Provenance and the real action remain.
    expect(html).toContain("Observed example.com");
    expect(html).toContain('href="tel:' + PHONE + '"');
    expect(html).toContain(">Call<");
  });

  test("whyThisClaimChainFor is plain language, no provenance jargon", () => {
    const steps = whyThisClaimChainFor(serviceObject());
    expect(steps.length).toBe(4);
    const text = steps.map((s) => s.step + ": " + s.detail).join(" ");
    expect(text).not.toContain("DIRECT:");
    expect(text).not.toContain("DERIVED:");
    expect(text).not.toContain("OWNER-CONFIRMED");
    expect(text).not.toMatch(/\(ref "/);
    expect(text).not.toMatch(/provenance:/i);
    expect(text).not.toMatch(/verified:/i);
    expect(text).not.toMatch(/binding:/i);
    // Still honest: names the source and the website-statement basis.
    expect(text).toContain("https://www.coppersmithplumbing.com/");
    expect(text).toContain("Found on your website");
  });

  test("WhyThis carries verification metadata in data attributes, not visible text", () => {
    const html = renderToStaticMarkup(
      React.createElement(WhyThis, {
        claim: "Plumbing",
        steps: [{ step: "Source", detail: "https://example.com/" }],
        dataAttributes: {
          "data-provenance-ref": "website-ingestion:https://example.com/",
        },
      }),
    );
    expect(html).toContain(
      'data-provenance-ref="website-ingestion:https://example.com/"',
    );
    expect(visibleText(html)).not.toContain("website-ingestion:");
  });
});
