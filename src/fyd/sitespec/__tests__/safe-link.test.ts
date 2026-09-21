/**
 * Safe-link resolver regression tests (FL-20260921-032).
 *
 * A hostile string anywhere in graph data must never become an executable
 * href in rendered output. The renderer only ever interpolates hrefs that
 * resolveSafeLink marked "safe"; these tests pin the resolver's fail-closed
 * behavior for every known smuggling shape.
 */

import { resolveSafeLink } from "../safe-link";

describe("resolveSafeLink navigate capability", () => {
  test("accepts https and http URLs", () => {
    expect(resolveSafeLink("https://example.com", "navigate")).toEqual({
      kind: "safe",
      href: "https://example.com/",
    });
    expect(resolveSafeLink("http://example.com/path?q=1", "navigate")).toEqual({
      kind: "safe",
      href: "http://example.com/path?q=1",
    });
  });

  test("rejects javascript: URLs", () => {
    const r = resolveSafeLink("javascript:alert(1)", "navigate");
    expect(r).toEqual({ kind: "non_navigable" });
  });

  test("rejects mixed-case javascript:", () => {
    expect(resolveSafeLink("JaVaScRiPt:alert(1)", "navigate")).toEqual({
      kind: "non_navigable",
    });
  });

  test("rejects whitespace-prefixed javascript:", () => {
    expect(resolveSafeLink("   javascript:alert(1)", "navigate")).toEqual({
      kind: "non_navigable",
    });
  });

  test("rejects data:, vbscript:, file:, blob:", () => {
    for (const raw of [
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
      "blob:https://example.com/uuid",
    ]) {
      expect(resolveSafeLink(raw, "navigate")).toEqual({ kind: "non_navigable" });
    }
  });

  test("rejects control-character smuggling", () => {
    expect(resolveSafeLink("java\tscript:alert(1)", "navigate")).toEqual({
      kind: "non_navigable",
    });
    expect(resolveSafeLink("\x01javascript:alert(1)", "navigate")).toEqual({
      kind: "non_navigable",
    });
  });

  test("rejects percent-encoded scheme tricks", () => {
    // "javascript%3Aalert(1)" has no scheme; without an explicit base it is
    // a relative reference and stays non-navigable.
    expect(resolveSafeLink("javascript%3Aalert(1)", "navigate")).toEqual({
      kind: "non_navigable",
    });
  });

  test("rejects malformed URLs", () => {
    for (const raw of ["", "   ", "http://", "://example.com", "http://exa mple.com"]) {
      expect(resolveSafeLink(raw, "navigate")).toEqual({ kind: "non_navigable" });
    }
  });

  test("relative URLs need an explicit safe base", () => {
    expect(resolveSafeLink("/about", "navigate")).toEqual({ kind: "non_navigable" });
    expect(resolveSafeLink("about", "navigate")).toEqual({ kind: "non_navigable" });
    // Bare hostnames have no scheme and are non-navigable without a base.
    expect(resolveSafeLink("example.com", "navigate")).toEqual({ kind: "non_navigable" });
    const withBase = resolveSafeLink("/about", "navigate", {
      baseUrl: "https://example.com",
    });
    expect(withBase).toEqual({ kind: "safe", href: "https://example.com/about" });
    // An unsafe base does not authorize relatives.
    expect(
      resolveSafeLink("/about", "navigate", { baseUrl: "javascript:alert(1)" }),
    ).toEqual({ kind: "non_navigable" });
  });

  test("non-string input is non-navigable", () => {
    for (const raw of [null, undefined, 42, ["https://example.com"], { href: "https://example.com" }]) {
      expect(resolveSafeLink(raw, "navigate")).toEqual({ kind: "non_navigable" });
    }
  });

  test("deterministic: same input always yields the same output", () => {
    const inputs = [
      "https://example.com",
      "javascript:alert(1)",
      "   JaVaScRiPt:alert(1)  ",
      "data:text/html,x",
    ];
    for (const raw of inputs) {
      expect(resolveSafeLink(raw, "navigate")).toEqual(resolveSafeLink(raw, "navigate"));
    }
  });
});

describe("resolveSafeLink call capability", () => {
  test("accepts a plain phone number", () => {
    expect(resolveSafeLink("(970) 555-0100", "call")).toEqual({
      kind: "safe",
      href: "tel:(970)555-0100",
    });
  });

  test("rejects scheme text and letters", () => {
    expect(resolveSafeLink("tel:javascript:alert(1)", "call")).toEqual({
      kind: "non_navigable",
    });
    expect(resolveSafeLink("call me now", "call")).toEqual({ kind: "non_navigable" });
  });

  test("requires at least one digit", () => {
    expect(resolveSafeLink("(+)-.", "call")).toEqual({ kind: "non_navigable" });
  });
});

describe("resolveSafeLink email capability", () => {
  test("accepts a well-formed address", () => {
    expect(resolveSafeLink("hello@example.com", "email")).toEqual({
      kind: "safe",
      href: "mailto:hello@example.com",
    });
  });

  test("rejects javascript: and malformed addresses", () => {
    expect(resolveSafeLink("javascript:alert(1)", "email")).toEqual({
      kind: "non_navigable",
    });
    expect(resolveSafeLink("not-an-email", "email")).toEqual({ kind: "non_navigable" });
    expect(resolveSafeLink("a@b", "email")).toEqual({ kind: "non_navigable" });
  });
});
