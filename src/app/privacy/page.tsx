import type { Metadata } from "next";
import { Container, Section } from "@/components/section";
import { getTenant } from "@/lib/tenant-config";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How PING handles your information.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  const tenant = getTenant();

  return (
    <Section>
      <Container className="max-w-3xl">
        <h1 className="text-3xl font-bold text-text">Privacy Policy</h1>
        <p className="mt-4 text-sm text-text-subtle">Last updated: {new Date().getFullYear()}</p>
        <div className="mt-8 space-y-6 text-text-muted">
          <section>
            <h2 className="text-xl font-bold text-text">Information we collect</h2>
            <p className="mt-2">
              When you subscribe to the newsletter or contact {tenant.operator.business}, we collect
              the information you provide: your name, contact details, and the contents of your
              message. This site does not run analytics trackers beyond what the hosting platform
              provides.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-bold text-text">How we use it</h2>
            <p className="mt-2">
              We use your information solely to respond to you and to send the newsletter you asked
              for. We do not sell your information, and we do not share it with third parties except
              the email service that delivers the newsletter.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-bold text-text">Contact</h2>
            <p className="mt-2">
              Questions about your data? Reach {tenant.operator.business} through the{" "}
              <a href="/contact" className="text-honey hover:underline">contact page</a>.
            </p>
          </section>
        </div>
      </Container>
    </Section>
  );
}
