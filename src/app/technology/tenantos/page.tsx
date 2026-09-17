import type { Metadata } from "next";
import { TechArticle } from "@/components/tech-article";

export const metadata: Metadata = {
  title: "TenantOS",
  description: "The platform direction this site proves: one codebase, many tenants, configuration over forking.",
  alternates: { canonical: "/technology/tenantos" },
};

export default function TenantOSPage() {
  return (
    <TechArticle
      eyebrow="Technology"
      title="TenantOS"
      lede="TenantOS is the platform direction, not a product. The model: one codebase, many tenants, where each tenant is configuration plus content plus brand plus domain, never a fork. This website is the first tenant, and its construction is the proof of concept."
      status="Direction"
      sections={[
        {
          heading: "The model",
          body: (
            <>
              <p>The stack, from bottom to top:</p>
              <ul className="list-disc space-y-2 pl-6">
                <li><strong>Platform:</strong> the shared application code. Next.js, components, layouts, the config authority pattern, the deployment pipeline.</li>
                <li><strong>Tenant:</strong> the configuration boundary. Identity, brand, navigation, contact, voice. One versioned JSON authority per tenant.</li>
                <li><strong>Site:</strong> the tenant&apos;s site structure: routes, information architecture, sitemap.</li>
                <li><strong>Brand:</strong> design tokens. Re-skinning means changing token values, never component code.</li>
                <li><strong>Content:</strong> pages, posts, documentation. Markdown-first, tenant-owned.</li>
                <li><strong>Assets:</strong> media, with provenance and licensing per tenant.</li>
                <li><strong>Domain:</strong> the tenant&apos;s canonical URL, assigned at the platform edge.</li>
                <li><strong>Integrations:</strong> per-tenant connections (email, social, analytics), configured not coded.</li>
                <li><strong>Agent capabilities:</strong> what agents may do on behalf of this tenant, as configuration.</li>
              </ul>
            </>
          ),
        },
        {
          heading: "The test",
          body: (
            <>
              <p>
                Every architectural decision on this site is checked against one question:{" "}
                <strong>could Tenant B use this without forking the application?</strong> If the
                answer requires copying the repo and editing code, the decision is wrong for the
                platform, even if it works for this tenant.
              </p>
              <p>
                The preferred path is always: tenant to configuration to content to branding to
                domain to integrations. The forbidden path is: copy repo, edit code, deploy. The
                second path is how every multi-tenant codebase rots into N unmaintainable forks.
              </p>
            </>
          ),
        },
        {
          heading: "What this site proves",
          body: (
            <>
              <p>This site, the first tenant, demonstrates the separable layers:</p>
              <ul className="list-disc space-y-2 pl-6">
                <li>PING identity lives in <code>tenant.ping.v1.json</code>, not in component code. Components read it through a typed loader.</li>
                <li>Brand is design tokens. The same components render a different brand when the token values change.</li>
                <li>Navigation, SEO defaults, contact info, and provenance all resolve from the tenant authority.</li>
                <li>The deployment path (git to preview to production) is tenant-independent.</li>
              </ul>
              <p>
                What it does not yet prove: onboarding Tenant B end to end, per-tenant domains at
                the edge, and per-tenant integrations. Those are future work, and this page will say
                so until they exist.
              </p>
            </>
          ),
        },
        {
          heading: "What TenantOS is not",
          body: (
            <>
              <p>To avoid confusion:</p>
              <ul className="list-disc space-y-2 pl-6">
                <li>It is not a product you can buy today. There is no signup, no pricing, no dashboard.</li>
                <li>It is not a website builder. Tenants are real codebases with real configuration, not templates with a theme picker.</li>
                <li>It is not finished. It is a direction with one working proof point, and the proof point is this site.</li>
              </ul>
            </>
          ),
        },
      ]}
      related={[
        { label: "Integrations", href: "/technology/integrations" },
        { label: "Continuity", href: "/technology/continuity" },
        { label: "Products", href: "/products" },
      ]}
    />
  );
}
