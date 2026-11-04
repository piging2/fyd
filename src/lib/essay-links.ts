/**
 * Reverse internal links (Wave 18, B-10 completion slice).
 *
 * The essays link into the technology pages, but a technology page used
 * to link nowhere back, so the essay library was a dead end from the
 * site highest authority pages. This mapping is the explicit, reviewed
 * list of which published essays genuinely belong at the foot of each
 * technology subpage. It holds slugs only: titles and excerpts are
 * pulled from the blog data layer at render time, never copied here,
 * so this file cannot drift from the posts themselves.
 *
 * Rules, pinned by src/lib/__tests__/essay-links.test.ts:
 * - Every slug must resolve to a real published post in
 *   src/content/blog. A dangling slug fails the test suite.
 * - A page with no genuinely relevant essay gets no entry and renders
 *   no section. Forced links are worse than none.
 * - social-objects is intentionally absent: no published essay is
 *   about social objects, shared artifacts, or outreach, so every
 *   candidate would be forced.
 * - tenantos carries a single entry on purpose: exactly one published
 *   essay is genuinely about TenantOS, the first tenant case study.
 *   A second link would be forced, so there is none.
 */
export const ESSAY_LINKS_BY_TECH_PAGE: Record<string, string[]> = {
  agents: [
    "building-agent-execution-boundaries",
    "why-continuity-matters-for-ai-agents",
    "the-machine-that-trusted-its-software",
  ],
  "business-automation": [
    "the-scheduler-said-it-ran",
    "the-retry-that-charged-twice",
  ],
  continuity: [
    "why-continuity-matters-for-ai-agents",
    "the-boat-that-stopped-the-world",
    "the-night-gitlab-deleted-itself",
  ],
  events: [
    "the-scheduler-said-it-ran",
    "airplane-mode-postmortem",
    "the-standup-is-a-distributed-system",
  ],
  evidence: [
    "evidence-and-provenance-for-autonomous-systems",
    "what-a-hash-taught-us-about-trust",
    "the-bug-that-didnt-bite",
  ],
  integrations: [
    "the-space-probe-that-measured-in-pounds",
    "the-rocket-that-overflowed",
    "building-agent-execution-boundaries",
  ],
  replay: [
    "the-retry-that-charged-twice",
    "what-a-hash-taught-us-about-trust",
    "the-night-gitlab-deleted-itself",
  ],
  tenantos: ["hpp-to-ping-first-tenant"],
};

export function getEssaySlugsForTechPage(slug: string): string[] {
  return ESSAY_LINKS_BY_TECH_PAGE[slug] ?? [];
}
