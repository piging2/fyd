/**
 * Ask FYD obligation model (EXECUTION MODE item 7).
 *
 * QUESTION -> OBLIGATIONS -> EVIDENCE RESOLUTION -> COVERAGE CHECK -> ANSWER.
 *
 * A compound question carries several obligations ("Can they repair heat
 * pumps, and how do I contact them?" = heat-pump repair + contact). The
 * pipeline used to answer with whichever single branch fired first and
 * silently drop the rest. Now every question decomposes into obligations,
 * each obligation resolves to SUPPORTED / DERIVED / UNKNOWN, and the
 * coverage check fails safe: an obligation that produced neither a claim
 * nor an unknown surfaces as an honest UNKNOWN, never as silence.
 *
 * Pure + deterministic. No loader, no network, no clock, no model. The
 * trigger detectors are the same regexes the concierge branches already
 * used; this module owns them once so the concierge and the contract
 * cannot drift.
 */

export type ObligationKind =
  | "contact"
  | "hours"
  | "emergency"
  | "services"
  | "location"
  | "profile"
  | "repair"
  | "coverage";

export type ObligationStatus = "supported" | "derived" | "unknown" | "declined";

export interface Obligation {
  /** Deterministic id: ob-0, ob-1, ... in decomposition order. */
  id: string;
  kind: ObligationKind;
  /** The original-case segment this obligation came from. */
  segment: string;
  /** The text the resolver runs on (== the full question for single obligations). */
  text: string;
  /** Short topic label, used for forced-unknown wording and coverage checks. */
  topic: string;
  /** Keywords proving the topic is addressed by a served answer. */
  keywords: string[];
}

export interface ObligationResolution {
  obligation: Obligation;
  status: ObligationStatus;
  claimCount: number;
  unknowns: string[];
}

/** Thrown when a served answer would silently omit an obligation. */
export class ObligationCoverageError extends Error {
  constructor(reason: string) {
    super(`Ask FYD obligation coverage violation: ${reason}. The answer was refused instead of served.`);
    this.name = "ObligationCoverageError";
  }
}

/**
 * The concierge's question normalization, verbatim: lowercases, expands
 * a/c, strips punctuation. Single owner now (was inline in
 * visitor-concierge.ts).
 */
