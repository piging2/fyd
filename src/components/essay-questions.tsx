import { FaqSection } from "@/components/faq-section";
import { getEssayQuestions } from "@/lib/essay-questions";

/**
 * Wave 31 pilot (regrade defect 7): the questions section on a blog
 * post. Renders nothing at all for a post with no questions data, so
 * unmodified posts render exactly as before. For a post with data it
 * mounts the shared FaqSection, which builds the visible section and
 * the FAQPage JSON-LD from the same items array, so the schema can
 * never describe questions the page does not display (the Wave 15
 * FaqSection discipline).
 */
export function EssayQuestions({ slug }: { slug: string }) {
  const items = getEssayQuestions(slug);
  if (items.length === 0) return null;
  return <FaqSection items={items} title="Questions this essay answers" />;
}
