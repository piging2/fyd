import { Container, Section, SectionHeading } from "@/components/section";
import { ScrollReveal } from "@/components/scroll-reveal";
import { FydCopyClassLabel } from "./fyd-copy-class";

/**
 * /install: the canonical loader snippet for a business that already has
 * a FYD object and wants its circle on its own site. The snippet is the
 * loader's own documented contract (see public/fyd-circle-loader.js):
 * mount(element, { objectId, apiBase }), both required, fail closed.
 * The loader is live and served from this site; the object id itself
 * comes from FYD onboarding, which this section does not promise.
 */

const SNIPPET = `<div id="fyd-circle"></div>
<script src="https://pingfyd.com/fyd-circle-loader.js"></script>
<script>
  FydCircle.mount(document.getElementById("fyd-circle"), {
    objectId: "your-object-id",
    apiBase: "https://pingfyd.com"
  });
</script>`;

const FACTS: { title: string; detail: string }[] = [
  {
    title: "One small script, no framework",
    detail:
      "The loader is under 4 KB of plain JavaScript, with no framework dependencies. It requests your public business information and, when available, its background image.",
  },
  {
    title: "It fails closed, never fake",
    detail:
      "If your public business information cannot be loaded, the circle shows a neutral dot. It never invents information about your business.",
  },
  {
    title: "Updates on future page loads",
    detail:
      "The script stays fresh in the browser cache for five minutes, with up to one more minute for background refresh. Later page loads pick up corrections as caches refresh; already-open pages keep their loaded script.",
  },
];

export function FydInstall() {
  return (
    <div id="install">
      <Section size="minor">
        <Container className="max-w-4xl">
          <SectionHeading
            eyebrow="/install"
            title="Put your circle on your own site"
            description="Already have a FYD object? Paste these two pieces where you want the circle to appear, with your own object id in place of the example. That is the whole install."
            align="center"
          />
          <div className="mt-6 flex justify-center">
            <FydCopyClassLabel kind="live" />
          </div>
          <ScrollReveal>
            <pre className="mx-auto mt-10 max-w-2xl overflow-x-auto rounded-2xl border border-border-soft bg-surface p-6 text-left text-sm leading-relaxed text-text">
              <code>{SNIPPET}</code>
            </pre>
          </ScrollReveal>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {FACTS.map((f) => (
              <div
                key={f.title}
                className="rounded-lg border border-border-soft bg-surface p-6"
              >
                <h3 className="text-base font-bold text-text">{f.title}</h3>
                <p className="mt-2 text-sm text-text-muted">{f.detail}</p>
              </div>
            ))}
          </div>
          <p className="mx-auto mt-8 max-w-3xl text-center text-sm text-text-subtle">
            Your object id comes from FYD when your business is set up. The
            circle shows your name. When your public business information includes
            a website link, clicking the circle opens that site in a new tab.
          </p>
        </Container>
      </Section>
    </div>
  );
}
