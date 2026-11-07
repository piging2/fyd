/**
 * Building in the Open: the public factory record.
 *
 * Every value here is either a measured number from a factory system of
 * record (lane receipts, the live sitemap census, the operation ledger),
 * an explicitly labeled estimate, or UNKNOWN. Nothing is published from a
 * summary when the underlying record can be cited instead. The pin test in
 * src/lib/__tests__/open-data.test.ts enforces that every counter carries
 * its provenance.
 */

export type Provenance = {
  source: string;
  asOf: string;
};

export type Counter = Provenance & {
  value: string;
  label: string;
  note: string;
};

export const openCounters: Counter[] = [
  {
    value: "58",
    label: "site improvement waves shipped",
    note: "Every wave gated on tests, typecheck, and a production build, then verified live at its public URL before it was called done.",
    source: "Website lane records (wave receipts)",
    asOf: "2026-11-07",
  },
  {
    value: "73",
    label: "pages in the open census",
    note: "One audit mission per sitemap URL: claims, metadata, duplication, and discoverability, read against current production.",
    source: "Live sitemap census + Operation 1000 ledger",
    asOf: "2026-11-07",
  },
  {
    value: "46",
    label: "essays published",
    note: "Fact-checked, funny, and deliberately not called episodes. Each carries its own FAQ section and structured data.",
    source: "Production blog census",
    asOf: "2026-11-07",
  },
  {
    value: "27 / 27",
    label: "independent UI audit findings dispositioned",
    note: "Fixed, ported, rejected with evidence, or formally routed to the floor that owns them. None silently dropped.",
    source: "UI audit 2026-11-01 + Website and FYD lane receipts",
    asOf: "2026-11-07",
  },
  {
    value: "11 / 110",
    label: "open census missions completed",
    note: "The websites slice of Operation 1000: paced admissions, append-only findings, semantic dedup before counting.",
    source: "Operation 1000 websites ledger",
    asOf: "2026-11-07",
  },
];

export type EvalGate = Provenance & {
  name: string;
  tests: string;
  state: string;
  trend: string;
};

export const evalGates: EvalGate[] = [
  {
    name: "Acoustic timing gate",
    tests:
      "Whether narration word timings in finished film match the waveform itself: onsets, leading silence, and words held through pauses. Dual-ASR word checks alone cannot hear a splice; this gate measures the audio.",
    state: "Enforced on every new build",
    trend:
      "An independent acoustic audit failed all six legacy clips on three systematic defects. The corrected pipeline (acoustic onset refinement) passes 6 of 6. The legacy masters were not re-rendered; the gate binds everything built since.",
    source: "Video Factory timing mission report",
    asOf: "2026-11-04",
  },
  {
    name: "Ship-line verification",
    tests:
      "Whether a change counted as shipped actually exists at its destination: the content hash is measured on the destination after transfer, and the public URL is read back settled before the word shipped is used.",
    state: "Active on every production change",
    trend:
      "Two early probes reported false positives by matching strings the old deployment also produced. The discipline now requires markers only the new deploy can produce, paired with an absence check for the old signature.",
    source: "Website lane wave receipts, Waves 46 to 58",
    asOf: "2026-11-05",
  },
  {
    name: "Tenant isolation battery",
    tests:
      "Whether one business's data, rendering, and editing surface can ever touch another's: cross-tenant loads and saves must fail closed at the adapter boundary.",
    state: "Adapter boundary: PASS (measured). Full contract: under validation",
    trend:
      "Cross-tenant load and save both throw scope errors on fixture tenants, and the objects test suites run green in production builds. TenantOS claims stay labeled UNDER VALIDATION until the full battery is green; that label is the contract, not a caveat.",
    source: "D-005 Puck spike evidence + reconciled deploy gate run",
    asOf: "2026-11-05",
  },
  {
    name: "Discoverability checks (SEO / AEO)",
    tests:
      "Whether a page can be found and correctly understood by search engines and AI answer engines, graded only from observable evidence: branded and local search presence, structured data, answer-shaped content, metadata, and conversion paths.",
    state: "Baseline measured; re-measurement running",
    trend:
      "The 2026-11-03 baseline graded 30 pages: 9 moderate-strong, 16 moderate, 4 weak-moderate, 1 weak. The weak page is named here rather than hidden: /privacy. A 13-area re-measurement cycle is running against current production.",
    source: "Discoverability audit 2026-11-03 + Operation 1000 Class R missions",
    asOf: "2026-11-05",
  },
  {
    name: "Content quality gate",
    tests:
      "Whether a social post earns publication at all: seven checks on originality, evidence, and craft, applied before anything ships. An empty day beats a mediocre post.",
    state: "Active (owner law)",
    trend:
      "The standing cadence dropped from volume quotas to 2 to 3 excellent posts per week. Watch time, retention, shares, saves, and real discussion are the metrics; vanity counts are not reported because they are not managed.",
    source: "Owner quality-over-quantity order 2026-11-05",
    asOf: "2026-11-05",
  },
  {
    name: "Wave gates (tests, types, build, live read)",
    tests:
      "Whether the production codebase itself is healthy at the moment a change ships: the full test suite, the typechecker, and a production build must pass, and the change must verify live.",
    state: "3,386 tests passing on the current tree",
    trend:
      "Three tests in two suites (the demo owner-mode gate suites) fail in the shared environment posture. The cause is root-caused to environment, the failures are identical on every tree, and they are published here instead of rounded away: 3,386 passing is the number, not a cleaner one.",
    source: "Reconciled deploy + Wave 58 gate runs",
    asOf: "2026-11-07",
  },
];

