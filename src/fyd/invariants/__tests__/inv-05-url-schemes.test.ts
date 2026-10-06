/**
 * INV-05: unsafe URL schemes never executable.
 *
 * Machinery under test (real, on the Pig):
 *   src/fyd/sitespec/safe-link.ts resolveSafeLink (the gate)
 *   src/fyd/object/view.ts        buildCapabilities (the /o capability seam)
 *
 * Relationship to adjacent lanes: QA-HOSTILE found the /o capability hole
 * (un-gated hrefs). This probe asserts the gate holds over a hostile
 * battery AND probes the /o seam with a hostile contact record. SEC-FIX #1
 * (2026-09-24) closed the seam: buildCapabilities routes every contact href
 * through resolveSafeLink, so a hostile website value emits NO website
 * capability. The seam probe asserts that closed behavior. */

import { resolveSafeLink } from "../../sitespec/safe-link";
import { buildCapabilities } from "../../object/view";
import type { ObjectContactView } from "../../object/types";

const HOSTILE_NAVIGATE = [
  "javascript:alert('xss-test')",
  "JaVaScRiPt:alert('xss-test')",
  "  javascript:alert('xss-test')  ",
  "java\tscript:alert('xss-test')",
  "java\nscript:alert('xss-test')",
  "data:text/html,<h1>hostile-test</h1>",
  "DATA:text/html;base64,PGgxPmgp",
  "vbscript:msgbox('hostile-test')",
  "file:///etc/passwd",
  "blob:https://example.com/uuid",
  "tel:+19705550100", // wrong capability: tel: is not navigable
  "mailto:attacker@example.com", // wrong capability: mailto: is not navigable
];

const HOSTILE_CALL = [
  "tel:+19705550100", // not a phone string; the call capability builds tel: itself
  "+1 (970) 555-0100\nBcc: attacker@example.com",
  "(970) 555-0100\" onmouseover=\"alert(1)",
];

const HOSTILE_EMAIL = [
  "not-an-email",
  "a@b.com\nBcc: attacker@example.com",
  "javascript:alert(1)",
];

describe("INV-05 unsafe URL schemes never executable", () => {
  describe("safe-link gate: hostile navigate inputs are non-navigable", () => {
    test.each(HOSTILE_NAVIGATE)("%p -> non_navigable", (raw) => {
      expect(resolveSafeLink(raw, "navigate")).toEqual({
        kind: "non_navigable",
      });
    });

    test("relative references are non-navigable without an explicit safe base", () => {
      expect(resolveSafeLink("/o/some-id", "navigate")).toEqual({
        kind: "non_navigable",
      });
      expect(resolveSafeLink("example.com", "navigate")).toEqual({
        kind: "non_navigable",
      });
    });

    test("non-string input is non-navigable", () => {
      for (const raw of [null, undefined, 42, {}, [], ""]) {
        expect(resolveSafeLink(raw, "navigate")).toEqual({
          kind: "non_navigable",
        });
      }
    });
  });

  describe("safe-link gate: hostile call/email inputs are non-navigable", () => {
    test.each(HOSTILE_CALL)("%p as call -> non_navigable", (raw) => {
      expect(resolveSafeLink(raw, "call")).toEqual({ kind: "non_navigable" });
    });
    test.each(HOSTILE_EMAIL)("%p as email -> non_navigable", (raw) => {
      expect(resolveSafeLink(raw, "email")).toEqual({ kind: "non_navigable" });
    });
  });

  describe("safe-link gate: positive controls", () => {
    test("https/http navigate", () => {
      expect(resolveSafeLink("https://example.com/path", "navigate")).toEqual({
        kind: "safe",
        href: "https://example.com/path",
      });
      expect(resolveSafeLink("http://example.com", "navigate").kind).toBe(
        "safe",
      );
    });
    test("call builds tel: from phone characters only", () => {
      expect(resolveSafeLink("+1 (970) 555-0100", "call")).toEqual({
        kind: "safe",
        href: "tel:+1(970)555-0100",
      });
    });
    test("email builds mailto: from a well-formed address", () => {
      expect(resolveSafeLink("shop@example.com", "email")).toEqual({
        kind: "safe",
        href: "mailto:shop@example.com",
      });
    });
  });

  describe("/o capability seam (QA-HOSTILE residual)", () => {
    // NOTE: the schema must carry the business role; an unknown schema id
    // takes the default branch (ask-only) and never reaches the website
    // capability. The seam under test is the business branch, which
    // interpolates the observed website value into the href.
    const SCHEMA = "ping.social.business@1";
    const hostileContact: ObjectContactView = {
      phone: "(970) 555-0112",
      email: "shop@example.com",
      website: "javascript:alert('xss-test')",
      locality: null,
      addressVisibility: "public",
    };

    test("documents the seam: a hostile website value emits no website capability (SEC-FIX #1)", () => {
      const caps = buildCapabilities(SCHEMA, "hostile-biz", hostileContact, {
        summary: "Hostile business record.",
        services: [],
      });
      const website = caps.find((c) => c.kind === "website");
      // SEC-FIX #1 closed the seam: the hostile value is gated by
      // resolveSafeLink ("navigate"), so no website capability is emitted.
      // The contact block still shows the value as inert text; no href exists.
      expect(website).toBeUndefined();
    });

    test("INVARIANT: every emitted capability href must be safe for its capability", () => {
      const caps = buildCapabilities(SCHEMA, "hostile-biz", hostileContact, {
        summary: "Hostile business record.",
        services: [],
      });
      for (const cap of caps) {
        // NOTE: call/email hrefs already carry their scheme (tel:/mailto:)
        // from buildCapabilities; re-resolve the VALUE part through the
        // gate, the same way the gate would see the raw observed value.
        if (cap.kind === "call") {
          const value = cap.href.replace(/^tel:/, "");
          expect(resolveSafeLink(value, "call")).toEqual({
            kind: "safe",
            href: cap.href,
          });
        } else if (cap.kind === "email") {
          const value = cap.href.replace(/^mailto:/, "");
          expect(resolveSafeLink(value, "email")).toEqual({
            kind: "safe",
            href: cap.href,
          });
        } else if (cap.kind === "website" || cap.kind === "directions") {
          expect(resolveSafeLink(cap.href, "navigate").kind).toBe("safe");
        }
      }
    });
  });
});
