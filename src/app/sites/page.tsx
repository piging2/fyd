/**
 * /sites index (dev surface, not a product page).
 *
 * Live observability: the available sites are discovered dynamically from
 * the projection directory at render time. No hardcoded site list.
 * Each tenant's display name is resolved at render time from its own
 * PING-backed object graph.
 */

import Link from "next/link";
import type { Metadata } from "next";
import { Container, Section, SectionHeading } from "@/components/section";
import {
  getVerifiedPublicProjection,
  listPingSiteIdsSync,
} from "@/fyd/data/ping-object-source";
import { isServableSiteId } from "@/app/sites/_shared/site-lookup";

export const metadata: Metadata = {
  title: { absolute: "FYD demo sites | PingFyd" },
  description: "Working demo websites built by FYD for real local businesses: a plumber, a carpentry company, and PingFyd itself. Open any demo and look around.",
};

/**
 * The refresh contract for this directory (decided on evidence,
 * 2026-11-12, input C): the candidate set is discovered from the
 * projection directory AT RENDER TIME, inside the page function below,
 * never cached at module scope. Projection files arrive by deploy, so a
 * new site appears on the first render after its deploy. Each candidate
 * is servable-checked and its public projection is verified at render;
 * a candidate that fails verification is omitted from the public
 * directory (fail closed) and the omission is logged server-side, so a
 * failure is never a silent empty result for the operator.
 */

function ownerName(
  graph: { objects: { schema: string; visibility: string; title: string }[] },
  fallback: string,
): string {
  const owner = graph.objects.find(
    (o) => o.schema === "ping.social.business@1" && o.visibility === "public",
  );
  const name = owner?.title?.trim();
  return name ? name : fallback;
}

export default async function SitesIndexPage() {
  // Register F7: the directory offers only destinations it can serve.
  // Candidates are filtered through the same servable check the dynamic
  // route uses, and a candidate whose public projection cannot be read
  // creates no card at all. One bad graph still never rejects the index.
  const candidates = listPingSiteIdsSync().filter((siteId) => isServableSiteId(siteId));
  const reads = await Promise.all(
    candidates.map(async (siteId) => {
      try {
        const { graph } = await getVerifiedPublicProjection(siteId, "anonymous");
        return { siteId, name: ownerName(graph, siteId) };
      } catch (err) {
        // Fail closed for the public directory, visible to the operator:
        // the omission is logged server-side with its cause, never silent.
        console.error(`[sites] demo site omitted from directory: ${siteId}`, err);
        return null;
      }
    }),
  );
  const sites = reads.filter((s): s is { siteId: string; name: string } => s !== null);

  return (
    <div className="min-h-screen bg-background">
      <Container>
        <Section size="minor">
          <SectionHeading
            headingLevel="h1"
            eyebrow="/sites"
            title="FYD demo sites"
            description="Demo websites FYD built for real local businesses. Open any of them and look around."
          />
          {sites.length > 0 ? (
            <div className="mt-10 grid gap-6 sm:grid-cols-2">
              {sites.map(({ siteId, name }) => (
                <Link
                  key={siteId}
                  href={`/sites/${siteId}`}
                  className="group block rounded-2xl border border-border-soft bg-surface p-8 transition hover:border-honey"
                >
                  <p className="text-2xl font-bold text-primary">{name}</p>
                  <p className="mt-2 text-sm text-text-muted">{`/sites/${siteId}`}</p>
                  <p className="mt-6 text-sm font-semibold text-honey-text group-hover:text-honey-text-hover">
                    Open demo site &rarr;
                  </p>
                </Link>
              ))}
            </div>
          ) : (
            <p className="mt-10 text-base text-text-muted">
              No demo sites are available right now.{" "}
              <Link href="/fyd" className="font-semibold text-honey-text hover:text-honey-text-hover">
                See how FYD works
              </Link>
            </p>
          )}
        </Section>
      </Container>
    </div>
  );
}
