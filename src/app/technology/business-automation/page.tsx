import type { Metadata } from "next";
import { TechArticle } from "@/components/tech-article";

export const metadata: Metadata = {
  title: "Business Automation",
  description: "Practical automation for home service businesses: capture, follow-up, and consistency without replacing judgment.",
  alternates: { canonical: "/technology/business-automation" },
};

export default function BusinessAutomationPage() {
  return (
    <TechArticle
      eyebrow="Technology"
      title="Business Automation"
      lede="The least glamorous and most valuable part of PING: practical automation for real businesses. Not AI hype, but systems that catch what falls through the cracks: missed calls, slow follow-up, scheduling friction, and the administrative drag that eats a small business alive."
      status="Documented"
      sections={[
        {
          heading: "Start from the pain",
          body: (
            <>
              <p>
                Automation fails when it starts from the technology. It works when it starts from
                the business&apos;s actual pain: the estimate request that sat unanswered for two
                days, the review that mentioned &ldquo;nobody called me back,&rdquo; the owner doing
                paperwork at 10pm instead of being with family. PING Social&apos;s consultancy begins
                with the workflow, not the tool.
              </p>
              <p>
                The prioritization rule: favor the smallest independent businesses first, the ones
                where the owner is also the dispatcher, the bookkeeper, and the crew. That is where
                leverage is highest and where consistency matters most.
              </p>
            </>
          ),
        },
        {
          heading: "The high-value patterns",
          body: (
            <>
              <ul className="list-disc space-y-2 pl-6">
                <li><strong>Reliable capture.</strong> Every inquiry, job detail, and follow-up lands somewhere it cannot disappear because someone was busy. The business never loses an opportunity to a full voicemail box again.</li>
                <li><strong>Fast, consistent response.</strong> Acknowledgment in minutes, not days. Speed of response is one of the strongest predictors of winning the job, and it is almost entirely automatable.</li>
                <li><strong>Follow-up that actually happens.</strong> Structured follow-up sequences (the estimate sent, the check-in, the review request) run without relying on anyone&apos;s memory.</li>
                <li><strong>Less interruption.</strong> Triage and organization so the owner sees what needs judgment, not a raw firehose of messages.</li>
                <li><strong>Review and reputation systems.</strong> Happy customers are asked at the right moment; problems surface early enough to fix.</li>
              </ul>
            </>
          ),
        },
        {
          heading: "Consultative, not packaged",
          body: (
            <p>
              PING Social does not sell a one-size-fits-all package. Each business gets its workflow
              understood first, then recommendations for the automation that fits its actual problems.
              Simple systems the owner can understand and trust beat sophisticated systems nobody
              maintains. Measurable value, time saved, leads captured, response speed, or the
              engagement does not continue.
            </p>
          ),
        },
        {
          heading: "Humans stay in control",
          body: (
            <p>
              The standing rule: automation supports owners and skilled workers; it never replaces
              their judgment. AI handles repetitive communication, organization, and follow-up so
              people can focus on customers, jobs, and decisions that require a human. Technology
              should strengthen the worker, not replace them.
            </p>
          ),
        },
      ]}
      related={[
        { label: "Agents", href: "/technology/agents" },
        { label: "Social Objects", href: "/technology/social-objects" },
        { label: "Products", href: "/products" },
      ]}
    />
  );
}
