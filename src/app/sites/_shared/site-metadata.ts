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
 * canonical/og:url are the site's own route resolved against the app's
 * metadataBase. Zero per-site conditionals: callers pass only their site
 * id. PING attribution is honest and labeled: the generator marker names
 * FYD Social as the generator; the business is the subject of every tag.
 */

import type { Metadata } from "next";
import { getVerifiedPublicProjection } from "@/fyd/data/ping-object-source";
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
 * Per-site metadata for a generated business page. Derived entirely from
 * the site's own projection at render time; nothing is hardcoded per site.
 */
export async function generateSiteMetadata(siteId: string): Promise<Metadata> {
  // Verified public projection (Q-C-01): metadata derives from the
  // public graph, never the raw source graph.
  const { graph } = await getVerifiedPublicProjection(siteId, "anonymous");
  const owner = ownerObject(graph);
  // Binding-verified owner text (FYD product authority directive,
  // 2026-09-25: the BindingVerifier owns ENFORCEMENT, truth stays
  // upstream). The <title>, meta description, and social tags are factual
  // render bindings: they may publish the business's own
  // title/description only when the binding verifies against the strong
  // BindingVerifier (direct: object field + evidence ref + fresh
  // website-derived provenance; owner-authored: a recorded owner
  // assertion matching the value). An unverified name/description is
  // never published as the business's words. The fallback is
  // explicitly generator-labeled presentation copy (GENERATED class),
  // never a factual claim about the business.
  const assertions = ownerAssertionsFromGraph(graph);
  const verifiedTitle = owner
    ? resolveBoundFieldVerified(
        graph,
        { objectId: owner.id, field: "title", classification: "direct" },
        assertions,
      )?.trim() || undefined
    : undefined;
  const verifiedDescription = owner
    ? resolveBoundFieldVerified(
        graph,
        { objectId: owner.id, field: "description", classification: "direct" },
        assertions,
      )?.trim() || undefined
    : undefined;
  const name = verifiedTitle ?? "FYD Social generated site";
  // The business's own description from its object graph. Never PING's.
  // Falls back to a plain generator-labeled line when the source object
  // carries no verifiable description; the fallback never claims facts
  // about the business and never mentions PING's infrastructure.
  const description =
    verifiedDescription ?? name + " | FYD Social generated site";
  // Canonical product decision (2026-09-24, W-META 80% call): these demo
  // tenants have no public domain of their own, so the canonical URL is
  // the site's own served route, resolved against the app's metadataBase
  // at render time. If a tenant ever gets its own domain, revisit this
  // seam to point canonical at that domain.
  const route = `/sites/${siteId}`;
  return {
    // Absolute: overrides the root layout's "%s · PING" title template so
    // the business page's <title> names the business, never PING.
    title: { absolute: name },
    description,
    openGraph: {
      type: "website",
      siteName: name,
      title: name,
      description,
      url: route,
    },
    twitter: {
      card: "summary",
      title: name,
      description,
    },
    alternates: { canonical: route },
    // Honest, labeled generator attribution: FYD Social generated this
    // page. Rendered as <meta name="generator" content="FYD Social">.
    generator: "FYD Social",
  };
}
