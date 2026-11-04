import type { FaqItem } from "@/types/faq";

/**
 * Per essay questions (Wave 31 pilot, regrade defect 7).
 *
 * Each entry answers questions a reader would ask after that essay,
 * written only from the essay's own body text. The claim to essay
 * mapping for every answer is recorded in the Wave 31 receipt.
 *
 * Storage rule for this pilot: questions live here, keyed by slug,
 * never inside the essay Markdown files, so essay bodies stay
 * untouched. A slug with no entry renders no questions section and
 * no FAQPage schema, exactly as posts rendered before this wave.
 */
export const ESSAY_QUESTIONS: Record<string, FaqItem[]> = {
  "the-retry-that-charged-twice": [
    {
      id: "retry-q1",
      category: "essay-questions",
      question: "Why did the customer end up with two charges for one purchase?",
      answer:
        "The server charged the card and created the order, but the response died on the way back, so the customer clicked buy again. The server treated the second click as a new request, and the result was two orders and two charges.",
    },
    {
      id: "retry-q2",
      category: "essay-questions",
      question: "What does idempotency mean?",
      answer:
        "Idempotency means an operation can be applied more than once and produce the same result as applying it once. The essay compares it to an elevator button: pressing it twelve times does not send twelve elevators.",
    },
    {
      id: "retry-q3",
      category: "essay-questions",
      question: "How does an idempotency key stop a retry from duplicating work?",
      answer:
        "The client attaches a unique identity to the first request, and the server records that identity with the result. If the same identity arrives again, the server returns the original result instead of redoing the work.",
    },
  ],
  "the-scheduler-said-it-ran": [
    {
      id: "scheduler-q1",
      category: "essay-questions",
      question: "What happened when the job's occurrences were coalesced?",
      answer:
        "When a scheduled run could not start, the platform folded it into the next occurrence and marked the folded one cancelled. Three mornings in a row the job simply never started, while the record showed a tidy calendar and an untouched workload.",
    },
    {
      id: "scheduler-q2",
      category: "essay-questions",
      question: "How does the factory judge whether a standing job really ran?",
      answer:
        "Every standing job is judged by a three-part test: a start time, a finish time, and an artifact it produced. If a job cannot show all three, its status is UNKNOWN, not probably fine.",
    },
    {
      id: "scheduler-q3",
      category: "essay-questions",
      question: "Why is an exit code not enough to prove a job succeeded?",
      answer:
        "A job can run and report success while the world it checks has stopped reporting honestly, as the factory's heal jobs once did for a stale safety file. An exit code tells you the job believes it succeeded, while an artifact lets you check whether the world agrees.",
    },
  ],
  "the-440-million-typo": [
    {
      id: "knight-q1",
      category: "essay-questions",
      question: "Why did the eighth server run different code from the other seven?",
      answer:
        "The rollout was manual: a technician copied the new software to seven of the eight servers, and the eighth kept the old build. Buried in that old build was dormant Power Peg test code, and the flag that activated the new feature on the updated servers woke the old code on the eighth.",
    },
    {
      id: "knight-q2",
      category: "essay-questions",
      question: "What did Power Peg do once the market opened, and what did it cost?",
      answer:
        "The eighth server began doing what Power Peg was designed to do in a test environment: buy high, sell low, over and over, at machine speed. Knight lost about $440 million in roughly forty-five minutes.",
    },
    {
      id: "knight-q3",
      category: "essay-questions",
      question: "What three fences does the essay say Knight did not have?",
      answer:
        "The essay lists three: dead code gets deleted instead of left in place with its activation flag wired up, deployments verify mechanically what version every node is running, and a kill switch that is actually a switch.",
    },
  ],
};

export function getEssayQuestions(slug: string): FaqItem[] {
  return ESSAY_QUESTIONS[slug] ?? [];
}
