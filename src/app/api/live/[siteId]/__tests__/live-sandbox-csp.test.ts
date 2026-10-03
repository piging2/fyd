/**
 * F04: the /api/live/[siteId] proxy re-serves third-party HTML from the app
 * origin. The response itself must carry the iframe's sandbox profile so a
 * direct navigation cannot run that HTML with full origin privileges.
 */
import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import type { NextRequest } from "next/server";

jest.mock("@/fyd/preview/pipeline", () => ({
  buildPortalProjection: () => ({ websiteHref: "https://example.com/" }),
}));

import { GET } from "../route";

const HTML = "<html><head><title>t</title></head><body>hello</body></html>";

function mockFetch(upstreamCsp: string | null) {
  const headers: Record<string, string> = { "content-type": "text/html" };
  if (upstreamCsp !== null) headers["content-security-policy"] = upstreamCsp;
  global.fetch = jest.fn(async () =>
    new Response(HTML, { status: 200, headers }),
  ) as unknown as typeof fetch;
}

beforeEach(() => {
  jest.clearAllMocks();
});

async function callGet() {
  return GET({} as NextRequest, { params: Promise.resolve({ siteId: "happy-place" }) });
}

describe("live proxy response sandbox (F04)", () => {
  it("sets the sandbox CSP when upstream sends none", async () => {
    mockFetch(null);
    const resp = await callGet();
    const csp = resp.headers.get("content-security-policy") ?? "";
    expect(csp).toMatch(/sandbox allow-scripts allow-forms allow-popups/);
    expect(csp).not.toMatch(/allow-same-origin/);
  });

  it("appends sandbox to the upstream CSP and strips frame-ancestors", async () => {
    mockFetch("script-src 'self'; frame-ancestors 'none'");
    const resp = await callGet();
    const csp = resp.headers.get("content-security-policy") ?? "";
    expect(csp).toMatch(/sandbox allow-scripts allow-forms allow-popups/);
    expect(csp).toMatch(/script-src 'self'/);
    expect(csp).not.toMatch(/frame-ancestors/);
  });

  it("does not double-add sandbox when upstream already sandboxes", async () => {
    mockFetch("sandbox allow-scripts; script-src 'self'");
    const resp = await callGet();
    const csp = resp.headers.get("content-security-policy") ?? "";
    expect(csp.match(/sandbox/g)?.length).toBe(1);
  });
});
