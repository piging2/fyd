/**
 * Regression test for red-team round 1 P1-1 (2026-10-03): stored-XSS sink in
 * the /api/live/[siteId] fallback page.
 *
 * The finding: `isSafeWebHref()` from @/fyd/preview/types permits `"`
 * characters, and `fallback(message, href)` interpolated the projected
 * `websiteHref` unescaped into raw HTML, so a poisoned projection value
 * like `https://x.com/"onmouseover="alert(1)` broke out of the href
 * attribute in the served fallback page.
 *
 * The fix (in the sibling route.ts): `safeWebHref()` allows only parseable
 * http:/https: URLs with no quotes/angle-brackets/backticks/whitespace,
 * and both the href attribute and the message text go through
 * `escapeHtml()` before interpolation. These tests pin that behavior:
 * quote breakout, javascript: URLs, data: URLs, and malformed URLs must
 * never reach the served page as a live link, and legit URLs must keep
 * working.
 */
import { describe, it, expect } from "@jest/globals";
import {
  escapeHtml,
  safeWebHref,
} from "@/app/api/live/[siteId]/route";

describe("live fallback HTML sink (P1-1 stored-XSS regression)", () => {
  describe("escapeHtml", () => {
    it("encodes the attribute-breakout characters", () => {
      expect(escapeHtml('"onmouseover="alert(1)')).toBe(
        "&quot;onmouseover=&quot;alert(1)",
      );
    });

    it("encodes markup and ampersands in message text", () => {
      expect(escapeHtml("<script>alert(1)</script> & more")).toBe(
        "&lt;script&gt;alert(1)&lt;/script&gt; &amp; more",
      );
    });

    it("encodes single quotes", () => {
      expect(escapeHtml("it's")).toBe("it&#x27;s");
    });

    it("leaves plain text untouched", () => {
      expect(escapeHtml("No safe website for this portal.")).toBe(
        "No safe website for this portal.",
      );
    });
  });

  describe("safeWebHref", () => {
    it("rejects the red-team quote-breakout payload", () => {
      expect(safeWebHref('https://x.com/"onmouseover="alert(1)')).toBeNull();
    });

    it("rejects angle-bracket and backtick injection", () => {
      expect(safeWebHref('https://x.com/"><script>alert(1)</script>')).toBeNull();
      expect(safeWebHref("https://x.com/`onmouseover=alert(1)")).toBeNull();
    });

    it("rejects javascript: URLs, any casing", () => {
      expect(safeWebHref("javascript:alert(1)")).toBeNull();
      expect(safeWebHref("JaVaScRiPt:alert(document.cookie)")).toBeNull();
    });

    it("rejects data: URLs", () => {
      expect(
        safeWebHref("data:text/html,<script>alert(1)</script>"),
      ).toBeNull();
    });

    it("rejects malformed URLs", () => {
      expect(safeWebHref("https://")).toBeNull();
      expect(safeWebHref("not a url")).toBeNull();
      expect(safeWebHref("")).toBeNull();
      expect(safeWebHref("https://exa mple.com")).toBeNull();
    });

    it("rejects non-http(s) schemes", () => {
      expect(safeWebHref("ftp://example.com/file")).toBeNull();
      expect(safeWebHref("file:///etc/passwd")).toBeNull();
    });

    it("passes legitimate https and http URLs", () => {
      expect(safeWebHref("https://example.com")).toBe("https://example.com");
      expect(safeWebHref("http://example.com/menu")).toBe(
        "http://example.com/menu",
      );
    });

    it("escapes ampersands in legitimate query strings for the attribute context", () => {
      expect(safeWebHref("https://example.com/?a=1&b=2")).toBe(
        "https://example.com/?a=1&amp;b=2",
      );
    });

    it("never returns a value containing a raw double quote", () => {
      const payloads = [
        'https://x.com/"onmouseover="alert(1)',
        "https://example.com/?q=%22test%22",
      ];
      for (const p of payloads) {
        const out = safeWebHref(p);
        if (out !== null) expect(out).not.toContain('"');
      }
    });
  });
});
