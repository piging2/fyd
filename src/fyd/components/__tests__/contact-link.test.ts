/**
 * Contact lane tests: the ContactMethod projection and the FYD contact
 * affordance.
 *
 * 1. contactMethodFor: a verified value becomes a ContactMethod with a
 *    safety-gated actionUri; an unverifiable or unsafe value is not a
 *    method (null), so the surface renders nothing for it.
 * 2. FydContactLink: a verified method renders the DIRECT tel:/mailto:
 *    anchor as the primary action (polish lane 2026-09-26 reversal of the
 *    disclosure-first treatment). A secondary adjacent <details>
 *    disclosure ("Why this number?" / "Why this email?") carries the
 *    provenance; it never wraps the primary action.
 * 3. ProvenanceLine: progressive disclosure renders the compact
 *    "Observed X · N sources" line; tap expands the full lineage.
 *
 * Run: npx jest --config src/fyd/components/jest.config.cjs contact-link
 */

import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  contactMethodFor,
  type ClaimEvidence,
  type ContactMethod,
} from "../../object/object-projection";
import { DEFAULT_FYD_THEME } from "../../sitespec/types";
import {
  compactProvenanceLine,
  ContactFlow,
  FydContactLink,
  ProvenanceLine,
} from "../contact-link";

const PHONE = "+19705550100";
const EMAIL = "hello@example.com";

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

function phoneMethod(): ContactMethod {
  const m = contactMethodFor("phone", PHONE, phoneEvidence());
  if (!m) throw new Error("expected a phone method");
  return m;
}

describe("contactMethodFor", () => {
  test("verified phone becomes a method with a gated tel: actionUri", () => {
    const m = contactMethodFor("phone", PHONE, phoneEvidence());
    expect(m).not.toBeNull();
    expect(m!.kind).toBe("phone");
    expect(m!.label).toBe("Phone");
    expect(m!.value).toBe(PHONE);
    expect(m!.actionUri).toBe("tel:" + PHONE);
    expect(m!.evidence.state).toBe("observed");
    expect(m!.evidence.receipt).toBe("example.com");
  });

  test("verified email becomes a method with a gated mailto: actionUri", () => {
    const m = contactMethodFor("email", EMAIL, phoneEvidence());
    expect(m).not.toBeNull();
    expect(m!.kind).toBe("email");
    expect(m!.label).toBe("Email");
    expect(m!.actionUri).toBe("mailto:" + EMAIL);
  });

  test("missing values are not methods", () => {
    expect(contactMethodFor("phone", undefined, phoneEvidence())).toBeNull();
    expect(contactMethodFor("phone", null, phoneEvidence())).toBeNull();
    expect(contactMethodFor("phone", "   ", phoneEvidence())).toBeNull();
    expect(contactMethodFor("email", "", phoneEvidence())).toBeNull();
  });

  test("hostile values are not methods: the gate never weakens", () => {
    const hostiles = [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(document.domain)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "java\tscript:alert(1)",
    ];
    for (const h of hostiles) {
      expect(contactMethodFor("phone", h, phoneEvidence())).toBeNull();
      expect(contactMethodFor("email", h, phoneEvidence())).toBeNull();
    }
  });

  test("malformed phone/email shapes are not methods", () => {
    expect(contactMethodFor("phone", "not a number!!!", phoneEvidence())).toBeNull();
    expect(contactMethodFor("phone", "(no digits)", phoneEvidence())).toBeNull();
    expect(contactMethodFor("email", "not-an-email", phoneEvidence())).toBeNull();
    expect(contactMethodFor("email", "a@b", phoneEvidence())).toBeNull();
  });
});

