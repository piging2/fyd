/**
 * /sites index (dev surface, not a product page).
 *
 * Nolan's directive: rapid switching between the two authorized FYD demo
 * nodes. No customer facts are hardcoded here beyond the two demo tenant
 * IDs; each tenant's display name is resolved at render time from its own
 * PING-backed object graph.
 */

import Link from "next/link";
import type { Metadata } from "next";
import { Container, Section, SectionHeading } from "@/components/section";
import { getVerifiedPublicProjection } from "@/fyd/data/ping-object-source";

export const metadata: Metadata = {
  title: "FYD demo sites | PING",
  description: "Index of the authorized FYD Social demo sites.",
};

/** The two authorized FYD demo tenants. */
const DEMO_SITES = ["happy-place", "coppersmith-plumbing"] as const;

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
  const sites = await Promise.all(
    DEMO_SITES.map(async (siteId) => {
      const { graph } = await getVerifiedPublicProjection(siteId, "anonymous");
      return { siteId, name: ownerName(graph, siteId) };
    }),
  );

  return (
    <main className="min-h-screen bg-background">
      <Container>
        <Section size="minor">
          <SectionHeading
            eyebrow="/sites"
            title="FYD demo sites"
            description="The two authorized demo tenants. Names resolve from each tenant's PING-backed object graph at render time."
          />
          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            {sites.map(({ siteId, name }) => (
              <Link
                key={siteId}
                href={`/sites/${siteId}`}
                className="group block rounded-2xl border border-border-soft bg-surface p-8 transition hover:border-honey"
              >
                <p className="text-2xl font-bold text-primary">{name}</p>
                <p className="mt-2 text-sm text-text-muted">{`/sites/${siteId}`}</p>
                <p className="mt-6 text-sm font-semibold text-honey group-hover:text-honey-hover">
                  Open demo site &rarr;
                </p>
              </Link>
            ))}
          </div>
        </Section>
      </Container>
    </main>
  );
}
