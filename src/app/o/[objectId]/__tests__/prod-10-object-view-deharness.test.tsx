/**
 * PROD-10 verification (2026-09-27): object view de-harness.
 *
 * The /o/* object view is a customer-facing business listing, not an
 * engineering harness. Rendered output assertions on the real pure
 * component (ObjectNodeView), with capabilities built through the real
 * pipeline (buildCapabilities -> resolveSafeLink):
 *
 * (a) no "DEV" badge text in visible output;
 * (b) no schema identifier patterns (e.g. ping.social.business@1) in
 *     visible text (the schema id stays in the data model and JSON-LD);
 * (c) working tel: and mailto: contact actions with the business's
 *     verified contact values;
 * plus: the demo distinction the DEV badge carried survives as a
 * data-owner-demo DOM attribute, never in visible text;
 * (d) PROD-10-REPAIR (2026-09-27): field corrections render with
 *     plain-language actor labels: the seeded demo actor label in the
 *     data model never leaks into the visible "Recorded by" text.
 */
import { renderToStaticMarkup } from "react-dom/server";
import * as React from "react";
import { buildCapabilities } from "@/fyd/object/view";
import { ObjectNodeView } from "../object-node-view";
import type { ObjectView } from "@/fyd/object/types";

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children?: React.ReactNode;
  }) => React.createElement("a", { href, ...rest }, children),
}));
jest.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound");
  },
}));
jest.mock("lucide-react", () => {
  const stub = (props: Record<string, unknown>) =>
    React.createElement("span", props);
  return new Proxy(
    {},
    {
      get: () => stub,
    },
  );
});

/** Visible text only: scripts, data attributes, tags are not visible. */
function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/data-[a-z-]+="[^"]*"/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The verified Happy Place contact values, straight from the served page. */
const PHONE = "+15412865190";
const EMAIL = "taylor@happyplacecarpentry.com";

function businessView(): ObjectView {
  const contact = {
    phone: PHONE,
    email: EMAIL,
    website: "https://happyplacecarpentry.com",
    locality: "Adair Village, OR",
    addressVisibility: "public" as const,
  };
  const capabilities = buildCapabilities(
    "ping.social.business@1",
    "website-business-6fa5ebd99d72c4cb",
    contact,
    { summary: "Licensed Oregon carpentry contractor.", services: [] },
  );
  return {
    id: "website-business-6fa5ebd99d72c4cb",
    schema: "ping.social.business@1",
    name: "Happy Place Carpentry LLC",
    category: "Carpentry",
    locationLabel: "Adair Village, OR",
    summary: "Licensed Oregon carpentry contractor (CCB# 254240).",
    media: [],
    services: [
      {
        id: "svc-repairs",
        name: "Repairs",
        basis: "structured",
        basisLabel: "From the site data",
        visible: true,
      },
    ],
    serviceArea: ["Benton", "Linn"],
    contact,
    capabilities,
    provenance: {
      kind: "website",
      ref: "website-ingestion:https://happyplacecarpentry.com/",
      derivedAt: "2026-09-21T13:50:00Z",
      label: "Information observed on happyplacecarpentry.com",
    },
    ownerUpdatedAt: "2026-09-24T11:44:58.341Z",
    sampleQuestions: ["What kind of repairs work do you do?"],
    fieldCorrections: [
      {
        field: "phone",
        label: "Phone",
        sourceValue: "+15415550101",
        ownerValue: PHONE,
        correctedAt: "2026-09-26T14:20:00Z",
        // PROD-10-REPAIR: the data layer keeps the seeded demo actor
        // label. The render must map it to plain language (tests below).
        actorLabel: "Demo Owner (seeded, unverified)",
        basis: "Owner correction: the owner says this is the main number.",
        sourceDrifted: false,
      },
    ],
  };
}

function render(): { html: string; text: string } {
  const html = renderToStaticMarkup(
    React.createElement(ObjectNodeView, {
      view: businessView(),
      tenantId: "happy-place",
    }),
  );
  return { html, text: visibleText(html) };
}

describe("PROD-10: object view de-harness", () => {
  test("(a) no DEV badge text in visible output", () => {
    const { text } = render();
    expect(text).not.toMatch(/\bDEV\b/);
  });

  test("(b) no schema identifier patterns in visible text", () => {
    const view = businessView();
    const { html, text } = render();
    // The exact schema id of the fixture object.
    expect(text).not.toContain("ping.social.business@1");
    // Any dotted schema@version identifier pattern.
    expect(text).not.toMatch(/[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+@\d+/);
    // The underlying data is NOT removed: the schema id stays on the
    // view model (and in the served page's JSON-LD). It simply never
    // enters the rendered customer surface.
    expect(view.schema).toBe("ping.social.business@1");
    expect(html).not.toContain("ping.social.business@1");
  });

  test("(c) tel: and mailto: contact actions carry the verified values", () => {
    const { html } = render();
    expect(html).toContain(`href="tel:${PHONE}"`);
    expect(html).toContain(`href="mailto:${EMAIL}"`);
  });

  test("demo distinction survives as a data attribute, not visible text", () => {
    const { html, text } = render();
    expect(html).toContain('data-owner-demo="true"');
    expect(text).not.toMatch(/\bdemo\b/i);
    expect(text).toContain("Manage this listing");
  });

  test("the Why this? provenance disclosure stays, in plain language", () => {
    const { text } = render();
    expect(text).toContain("Why this?");
    expect(text).toContain("Where this information comes from");
  });

  test("PROD-10-REPAIR: fixture carries at least one field correction", () => {
    const view = businessView();
    expect(view.fieldCorrections.length).toBeGreaterThan(0);
  });

  test("PROD-10-REPAIR: the demo actor label survives in the data model", () => {
    const view = businessView();
    expect(view.fieldCorrections[0].actorLabel).toBe(
      "Demo Owner (seeded, unverified)",
    );
  });

  test("PROD-10-REPAIR: 'Recorded by' never leaks the seeded demo actor label", () => {
    const { text } = render();
    expect(text).toContain("Source vs owner");
    expect(text).toContain("Recorded by");
    expect(text).not.toMatch(/\bdemo\b/i);
    expect(text).not.toContain("seeded");
    expect(text).not.toContain("unverified");
  });

  test("PROD-10-REPAIR: 'Recorded by' names the owner in plain language", () => {
    const { text } = render();
    expect(text).toContain("Recorded by: The business owner on 2026-09-26");
  });
});
