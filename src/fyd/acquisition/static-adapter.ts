/**
 * FYD static acquisition adapter: the L1 implementation of the
 * AcquisitionAdapter contract (src/fyd/acquisition/acquisition-adapter.ts).
 *
 * TRACK F (2026-09-25). No new architecture: this implements the
 * types-only interface that already existed. The ONLY network touchpoint
 * in the live loop is safeFetchPage/safeFetch from @/fyd/net/safe-fetch
 * (Lane A: the canonical SSRF gate). There is exactly one SSRF
 * implementation and this file does not add fetch logic.
 *
 * Escalation contract:
 *   L0 policy gate  -> checkPolicy (shape, scheme, credentials, DNS-public,
 *                      registrable-domain allowlist). Also usable standalone.
 *   L1 static HTTP  -> acquire() via safeFetchPage (redirects re-validated
 *                      per hop, content-type allowlisted, size-capped,
 *                      timeout-bounded inside the gate).
 *   L2 browser-rendered fallback -> NOT IMPLEMENTED in this build. acquire()
 *                      records the L2 consideration as a typed policy note
 *                      instead of silently skipping it.
 *
 * SEAM (PRESERVE, do not build): the harvest lane is evaluating Crawl4AI.
 * A Crawl4AI adapter would plug in here as an alternate fetcher behind the
 * SAME AcquisitionAdapter interface (same typed observations out), gated
 * by a named gap + Nolan's go. Nothing in this file assumes the fetcher
 * is static HTTP beyond the L1 fast path.
 */

import { lookup } from "node:dns/promises";
import { createHash } from "node:crypto";
import { parse as parseHtml } from "node-html-parser";
import {
  isPublicIp,
  safeFetch,
  safeFetchPage,
  type SafeFetchDeps,
} from "@/fyd/net/safe-fetch";
import { discoverStructuredData } from "@/fyd/proceduralize/structured-data";
import type {
  AcquiredLink,
  AcquiredObservation,
  AcquisitionAdapter,
  AcquisitionPolicy,
  AcquisitionRequest,
  PolicyDecision,
} from "./acquisition-adapter";
import {
  classifyFetchFailure,
  LiveAcquisitionError,
} from "./errors";

/** Observation with the raw HTML attached for the UNDERSTAND stage. Local extension; not part of the adapter contract. */
export interface LiveAcquiredObservation extends AcquiredObservation {
  html: string;
}

