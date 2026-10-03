// ==== FYD EMBED SHIMS (portal lane 2026-10-02): begin ====
import { injectEmbedShims } from "@/fyd/ui/storage-shim";
// ==== FYD EMBED SHIMS (portal lane 2026-10-02): end ====
import { NextRequest, NextResponse } from "next/server";
import { buildPortalProjection } from "@/fyd/preview/pipeline";
import { isSafeWebHref } from "@/fyd/preview/types";
import { PreviewSizeLimitError, readPreviewHtml } from "@/fyd/preview/bounded-response";

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
          await res.body?.cancel().catch(() => {});
          return fallback("The live site redirected away from its own domain.", href);
        }
        await res.body?.cancel().catch(() => {});
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

    let html = await readPreviewHtml(upstream, MAX_BYTES, ctrl);

    // <base> so relative subresource/link URLs resolve to the real site.
    // Anchored to the portal's own origin (not the final hop), so a
    // same-origin redirect chain cannot rebase assets elsewhere.
    const origin = new URL(href).origin + "/";
    if (/<head[^>]*>/i.test(html)) {
      html = html.replace(/<head[^>]*>/i, (m) => `${m}<base href="${origin}">`);
    } else if (/<html[^>]*>/i.test(html)) {
      html = html.replace(/<html[^>]*>/i, (m) => `${m}<head><base href="${origin}"></head>`);
    }

    // ==== FYD EMBED SHIMS (portal lane 2026-10-02): begin ====
    // Proxied generated sites (e.g. Happy Place) crash with a user-visible
    // "Application error" inside FYD's sandboxed iframe (no allow-same-origin):
    // storage access throws (fixed by the storage shim's in-memory fallbacks)
    // and cross-frame location probes (window.parent.location.origin) throw a
    // browser-enforced SecurityError no same-document script can prevent
    // (reported by the crash beacon so the portal swaps the dead iframe for
    // its graceful fallback UI). Never loosen the iframe sandbox.
    html = injectEmbedShims(html);
    // ==== FYD EMBED SHIMS (portal lane 2026-10-02): end ====

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
  } catch (error) {
    if (error instanceof PreviewSizeLimitError) return fallback(error.message, href);
    return fallback("Could not reach the live site right now.", href);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Stored-XSS guard (P1-1, red-team round 1, 2026-10-03): the websiteHref and
 * the fallback message reach this sink from projected/onboarding data, which
 * is untrusted. Two independent layers:
 *   1. escapeHtml() encodes every interpolated value for its HTML context
 *      (attribute for href, text for message), so `"` or `<` cannot break
 *      out of markup.
 *   2. safeWebHref() additionally allows only parseable http:/https: URLs
 *      and rejects quotes, angle brackets, backticks, and whitespace, so
 *      javascript:, data:, and malformed URLs never render as a clickable
 *      link at all.
 * Exported for the regression test.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

export function safeWebHref(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (/[\s"<>`]/.test(raw)) return null;
  return escapeHtml(raw);
}

function fallback(message: string, href?: string | null) {
  const safe = href ? safeWebHref(href) : null;
  const link = safe
    ? `<p><a href="${safe}" target="_blank" rel="noopener" style="color:#d9a441">Open the live site in a new tab</a></p>`
    : "";
  return new NextResponse(
    `<!doctype html><html><body style="font-family:system-ui;background:#141210;color:#e8e2d6;display:flex;align-items:center;justify-content:center;min-height:90vh;margin:0"><div style="text-align:center;padding:24px"><p>${escapeHtml(message)}</p>${link}</div></body></html>`,
    { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}
