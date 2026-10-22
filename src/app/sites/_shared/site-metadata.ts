/**
 * FYD Social generated-site metadata seam. SERVER ONLY.
 *
 * Trust defect repair (2026-09-24): generated business pages previously
 * shipped PING's metadata (og:title/description, twitter:title/description,
 * og:url, rel=canonical all described https://ping.vercel.app). The defect
 * came from the root layout's hardcoded PING metadata export: per-site
 * pages only overrode `title`/`description`, so Next's metadata merge
 * kept the parent's openGraph/twitter/canonical blocks.
 *
 * This seam derives every social/search tag from the site's own
 * PING-backed projection at render time: the business name and its real
 * description come from the public owner business object, and the
 * canonical/og:url are the site's own route on the origin the request
 * was actually served from. Zero per-site conditionals: callers pass
 * only their site id. PING attribution is honest and labeled: the
 * generator marker names FYD Social as the generator; the business is
 * the subject of every tag.
 */

import type { Metadata } from "next";
import { headers } from "next/headers";
import { getSiteBundle } from "@/fyd/media/site-bundle";
import { findConfiguredMark } from "@/fyd/presentation/identity";
import {
  ownerAssertionsFromGraph,
  resolveBoundFieldVerified,
} from "@/fyd/sitespec/binding-verifier";
import type { ObjectGraph } from "@/fyd/sitespec/types";

const OWNER_BUSINESS_SCHEMA = "ping.social.business@1";

/** Public owner business object (the business this site is generated for). */
function ownerObject(graph: ObjectGraph) {
  return graph.objects.find(
    (o) => o.schema === OWNER_BUSINESS_SCHEMA && o.visibility === "public",
  );
}

/**
 * Resolve one bound owner field through the strong verifier (AP-1).
 * The direct lane is tried first (website-derived evidence). When it
 * cannot bind, the owner_authored lane is tried: it binds a value only
 * when a recorded owner assertion attests it. This matters for tenants
 * whose owner object carries the legacy owner-asserted provenance kind:
 * the direct lane rejects any non website-derived provenance, while
 * ownerAssertionsFromGraph attests title, description, and field values
 * for those objects (and ownerFieldCorrection values), so the
 * owner_authored lane can bind them. Returns undefined when neither
 * lane verifies, so callers keep their fail-closed fallbacks and never
 * invent a value.
 */
function resolveBoundOwnerField(
  graph: ObjectGraph,
  objectId: string,
  field: string,
): string | undefined {
  const assertions = ownerAssertionsFromGraph(graph);
  const direct =
    resolveBoundFieldVerified(
      graph,
      { objectId, field, classification: "direct" },
      assertions,
    )?.trim() || undefined;
  if (direct) return direct;
  return (
    resolveBoundFieldVerified(
      graph,
      { objectId, field, classification: "owner_authored" },
      assertions,
    )?.trim() || undefined
  );
}

/**
 * PROD-1 (2026-09-27): the public site chrome's first <h1> must be the
 * business name, never a demo label. Single resolution seam shared by
 * the metadata and the visible header: the business's own
 * binding-verified title, falling back to explicitly generator-labeled
 * copy when the binding cannot verify. The fallback never claims facts
 * about the business.
 */
export function resolveSiteDisplayName(graph: ObjectGraph): string {
  const owner = ownerObject(graph);
  // Binding-verified owner text (FYD product authority directive,
  // 2026-09-25: the BindingVerifier owns ENFORCEMENT, truth stays
  // upstream). The business's own title may be published only when the
  // binding verifies against the strong BindingVerifier (direct: object
  // field + evidence ref + fresh website-derived provenance;
  // owner-authored: a recorded owner assertion matching the value). An
  // unverified name is never published as the business's words.
  if (!owner) return "FYD Social generated site";
  const verifiedTitle = resolveBoundOwnerField(graph, owner.id, "title");
  return verifiedTitle ?? "FYD Social generated site";
}

/**
 * Per-site metadata for a generated business page. Derived entirely from
 * the site's own projection at render time; nothing is hardcoded per site.
 */
export async function generateSiteMetadata(siteId: string): Promise<Metadata> {
  // Verified public projection (Q-C-01): metadata derives from the
  // public graph, never the raw source graph.
  const bundle = await getSiteBundle(siteId);
  if (!bundle) return {title:{absolute:"Business information unavailable"}};
  const { graph } = bundle;
  const owner = ownerObject(graph);
  const verifiedDescription = owner
    ? resolveBoundOwnerField(graph, owner.id, "description")
    : undefined;
  // The visible header shares this exact seam (resolveSiteDisplayName)
  // so the <title> and the first <h1> can never disagree.
  const name = resolveSiteDisplayName(graph);
  // The business's own description from its object graph. Never PING's.
  // Falls back to a plain generator-labeled line when the source object
  // carries no verifiable description; the fallback never claims facts
  // about the business and never mentions PING's infrastructure.
  const description =
    verifiedDescription ?? name + " | FYD Social generated site";
  // Canonical (AP-1): these demo tenants have no public domain of their
  // own, so the canonical URL is the site's own route on the origin the
  // request was actually served from, read from the request headers.
  // Returning the relative route alone would let Next resolve it against
  // the root layout metadataBase, which defaults to a foreign origin
  // for these tenant pages. When there is no request scope (unit
  // tests), fall back to the relative route instead of throwing.
  const route = `/sites/${siteId}`;
  let canonical = route;
  try {
    const requestHeaders = await headers();
    const proto = requestHeaders.get("x-forwarded-proto") ?? "http";
    const host =
      requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
    const origin = host ? proto + "://" + host : "";
    canonical = origin ? origin + route : route;
  } catch {
    canonical = route;
  }
  // The tenant's own reviewed presentation mark (the same asset the
  // visible header renders) doubles as the page's icon and social-card
  // image, so browser chrome and link previews identify the business,
  // not the platform. Resolved from the shared mark registry by site
  // id; a tenant with no reviewed mark simply gets neither, never a
  // platform default.
  const mark = findConfiguredMark(siteId);
  return {
    // Absolute: overrides the root layout's "%s · PING" title template so
    // the business page's <title> names the business, never PING.
    title: { absolute: name },
    description,
    ...(mark ? { icons: { icon: mark.src } } : {}),
    openGraph: {
      type: "website",
      siteName: name,
      title: name,
      description,
      url: canonical,
      ...(mark
        ? {
            images: [
              {
                url: mark.src,
                width: mark.width,
                height: mark.height,
                alt: name,
              },
            ],
          }
        : {}),
    },
    twitter: {
      card: "summary",
      title: name,
      description,
      ...(mark ? { images: [mark.src] } : {}),
    },
    alternates: { canonical },
    // Honest, labeled generator attribution: FYD Social generated this
    // page. Rendered as <meta name="generator" content="FYD Social">.
    generator: "FYD Social",
  };
}
