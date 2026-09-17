import type { Metadata } from "next";
import { TechArticle } from "@/components/tech-article";

export const metadata: Metadata = {
  title: "Integrations",
  description: "AI integrations without credential sprawl: one identity per human, capabilities for agents, no secret piles.",
  alternates: { canonical: "/technology/integrations" },
};

export default function IntegrationsPage() {
  return (
    <TechArticle
      eyebrow="Technology"
      title="Integrations"
      lede="Every integration is a trust decision. PING's rule: one identity per human, capabilities for agents instead of credential piles, and no new secret for every deployment. Integrations should reduce the number of things that can leak, not multiply them."
      status="In development"
      sections={[
        {
          heading: "No credential sprawl",
          body: (
            <>
              <p>
                The failure mode PING designs against: every agent gets its own API key, every
                deployment gets its own OAuth app, secrets multiply across machines, and nobody can
                say which credential does what anymore. Each new secret is a new way to fail and a
                new thing to rotate in a crisis.
              </p>
              <p>The PING pattern instead:</p>
              <ul className="list-disc space-y-2 pl-6">
                <li><strong>Humans authenticate as themselves,</strong> once, through the platform&apos;s native auth. No parallel identity zoo.</li>
                <li><strong>Agents get capabilities, not credentials.</strong> Repository access plus the platform&apos;s native deployment integration, rather than a personal API token per agent.</li>
                <li><strong>One OAuth application per platform,</strong> not one per deployment. Deployments are configuration, not new trust roots.</li>
                <li><strong>Secrets live in exactly one place,</strong> resolved at runtime, never copied into worktrees, chat logs, or generated code.</li>
              </ul>
            </>
          ),
        },
        {
          heading: "Use the platform's native seams",
          body: (
            <p>
              When a platform already integrates two systems (for example, a git host that deploys
              to a hosting provider on push), PING uses that seam rather than building a custom
              deployment service or distributing credentials to agents. The agent&apos;s loop is:
              change code, commit, push, verify the platform&apos;s preview, merge. No custom
              machinery, no credential distribution, and the platform&apos;s own audit trail covers
              the deployment.
            </p>
          ),
        },
        {
          heading: "The website's integration posture",
          body: (
            <p>
              This website follows the same rules. It creates no OAuth applications, stores no API
              keys, and duplicates no backend authorities. Where it will eventually talk to PING
              services, it does so through a defined adapter interface (see the API seam), and the
              services own their authorities. The website consumes; it does not own.
            </p>
          ),
        },
        {
          heading: "Status",
          body: (
            <p>
              The integration principles are established and followed across PING&apos;s current
              operations. The website&apos;s adapter seam is defined but unconnected by design:
              there is no PING API to connect to yet, and inventing one inside the website would
              violate the no-duplicate-authorities rule. Connection happens when the API exists.
            </p>
          ),
        },
      ]}
      related={[
        { label: "Agents", href: "/technology/agents" },
        { label: "Evidence", href: "/technology/evidence" },
        { label: "TenantOS", href: "/technology/tenantos" },
      ]}
    />
  );
}