function sha256Hex(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

function registrableDomain(hostname: string): string {
  const bare = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const parts = bare.split(".");
  if (parts.length <= 2) return bare;
  return parts.slice(-2).join(".");
}

async function checkHostPublic(
  hostname: string,
  dnsLookup: (hostname: string) => Promise<Array<{ address: string }>>,
): Promise<{ ok: boolean; reason?: string }> {
  const bare = hostname.replace(/^\[|\]$/g, "");
  if (/^\d+\.\d+\.\d+\.\d+$/.test(bare) || bare.includes(":")) {
    return isPublicIp(bare)
      ? { ok: true }
      : { ok: false, reason: "IP literal is not public routable space: " + bare };
  }
  let addrs: Array<{ address: string }>;
  try {
    addrs = await dnsLookup(hostname);
  } catch {
    return { ok: false, reason: "DNS resolution failed for " + hostname };
  }
  if (addrs.length === 0) return { ok: false, reason: "DNS returned no addresses for " + hostname };
  for (const a of addrs) {
    if (!isPublicIp(a.address)) {
      return { ok: false, reason: "DNS for " + hostname + " resolves to non-public " + a.address };
    }
  }
  return { ok: true };
}

function extractLinks(html: string, baseUrl: string, origin: string): AcquiredLink[] {
  const root = parseHtml(html);
  const out: AcquiredLink[] = [];
  const seen = new Set<string>();
  for (const a of root.querySelectorAll("a[href]").slice(0, 500)) {
    const href = (a.getAttribute("href") ?? "").trim();
    if (!href || href.startsWith("#") || href.startsWith("javascript:") || href.startsWith("mailto:") || href.startsWith("tel:")) continue;
    let absolute: string;
    try {
      absolute = new URL(href, baseUrl).toString();
    } catch {
      continue;
    }
    if (seen.has(absolute)) continue;
    seen.add(absolute);
    let internal = false;
    try {
      internal = new URL(absolute).origin === origin;
    } catch {
      continue;
    }
    out.push({
      href,
      absoluteUrl: absolute,
      rel: a.getAttribute("rel") ?? null,
      anchorText: (a.text ?? "").trim().slice(0, 120),
      internal,
    });
    if (out.length >= 200) break;
  }
  return out;
}

export class StaticAcquisitionAdapter implements AcquisitionAdapter {
  /** L0 gate, also usable standalone by the scheduler. */
  async checkPolicy(url: string, allowedDomains: string[], deps?: SafeFetchDeps): Promise<PolicyDecision> {
    let parsed: URL;
    try {
      parsed = new URL(url.trim());
    } catch {
      return { allowed: false, reason: "ACQ_INVALID_URL: not a parseable URL", normalizedUrl: null };
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { allowed: false, reason: "ACQ_SCHEME_REJECTED: " + parsed.protocol, normalizedUrl: null };
    }
    if (parsed.username || parsed.password) {
      return { allowed: false, reason: "ACQ_CREDENTIAL_URL: credential-bearing URLs are rejected", normalizedUrl: null };
    }
    const dnsLookup = deps?.dnsLookup ?? ((h: string) => lookup(h, { all: true }));
    const host = await checkHostPublic(parsed.hostname, dnsLookup);
    if (!host.ok) {
      const code = host.reason?.includes("not public") || host.reason?.includes("non-public") ? "ACQ_PRIVATE_IP" : "ACQ_DNS_FAILED";
      return { allowed: false, reason: code + ": " + host.reason, normalizedUrl: null };
    }
    const reg = registrableDomain(parsed.hostname);
    const allowed = allowedDomains.some((d) => {
      const dd = d.toLowerCase().replace(/^\*\./, "");
      return reg === dd || parsed.hostname.toLowerCase() === dd || parsed.hostname.toLowerCase().endsWith("." + dd);
    });
    if (!allowed) {
      return {
        allowed: false,
        reason: "ACQ_INVALID_URL: host " + parsed.hostname + " is outside the allowed domains [" + allowedDomains.join(", ") + "]",
        normalizedUrl: null,
      };
    }
    return { allowed: true, reason: "", normalizedUrl: parsed.toString() };
  }

  /**
   * L1 static acquisition. Throws LiveAcquisitionError with a typed code
   * on any terminal failure (fail closed; the caller converts to a
   * report, never to a half-built presence).
   */
  async acquire(
    request: AcquisitionRequest,
    policy: AcquisitionPolicy,
    deps?: SafeFetchDeps,
  ): Promise<AcquiredObservation[]> {
    const decision = await this.checkPolicy(request.url, request.allowedDomains, deps);
    if (!decision.allowed || !decision.normalizedUrl) {
      const [code] = decision.reason.split(": ");
      throw new LiveAcquisitionError(
        (code as LiveAcquisitionError["code"]) || "ACQ_INVALID_URL",
        "acquire",
        "L0 policy gate refused the seed URL: " + decision.reason,
      );
    }
    const seed = new URL(decision.normalizedUrl);

    // robots.txt compliance (policy.requireRobotsTxt has no public off switch).
    let robotsNote = "robots.txt check skipped (policy off)";
    if (policy.requireRobotsTxt) {
      const robots = await this.fetchText(
        seed.origin + "/robots.txt",
        ["text/plain"],
        64 * 1024,
        8000,
        deps,
      );
      if (robots.ok) {
        const disallows = robotsAllowsPath(robots.text, seed.pathname || "/");
        robotsNote = disallows
          ? "robots.txt DISALLOWS this path"
          : "robots.txt checked; path allowed";
        if (disallows) {
          throw new LiveAcquisitionError("ACQ_ROBOTS_DISALLOWED", "acquire", "robots.txt disallows " + seed.pathname);
        }
      } else {
        robotsNote = "robots.txt unavailable (" + robots.reason + "); proceeding, missing file is fail-open";
      }
    }

    // Capture the final response status honestly: safeFetch's typed result
    // does not carry it, so wrap the fetch impl.
    let finalStatus = 0;
    const wrappedDeps: SafeFetchDeps = {
      ...deps,
      fetchImpl: async (input: string | URL | Request, init?: RequestInit) => {
        const impl = deps?.fetchImpl ?? fetch;
        const res = await impl(input as string, init);
        finalStatus = res.status;
        return res;
      },
    };
    const res = await safeFetchPage(seed.toString(), {
      maxBytes: policy.maxBodyBytes,
      timeoutMs: policy.timeoutMs,
      maxRedirects: policy.maxRedirects,
    }, wrappedDeps);
    if (!res.ok) {
      throw new LiveAcquisitionError(
        classifyFetchFailure(res.reason),
        "acquire",
        "L1 fetch failed: " + res.reason,
      );
    }

    const html = res.bytes.toString("utf8");
    const root = parseHtml(html);
    const title = root.querySelector("title")?.text?.trim() || null;
    const meta: Record<string, string> = {};
    const openGraph: Record<string, string> = {};
    for (const m of root.querySelectorAll("meta").slice(0, 200)) {
      const key = (m.getAttribute("property") ?? m.getAttribute("name") ?? "").trim();
      const content = (m.getAttribute("content") ?? "").trim();
      if (!key || !content) continue;
      if (key.toLowerCase().startsWith("og:")) {
        if (!(key in openGraph)) openGraph[key] = content;
      } else if (!(key in meta)) {
        meta[key] = content;
      }
    }
    const jsonLd: unknown[] = [];
    try {
      for (const b of discoverStructuredData(html)) {
        if (b.ok && b.parsed !== undefined) jsonLd.push(b.parsed);
        else jsonLd.push({ unparseable: b.raw.slice(0, 200), error: b.error });
      }
    } catch {
      // JSON-LD discovery is best-effort; the UNDERSTAND stage does the
      // authoritative structured extraction.
    }
    const canonicalUrl = root.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? null;
    const finalUrlObj = new URL(res.finalUrl);
    const links = extractLinks(html, res.finalUrl, finalUrlObj.origin);

    const observation: LiveAcquiredObservation = {
      url: seed.toString(),
      finalUrl: res.finalUrl,
      fetchedAt: new Date().toISOString(),
      statusCode: finalStatus,
      contentType: res.contentType,
      bytes: res.bytes.length,
      truncated: false,
      levelUsed: 1,
      depth: 0,
      title,
      meta,
      openGraph,
      jsonLd,
      canonicalUrl: canonicalUrl ? new URL(canonicalUrl, res.finalUrl).toString() : null,
      links,
      policyNotes: [
        robotsNote + ".",
        "L2 browser-rendered fallback is NOT implemented in this build; " +
          "the Crawl4AI adapter seam is reserved for it (harvest lane " +
          "evaluating; integration needs a named gap + Nolan's go). " +
          "Proceeding on L1 static extraction only.",
      ],
      evidenceHash: sha256Hex(res.bytes),
      escalation: [],
      html,
    };
    return [observation];
  }

  /**
   * Small typed text fetch through the same SSRF gate (robots.txt and
   * other policy reads). Returns {ok, text} or {ok:false, reason}.
   */
  async fetchText(
    url: string,
    allowContentTypes: string[],
    maxBytes: number,
    timeoutMs: number,
    deps?: SafeFetchDeps,
  ): Promise<{ ok: true; text: string } | { ok: false; reason: string }> {
    const res = await safeFetch(
      url,
      { allowContentTypes, maxBytes, timeoutMs, maxRedirects: 2 },
      deps,
    );
    if (!res.ok) return { ok: false, reason: res.reason };
    return { ok: true, text: res.bytes.toString("utf8") };
  }
}

/** Minimal robots.txt: honor Disallow for User-agent: * (and our bot names). */
function robotsAllowsPath(robotsText: string, path: string): boolean {
  let inScope = false;
  const disallows: string[] = [];
  for (const line of robotsText.split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (field === "user-agent") {
      const v = value.toLowerCase();
      inScope = v === "*" || v === "fyd-socialbot" || v === "fyd-media-ingest";
    } else if (field === "disallow" && inScope && value) {
      disallows.push(value);
    }
  }
  for (const d of disallows) {
    if (d === "/" || (d.length > 1 && path.startsWith(d))) return true;
  }
  return false;
}
