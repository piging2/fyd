/**
 * Regression tests for the canonical SSRF gate (fyd/net/safe-fetch).
 *
 * Fail-closed contract: private IPs (literal or DNS-resolved), redirect
 * chains into private space, oversize responses, and bad schemes must all
 * return { ok: false }, never throw, never fetch the target.
 */
import { isPublicIp, safeFetch, safeFetchPage } from "../safe-fetch";

describe("isPublicIp", () => {
  test("rejects loopback", () => {
    expect(isPublicIp("127.0.0.1")).toBe(false);
    expect(isPublicIp("::1")).toBe(false);
  });
  test("rejects RFC1918", () => {
    expect(isPublicIp("10.0.0.5")).toBe(false);
    expect(isPublicIp("172.16.9.9")).toBe(false);
    expect(isPublicIp("172.31.255.1")).toBe(false);
    expect(isPublicIp("192.168.1.1")).toBe(false);
  });
  test("rejects link-local and metadata endpoint", () => {
    expect(isPublicIp("169.254.169.254")).toBe(false);
    expect(isPublicIp("169.254.10.20")).toBe(false);
    expect(isPublicIp("fe80::1")).toBe(false);
  });
  test("rejects CGNAT / tailnet space", () => {
    expect(isPublicIp("100.79.154.43")).toBe(false);
    expect(isPublicIp("100.64.0.1")).toBe(false);
  });
  test("rejects multicast and v4-mapped private", () => {
    expect(isPublicIp("224.0.0.1")).toBe(false);
    expect(isPublicIp("::ffff:192.168.1.1")).toBe(false);
  });
  test("accepts public addresses", () => {
    expect(isPublicIp("93.184.216.34")).toBe(true);
    expect(isPublicIp("2606:2800:220:1:248:1893:25c8:1946")).toBe(true);
  });
  test("rejects garbage", () => {
    expect(isPublicIp("not-an-ip")).toBe(false);
    expect(isPublicIp("")).toBe(false);
  });
});

const PUBLIC_DNS = async (hostname: string) => {
  if (hostname === "example.com") return [{ address: "93.184.216.34" }];
  throw new Error("getaddrinfo ENOTFOUND " + hostname);
};
const PRIVATE_DNS = async (hostname: string) => {
  if (hostname === "evil.example") return [{ address: "10.0.0.5" }];
  return PUBLIC_DNS(hostname);
};

function htmlResponse(body: string, status = 200, headers: Record<string, string> = {}) {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", ...headers },
  });
}

describe("safeFetch fail-closed behavior (mocked network)", () => {
  test("rejects bad schemes without fetching", async () => {
    const fetchImpl = jest.fn();
    for (const url of [
      "file:///etc/passwd",
      "javascript:alert(1)",
      "data:text/html,<h1>x</h1>",
      "ftp://example.com/file",
    ]) {
      const r = await safeFetchPage(url, {}, { dnsLookup: PUBLIC_DNS, fetchImpl });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toMatch(/Scheme not allowed/);
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("rejects credential-bearing URLs", async () => {
    const fetchImpl = jest.fn();
    const r = await safeFetchPage("https://user:pass@example.com/", {}, { dnsLookup: PUBLIC_DNS, fetchImpl });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/Credential-bearing/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("rejects private IP literals without fetching", async () => {
    const fetchImpl = jest.fn();
    for (const url of ["http://127.0.0.1/", "http://10.0.0.5:8080/", "http://[::1]/"]) {
      const r = await safeFetchPage(url, {}, { dnsLookup: PUBLIC_DNS, fetchImpl });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toMatch(/not public routable/);
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("rejects hostnames that DNS-resolve to private space", async () => {
    const fetchImpl = jest.fn();
    const r = await safeFetchPage("http://evil.example/", {}, { dnsLookup: PRIVATE_DNS, fetchImpl });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/non-public 10\.0\.0\.5/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("rejects redirect chains into private space", async () => {
    const fetchImpl = jest.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u === "http://example.com/") {
        return new Response(null, { status: 302, headers: { location: "http://127.0.0.1/secret" } });
      }
      throw new Error("should never fetch " + u);
    });
    const r = await safeFetchPage("http://example.com/", {}, { dnsLookup: PUBLIC_DNS, fetchImpl: fetchImpl as typeof fetch });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toMatch(/not public routable/);
      expect(r.redirectChain).toHaveLength(1);
    }
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("rejects oversize streaming bodies", async () => {
    const big = "x".repeat(64 * 1024);
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        const enc = new TextEncoder();
        for (let i = 0; i < 10; i++) c.enqueue(enc.encode(big));
        c.close();
      },
    });
    const fetchImpl = jest.fn(async () => new Response(stream, { headers: { "content-type": "text/html" } }));
    const r = await safeFetchPage(
      "http://example.com/",
      { maxBytes: 1000 },
      { dnsLookup: PUBLIC_DNS, fetchImpl: fetchImpl as typeof fetch },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/exceeded size limit/);
  });

  test("rejects declared content-length over the limit", async () => {
    const fetchImpl = jest.fn(async () =>
      htmlResponse("<h1>hi</h1>", 200, { "content-length": String(10 * 1024 * 1024) }),
    );
    const r = await safeFetchPage(
      "http://example.com/",
      { maxBytes: 1000 },
      { dnsLookup: PUBLIC_DNS, fetchImpl: fetchImpl as typeof fetch },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/Declared size/);
  });

  test("rejects disallowed content types", async () => {
    const fetchImpl = jest.fn(async () =>
      new Response("binary", { headers: { "content-type": "application/octet-stream" } }),
    );
    const r = await safeFetchPage(
      "http://example.com/",
      {},
      { dnsLookup: PUBLIC_DNS, fetchImpl: fetchImpl as typeof fetch },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/Content-type not allowed/);
  });

  test("too many redirects fails closed", async () => {
    const fetchImpl = jest.fn(async () => new Response(null, { status: 302, headers: { location: "/loop" } }));
    const r = await safeFetch(
      "http://example.com/",
      { allowContentTypes: ["text/html"], maxRedirects: 2 },
      { dnsLookup: PUBLIC_DNS, fetchImpl: fetchImpl as typeof fetch },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/Too many redirects/);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  test("happy path returns bytes with provenance", async () => {
    const fetchImpl = jest.fn(async () => htmlResponse("<title>Hi</title>"));
    const r = await safeFetchPage(
      "http://example.com/",
      {},
      { dnsLookup: PUBLIC_DNS, fetchImpl: fetchImpl as typeof fetch },
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.bytes.toString()).toContain("<title>Hi</title>");
      expect(r.contentType).toBe("text/html");
      expect(r.finalUrl).toBe("http://example.com/");
      expect(r.redirectChain).toEqual([]);
    }
  });
});