export function normalizeQuestion(text: string): string {
  return text.toLowerCase().replace(/\ba\s*\/\s*c\b|\bac\b/g, 'air conditioning')
    .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Branch priority: the order the concierge's branch chain tested triggers
 * in. A single-intent question keeps first-wins semantics exactly.
 */
const KIND_PRIORITY: ObligationKind[] = [
  "contact",
  "location",
  "emergency",
  "hours",
  "services",
  "coverage",
  "repair",
  "profile",
];

function hasContact(norm: string): boolean {
  return /\b(contact|phone|telephone|email|reach|call)\b/.test(norm) &&
    !/\b(answer|answering|automate|automation)\b/.test(norm);
}

/**
 * Every intent kind a normalized segment matches, in branch-priority
 * order. Mirrors the visitor-concierge branch triggers one for one.
 */
export function classifySegment(norm: string): ObligationKind[] {
  const kinds: ObligationKind[] = [];
  if (hasContact(norm)) kinds.push("contact");
  if (/\b(where|located|location|address|based|area|serve|serves|serving)\b/.test(norm)) kinds.push("location");
  if (/\b(emergency|24|weekend)\b/.test(norm)) kinds.push("emergency");
  else if (/\b(hours|open|opening|closed)\b/.test(norm)) kinds.push("hours");
  if (/^what services does this business offer and how do you know$/.test(norm)) kinds.push("coverage");
  else if (/^(what (services|do .* (offer|provide))|list .*services|show .*services)/.test(norm)) kinds.push("services");
  if (/\b(help|problem|broken|repair|fix|need|leak|leaking)\b/.test(norm) ||
      /^do (they|you) (do|offer|provide|have)\b/.test(norm) ||
      /^can (they|you)\b/.test(norm)) kinds.push("repair");
  if (/^(what does .* do|what do (you|they) do|tell me about|who are (you|they))/.test(norm)) kinds.push("profile");
  return KIND_PRIORITY.filter((k) => kinds.includes(k));
}

/** Split a question into topic segments on multi-topic connectors. */
export function splitSegments(question: string): string[] {
  const out: string[] = [];
  for (const part of question.split(/[;,?+]+/)) {
    for (const sub of part.split(/\band\b|\bor\b/i)) {
      const t = sub.trim();
      if (t.length > 0) out.push(t);
    }
  }
  return out;
}

/** Strip emergency modifiers so the repair obligation sees the service topic. */
export function stripEmergencyWords(segment: string): string {
  return segment.replace(/\b(emergency|24|weekend)\b/gi, " ").replace(/\s+/g, " ").trim();
}

const REPAIR_TOPIC_NOISE = new Set(
  "can could would they you help me my with do does offer provide need needs a an the is are broken working not have has i we our please this that them business repair fix".split(" "),
);

/** The service topic of a repair segment: content terms, trigger verbs removed. */
function repairTopic(text: string): string {
  const terms = normalizeQuestion(text).split(" ").filter((t) => t.length > 2 && !REPAIR_TOPIC_NOISE.has(t));
  return terms.slice(0, 4).join(" ") || "that service";
}

const KIND_META: Record<Exclude<ObligationKind, "repair">, { topic: string; keywords: string[] }> = {
  contact: { topic: "contact details", keywords: ["contact", "phone", "email", "call", "website"] },
  hours: { topic: "business hours", keywords: ["hours", "open", "opening", "closed"] },
  emergency: { topic: "emergency or after-hours availability", keywords: ["emergency", "after-hours"] },
  services: { topic: "the services offered", keywords: ["service", "services", "offer"] },
  location: { topic: "the business location", keywords: ["located", "location", "address", "based", "area", "serve"] },
  profile: { topic: "a business description", keywords: ["description", "about"] },
  coverage: { topic: "service details and their sources", keywords: ["service", "evidence", "source"] },
};

function makeObligation(id: number, kind: ObligationKind, segment: string, text: string): Obligation {
  const topic = kind === "repair" ? repairTopic(text) : KIND_META[kind].topic;
  const keywords = kind === "repair"
    ? (repairTopic(text) === "that service" ? ["service"] : repairTopic(text).split(" "))
    : KIND_META[kind].keywords;
  return { id: "ob-" + id, kind, segment, text, topic, keywords };
}

/**
 * Decompose a question into obligations.
 *
 * - One segment, or several segments that all match the same kind set:
 *   a single obligation over the ORIGINAL question text (first-wins kind).
 *   Single-intent behavior is preserved byte-for-byte.
 * - Segments matching different kinds: one obligation per (segment, kind).
 *   A segment matching emergency plus another kind also yields the second
 *   kind with emergency words stripped ("emergency heat-pump repair" ->
 *   emergency availability + heat-pump repair).
 * - A segment matching nothing becomes a repair obligation: the topic
 *   matcher is the most general resolver, and a declined resolver still
 *   surfaces as UNKNOWN. Silence is never an option.
 */
export function decomposeObligations(question: string): Obligation[] {
  const segments = splitSegments(question);
  if (segments.length === 0) return [];
  const classified = segments.map((seg) => ({ seg, kinds: classifySegment(normalizeQuestion(seg)) }));
  const kindSets = classified.map((c) => c.kinds.join("|"));
  const allSame = kindSets.every((k) => k === kindSets[0]);
  if (classified.length === 1 || allSame) {
    const kinds = classified[0].kinds;
    if (kinds.length === 0) return [];
    return [makeObligation(0, kinds[0], segments[0], question)];
  }
  const obligations: Obligation[] = [];
  for (const { seg, kinds } of classified) {
    const effective: ObligationKind[] = kinds.length > 0 ? kinds : ["repair"];
    for (const kind of effective) {
      const text = kind === "repair" && kinds.includes("emergency") ? stripEmergencyWords(seg) : seg;
      obligations.push(makeObligation(obligations.length, kind, seg, text));
    }
  }
  return obligations;
}

/** The honest-unknown sentence for an uncovered obligation. Presentational: no factual atoms. */
export function forcedUnknownFor(obligation: Obligation): string {
  return "I can't confirm " + obligation.topic + " from the published information I have.";
}

/**
 * Is this obligation addressed by a served answer? Keyword match on the
 * answer text, unknowns, and claim texts. Profile claims are free-form
 * business prose that may share no vocabulary with the topic words, so a
 * long claim-shaped sentence also covers the profile obligation.
 *
 * This is a heuristic backstop, not the primary enforcement: the
 * concierge enforces coverage structurally per obligation
 * (assertObligationCoverage). It is shared by the contract seam and the
 * fallback composer so the three cannot drift.
 */
export function isObligationCovered(
  ob: { kind: string; keywords: string[] },
  args: { answer: string; unknowns: string[]; claimTexts: string[] },
): boolean {
  const haystack = (
    args.answer + "\n" + args.unknowns.join("\n") + "\n" + args.claimTexts.join("\n")
  ).toLowerCase();
  if (ob.keywords.some((k) => k.length > 0 && haystack.includes(k.toLowerCase()))) return true;
  if (ob.kind === "profile") {
    return args.claimTexts.some((c) => c.length > 100);
  }
  return false;
}

/** Obligations with no claim and no unknown: the ones coverage must not omit. */
export function missingObligations(
  obligations: Obligation[],
  resolutions: ObligationResolution[],
): Obligation[] {
  return obligations.filter((ob) => {
    const r = resolutions.find((x) => x.obligation.id === ob.id);
    return !r || r.status === "declined" || (r.claimCount === 0 && r.unknowns.length === 0);
  });
}

/**
 * Hard coverage check: every obligation ends with >= 1 claim or >= 1
 * unknown. Throws ObligationCoverageError otherwise. The served pipeline
 * calls this after fail-safe forcing, so a throw here is a pipeline bug.
 */
export function assertObligationCoverage(
  obligations: Obligation[],
  resolutions: ObligationResolution[],
): void {
  const missing = missingObligations(obligations, resolutions);
  if (missing.length > 0) {
    throw new ObligationCoverageError(
      "uncovered obligations: " + missing.map((o) => o.id + " (" + o.kind + ": " + o.topic + ")").join(", "),
    );
  }
}
