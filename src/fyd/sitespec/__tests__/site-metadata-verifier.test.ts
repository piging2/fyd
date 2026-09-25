/**
 * Track C: production-path Binding Verifier wiring for site metadata
 * (FYD product authority directive 2026-09-25).
 *
 * generateSiteMetadata is the real production seam behind the demo pages'
 * <title> and meta description. It must publish the business object's own
 * title/description only when the strong BindingVerifier accepts the
 * factual binding (direct: present object field + evidence ref + fresh
 * website-derived provenance, or a matching owner correction). The
 * GENERATED fallback ("FYD Social generated site") must never leak for
 * the demo tenants whose evidence verifies.
 */
import { generateSiteMetadata } from "@/app/sites/_shared/site-metadata";
import { getVerifiedPublicProjection } from "@/fyd/data/ping-object-source";

const SITES = ["happy-place", "coppersmith-plumbing"] as const;
const OWNER_BUSINESS_SCHEMA = "ping.social.business@1";
const GENERATED_TITLE = "FYD Social generated site";

describe.each(SITES)("site metadata verifier wiring (%s)", (siteId) => {
  test("title and description publish the business's verified facts, not generator fallback", async () => {
    const meta = await generateSiteMetadata(siteId);
    const { graph } = await getVerifiedPublicProjection(siteId, "anonymous");
    const owner = graph.objects.find(
      (o) => o.schema === OWNER_BUSINESS_SCHEMA && o.visibility === "public",
    );
    expect(owner).toBeDefined();
    const wantTitle = String(
      (owner!.fields as Record<string, unknown>).title,
    ).trim();
    const wantDescription = String(
      (owner!.fields as Record<string, unknown>).description,
    ).trim();

    const title =
      typeof meta.title === "object" && meta.title !== null && "absolute" in meta.title
        ? String((meta.title as { absolute: unknown }).absolute)
        : String(meta.title);

    // The verifier accepted both factual bindings: the object's own
    // values publish verbatim.
    expect(title).toBe(wantTitle);
    expect(meta.description).toBe(wantDescription);

    // Fail-closed fallback never triggers for these tenants.
    expect(title).not.toBe(GENERATED_TITLE);
    expect(meta.description ?? "").not.toContain(GENERATED_TITLE);

    // Social tags carry the same verified facts, never PING's metadata.
    expect(meta.openGraph?.title).toBe(wantTitle);
    expect(meta.openGraph?.description).toBe(wantDescription);
    expect(meta.twitter?.title).toBe(wantTitle);
    expect(meta.generator).toBe("FYD Social");
  });
});
