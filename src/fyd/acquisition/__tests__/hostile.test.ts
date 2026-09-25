/**
 * Hostile-URL tests for the FYD live acquisition loop (Track F).
 *
 * No real network: every case injects dnsLookup/fetchImpl stubs through
 * SafeFetchDeps. These prove the fail-closed contract: hostile input
 * terminates with a typed AcquisitionFailureCode and never reaches the
 * internal network (the fetch spy is never called when the L0 gate
 * refuses).
 */

import { runLiveLoop } from "../live-loop";
import { classifyFetchFailure } from "../errors";
import type { SafeFetchDeps } from "@/fyd/net/safe-fetch";

const PUBLIC_DNS: SafeFetchDeps["dnsLookup"] = async () => [{ address: "93.184.216.34" }];
const PRIVATE_DNS: SafeFetchDeps["dnsLookup"] = async () => [{ address: "192.168.1.10" }];

function stubFetch(handler: (url: string) => Response): SafeFetchDeps["fetchImpl"] {
  return (async (input: unknown) => handler(String(input))) as SafeFetchDeps["fetchImpl"];
}

const GOOD_HTML =
  '<html><head><title>Test Trade Co</title>' +
  '<meta property="og:description" content="We fix pipes in Grand Junction.">' +
  '<meta property="og:url" content="https://www.testtradeco.example/">' +
  "</head><body><h1>Test Trade Co</h1></body></html>";

function pageDeps(overrides?: {
  dns?: SafeFetchDeps["dnsLookup"];
  status?: number;
  contentType?: string;
  body?: string;
}): SafeFetchDeps {
  const dns = overrides?.dns ?? PUBLIC_DNS;
  const status = overrides?.status ?? 200;
  const contentType = overrides?.contentType ?? "text/html; charset=utf-8";
  const body = overrides?.body ?? GOOD_HTML;
  return {
    dnsLookup: dns,
    fetchImpl: stubFetch((url) => {
      if (url.endsWith("/robots.txt")) return new Response("User-agent: *\nDisallow:\n", { status: 200, headers: { "content-type": "text/plain" } });
      return new Response(body, { status, headers: { "content-type": contentType } });
    }),
  };
}

describe("classifyFetchFailure", () => {
  it("maps safe-fetch reasons to typed codes", () => {
    expect(classifyFetchFailure("URL rejected: Not a parseable URL")).toBe("ACQ_INVALID_URL");
    expect(classifyFetchFailure("URL rejected: Scheme not allowed: ftp:")).toBe("ACQ_SCHEME_REJECTED");
    expect(classifyFetchFailure("URL rejected: Credential-bearing URLs are rejected")).toBe("ACQ_CREDENTIAL_URL");
    expect(classifyFetchFailure("DNS rejected: IP literal is not public routable space: 10.0.0.1")).toBe("ACQ_PRIVATE_IP");
    expect(classifyFetchFailure("DNS rejected: DNS for x resolves to non-public 192.168.0.1")).toBe("ACQ_PRIVATE_IP");
    expect(classifyFetchFailure("DNS rejected: DNS resolution failed for x")).toBe("ACQ_DNS_FAILED");
    expect(classifyFetchFailure("Fetch failed: The operation was aborted due to timeout")).toBe("ACQ_TIMEOUT");
    expect(classifyFetchFailure("Fetch failed: connect ECONNREFUSED")).toBe("ACQ_NETWORK_ERROR");
    expect(classifyFetchFailure("HTTP 404")).toBe("ACQ_HTTP_STATUS");
    expect(classifyFetchFailure("Content-type not allowed: application/pdf")).toBe("ACQ_CONTENT_TYPE_REJECTED");
    expect(classifyFetchFailure("Body exceeded size limit 5242880")).toBe("ACQ_TOO_LARGE");
    expect(classifyFetchFailure("Too many redirects (>5)")).toBe("ACQ_REDIRECT_LOOP");
  });
});

