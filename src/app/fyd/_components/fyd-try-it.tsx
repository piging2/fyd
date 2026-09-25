import Link from "next/link";
import { Container, Section, SectionHeading } from "@/components/section";
import { ScrollReveal } from "@/components/scroll-reveal";
import { FydCopyClassLabel } from "./fyd-copy-class";
import { FydOnboardingTool } from "./fyd-onboarding-tool";

/**
 * /try: the CTA appropriate to current real capability.
 * The paste-URL tool, preserved from the original /fyd onboarding page.
 */
export function FydTryIt() {
  return (
    <div id="try">
      <Section className="relative bg-deep">
        <Container className="max-w-4xl">
          <SectionHeading
            eyebrow={<span className="text-honey">/try</span>}
            title={<span className="text-text-on-dark">Try it: paste your URL</span>}
            description={
              <span className="text-text-on-dark/80">
                No account. FYD reads only what is public about the business
                and shows you what it understood. Value first, registration
                never before value.
              </span>
            }
            align="center"
            descriptionColor="text-text-on-dark/80"
          />
          <div className="mt-6 flex justify-center">
            <FydCopyClassLabel kind="live" />
          </div>
          <ScrollReveal>
            <div className="mx-auto mt-10 max-w-3xl rounded-2xl bg-background p-6 shadow-2xl sm:p-8">
              <FydOnboardingTool />
            </div>
          </ScrollReveal>
          <p className="mt-8 text-center text-sm text-text-on-dark/60">
            Want the full intake instead?{" "}
            <Link href="/build-my-fyd" className="font-semibold text-honey hover:underline">
              Start a fresh FYD build →
            </Link>
          </p>
        </Container>
      </Section>
    </div>
  );
}