export type CostLine = {
  item: string;
  diy: string;
  note: string;
  kind: "measured" | "estimate" | "unknown";
};

/**
 * Category cost physics for running a small business's web, social, and AI
 * stack yourself. Dollar lines are typical list-price ranges, labeled
 * estimates; the dominant line is the owner's own time, which the
 * calculator prices from the visitor's own numbers.
 */
export const diyCostLines: CostLine[] = [
  {
    item: "Website hosting and deployment",
    diy: "$0 to $25 / mo",
    note: "Free tiers exist; production-grade hosting for a small business site lands in this band at list prices.",
    kind: "estimate",
  },
  {
    item: "Domain and DNS",
    diy: "about $15 / yr",
    note: "One domain at a mainstream registrar, before premium TLDs.",
    kind: "estimate",
  },
  {
    item: "Scheduling, design, and inbox tools",
    diy: "$20 to $60 / mo",
    note: "The usual stack of two or three subscriptions a business accumulates to post, design, and reply.",
    kind: "estimate",
  },
  {
    item: "AI model usage",
    diy: "$5 to $40 / mo",
    note: "Drafting, captions, and replies at small-business volume, at published per-token list prices.",
    kind: "estimate",
  },
  {
    item: "Your hours",
    diy: "priced by the calculator",
    note: "Posting, replying, fixing the site, chasing follow-up. For most owners this line is larger than every other line combined, which is the entire point of the tiers below.",
    kind: "estimate",
  },
];

/**
 * Our own operating cost shape, as percentages. The spec for this page
 * says: publish after the first clean month of ledger data. Until then
 * this stays UNKNOWN in public, on purpose.
 */
export const ownCostShape: { state: "unknown"; note: string } = {
  state: "unknown",
  note: "UNKNOWN, deliberately. We publish our cost shape as percentages after the first clean month of ledger data. Until then this cell stays unknown rather than estimated, because a transparency page that guesses at its own numbers is worse than one that admits the gap.",
};

/** Planning assumption used by the calculator for the tooling stack. */
export const TOOLING_PER_SITE_ESTIMATE = 20;

/**
 * DIY true monthly cost: the owner's hours at their own rate, plus a
 * labeled tooling estimate per site. Pure and unit-tested.
 */
export function diyMonthlyCost(hoursPerWeek: number, hourlyRate: number, sites: number): number {
  const weeksPerMonth = 4.33;
  const time = Math.max(0, hoursPerWeek) * Math.max(0, hourlyRate) * weeksPerMonth;
  const tooling = Math.max(1, sites) * TOOLING_PER_SITE_ESTIMATE;
  return Math.round(time + tooling);
}
