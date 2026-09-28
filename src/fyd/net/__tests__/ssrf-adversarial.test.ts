/**
 * SSRF adversarial matrix (Nolan 2026-09-28, fail closed, mocked only).
 *
 * Every case asserts the EFFECTIVE destination is validated: after URL
 * parsing/normalization, after DNS resolution, and on every redirect hop.
 * No test performs a real socket connection: DNS and fetch are injected.
 * Nothing here probes production or private targets.
 *
 * Classes:
 *  - IPv4 private / loopback / link-local, incl. runtime-accepted
 *    alternate encodings (decimal, hex, octal, truncated, trailing dot)
 *  - IPv6 loopback, link-local, unspecified
 *  - IPv4-mapped IPv6 (dotted + hex), incl. translatable form
 *  - IPv4-compatible IPv6 (all spellings the runtime accepts)
 *  - 6to4, NAT64, ISATAP, Teredo, documentation/benchmarking ranges
 *  - public URL redirecting to a private effective destination
 *  - DNS resolving a public hostname to a private effective destination
 */

import { isPublicIp, safeFetch, safeFetchPage } from "../safe-fetch";

describe("isPublicIp adversarial matrix", () => {
  test.each([
    ["127.0.0.1", "loopback"],
    ["127.1.2.3", "loopback /8"],
    ["10.0.0.5", "RFC1918"],
    ["172.16.0.1", "RFC1918"],
    ["192.168.1.1", "RFC1918"],
    ["169.254.169.254", "link-local metadata endpoint"],
    ["100.64.0.1", "CGNAT"],
    ["0.0.0.0", "this network"],
    ["224.0.0.1", "multicast"],
    ["::1", "IPv6 loopback"],
    ["::", "IPv6 unspecified"],
    ["fe80::1", "IPv6 link-local"],
    ["fec0::1", "IPv6 site-local-ish (fc00::/7)"],
    ["ff02::1", "IPv6 multicast"],
  ])("rejects %s (%s)", (ip) => {
    expect(isPublicIp(ip)).toBe(false);
  });

  test.each([
    ["::ffff:127.0.0.1", "mapped dotted loopback"],
    ["::ffff:7f00:1", "mapped hex loopback"],
    ["::ffff:10.0.0.5", "mapped dotted RFC1918"],
    ["::ffff:a00:1", "mapped hex RFC1918"],
    ["::ffff:0:7f00:1", "translatable (SIIT) loopback"],
    ["::ffff:0:0", "translatable zero"],
  ])("rejects %s (%s)", (ip) => {
    expect(isPublicIp(ip)).toBe(false);
  });

  test.each([
    ["::7f00:1", "compatible hex loopback"],
    ["::127.0.0.1", "compatible dotted loopback"],
    ["0:0:0:0:0:0:127.0.0.1", "compatible uncompressed dotted loopback"],
    ["0:0:0:0:0:0:7f00:1", "compatible uncompressed hex loopback"],
    ["::a00:1", "compatible hex RFC1918"],
    ["::ffff:1:2:3", "mapped-adjacent unassigned space"],
  ])("rejects %s (%s)", (ip) => {
    expect(isPublicIp(ip)).toBe(false);
  });

  test.each([
    ["2002:7f00:1::", "6to4 loopback"],
    ["2002:a00:1::", "6to4 RFC1918"],
    ["2002:c0a8:101::", "6to4 192.168.1.1"],
    ["64:ff9b::7f00:1", "NAT64 loopback"],
    ["64:ff9b::127.0.0.1", "NAT64 dotted loopback"],
    ["64:ff9b::a00:1", "NAT64 RFC1918"],
    ["::0:5efe:7f00:1", "ISATAP loopback"],
    ["::0:5efe:127.0.0.1", "ISATAP dotted loopback"],
    ["2001::1", "Teredo (XOR-obfuscated, undecodable)"],
    ["2001:db8::1", "documentation range"],
    ["2001:2::1", "benchmarking range"],
  ])("rejects %s (%s)", (ip) => {
    expect(isPublicIp(ip)).toBe(false);
  });

  test("6to4 embedding a public IPv4 stays precisely classified", () => {
    // 2002:5db8:d822:: embeds 93.184.216.34 (public). The gate classifies
    // the effective v4 destination, not the mechanism.
    expect(isPublicIp("2002:5db8:d822::")).toBe(true);
  });

  test("genuine public addresses stay public", () => {
    expect(isPublicIp("93.184.216.34")).toBe(true);
    expect(isPublicIp("2606:2800:220:1:248:1893:25c8:1946")).toBe(true);
    expect(isPublicIp("::ffff:5db8:d822")).toBe(true);
  });
});

