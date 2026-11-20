/**
 * W-25 repair: the tenant proof surfaces' edge cache policy lives in
 * middleware, because the next.config headers() rule is overridden by
 * the force-dynamic document response (measured on production
 * 2026-11-19: private, no-store served, repeat reads MISS).
 */
import { NextRequest } from "next/server";
import { middleware } from "../middleware";

const POLICY =
  "public, max-age=0, s-maxage=300, stale-while-revalidate=3600";
const CDN_POLICY = "public, s-maxage=300, stale-while-revalidate=3600";

describe("middleware tenant cache policy (W-25)", () => {
  test("happy-place carries the edge cache policy", () => {
    const res = middleware(
      new NextRequest("https://pingfyd.com/sites/happy-place"),
    );
    expect(res.headers.get("cache-control")).toBe(POLICY);
    expect(res.headers.get("cdn-cache-control")).toBe(CDN_POLICY);
    expect(res.headers.get("vercel-cdn-cache-control")).toBe(CDN_POLICY);
  });

  test("coppersmith-plumbing carries the edge cache policy", () => {
    const res = middleware(
      new NextRequest("https://pingfyd.com/sites/coppersmith-plumbing"),
    );
    expect(res.headers.get("cache-control")).toBe(POLICY);
    expect(res.headers.get("cdn-cache-control")).toBe(CDN_POLICY);
    expect(res.headers.get("vercel-cdn-cache-control")).toBe(CDN_POLICY);
  });

  test("other paths carry no cache-control from middleware", () => {
    const res = middleware(new NextRequest("https://pingfyd.com/fyd"));
    expect(res.headers.get("cache-control")).toBeNull();
    expect(res.headers.get("cdn-cache-control")).toBeNull();
    expect(res.headers.get("vercel-cdn-cache-control")).toBeNull();
  });
});
