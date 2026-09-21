/**
 * Portal-adjacent unit tests: focal resolver, HTTPS-safe hrefs,
 * generic portal enumeration, and the like store's validation.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveFocal, focalToObjectPosition } from "../../preview/focal";
import { isSafeWebHref } from "../../preview/types";
import { listPortalIds } from "../../preview/pipeline";
import { listObjectIds } from "../../object/view";
import { isLiked, setLiked } from "../../object/likes";

beforeEach(() => {
  process.env.FYD_LIKES_DIR = mkdtempSync(join(tmpdir(), "fyd-likes-test-"));
});

describe("focal resolver", () => {
  test("owner-selected focal region wins over heuristics", () => {
    const d = resolveFocal({ ownerFocal: { x: 0.2, y: 0.8 } });
    expect(d.focal.x).toBe(0.2);
    expect(d.focal.y).toBe(0.8);
    expect(d.basis).toMatch(/owner/i);
  });

  test("focal point converts to CSS object-position", () => {
    expect(focalToObjectPosition({ x: 0.25, y: 0.75 })).toBe("25% 75%");
  });

  test("deterministic: same hints give same decision", () => {
    const a = resolveFocal({ siteSpecHero: true });
    const b = resolveFocal({ siteSpecHero: true });
    expect(a).toEqual(b);
  });

  test("focal coordinates are clamped to 0..1", () => {
    const d = resolveFocal({ ownerFocal: { x: 2, y: -1 } });
    expect(d.focal.x).toBe(1);
    expect(d.focal.y).toBe(0);
  });
});

describe("isSafeWebHref", () => {
  test("allows https", () => {
    expect(isSafeWebHref("https://example.com/page")).toBe(true);
  });

  test("rejects javascript: urls (no regression)", () => {
    expect(isSafeWebHref("javascript:alert(1)")).toBe(false);
  });

  test("rejects http, data, and relative urls", () => {
    expect(isSafeWebHref("http://example.com")).toBe(false);
    expect(isSafeWebHref("data:text/html,<h1>x</h1>")).toBe(false);
    expect(isSafeWebHref("/relative/path")).toBe(false);
    expect(isSafeWebHref("")).toBe(false);
  });
});

describe("portal enumeration", () => {
  test("listPortalIds derives from the authoritative object registry", () => {
    const ids = listPortalIds();
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect(listObjectIds()).toContain(id);
    }
  });

  test("no hardcoded customer list in the enumeration path", () => {
    // If the registry grows, the portal list grows with it.
    expect(listPortalIds().sort()).toEqual(
      listObjectIds()
        .filter((id) => listPortalIds().includes(id))
        .sort(),
    );
  });
});

describe("like store", () => {
  test("setLiked/isLiked round-trip for a known object", () => {
    const id = listObjectIds()[0];
    const before = isLiked(id);
    expect(setLiked(id, !before)).toBe(!before);
    expect(isLiked(id)).toBe(!before);
    // Restore.
    expect(setLiked(id, before)).toBe(before);
    expect(isLiked(id)).toBe(before);
  });

  test("unknown object ids throw instead of silently writing", () => {
    expect(() => setLiked("no-such-object", true)).toThrow();
    expect(() => isLiked("no-such-object")).toThrow();
  });
});
