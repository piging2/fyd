/**
 * Regression: /sites must stay reachable through the middleware.
 *
 * Binding intent: the Circle is the portable doorway, Site/Node is the
 * generated customer experience. The middleware must never 404, rewrite, or
 * disable /sites/*, and it must keep exposing the request pathname to
 * server components via the x-pathname header.
 *
 * Guards against a recurrence of the uncommitted experiment that added a
 * middleware disabled-paths list containing "/sites".
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { config, middleware } from "../middleware";

const SITES = ["/sites/happy-place", "/sites/coppersmith-plumbing"];

function middlewareSource(): string {
  return readFileSync(join(__dirname, "..", "middleware.ts"), "utf8");
}

describe("the /sites routes exist", () => {
  test.each(SITES)("route file exists for %s", (p) => {
    const slug = p.split("/").pop() as string;
    expect(
      existsSync(join(__dirname, "..", "app", "sites", slug, "page.tsx")),
    ).toBe(true);
  });
});

describe("the middleware does not 404 /sites", () => {
  test.each(SITES)(
    "middleware passes %s through (no 404, no rewrite, no redirect)",
    async (p) => {
      const res = await middleware(
        new NextRequest(`http://localhost:3000${p}`),
      );
      expect(res.status).not.toBe(404);
      expect(res.status).toBe(200);
      // A pass-through "next" response carries the x-middleware-next marker.
      expect(res.headers.get("x-middleware-next")).toBe("1");
    },
  );
});

describe("no middleware disable list contains /sites", () => {
  test('the committed middleware source has no string literal "/sites"', () => {
    const src = middlewareSource();
    // A disabled-paths list would have to name the path it disables. The
    // committed middleware must not name /sites anywhere.
    expect(src).not.toMatch(/["']\/sites["']/);
  });

  test("the middleware matcher includes /sites/* (and still excludes _next)", () => {
    const matchers = config.matcher;
    expect(Array.isArray(matchers) && matchers.length).toBeGreaterThan(0);
    for (const m of matchers as string[]) {
      // Matchers are path patterns anchored at the start; evaluate them the
      // same way Next does for this smoke check.
      const re = new RegExp("^" + m);
      for (const p of SITES) {
        expect(re.test(p)).toBe(true);
      }
      // The exclusion half of the lookahead still works, so this test is
      // not vacuously true.
      expect(re.test("/_next/static/chunks/app.js")).toBe(false);
    }
  });
});

describe("the middleware still sets x-pathname for /sites", () => {
  test.each(SITES)("x-pathname is forwarded for %s", async (p) => {
    const spy = jest.spyOn(NextResponse, "next");
    try {
      await middleware(new NextRequest(`http://localhost:3000${p}`));
      expect(spy).toHaveBeenCalledTimes(1);
      const calls = spy.mock.calls as unknown as Array<
        [{ request?: { headers?: Headers } } | undefined]
      >;
      const headers = calls[0]?.[0]?.request?.headers;
      expect(headers).toBeDefined();
      expect(headers?.get("x-pathname")).toBe(p);
    } finally {
      spy.mockRestore();
    }
  });
});
