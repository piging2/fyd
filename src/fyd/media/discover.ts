/**
 * Image discovery from fetched HTML.
 *
 * Extracts candidate image references from: <img> (src, data-src,
 * data-lazy-src, data-original, srcset, data-srcset),
 * <meta property="og:image">, JSON-LD "image" fields, and
 * <link rel="image_src">. Pure function: HTML string in,
 * discovered references out. No fetching here.
 *
 * PARSING (harvest posture): HTML parsing is a commodity layer and is NOT
 * hand-rolled here. We use the ecosystem package `node-html-parser`
 * (PING has no HTML parser to harvest; `fast-xml-parser` is XML-only).
 * Only the FYD-specific extraction policy (which attributes count, the
 * srcset best-candidate rule, JSON-LD image collection, rights
 * classification) is ours. Output contract is unchanged from the
 * regex implementation it replaces.
 *
 * Rights classification (generic heuristic, no customer-specific lists).
 * Produces a RightsSource; the PIPELINE enforces it (ingest.ts refuses to
 * acquire unclear-reference-only assets: the reference is retained, the
 * bytes are never fetched, derivatives never generated).
 * - Same-origin public marketing imagery on the business site is
 *   "public-demo-source": Nolan's standing default for these demo
 *   businesses. FYD claims no copyright; the basis sentence says so.
 * - Off-origin images, logo-like images that do NOT match the business's
 *   own name, and unparseable URLs are "unclear-reference-only":
 *   third-party brand marks (manufacturers, badges) are referenced, never
 *   claimed or republished as FYD media.
 * - "business-provided" is the forward slot for owner-supplied assets;
 *   the demo ingest never mints it (nothing in the demo flow is
 *   business-provided yet), but the pipeline treats it as acquirable.
 *
 * The classifier never invents ownership. Publicly fetchable is not
 * FYD-owned IP; rightsBasis always states the basis in plain language.
 */

import { parse, type HTMLElement } from "node-html-parser";
import type { RightsSource } from "./types";

export interface DiscoveredImage {
  url: string;
  alt: string | null;
  kind: "img" | "srcset" | "og:image" | "jsonld" | "link-image";
}

/** Pick the largest candidate from a srcset value. */
function bestSrcsetCandidate(srcset: string): string | null {
  let best: { url: string; w: number } | null = null;
  for (const part of srcset.split(",")) {
    const tokens = part.trim().split(/\s+/);
    const url = tokens[0];
    if (!url) continue;
    const desc = tokens[1] ?? "";
    const w = desc.endsWith("w") ? Number(desc.slice(0, -1)) : desc.endsWith("x") ? Number(desc.slice(0, -1)) * 1000 : 0;
    if (!best || w >= best.w) best = { url, w };
  }
  return best?.url ?? null;
}

function pushUnique(out: DiscoveredImage[], seen: Set<string>, url: string, alt: string | null, kind: DiscoveredImage["kind"], pageUrl: string) {
  let abs: string;
  try {
    abs = new URL(url, pageUrl).toString();
  } catch {
    return;
  }
  if (!/^https?:\/\//i.test(abs)) return;
  if (seen.has(abs)) return;
  seen.add(abs);
  out.push({ url: abs, alt, kind });
}

/** Attribute lookup that is case-insensitive on the attribute name. */
function attrsLower(el: HTMLElement): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(el.attributes)) out[k.toLowerCase()] = v;
  return out;
}

function firstAttr(attrs: Record<string, string>, names: string[]): string | null {
  for (const n of names) {
    const v = attrs[n];
    if (v) return v;
  }
  return null;
}

/** Collect every URL-like string under a JSON value (any depth). */
function collectUrlStrings(node: unknown, out: string[]): void {
  if (typeof node === "string") {
    if (/^(https?:)?\/\//i.test(node)) out.push(node);
    return;
  }
  if (Array.isArray(node)) {
    for (const v of node) collectUrlStrings(v, out);
    return;
  }
  if (node && typeof node === "object") {
    for (const v of Object.values(node)) collectUrlStrings(v, out);
  }
}

/** Walk a parsed JSON-LD document collecting "image" values (any depth). */
function collectJsonLdImages(node: unknown, out: string[]): void {
  if (Array.isArray(node)) {
    for (const v of node) collectJsonLdImages(v, out);
    return;
  }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (k.toLowerCase() === "image") collectUrlStrings(v, out);
      else collectJsonLdImages(v, out);
    }
  }
}

