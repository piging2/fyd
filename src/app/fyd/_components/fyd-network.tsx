import { Container, Section, SectionHeading } from "@/components/section";
import { ScrollReveal } from "@/components/scroll-reveal";
import { FydCopyClassLabel, type FydCopyClass } from "./fyd-copy-class";

/**
 * /network: the network effect, honestly staged.
 *
 * The boundary rule is live today. Public relationships are next.
 * Multi-network projection is long-term vision. No partners announced,
 * no integrations claimed, no unfinished protocols presented as live.
 */

const ROWS: { title: string; detail: string; copy: FydCopyClass }[] = [
  {
    title: "The boundary rule: live today",
    detail:
      "Private business data never becomes network data. Only public or owner-authorized information ever leaves your business boundary. Tenant isolation is constitutional, and the network is built from projections, never by weakening it.",
    copy: "live",
  },
  {
    title: "Public relationships you choose: coming",
    detail:
      "Your presence will be able to connect to partners, creators, directories, and community organizations you pick. Each share is explicitly approved by you. A relationship across businesses never implies access to another business's private data.",
    copy: "coming",
  },
  {
    title: "One identity, many networks: long-term vision",
    detail:
      "The design preserves the ability for a FYD presence to reach multiple networks without giving up control of its private data. Open protocols are design direction. They are not built, and no outside service ever becomes the owner of your business identity.",
    copy: "vision",
  },
];

export function FydNetwork() {
  return (
    <div id="network">
      <Section>
        <Container className="max-w-5xl">
          <SectionHeading
            eyebrow="/network"
            title="Your business in a permission-aware network"
            description="FYD is not only a tool for isolated businesses. Presences can connect: businesses, customers, creators, partners, communities. The network grows only from information that is legitimately public or owner-authorized. Never by weakening the boundary."
            align="center"
          />
          <div className="mt-12 space-y-6">
            {ROWS.map((r) => (
              <ScrollReveal key={r.title}>
                <div className="rounded-lg border border-border-soft bg-surface p-6 sm:p-8">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-xl font-bold text-text">{r.title}</h3>
                    <FydCopyClassLabel kind={r.copy} />
                  </div>
                  <p className="mt-3 max-w-3xl text-text-muted">{r.detail}</p>
                </div>
              </ScrollReveal>
            ))}
          </div>
          <div className="mx-auto mt-8 max-w-3xl rounded-lg border border-border-soft bg-surface-2 p-6">
            <p className="text-sm font-semibold text-text">
              No partner announcements.
            </p>
            <p className="mt-2 text-sm text-text-muted">
              FYD names no partners and claims no integrations until there is
              real evidence and real authorization. When a partnership is real,
              it will carry the same proof this page demands of everything else.
            </p>
          </div>
        </Container>
      </Section>
    </div>
  );
}
