import type { Metadata } from "next";
import { TechArticle } from "@/components/tech-article";

export const metadata: Metadata = {
  title: "Social Objects",
  description: "The shared artifacts that business conversations orbit: posts, pages, and proof that compound over time, treated as infrastructure rather than content.",
  alternates: { canonical: "/technology/social-objects" },
  openGraph: {
    type: "website",
    title: "Social Objects · PING",
    description: "The shared artifacts that business conversations orbit: posts, pages, and proof that compound over time, treated as infrastructure rather than content.",
    url: "/technology/social-objects",
    images: [{ url: "/brand/og-card.png", width: 1200, height: 630, alt: "PING Social" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Social Objects · PING",
    description: "The shared artifacts that business conversations orbit: posts, pages, and proof that compound over time, treated as infrastructure rather than content.",
    images: ["/brand/og-card.png"],
  },
};

export default function SocialObjectsPage() {
  return (
    <TechArticle
      eyebrow="Technology"
      title="Social Objects"
      lede="Conversations need something to orbit. A social object is the shared artifact, a post, a page, a review, a piece of proof, that gives a business conversation its center of gravity. PING treats social objects as infrastructure, not content."
      status="Direction"
      sections={[
        {
          heading: "Why objects, not messages",
          body: (
            <>
              <p>
                Most business outreach is messages aimed at people: cold emails, DMs, pitches. Messages
                are ephemeral; they are read or ignored and then they are gone. Social objects invert
                this: create the artifact first (a page that demonstrates capability, a post that
                teaches something true, a review thread that shows real work), then let conversations
                form around it.
              </p>
              <p>
                The object compounds. A good page keeps working while you sleep. A message does not.
                Businesses that understand this stop chasing attention and start accumulating proof.
              </p>
            </>
          ),
        },
        {
          heading: "Objects as evidence",
          body: (
            <p>
              In PING&apos;s terms, a social object is presented truth with its evidence attached:
              the claim (&ldquo;we do good work&rdquo;) plus the verifiable artifact (the work
              itself, documented). This is why the PING Social page, the project documentation, and
              the published engagement all matter more than any pitch: they are objects a prospect
              can inspect, not claims a prospect must take on faith.
            </p>
          ),
        },
        {
          heading: "The compound loop",
          body: (
            <>
              <p>The intended loop:</p>
              <ul className="list-disc space-y-2 pl-6">
                <li>Do real work and record it as events with evidence.</li>
                <li>Distill the work into social objects: pages, posts, documentation.</li>
                <li>Let discovery happen around the objects (search, social, word of mouth).</li>
                <li>Conversations that start from an object start from proof, not from a cold open.</li>
                <li>New work creates new objects, and the corpus compounds.</li>
              </ul>
            </>
          ),
        },
        {
          heading: "Status",
          body: (
            <p>
              Social objects are a direction, not a shipped system. The concepts are in use
              operationally (the PING Social page as home base, published work as proof), but the
              systematic machinery, object lifecycle, discovery, compounding measurement, is still
              being designed. This page documents the thinking so the build can be checked against it.
            </p>
          ),
        },
      ]}
      related={[
        { label: "Evidence", href: "/technology/evidence" },
        { label: "Business Automation", href: "/technology/business-automation" },
        { label: "Continuity", href: "/technology/continuity" },
      ]}
    />
  );
}
