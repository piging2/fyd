/**
 * Contact lane: ContactMethod projections from object fields.
 *
 * objectViewToProjection carries phone/email as first-class ContactMethod
 * projections (kind, value, label, evidence refs, verification state),
 * gated through the safe-link gate: an unverifiable or unsafe
 * number/email is not a method and the projection omits it.
 *
 * Run: npx jest --config src/fyd/object/jest.config.cjs contact-method-projection
 */

import { objectViewToProjection } from "../object-projection";
import type { ObjectView } from "../types";

const OBS = "2026-09-21T13:50:00Z";

function viewWithContact(
  phone: string | null,
  email: string | null,
): ObjectView {
  return {
    id: "biz-1",
    schema: "ping.social.business@1",
    name: "Test Business",
    category: null,
    locationLabel: null,
    summary: "",
    media: [],
    services: [],
    serviceArea: [],
    contact: {
      phone,
      email,
      website: "https://example.com/",
      locality: null,
      addressVisibility: "public",
    },
    capabilities: [],
    provenance: {
      kind: "website-derived",
      ref: "website-ingestion:https://example.com/",
      derivedAt: OBS,
      label: "Information from the business website",
    },
    ownerUpdatedAt: null,
    sampleQuestions: [],
    fieldCorrections: [],
  };
}

describe("ContactMethod projection", () => {
  test("phone/email fields project to ContactMethods with evidence", () => {
    const p = objectViewToProjection(
      viewWithContact("+19705550100", "hello@example.com"),
    );
    expect(p.contactMethods).toHaveLength(2);

    const [phone, email] = p.contactMethods;
    expect(phone.kind).toBe("phone");
    expect(phone.label).toBe("Phone");
    expect(phone.value).toBe("+19705550100");
    expect(phone.actionUri).toBe("tel:+19705550100");
    expect(phone.evidence.state).toBe("observed");
    expect(phone.evidence.receipt).toBe("example.com");
    expect(phone.evidence.asOf).toBe("2026-09-21");
    expect(
      phone.evidence.steps?.some(
        (s) => s.step === "Source" && s.detail.includes("example.com"),
      ),
    ).toBe(true);

    expect(email.kind).toBe("email");
    expect(email.label).toBe("Email");
    expect(email.value).toBe("hello@example.com");
    expect(email.actionUri).toBe("mailto:hello@example.com");
    expect(email.evidence.state).toBe("observed");

    // Deterministic order: phone, email.
    expect(p.contactMethods.map((m) => m.kind)).toEqual(["phone", "email"]);
  });

  test("missing contact fields project to no methods", () => {
    const p = objectViewToProjection(viewWithContact(null, null));
    expect(p.contactMethods).toEqual([]);
    expect(p.contact.phone).toBeNull();
    expect(p.contact.email).toBeNull();
  });

  test("unsafe values are not methods: hostile input renders nothing", () => {
    const hostiles = [
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
    ];
    for (const h of hostiles) {
      const p = objectViewToProjection(viewWithContact(h, h));
      expect(p.contactMethods).toEqual([]);
    }
  });

  test("the actionUri never carries a non-tel/mailto scheme", () => {
    const p = objectViewToProjection(
      viewWithContact("+19705550100", "hello@example.com"),
    );
    for (const m of p.contactMethods) {
      expect(m.actionUri).toMatch(/^(tel:|mailto:)/);
    }
  });
});