const PUBLIC_DNS = async (hostname: string) => {
  if (hostname === "example.com" || hostname === "example.org") {
    return [{ address: "93.184.216.34" }];
  }
  throw new Error("getaddrinfo ENOTFOUND " + hostname);
};
const dnsFor = (address: string) => async (hostname: string) => {
  if (hostname === "evil.example") return [{ address }];
  return PUBLIC_DNS(hostname);
};

function pageFetch(
  handler: (url: string) => Promise<Response>,
): jest.Mock<Promise<Response>, [string]> {
  return jest.fn(async (url: string | URL | Request) => handler(String(url))) as unknown as jest.Mock<
    Promise<Response>,
    [string]
  >;
}

const OK_PAGE = () =>
  new Response("<title>ok</title>", { headers: { "content-type": "text/html" } });

describe("safeFetch effective-destination boundary (mocked)", () => {
  test.each([
    "http://2130706433/",
    "http://0x7f.0.0.1/",
    "http://0x7f000001/",
    "http://0177.0.0.1/",
    "http://127.1/",
    "http://127.0.0.1./",
    "http://3232235777/",
    "http://0xc0.0xA8.0x01.0x01/",
  ])("rejects alternate IPv4 encoding %s without fetching", async (url) => {
    const fetchImpl = pageFetch(async () => OK_PAGE());
    const r = await safeFetchPage(url, {}, { dnsLookup: PUBLIC_DNS, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/not public routable/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test.each([
    "http://[::]/",
    "http://[::1]/",
    "http://[fe80::1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://[::ffff:7f00:1]/",
    "http://[::7f00:1]/",
    "http://[0:0:0:0:0:0:127.0.0.1]/",
    "http://[2002:7f00:1::]/",
    "http://[64:ff9b::7f00:1]/",
    "http://[::0:5efe:127.0.0.1]/",
    "http://[2001::1]/",
    "http://[2001:db8::1]/",
  ])("rejects IPv6 literal %s without fetching", async (url) => {
    const fetchImpl = pageFetch(async () => OK_PAGE());
    const r = await safeFetchPage(url, {}, { dnsLookup: PUBLIC_DNS, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/not public routable/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test.each([
    ["http://[2002:7f00:1::]/", "6to4"],
    ["http://[64:ff9b::7f00:1]/", "NAT64"],
    ["http://[::ffff:7f00:1]/", "mapped"],
    ["http://[::7f00:1]/", "compatible"],
    ["http://0x7f.0.0.1/", "alternate encoding"],
    ["http://10.0.0.5/", "plain private"],
  ])("rejects public redirect to private space (%s via %s)", async (target: string) => {
    const fetchImpl = pageFetch(async (u) => {
      if (u === "http://example.com/") {
        return new Response(null, { status: 302, headers: { location: target } });
      }
      throw new Error("must never fetch " + u);
    });
    const r = await safeFetchPage(
      "http://example.com/",
      {},
      { dnsLookup: PUBLIC_DNS, fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toMatch(/not public routable/);
      expect(r.redirectChain).toHaveLength(1);
    }
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test.each([
    ["2002:7f00:1::", "6to4"],
    ["64:ff9b::7f00:1", "NAT64"],
    ["::ffff:10.0.0.5", "mapped"],
    ["::a00:1", "compatible"],
    ["10.0.0.5", "plain private"],
  ])("rejects DNS resolving to private space (%s via %s)", async (address: string) => {
    const fetchImpl = pageFetch(async () => OK_PAGE());
    const r = await safeFetchPage(
      "http://evil.example/",
      {},
      { dnsLookup: dnsFor(address), fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(new RegExp("non-public " + address.replace(/:/g, "\\:")));
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("public -> public redirect chain still works", async () => {
    const fetchImpl = pageFetch(async (u) => {
      if (u === "http://example.com/") {
        return new Response(null, { status: 302, headers: { location: "http://example.org/" } });
      }
      return OK_PAGE();
    });
    const r = await safeFetchPage(
      "http://example.com/",
      {},
      { dnsLookup: PUBLIC_DNS, fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.finalUrl).toBe("http://example.org/");
      expect(r.redirectChain).toHaveLength(1);
    }
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  test("each redirect hop re-resolves DNS (no rebinding past the gate)", async () => {
    const seen: string[] = [];
    const dnsLookup = async (hostname: string) => {
      seen.push(hostname);
      return PUBLIC_DNS(hostname);
    };
    const fetchImpl = pageFetch(async (u) => {
      if (u === "http://example.com/") {
        return new Response(null, { status: 302, headers: { location: "http://example.org/" } });
      }
      return OK_PAGE();
    });
    const r = await safeFetchPage(
      "http://example.com/",
      {},
      { dnsLookup, fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(r.ok).toBe(true);
    expect(seen).toEqual(["example.com", "example.org"]);
  });
});
