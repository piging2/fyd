import { Container, Section, SectionHeading } from "@/components/section";
import { ScrollReveal } from "@/components/scroll-reveal";
import { FydCopyClassLabel, type FydCopyClass } from "./fyd-copy-class";

/**
 * /yours: TenantOS privacy and authority, in owner language.
 *
 * FYD runs on ordinary tenant machinery: no special access, no bypass.
 * Three guarantees a business owner can hold us to.
 */

const GUARANTEES: { title: string; detail: string; copy: FydCopyClass }[] = [
  {
    title: "Your private data never becomes network data",
    detail:
      "What is private to your business stays private to your business. The network is built from public or owner-authorized projections only. This rule is live today, not a promise for later.",
    copy: "live",
  },
  {
    title: "Nothing is published or shared without your explicit okay",
    detail:
      "FYD proposes; you approve. Publishing, sharing, and any outward action wait for your explicit authorization, every time.",
    copy: "live",
  },
  {
    title: "You can see everything FYD believes, and change it",
    detail:
      "The understanding is inspectable: what FYD knows, why it believes it, and where it came from. Corrections happen in plain words and survive rebuilds.",
    copy: "live",
  },
];

export function FydPrivacy() {
  return (
    <div id="privacy">
      <Section>
        <Container className="max-w-5xl">
          <SectionHeading
            eyebrow="/yours"
            title="Your business stays yours"
            description="TenantOS is the part of the system that keeps every business separate. FYD runs on that ordinary tenant machinery: no special access, no bypass, no exceptions for the product itself."
            align="center"
          />
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {GUARANTEES.map((g) => (
              <ScrollReveal key={g.title}>
                <div className="flex h-full flex-col rounded-lg border border-border-soft bg-surface p-6">
                  <FydCopyClassLabel kind={g.copy} />
                  <h3 className="mt-3 text-lg font-bold text-text">{g.title}</h3>
                  <p className="mt-2 flex-1 text-sm text-text-muted">{g.detail}</p>
                </div>
              </ScrollReveal>
            ))}
          </div>
          <p className="mx-auto mt-8 max-w-3xl text-center text-sm text-text-subtle">
            The same boundary that protects your data from the network protects
            the network from your data. One rule, both directions.
          </p>
        </Container>
      </Section>
    </div>
  );
}