describe("FydContactLink", () => {
  test("verified phone renders the direct tel: anchor as the primary action", () => {
    const html = renderToStaticMarkup(
      React.createElement(FydContactLink, {
        method: phoneMethod(),
        theme: DEFAULT_FYD_THEME,
        variant: "row",
      }),
    );
    // The affordance marker: the wrapper, keyed by method kind.
    expect(html).toContain('data-fyd-contact="phone"');
    // The value IS the anchor: direct conversion, no toggle in between.
    expect(html).toContain('href="tel:' + PHONE + '"');
    expect(html).toContain(">" + PHONE + "</a>");
  });

  test("tel: lives exactly once, outside the Why-disclosure", () => {
    const html = renderToStaticMarkup(
      React.createElement(FydContactLink, {
        method: phoneMethod(),
        theme: DEFAULT_FYD_THEME,
        variant: "row",
      }),
    );
    const occurrences = html.split('href="tel:' + PHONE + '"').length - 1;
    expect(occurrences).toBe(1);
    // The disclosure is a SECONDARY affordance beside the action: the
    // tel: href must not sit inside the <details> element.
    const detailsOpen = html.indexOf("<details");
    const detailsClose = html.indexOf("</details>");
    const hrefIdx = html.indexOf('href="tel:' + PHONE + '"');
    expect(detailsOpen).toBeGreaterThan(-1);
    expect(hrefIdx < detailsOpen || hrefIdx > detailsClose).toBe(true);
  });

  test("the Why-disclosure carries provenance, never the action", () => {
    const html = renderToStaticMarkup(
      React.createElement(FydContactLink, {
        method: phoneMethod(),
        theme: DEFAULT_FYD_THEME,
        variant: "row",
      }),
    );
    expect(html).toContain("Why this number?");
    const detailsOpen = html.indexOf("<details");
    const detailsClose = html.indexOf("</details>");
    const detailsHtml = html.slice(detailsOpen, detailsClose);
    // Provenance inside the disclosure...
    expect(detailsHtml).toContain("Observed example.com");
    // ...but no tel: anchor inside it.
    expect(detailsHtml).not.toContain('href="tel:');
  });

  test("email method renders the direct mailto: anchor", () => {
    const method = contactMethodFor("email", EMAIL, phoneEvidence());
    if (!method) throw new Error("expected an email method");
    const html = renderToStaticMarkup(
      React.createElement(FydContactLink, {
        method,
        theme: DEFAULT_FYD_THEME,
        variant: "row",
      }),
    );
    expect(html).toContain('data-fyd-contact="email"');
    expect(html).toContain('href="mailto:' + EMAIL + '"');
    expect(html).toContain(">" + EMAIL + "</a>");
    expect(html).toContain("Why this email?");
  });

  test("button variant keeps the hero's primary-action copy", () => {
    const html = renderToStaticMarkup(
      React.createElement(FydContactLink, {
        method: phoneMethod(),
        theme: DEFAULT_FYD_THEME,
        variant: "button",
      }),
    );
    expect(html).toContain("Call " + PHONE);
    expect(html).toContain('href="tel:' + PHONE + '"');
  });

  test("ContactFlow shows the value, provenance, and the real action", () => {
    const html = renderToStaticMarkup(
      React.createElement(ContactFlow, {
        method: phoneMethod(),
        theme: DEFAULT_FYD_THEME,
      }),
    );
    expect(html).toContain(PHONE);
    expect(html).toContain("Observed example.com");
    expect(html).toContain('href="tel:' + PHONE + '"');
    expect(html).toContain(">Call<");
  });
});

describe("ProvenanceLine progressive disclosure", () => {
  test("compact line names the receipt and the honest source count", () => {
    expect(compactProvenanceLine(phoneEvidence())).toBe(
      "Observed example.com · 1 source",
    );
  });

  test("unverified evidence says so plainly", () => {
    expect(
      compactProvenanceLine({
        state: "unverified",
        receipt: "example.com",
        steps: [],
      }),
    ).toBe("Unverified · claimed by example.com");
  });

  test("renders the compact line with a tap-to-expand disclosure", () => {
    const html = renderToStaticMarkup(
      React.createElement(ProvenanceLine, { evidence: phoneEvidence() }),
    );
    // Claim line -> compact line...
    expect(html).toContain("Observed example.com · 1 source");
    // ...tap expands the full lineage (details content is in the DOM).
    expect(html).toContain("<details");
    expect(html).toContain("Object field:");
    expect(html).toContain("website-ingestion:https://example.com/");
    expect(html).toContain("Observed 2026-09-21.");
  });

  test("empty lineage renders a plain compact line, never a dead toggle", () => {
    const html = renderToStaticMarkup(
      React.createElement(ProvenanceLine, {
        evidence: { state: "observed", receipt: "example.com" },
      }),
    );
    expect(html).toContain("Observed example.com");
    expect(html).not.toContain("<details");
  });
});