/** Legacy regex scan for JSON-LD blocks that do not parse as JSON. */
function scanJsonLdFallback(body: string, out: string[]): void {
  for (const im of body.matchAll(/"image"\s*:\s*(\[[^\]]*\]|"[^"]*"|\{[^{}]*\})/g)) {
    const val = im[1];
    const urls: string[] = [];
    if (val.startsWith('"')) urls.push(val.slice(1, -1));
    else for (const u of val.matchAll(/"((?:https?:)?\/\/[^"]+)"/g)) urls.push(u[1]);
    for (const u of urls) out.push(u);
  }
}

export function discoverImages(html: string, pageUrl: string): DiscoveredImage[] {
  const out: DiscoveredImage[] = [];
  const seen = new Set<string>();
  const root = parse(html);
  // Document order within each category; categories keep the historical
  // processing order (img, og:image, link, jsonld) so output order is stable.
  const els = root.querySelectorAll("img,meta,link,script");
  const byTag = (t: string): HTMLElement[] =>
    els.filter((el) => (el.tagName ?? "").toLowerCase() === t);

  for (const img of byTag("img")) {
    const attrs = attrsLower(img);
    const alt = attrs["alt"] ?? null;
    const src = firstAttr(attrs, ["src", "data-src", "data-lazy-src", "data-original"]);
    if (src && !src.startsWith("data:")) pushUnique(out, seen, src, alt, "img", pageUrl);
    const srcset = firstAttr(attrs, ["srcset", "data-srcset"]);
    if (srcset) {
      const best = bestSrcsetCandidate(srcset);
      if (best && !best.startsWith("data:")) pushUnique(out, seen, best, alt, "srcset", pageUrl);
    }
  }
  for (const meta of byTag("meta")) {
    const attrs = attrsLower(meta);
    if ((attrs["property"] ?? "").toLowerCase() !== "og:image") continue;
    const content = attrs["content"];
    if (content) pushUnique(out, seen, content, null, "og:image", pageUrl);
  }
  for (const link of byTag("link")) {
    const attrs = attrsLower(link);
    if ((attrs["rel"] ?? "").toLowerCase() !== "image_src") continue;
    const href = attrs["href"];
    if (href) pushUnique(out, seen, href, null, "link-image", pageUrl);
  }
  for (const script of byTag("script")) {
    const attrs = attrsLower(script);
    if ((attrs["type"] ?? "").toLowerCase() !== "application/ld+json") continue;
    const body = script.text.trim();
    if (!body) continue;
    const urls: string[] = [];
    try {
      collectJsonLdImages(JSON.parse(body), urls);
    } catch {
      scanJsonLdFallback(body, urls);
    }
    for (const u of urls) {
      const abs = u.startsWith("//") ? "https:" + u : u;
      pushUnique(out, seen, abs, null, "jsonld", pageUrl);
    }
  }
  return out;
}

export interface RightsCall {
  rightsSource: RightsSource;
  basis: string;
}

/**
 * Generic rights heuristic. businessSlug is the lowercased domain-ish name
 * (e.g. "coppersmith", "happy-place"), derived from the site, not a
 * customer list.
 */
export function classifyRights(
  imageUrl: string,
  businessSlug: string,
  sourceOrigin: string,
): RightsCall {
  let url: URL;
  try {
    url = new URL(imageUrl);
  } catch {
    return {
      rightsSource: "unclear-reference-only",
      basis: "Unparseable image URL; provenance unclear. Retained as a reference only; not acquired.",
    };
  }
  const file = url.pathname.split("/").pop()?.toLowerCase() ?? "";
  const looksLikeLogo = /logo|brand|badge/.test(file);
  const matchesBusiness = businessSlug.length >= 3 && file.includes(businessSlug);
  if (url.origin !== sourceOrigin) {
    return {
      rightsSource: "unclear-reference-only",
      basis:
        "Hosted off-site (" +
        url.host +
        "); authorization unclear. Retained as a reference only; not acquired, derived, or served as FYD media.",
    };
  }
  if (looksLikeLogo && !matchesBusiness) {
    return {
      rightsSource: "unclear-reference-only",
      basis:
        "Logo-like image that does not match the business name; treated as a third-party brand mark. Referenced, never claimed or republished.",
    };
  }
  return {
    rightsSource: "public-demo-source",
    basis:
      "Public marketing imagery on the business site; authorized for acquisition and derivative generation for this demo. " +
      "FYD claims no copyright: caching or deriving this asset does not transfer rights; the business (or its site licensor) retains all rights.",
  };
}
