import type { Metadata } from "next";
import { TechArticle } from "@/components/tech-article";

export const metadata: Metadata = {
  title: "Agents",
  description: "Agent infrastructure with explicit capability boundaries: what an agent may touch, change, and where it must stop.",
  alternates: { canonical: "/technology/agents" },
};

export default function AgentsPage() {
  return (
    <TechArticle
      eyebrow="Technology"
      title="Agents"
      lede="Software that acts on your behalf needs boundaries more than it needs intelligence. PING treats agent infrastructure as a capability problem: what an agent may touch, what it may change, where it must stop and ask, and how every action is recorded."
      status="Documented"
      sections={[
        {
          heading: "Why boundaries come first",
          body: (
            <>
              <p>
                The industry conversation about agents focuses on capability: what the model can do.
                PING focuses on authority: what the agent is allowed to do, enforced by the system
                rather than requested of the model. A sufficiently clever prompt cannot substitute
                for a permission boundary, because prompts are suggestions and boundaries are guarantees.
              </p>
              <p>
                The practical pattern: agents receive repository and deployment capabilities, not
                credential piles. An agent that deploys through git plus the platform&apos;s native
                integration never needs the platform&apos;s password. Fewer secrets, fewer ways to fail.
              </p>
            </>
          ),
        },
        {
          heading: "Execution boundaries",
          body: (
            <>
              <p>
                One concrete boundary PING uses daily: agents execute commands on machines by passing
                script bytes on standard input, never by embedding commands inside other shells&apos;
                quoting layers. Each layer that reinterprets a command is a place where meaning can
                corrupt silently. Removing the reinterpretation removes a whole class of failures.
              </p>
              <p>
                The general principle: every boundary crossing (machine, process, permission domain)
                should move data as opaquely as possible and interpret it as late as possible. Clever
                quoting is a liability; boring pipes are an asset.
              </p>
            </>
          ),
        },
        {
          heading: "Reversible vs. irreversible",
          body: (
            <>
              <p>
                Agents should move fast on reversible actions (reads, drafts, proposals) and slow
                down on irreversible ones (deletes, publishes, credential changes, anything that
                rewrites history). The more irreversible the operation, the higher the proof
                requirement before acting, and the stronger the preference for human confirmation.
              </p>
              <p>
                This is not timidity. It is the same discipline as the rest of PING: be bold where
                failure is cheap and recoverable, conservative where it is not.
              </p>
            </>
          ),
        },
        {
          heading: "Delegation without duplication",
          body: (
            <p>
              When PING delegates to a worker (another agent, a research model, a script), the worker
              contract is the full evidence lineage: raw artifact, extracted observations with source
              spans and confidence, verification status, preserved contradictions. The worker&apos;s
              output is unverified external material until it passes the verification gate. Trust is
              earned per claim, not per worker.
            </p>
          ),
        },
      ]}
      related={[
        { label: "Continuity", href: "/technology/continuity" },
        { label: "Evidence", href: "/technology/evidence" },
        { label: "Integrations", href: "/technology/integrations" },
      ]}
    />
  );
}
