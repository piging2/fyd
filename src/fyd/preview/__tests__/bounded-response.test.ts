import { NextRequest } from "next/server";
import { PreviewSizeLimitError, readPreviewHtml } from "../bounded-response";
import { GET } from "@/app/api/live/[siteId]/route";
import { buildPortalProjection } from "../pipeline";

jest.mock("../pipeline", () => ({ buildPortalProjection: jest.fn() }));

describe("preview streaming budget", () => {
  test("normal UTF-8 content survives a split multibyte character", async () => {
    const encoded = new TextEncoder().encode("<p>Café</p>");
    const response = new Response(new ReadableStream({
      start(c) { c.enqueue(encoded.slice(0, 7)); c.enqueue(encoded.slice(7)); c.close(); },
    }));
    const ctrl = new AbortController();
    expect(await readPreviewHtml(response, encoded.length, ctrl)).toBe("<p>Café</p>");
    expect(ctrl.signal.aborted).toBe(false);
  });

  test("an oversized stream without Content-Length aborts and cancels early", async () => {
    const cancel = jest.fn();
    let chunks = 0;
    const response = new Response(new ReadableStream({
      pull(c) { chunks++; c.enqueue(new Uint8Array(8)); }, cancel,
    }));
    const ctrl = new AbortController();
    await expect(readPreviewHtml(response, 10, ctrl)).rejects.toBeInstanceOf(PreviewSizeLimitError);
    expect(ctrl.signal.aborted).toBe(true);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(chunks).toBeLessThanOrEqual(3); // The stream may prefetch one chunk.
  });

  test("a misleading small Content-Length cannot bypass the actual byte count", async () => {
    const ctrl = new AbortController();
    const response = new Response("abcdef", { headers: { "content-length": "1" } });
    await expect(readPreviewHtml(response, 5, ctrl)).rejects.toBeInstanceOf(PreviewSizeLimitError);
    expect(ctrl.signal.aborted).toBe(true);
  });

  test("an advertised oversized body is canceled before reading", async () => {
    const response = new Response("unused", { headers: { "content-length": "999" } });
    const ctrl = new AbortController();
    await expect(readPreviewHtml(response, 20, ctrl)).rejects.toBeInstanceOf(PreviewSizeLimitError);
    expect(ctrl.signal.aborted).toBe(true);
  });
});

describe("live preview route with bounded upstream transport", () => {
  const originalFetch = global.fetch;
  const projection = jest.mocked(buildPortalProjection);
  beforeEach(() => {
    projection.mockReturnValue({ websiteHref: "https://example.com/" } as ReturnType<typeof buildPortalProjection>);
  });
  afterEach(() => { global.fetch = originalFetch; jest.clearAllMocks(); });
  const request = () => GET(new NextRequest("https://unit.test/api/live/happy-place"), {
    params: Promise.resolve({ siteId: "happy-place" }),
  });

  test("normal page keeps its CSP restrictions and gets the existing base URL", async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response("<html><head></head><body>Business</body></html>", {
      headers: { "content-type": "text/html", "content-security-policy": "default-src 'self'; frame-ancestors 'none'" },
    }));
    const response = await request();
    expect(await response.text()).toContain('<base href="https://example.com/">');
    expect(response.headers.get("content-security-policy")).toBe("default-src 'self'");
    expect(global.fetch).toHaveBeenCalledWith("https://example.com/", expect.objectContaining({ redirect: "manual" }));
  });

  test("oversized streaming HTML returns the existing safe fallback and aborts fetch", async () => {
    const cancel = jest.fn();
    global.fetch = jest.fn().mockResolvedValue(new Response(new ReadableStream({
      pull(c) { c.enqueue(new Uint8Array(1024 * 1024)); }, cancel,
    }), { headers: { "content-type": "text/html" } }));
    const response = await request();
    expect(await response.text()).toContain("too large to embed");
    expect(cancel).toHaveBeenCalledTimes(1);
    const options = (global.fetch as jest.Mock).mock.calls[0][1] as RequestInit;
    expect(options.signal?.aborted).toBe(true);
  });

  test("off-domain redirects and unregistered objects remain rejected", async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response("", {
      status: 302, headers: { location: "https://other.example/" },
    }));
    expect(await (await request()).text()).toContain("redirected away");
    expect(global.fetch).toHaveBeenCalledTimes(1);
    projection.mockReturnValue(null);
    expect(await (await request()).text()).toContain("No safe website");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
