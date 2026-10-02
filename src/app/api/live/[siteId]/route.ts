import { NextRequest, NextResponse } from "next/server";
import { buildPortalProjection } from "@/fyd/preview/pipeline";
import { isSafeWebHref } from "@/fyd/preview/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const OBJECT_ID_PATTERN = /^[a-z0-9-]+$/;
const FETCH_TIMEOUT_MS = 10000;
const MAX_BYTES = 2 * 1024 * 1024;

/**
 * GET /api/live/[siteId]
 *
 * Nolan 2026-10-02: portals open the LIVE website, not a static
 * screenshot. Many small-business hosts (Squarespace et al) send
 * X-Frame-Options: SAMEORIGIN, which blocks a direct iframe. This
 * route re-serves the portal's own website document same-origin with
 * frame-blocking headers stripped and a <base> tag injected, so the
 * iframe renders the live site in real time. Subresources keep loading
 * from the real origin via <base>; only the top document is proxied.
 *
 * Safety: closed set of portal ids (buildPortalProjection returns null
 * for anything else), https-only validated hrefs, no credentials, fetch
 * timeout, 2MB cap. Never a general-purpose proxy.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await params;
  if (!OBJECT_ID_PATTERN.test(siteId)) {
    return fallback("Unknown site.");
  }
  let href: string | null = null;
  try {
    href = buildPortalProjection(siteId)?.websiteHref ?? null;
  } catch {
    href = null;
  }
  if (!href || !isSafeWebHref(href)) {
    return fallback("No safe website for this portal.");
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    // Same-origin redirect chain only: a redirect off the site's own
    // domain (parked domain, hijack, captive portal) fails closed to the
    // fallback page instead of embedding a stranger's content. apex <->
    // www counts as the same site. Never a general proxy.
    const siteHost = new URL(href).hostname.replace(/^www\./i, "");
    const siteProto = new URL(href).protocol;
    let current = href;
    let upstream: Response | null = null;
    for (let hop = 0; hop < 5; hop++) {
      const res = await fetch(current, {
        signal: ctrl.signal,
        redirect: "manual",
        headers: {
          "User-Agent": "PING-LiveEmbed/1.0 (+portal preview)",
          Accept: "text/html",
        },
      });
      const loc = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && loc) {
        const next = new URL(loc, current);
        const nextHost = next.hostname.replace(/^www\./i, "");
        if (nextHost !== siteHost || next.protocol !== siteProto) {
          return fallback("The live site redirected away from its own domain.", href);
        }
        current = next.toString();
        continue;
      }
      upstream = res;
      break;
    }
    if (!upstream) return fallback("The live site redirected too many times.", href);
    if (!upstream.ok) return fallback("The live site did not respond.", href);
    const contentType = upstream.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) return fallback("The live site did not return a page.", href);

    const buf = await upstream.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) return fallback("The live site page is too large to embed.", href);
    let html = new TextDecoder("utf-8", { fatal: false }).decode(buf);

    // <base> so relative subresource/link URLs resolve to the real site.
    // Anchored to the portal's own origin (not the final hop), so a
    // same-origin redirect chain cannot rebase assets elsewhere.
    const origin = new URL(href).origin + "/";
    if (/<head[^>]*>/i.test(html)) {
      html = html.replace(/<head[^>]*>/i, (m) => `${m}<base href="${origin}">`);
    } else if (/<html[^>]*>/i.test(html)) {
      html = html.replace(/<html[^>]*>/i, (m) => `${m}<head><base href="${origin}"></head>`);
    }

    const headers = new Headers();
    headers.set("content-type", "text/html; charset=utf-8");
    headers.set("cache-control", "public, max-age=120");
    // Strip frame-ancestors only; keep the rest of the site's CSP.
    const csp = upstream.headers.get("content-security-policy");
    if (csp) {
      const kept = csp
        .split(";")
        .map((d) => d.trim())
        .filter((d) => d && !/^frame-ancestors\b/i.test(d));
      if (kept.length > 0) headers.set("content-security-policy", kept.join("; "));
    }
    // Deliberately NOT forwarding x-frame-options.
    return new NextResponse(html, { status: 200, headers });
  } catch {
    return fallback("Could not reach the live site right now.", href);
  } finally {
    clearTimeout(timer);
  }
}

function fallback(message: string, href?: string | null) {
  const link = href
    ? `<p><a href="${href}" target="_blank" rel="noopener" style="color:#d9a441">Open the live site in a new tab</a></p>`
    : "";
  return new NextResponse(
    `<!doctype html><html><body style="font-family:system-ui;background:#141210;color:#e8e2d6;display:flex;align-items:center;justify-content:center;min-height:90vh;margin:0"><div style="text-align:center;padding:24px"><p>${message}</p>${link}</div></body></html>`,
    { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}
