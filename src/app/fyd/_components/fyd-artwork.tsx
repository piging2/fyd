import Image from "next/image";
import { Container, Section, SectionHeading } from "@/components/section";

/**
 * Original three-stage artwork recovered from the October visual-language
 * work (harvest commit 95cb3560). The WebP strips are byte-identical copies;
 * the middle-stage crop keeps the object recognizable without adding a new
 * viewer or animation. These figures explain concepts, not live system state.
 */
const CONCEPTS = [
  {
    id: "continuity",
    title: "Continuity",
    caption: "A record carried forward, instead of starting over.",
    alt: "Violet and gold rings surrounding a central form, illustrating retained context.",
  },
  {
    id: "evidence",
    title: "Evidence",
    caption: "A claim connected to the source that supports it.",
    alt: "Separated violet layers above a gold base, illustrating the supporting parts of a claim.",
  },
  {
    id: "knowledge",
    title: "Knowledge",
    caption: "Individual facts connected into a useful picture.",
    alt: "Violet and gold nodes joined into a lattice, illustrating connected information.",
  },
] as const;

export function FydArtwork() {
  return (
    <div id="visual-language">
      <Section size="minor">
        <Container className="max-w-5xl">
          <SectionHeading
            eyebrow="/the ideas"
            title="Remember. Explain. Connect."
            description="Three illustrations of the ideas behind FYD. The live examples below show what you can use today."
            align="center"
          />
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {CONCEPTS.map((concept) => (
              <figure key={concept.id}>
                <div className="relative mx-auto aspect-square w-full max-w-xs overflow-hidden rounded-2xl bg-deep">
                  <Image
                    src={`/images/concepts/${concept.id}.webp`}
                    alt={concept.alt}
                    fill
                    // A square crop displays one third of the 1536px strip.
                    // Account for that source width when choosing a rendition.
                    sizes="(min-width: 768px) 960px, (min-width: 352px) 960px, 300vw"
                    loading="lazy"
                    fetchPriority="low"
                    style={{ objectFit: "cover", objectPosition: "50% 50%" }}
                  />
                </div>
                <figcaption className="mx-auto mt-5 max-w-xs">
                  <h3 className="font-display text-2xl font-bold text-primary">{concept.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-text-muted">{concept.caption}</p>
                </figcaption>
              </figure>
            ))}
          </div>
        </Container>
      </Section>
    </div>
  );
}