describe("live loop hostile URLs (no real network)", () => {
  it("rejects a private IPv4 literal without touching the network", async () => {
    let fetched = false;
    const deps: SafeFetchDeps = {
      dnsLookup: PUBLIC_DNS,
      fetchImpl: stubFetch(() => {
        fetched = true;
        return new Response("x", { status: 200, headers: { "content-type": "text/html" } });
      }),
    };
    const r = await runLiveLoop({ url: "http://10.0.0.5/", safeFetchDeps: deps, runMedia: false });
    expect(r.report.error?.code).toBe("ACQ_PRIVATE_IP");
    expect(r.report.error?.stage).toBe("discover");
    expect(fetched).toBe(false);
    expect(r.report.stages[0]).toMatchObject({ stage: "discover", status: "failed" });
  });

  it("rejects the metadata endpoint class (169.254.169.254)", async () => {
    const r = await runLiveLoop({ url: "http://169.254.169.254/", safeFetchDeps: { dnsLookup: PUBLIC_DNS }, runMedia: false });
    expect(r.report.error?.code).toBe("ACQ_PRIVATE_IP");
  });

  it("rejects loopback", async () => {
    const r = await runLiveLoop({ url: "http://127.0.0.1:3000/", safeFetchDeps: { dnsLookup: PUBLIC_DNS }, runMedia: false });
    expect(r.report.error?.code).toBe("ACQ_PRIVATE_IP");
  });

  it("rejects DNS that resolves to private space", async () => {
    let fetched = false;
    const deps: SafeFetchDeps = {
      dnsLookup: PRIVATE_DNS,
      fetchImpl: stubFetch(() => {
        fetched = true;
        return new Response("x", { status: 200, headers: { "content-type": "text/html" } });
      }),
    };
    const r = await runLiveLoop({ url: "https://intranet.example/", safeFetchDeps: deps, runMedia: false });
    expect(r.report.error?.code).toBe("ACQ_PRIVATE_IP");
    expect(fetched).toBe(false);
  });

  it("rejects non-http schemes", async () => {
    const r = await runLiveLoop({ url: "ftp://example.com/file", safeFetchDeps: { dnsLookup: PUBLIC_DNS }, runMedia: false });
    expect(r.report.error?.code).toBe("ACQ_SCHEME_REJECTED");
  });

  it("rejects credential-bearing URLs", async () => {
    const r = await runLiveLoop({ url: "https://user:pass@example.com/", safeFetchDeps: { dnsLookup: PUBLIC_DNS }, runMedia: false });
    expect(r.report.error?.code).toBe("ACQ_CREDENTIAL_URL");
  });

  it("rejects unparseable URLs", async () => {
    const r = await runLiveLoop({ url: "not a url at all", safeFetchDeps: { dnsLookup: PUBLIC_DNS }, runMedia: false });
    expect(r.report.error?.code).toBe("ACQ_INVALID_URL");
  });

  it("fails closed on non-HTML content", async () => {
    const r = await runLiveLoop({
      url: "https://www.testtradeco.example/brochure.pdf",
      safeFetchDeps: pageDeps({ contentType: "application/pdf", body: "%PDF-1.4 fake" }),
      runMedia: false,
    });
    expect(r.report.error?.code).toBe("ACQ_CONTENT_TYPE_REJECTED");
    expect(r.report.error?.stage).toBe("acquire");
  });

  it("fails closed on HTTP 404", async () => {
    const r = await runLiveLoop({
      url: "https://www.testtradeco.example/nope",
      safeFetchDeps: pageDeps({ status: 404, body: "not found" }),
      runMedia: false,
    });
    expect(r.report.error?.code).toBe("ACQ_HTTP_STATUS");
  });

  it("maps fetch aborts to ACQ_TIMEOUT", async () => {
    const deps: SafeFetchDeps = {
      dnsLookup: PUBLIC_DNS,
      fetchImpl: stubFetch((url) => {
        if (url.endsWith("/robots.txt")) return new Response("", { status: 404 });
        throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
      }),
    };
    const r = await runLiveLoop({ url: "https://www.testtradeco.example/", safeFetchDeps: deps, runMedia: false });
    expect(r.report.error?.code).toBe("ACQ_TIMEOUT");
  });

  it("refuses a page that yields zero facts", async () => {
    const r = await runLiveLoop({
      url: "https://www.testtradeco.example/",
      safeFetchDeps: pageDeps({ body: "<html><head></head><body></body></html>" }),
      runMedia: false,
    });
    expect(r.report.error?.code).toBe("ACQ_EMPTY_CONTENT");
  });

  it("skips media for unauthorized tenants with MEDIA_RIGHTS_SCOPE", async () => {
    const r = await runLiveLoop({
      url: "https://www.testtradeco.example/",
      tenantId: "someone-elses-business",
      safeFetchDeps: pageDeps(),
      runMedia: true,
    });
    expect(r.report.error).toBeNull();
    expect(r.report.media?.status).toBe("skipped");
    expect(r.report.media?.reason).toContain("MEDIA_RIGHTS_SCOPE");
    expect(r.renderable).toBe(true);
    expect(r.report.graphSummary.objects).toBeGreaterThan(0);
  });

  it("accepts intake socials that pass the gate and rejects hostile ones", async () => {
    const r = await runLiveLoop({
      url: "https://www.testtradeco.example/",
      tenantId: "someone-elses-business",
      safeFetchDeps: pageDeps(),
      runMedia: false,
      socials: ["https://www.facebook.com/testtradeco", "http://10.9.9.9/evil"],
    });
    expect(r.report.error).toBeNull();
    const ok = r.report.socials.find((s) => s.url.includes("facebook"));
    const bad = r.report.socials.find((s) => s.url.includes("10.9.9.9"));
    expect(ok?.status).toBe("accepted");
    expect(bad?.status).toBe("rejected");
    expect(bad?.code).toBe("ACQ_PRIVATE_IP");
    expect(r.report.graphSummary.schemas["ping.social.external_identity@1"]).toBe(1);
  });
});
