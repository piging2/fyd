/**
 * Ask PING: server-side bounded context builder plus a DETERMINISTIC
 * evidence-backed answer composer (Lane A).
 *
 * No LLM, no agent runtime, no new authority. The composer is a pure
 * function of (bounded context, question): same inputs always produce the
 * same answer. Every factual sentence cites evidence as [n]; when the
 * context has no supporting evidence the composer says so instead of
 * inventing facts.
 *
 * Proposal flow: the composer DRAFTS proposals only. Agents propose, they
 * cannot publish. A human approves the exact digest through the proposal
 * endpoint, which re-verifies the digest before submitting the governed
 * signed envelope as the viewer identity.
 */

import { canonicalize, sha256Hex } from "./digest";
import { ownerCorrectionForObject } from "@/fyd/object/owner-overlay";
import {
  coarsenAddress,
  isAddressFamilyField,
  valueLooksLikeAddress,
} from "@/fyd/sitespec/field-visibility";
import type {
  AskAnswer,
  AskClaimClassification,
  AskContext,
  AskEvidenceRef,
  AskProposal,
  CapabilityPlan,
  PingObject,
  PingRelationship,
  PlannedAction,
  SitePatchProposalBody,
} from "./types";

export const ASK_LIMITS = {
  maxRelated: 8,
  maxRelationships: 20,
  maxFieldChars: 500,
  maxRelatedInAnswer: 5,
} as const;

/** Whitelisted object fields a proposal may change. Aliases map to canonical names. */
const PROPOSABLE_FIELDS: Record<string, string> = {
  bio: "description",
  description: "description",
  summary: "description",
  title: "title",
  name: "title",
  website: "website",
  url: "website",
  location: "location",
};

// ---------------------------------------------------------------------------
// Canonical JSON + digest (sha256-canonical-json-v1)
// ---------------------------------------------------------------------------

export { canonicalize };

export interface ObjectProposalBody {
  kind: "object_update" | "object_create";
  targetObjectId: string | null;
  schema: string;
  changes: Record<string, string>;
}

/**
 * Digest input for every AskProposal. The digest law is shared: hash the
 * canonical body only, never the digest, algorithm label, note, or
 * signature envelope.
 */
export type ProposalBody = ObjectProposalBody | SitePatchProposalBody;

export function proposalDigest(body: ProposalBody): string {
  return sha256Hex(canonicalize(body));
}

export function verifyProposalDigest(proposal: AskProposal): boolean {
  const body: ProposalBody =
    proposal.kind === "site_patch"
      ? {
          kind: proposal.kind,
          targetObjectId: proposal.targetObjectId,
          schema: proposal.schema,
          changes: proposal.changes,
          sitePatch: proposal.sitePatch,
        }
      : {
          kind: proposal.kind,
          targetObjectId: proposal.targetObjectId,
          schema: proposal.schema,
          changes: proposal.changes,
        };
  return proposal.digest === proposalDigest(body);
}

// ---------------------------------------------------------------------------
// Bounded context builder
// ---------------------------------------------------------------------------

export interface AskContextInput {
  viewer: { id: string | null; displayName: string | null };
  target: PingObject | null;
  relatedObjects: PingObject[];
  relationships: PingRelationship[];
  plan: CapabilityPlan | null;
  /** Optional per-object field epistemic classes (pipeline FactClass vocabulary). */
  fieldClasses?: Record<string, Record<string, string>>;
}

/** Extract deduped source URLs from object provenance refs. Deterministic. */
function provenanceSourceUrls(objects: Array<PingObject | null>): string[] {
  const urls = new Set<string>();
  for (const o of objects) {
    const ref = o?.provenance?.ref;
    if (!ref) continue;
    const m = /^website-ingestion:(https?:\/\/.+)$/.exec(ref);
    if (m) {
      urls.add(m[1]);
      continue;
    }
    const u = /https?:\/\/[^\s"']+/.exec(ref);
    if (u) urls.add(u[0]);
  }
  return [...urls].sort();
}

/**
 * Epistemic classification from object provenance, used when the context
 * carries no explicit field class and the object has no claim kind of its
 * own. Website-derived material is the site's own words (never verified
 * fact); canonical-journal objects are recorded facts in the site data;
 * owner material is owner-authored. Overlay-authored (demo) content
 * is classified DEMO_SYNTHETIC, never a recorded fact. This keeps
 * citations on a real evidence class instead of degrading to the
 * meaningless "unknown".
 */
function classificationFromProvenance(obj: PingObject): string {
  const kind = obj.provenance?.kind ?? "";
  if (kind === "overlay-authored") return "DEMO_SYNTHETIC";
  if (kind === "canonical-journal") return "DIRECT_FACT";
  if (kind === "website-derived" || kind === "website-ingestion") return "website_statement";
  if (kind === "owner") return "owner_authorship";
  return "unknown";
}

/**
 * Epistemic classification for one object field claim. Prefers the
 * pipeline FactClass vocabulary when the context carries field classes;
 * then the object's own claim kind; then the object's provenance;
 * never invents certainty.
 */
function claimClassification(
  fieldClasses: Record<string, Record<string, string>>,
  obj: PingObject,
  field: string,
): string {
  const fc = fieldClasses[obj.id]?.[field];
  if (fc) return fc;
  const ck = obj.fields["claimKind"];
  if (typeof ck === "string" && ck !== "") return ck;
  return classificationFromProvenance(obj);
}

function truncateField(value: string | string[]): string | string[] {
  const cut = (s: string) =>
    s.length > ASK_LIMITS.maxFieldChars ? s.slice(0, ASK_LIMITS.maxFieldChars) + "…" : s;
  return Array.isArray(value) ? value.map(cut) : cut(value);
}

function boundedObject(obj: PingObject): PingObject {
  const fields: Record<string, string | string[]> = {};
  for (const [k, v] of Object.entries(obj.fields)) fields[k] = truncateField(v);
  return {
    ...obj,
    title: obj.title.slice(0, 200),
    description: obj.description.slice(0, 2000),
    fields,
  };
}

export function schemaLabel(schema: string): string {
  const short = schema.split(".").pop() ?? schema;
  return short.replace(/@.*$/, "").replace(/_/g, " ");
}

export function buildAskContext(input: AskContextInput): AskContext {
  const related = input.relatedObjects.slice(0, ASK_LIMITS.maxRelated).map(boundedObject);
  const relationships = input.relationships.slice(0, ASK_LIMITS.maxRelationships);
  const target = input.target ? boundedObject(input.target) : null;

  const evidenceRefs: AskEvidenceRef[] = [];
  if (target) {
    evidenceRefs.push({
      kind: "object",
      id: target.id,
      label: `${schemaLabel(target.schema)}: ${target.title || target.id}`,
      detail: `provenance ${target.provenance.kind}, ref ${target.provenance.ref}`,
    });
  }
  for (const r of relationships.slice(0, 10)) {
    evidenceRefs.push({
      kind: "relationship",
      id: r.id,
      // FYD P1: full endpoint ids (no truncation). The subject and object
      // of overlay relationships share a "website-" prefix, so truncating
      // both to 12 chars rendered every relationship as the identical
      // "website-busi <pred> website-busi", making the consulted-evidence
      // line useless as an evidence-transparency surface.
      label: `${r.subject} ${r.predicate} ${r.object} (${r.status})`,
      detail: `event ${r.evidenceRef}`,
    });
  }
  for (const o of related.slice(0, 5)) {
    evidenceRefs.push({
      kind: "object",
      id: o.id,
      label: `${schemaLabel(o.schema)}: ${o.title || o.id}`,
    });
  }

  return {
    viewer: input.viewer,
    target,
    schemaLabel: target ? schemaLabel(target.schema) : "none",
    relatedObjects: related,
    relationships,
    evidenceRefs,
    plan: input.plan,
    limits: { ...ASK_LIMITS, maxRelated: ASK_LIMITS.maxRelated, maxRelationships: ASK_LIMITS.maxRelationships, maxFieldChars: ASK_LIMITS.maxFieldChars },
    fieldClasses: input.fieldClasses ?? {},
    sourceUrls: provenanceSourceUrls([target, ...related]),
  };
}

// ---------------------------------------------------------------------------
// Deterministic answer composer
// ---------------------------------------------------------------------------

interface Sentence {
  text: string;
  /** 0-based indices into evidenceRefs. Empty = non-factual (allowed sparingly). */
  cites: number[];
}

function cite(text: string, cites: number[]): string {
  if (cites.length === 0) return text;
  const tags = [...new Set(cites)].map((i) => `[${i + 1}]`).join("");
  return `${text} ${tags}`;
}

/**
 * Plain-language epistemic basis for a provenance kind, used by the
 * provenance ("how do you know?") branch. The citation layer carries the
 * formal classification; this is the sentence-level wording.
 */
function provenanceBasisLabel(kind: string): string {
  if (kind === "overlay-authored")
    return "demo content added by the site operator (not the website's own words, not a recorded fact)";
  if (kind === "canonical-journal") return "a recorded fact in the site data";
  if (kind === "website-derived" || kind === "website-ingestion")
    return "the site's own words (website statement, not independently verified)";
  if (kind === "owner") return "owner-authored content";
  return "the site record";
}

function fieldOf(obj: PingObject, ...names: string[]): string | null {
  for (const n of names) {
    const v = obj.fields[n];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (Array.isArray(v) && v.length > 0) return v.join(", ");
  }
  return null;
}

/**
 * TITLE-SHAPE RULE (Q-P0-01 leak 4): the located_at branch names the
 * location object by its TITLE, which never passes through field
 * visibility. When the title is address-shaped ("123 Main St, Grand
 * Junction, CO") it is coarsened exactly like an address field; a
 * business-name title ("Acme Plumbing") passes through unchanged. A
 * title that IS pure street ("123 Main St") coarsens to "" and returns
 * null so the caller falls back to the locality field — fail closed on
 * the title itself. Pure, deterministic, no I/O, no clock.
 */
function coarsenLocationTitle(title: string | null | undefined): string | null {
  if (!title) return null;
  if (!valueLooksLikeAddress(title)) return title;
  return coarsenAddress(title) || null;
}

function hasWord(q: string, ...words: string[]): boolean {
  return words.some((w) => new RegExp(`\\b${w}\\b`).test(q));
}

/**
 * Generic words carrying no topic: question scaffolding, the branches'
 * own trigger words, and business-generic nouns. Used to decide whether
 * a question names a SPECIFIC topic (e.g. "financing") that must match
 * something on record before a branch fires.
 */
const GENERIC_WORDS: ReadonlySet<string> = new Set([
  "a", "an", "the", "this", "that", "these", "those",
  "is", "are", "was", "were", "be", "been", "being",
  "do", "does", "did", "done", "doing",
  "what", "which", "who", "whom", "whose", "when", "where", "why", "how",
  "and", "or", "but", "if", "then", "than", "so", "such",
  "of", "for", "with", "about", "into", "from", "to", "in", "on", "at", "by", "as",
  "it", "its", "they", "them", "their", "you", "your", "yours",
  "we", "our", "us", "i", "me", "my", "mine",
  "he", "him", "his", "she", "her", "hers",
  "business", "businesses", "company", "companies", "shop", "store", "firm",
  "service", "services", "offer", "offers", "offered", "offering", "offerings",
  "provide", "provides", "provided", "providing", "sell", "sells", "sold",
  "have", "has", "had", "having", "get", "gets", "getting",
  "there", "here", "any", "some", "all", "anyone", "anything",
  "can", "could", "would", "should", "will", "shall", "may", "might", "must",
  "just", "really", "please", "very", "quite",
  "tell", "know", "kinds", "kind", "types", "type", "many", "much", "more", "most",
  "list", "name", "names", "like",
  "handle", "handles", "handling",
]);

/**
 * Words the hours branch answers: schedule, availability, emergency. The
 * services branch excludes these from its unmatched-topic reporting so
 * the hours branch owns them (no double coverage, no UNKNOWN inflation).
 */
const HOURS_WORDS = new Set([
  "hour", "hours", "emergency", "weekend", "weekends", "saturday", "sunday",
  "open", "close", "closing", "schedule",
]);

/**
 * Words that name the people/association intent itself (the people branch's
 * own triggers) plus identity words the person listing answers (the recorded
 * name). Excluded from the people branch's grounded-topic check so a general
 * people question ("who works here?", "what is the owner's name?") is not
 * treated as naming an ungrounded specific topic.
 */
const PEOPLE_TRIGGER_WORDS: ReadonlySet<string> = new Set([
  "person", "people", "owner", "owners", "owns", "owned",
  "founder", "founders", "staff", "team", "employee", "employees",
  "member", "members", "employs",
  "works", "working", "runs", "manages",
  "associated", "associate", "associates", "association",
  "affiliated", "affiliate", "affiliation", "connected", "linked",
  "name", "names",
]);

/**
 * Content words of the question minus generic scaffolding. Empty means
 * the question is general ("what services are offered?"); non-empty
 * means it names a specific topic ("financing") that must match the
 * record before a branch fires.
 */
function topicWords(q: string): string[] {
  const out: string[] = [];
  for (const w of q.toLowerCase().split(/[^a-z0-9]+/)) {
    if (w.length > 2 && !GENERIC_WORDS.has(w) && !out.includes(w)) out.push(w);
  }
  return out;
}

/**
 * PROD-3: out-of-scope topics. These name things with no bearing on any
 * business Ask FYD answers for (elections, general knowledge, weather
 * forecasts, news, sports, markets). A question naming one is refused with
 * the scope refusal ("I can only answer questions about X"), never
 * answered with a business blurb. The lexicon is a certain-signal list:
 * anything NOT on it flows to the normal branch logic, which refuses
 * honestly when ungrounded (fail-closed: uncertain scope never
 * confabulates).
 *
 * PROD-3+4-REPAIR: the ambiguous words "weather", "temperature", "news",
 * "stock"/"stocks" are NOT bare words here; they are context-sensitive
 * (see the names* helpers below) because bare matching over-fired on
 * legitimate business questions ("Do you have this part in stock?",
 * "What temperature should my water heater be set to?").
 */
const OUT_OF_SCOPE_WORDS: ReadonlySet<string> = new Set([
  // Elections and politics.
  "election", "elections", "president", "presidential", "senator", "senators",
  "congress", "congressman", "governor", "mayor", "ballot", "vote", "votes",
  "voting", "voter", "voters", "democrat", "democrats", "republican",
  "republicans", "referendum", "polls",
  // Weather as general knowledge (not business operations).
  "forecast", "forecasts", "fahrenheit", "celsius",
  "tornado", "hurricane", "blizzard",
  // Sports, entertainment.
  "sports", "football", "basketball", "baseball", "soccer", "olympics",
  // Markets.
  "bitcoin", "crypto", "cryptocurrency", "nasdaq",
  // Lottery, horoscope.
  "lottery", "horoscope",
]);

/**
 * Multi-word out-of-scope topics (matched as substrings of the lowercased
 * question). PROD-3+4-REPAIR: "how tall is" is context-sensitive
 * (see namesUnanchoredHeight) because it over-fired on "how tall is your
 * building?".
 */
const OUT_OF_SCOPE_PHRASES: readonly string[] = [
  "capital of",
  "population of",
  "who won",
  "who will win",
  "who is winning",
  "who wrote",
  "who invented",
  "who discovered",
  "world cup",
  "super bowl",
];

/**
 * Words that anchor a question to the business even when it also names an
 * out-of-scope topic ("What are your hours on election day?"). Business
 * nouns and the business name itself are checked separately via
 * namesBusiness / titleWords; these are the concrete business facets and
 * operation words.
 */
const SCOPE_ANCHOR_WORDS: ReadonlySet<string> = new Set([
  "hour", "hours", "open", "close", "closing", "schedule", "appointment",
  "appointments", "saturday", "sunday", "weekend", "weekends",
  "phone", "email", "address", "location", "located", "website", "contact",
  "price", "pricing", "cost", "costs", "rate", "rates", "quote", "estimate",
  "estimates", "service", "services", "offer", "offers", "offering",
  "offerings", "provide", "provides", "providing",
  "owner", "owners", "staff", "team", "employee", "employees",
  "emergency", "review", "reviews", "rating", "ratings",
  "work", "working", "job", "jobs", "operate", "operates", "hire", "hiring",
  // PROD-3+4-REPAIR: testimonials are a business facet (social proof).
  "testimonial", "testimonials",
]);

/**
 * PROD-3+4-REPAIR: context-sensitive out-of-scope topics. These words are
 * ambiguous alone, so each only names an out-of-scope topic with
 * disambiguating context:
 * - "stock"/"stocks": market context only, never inventory ("this part in
 *   stock" is a business question).
 * - "temperature": forecast context only, never appliance settings ("what
 *   temperature should my water heater be set to" is a business question).
 * - "news": headlines/current-events context only, never job status ("any
 *   news on my repair" is a business question).
 * - "weather": forecast context only, never damage repair ("do you repair
 *   weather damage" is a business question).
 * - "how tall is": only when not anchored to a business facet ("how tall
 *   is your building" is a business question).
 */

/** Market-context phrases that make singular "stock" out-of-scope. */
const STOCK_MARKET_PHRASES: readonly string[] = [
  "stock market",
  "stock price",
  "stock prices",
  "share price",
  "share prices",
];

/** "stock"/"stocks": out-of-scope only with market context, never inventory. */
function namesStockMarket(q: string): boolean {
  if (!hasWord(q, "stock", "stocks")) return false;
  if (hasWord(q, "stocks")) return true;
  return STOCK_MARKET_PHRASES.some((p) => q.includes(p));
}

/** Words that put "temperature"/"weather" in a weather-forecast frame. */
const FORECAST_CONTEXT_WORDS: readonly string[] = [
  "forecast", "forecasts", "outside", "today", "tomorrow", "tonight",
];

/** "temperature": out-of-scope only with forecast context, never appliance settings. */
function namesForecastTemperature(q: string): boolean {
  if (!hasWord(q, "temperature")) return false;
  return hasWord(q, ...FORECAST_CONTEXT_WORDS);
}

/** "weather": out-of-scope only with forecast context, never damage repair. */
function namesForecastWeather(q: string): boolean {
  if (!hasWord(q, "weather")) return false;
  if (hasWord(q, ...FORECAST_CONTEXT_WORDS)) return true;
  // A bare "what is the weather"-style question is a forecast question.
  return topicWords(q).every((w) => w === "weather");
}

/** Job-status words that keep "news" about the business in scope. */
const NEWS_JOB_STATUS_WORDS: readonly string[] = [
  "repair", "repairs", "order", "orders", "job", "jobs",
  "project", "projects", "appointment", "appointments",
  "service", "services", "update", "updates", "status",
];

/** "news": out-of-scope only with headlines/current-events context, never job status. */
function namesHeadlineNews(q: string): boolean {
  if (!hasWord(q, "news")) return false;
  if (hasWord(q, ...NEWS_JOB_STATUS_WORDS)) return false;
  if (
    hasWord(q, "headlines", "headline", "breaking", "latest", "world", "national", "today", "tonight")
  ) return true;
  return topicWords(q).every((w) => w === "news");
}

/** Business-facet nouns that anchor "how tall is" to the business. */
const HEIGHT_FACET_WORDS: readonly string[] = [
  "your", "yours",
  "building", "buildings", "sign", "signs", "fence", "fences",
  "wall", "walls", "shop", "store", "business", "company",
  "house", "home", "ceiling", "door", "doors",
];

/**
 * "how tall is": out-of-scope only when it asks about something other than
 * the business ("how tall is the Eiffel Tower?"). A business-facet anchor
 * ("how tall is your building") keeps it in scope.
 */
function namesUnanchoredHeight(q: string): boolean {
  if (!q.includes("how tall is")) return false;
  return !hasWord(q, ...HEIGHT_FACET_WORDS);
}

/**
 * PROD-3+4-REPAIR-R2: trades/service vocabulary. A question naming
 * trades or service work is always business scope, never an out-of-scope
 * topic for the ambiguous words (temperature/weather/stock/news):
 * "The outside unit shows a temperature fault, can you come look at it
 * today?" names a condenser fault and a service visit, not a weather
 * forecast. Business signal wins over out-of-scope signal: the refusal
 * fires only on a strong out-of-scope signal with zero business/trades
 * signal. Some of these words also anchor via SCOPE_ANCHOR_WORDS; they
 * are listed here as the documented trades signal anyway.
 */
const TRADES_VOCABULARY_WORDS: readonly string[] = [
  "unit", "units", "fault", "faults",
  "repair", "repairs", "service", "services",
  "install", "installs", "installed", "installation",
  "fix", "fixes", "fixing", "fixed", "broken",
  "schedule", "schedules", "scheduling",
  "appointment", "appointments",
  "estimate", "estimates", "quote", "quotes",
  // PROD-3+4-REPAIR-R3: missing trades vocabulary. Legitimate questions
  // like "Will tomorrow's weather affect the maintenance visit?" were
  // wrongly refused because no trades word was recognized.
  "maintenance", "visit", "visits", "tune-up",
  "diagnostic", "diagnostics", "technician", "technicians",
  "warranty", "inspection", "inspections",
  "replacement", "replacements", "upgrade", "upgrades",
  "servicing",
  // "tech" (technician shorthand) is a word, not a phrase: word-boundary
  // matching so "technology"/"technical" do not count as trades signal.
  "tech",
];
const TRADES_VOCABULARY_PHRASES: readonly string[] = [
  "not working",
  "come look",
  "come by",
  "take a look",
  "have a look",
  "stop by",
  // PROD-3+4-REPAIR-R3: multi-word trades phrases.
  "maintenance visit",
  "tune up",
];

/** True when the question names trades/service work (business scope). */
function namesTradesWork(q: string): boolean {
  if (hasWord(q, ...TRADES_VOCABULARY_WORDS)) return true;
  return TRADES_VOCABULARY_PHRASES.some((p) => q.includes(p));
}

/**
 * PROD-3+4-REPAIR-R3: the raw out-of-scope topic-naming test, WITHOUT the
 * trades/business anchor guards. The profile branch uses this stricter
 * test: a business blurb must never answer a question whose subject is an
 * out-of-scope topic, even when trades words are present ("Who will win
 * the election, fix this?" names trades work via "fix", but the election
 * is the subject, so it must refuse, not blurb).
 */
function namesOutOfScopeTopic(q: string): boolean {
  for (const w of OUT_OF_SCOPE_WORDS) {
    if (hasWord(q, w)) return true;
  }
  for (const p of OUT_OF_SCOPE_PHRASES) {
    if (q.includes(p)) return true;
  }
  // PROD-3+4-REPAIR: context-sensitive topics; bare words over-fired.
  return (
    namesStockMarket(q) ||
    namesForecastTemperature(q) ||
    namesForecastWeather(q) ||
    namesHeadlineNews(q) ||
    namesUnanchoredHeight(q)
  );
}

/**
 * PROD-3 scope check. True when the question names an out-of-scope topic
 * AND is not anchored to the business (it neither names the business nor
 * asks about a concrete business facet). A hit refuses; anything uncertain
 * flows through to the branch logic, which refuses honestly when it cannot
 * ground an answer.
 */
function isOutOfScopeQuestion(q: string, titleWords: string[]): boolean {
  if (!namesOutOfScopeTopic(q)) return false;
  // PROD-3+4-REPAIR-R2: business signal wins over out-of-scope signal.
  // A question naming trades/service work is never out-of-scope for the
  // ambiguous topics (temperature/weather/stock/news), regardless of
  // context words: "outside", "today", "tomorrow" are ordinary trades
  // words too ("The outside unit shows a temperature fault, can you come
  // look at it today?"). The refusal fires only on a strong out-of-scope
  // signal with zero business/trades signal.
  if (namesTradesWork(q)) return false;
  if (
    hasWord(q, "business", "businesses", "company", "companies", "shop", "store", "firm", "contractor") ||
    titleWords.some((w) => hasWord(q, w))
  ) return false;
  for (const w of SCOPE_ANCHOR_WORDS) {
    if (hasWord(q, w)) return false;
  }
  return true;
}

/** Words describing the services on record (services field, titles, descriptions). */
function serviceVocabulary(target: PingObject, relatedServices: PingObject[]): Set<string> {
  const vocab = new Set<string>();
  const add = (text: string | null): void => {
    if (!text) return;
    for (const w of text.toLowerCase().split(/[^a-z0-9]+/)) {
      if (w.length > 2 && !GENERIC_WORDS.has(w)) vocab.add(w);
    }
  };
  add(fieldOf(target, "services"));
  for (const o of relatedServices) {
    add(o.title);
    add(o.description);
  }
  return vocab;
}

/** Words describing the person records on record (titles, descriptions, field values). */
function peopleVocabulary(persons: PingObject[]): Set<string> {
  const vocab = new Set<string>();
  const add = (text: string | null | undefined): void => {
    if (!text) return;
    for (const w of text.toLowerCase().split(/[^a-z0-9]+/)) {
      if (w.length > 2 && !GENERIC_WORDS.has(w)) vocab.add(w);
    }
  };
  for (const p of persons) {
    add(p.title);
    add(p.description);
    for (const [k, v] of Object.entries(p.fields)) {
      // claimKind is epistemic metadata, not person content.
      if (k === "claimKind") continue;
      if (typeof v === "string") add(v);
      else if (Array.isArray(v)) for (const s of v) if (typeof s === "string") add(s);
    }
  }
  return vocab;
}

/** Extract proposed text after "to:", a quoted string, or "to <text>". */
function extractProposedText(question: string): string | null {
  const colon = question.match(/:\s*["“]?(.+?)["”]?\s*$/);
  if (colon && colon[1].trim().length > 0) return colon[1].trim();
  const quoted = question.match(/["“](.+?)["”]/);
  if (quoted && quoted[1].trim().length > 0) return quoted[1].trim();
  const toForm = question.match(/\bto\s+(.+?)\s*$/i);
  if (toForm && toForm[1].trim().length > 0) return toForm[1].trim();
  return null;
}

function detectProposableField(question: string): string | null {
  const q = question.toLowerCase();
  for (const alias of Object.keys(PROPOSABLE_FIELDS)) {
    if (new RegExp(`\\b${alias}\\b`).test(q)) return PROPOSABLE_FIELDS[alias];
  }
  return null;
}

function baseAnswer(
  ctx: AskContext,
): Pick<
  AskAnswer,
  | "evidenceRefs"
  | "relatedObjects"
  | "suggestedActions"
  | "claimClassifications"
  | "unknowns"
  | "sourceUrls"
> {
  return {
    evidenceRefs: ctx.evidenceRefs,
    claimClassifications: [],
    unknowns: [],
    sourceUrls: ctx.sourceUrls,
    relatedObjects: ctx.relatedObjects.slice(0, ASK_LIMITS.maxRelatedInAnswer).map((o) => ({
      id: o.id,
      schema: o.schema,
      title: o.title || o.id,
    })),
    suggestedActions: (ctx.plan?.actions ?? []).filter((a) =>
      [
        "follow",
        "unfollow",
        "like",
        "unlike",
        "open",
        "open_site",
        "open_website",
        "reply",
        "propose_update",
        "propose_site_patch",
      ].includes(a.kind),
    ) as PlannedAction[],
  };
}

function noEvidenceAnswer(ctx: AskContext, question: string, unknowns: string[] = []): AskAnswer {
  const consulted =
    ctx.evidenceRefs.length > 0
      ? `I consulted: ${ctx.evidenceRefs.map((e) => e.label).join("; ")}.`
      : "The current context contains no objects or relationships to consult.";
  return {
    ...baseAnswer(ctx),
    unknowns,
    answer: [
      "I cannot answer that: nothing in the site record covers it, and I will not guess.",
      consulted,
      "Open an object to give me something concrete to answer from, or ask about what is listed below.",
    ].join("\n\n"),
    proposal: null,
    partial: true,
  };
}

/**
 * Optional composer inputs.
 *
 * conflictedFields: public fields suppressed from the projection because
 * of an unresolved field conflict (FYD-Q1). The composer must never state
 * a disputed value; the contact/location/coverage branches describe the
 * field with the locked copy "Contact information is being verified."
 * instead. evidenceIndices point at pre-registered conflict-observation
 * evidence refs, so both evidence chains survive in the Why-this surface.
 */
export interface ComposeAnswerOpts {
  conflictedFields?: { objectId: string; field: string; evidenceIndices: number[] }[];
}

/**
 * PROD-4: user-facing display name for the target object. Never an
 * internal id: a missing or blank title degrades to the given neutral
 * noun, never to a raw id prefix like "website-bus".
 */
function displayTarget(target: PingObject, fallbackNoun: string): string {
  const t = target.title.trim();
  return t.length > 0 ? t : fallbackNoun;
}

/**
 * PROD-4 (repaired PROD-3+4-REPAIR, hardened PROD-3+4-REPAIR-R2):
 * internal-id shapes. Matches ONLY actual id shapes: website-business |
 * service | location followed by a hex hash (8+ hex chars, the observed
 * id form, e.g. website-business-6fa5ebd99d72c4cb) plus any further
 * hyphenated id segments (-location, -service-<hex>, -post-<hex>),
 * fyd-media ids of the same form, or the standalone truncated prefix
 * "website-bus". The hex hash is the whole gate: plain English words
 * after the prefix ("website-business-rentals", "website-business-program",
 * "fyd-media-kit", "Website-Business-99") are never ids and always survive
 * intact. Once the hex hash confirms an id, trailing hyphenated segments
 * are consumed as part of it, so suffixed ids never leak a tail. The
 * trailing (?![-\w]) guard never matches a prefix of a longer hyphenated
 * word.
 */
export const INTERNAL_ID_RE =
  /\bwebsite-(?:business|service|location)-[0-9a-f]{8,}(?:-[a-z0-9]+)*\b(?![-\w])|\bfyd-media-[0-9a-f]{8,}(?:-[a-z0-9]+)*\b(?![-\w])|\bwebsite-bus\b(?![-\w])/gi;

/**
 * PROD-4: strip internal identifiers from user-facing text. Known ids
 * resolve to their object titles; anything unrecognized becomes
 * "the site record". Structured refs (citation ids, objectRefs) are not
 * text surfaces and stay intact for the Why-this panel.
 */
export function stripInternalIds(text: string, labels: ReadonlyMap<string, string>): string {
  return text.replace(INTERNAL_ID_RE, (id) => labels.get(id) ?? "the site record");
}

export function composeAnswer(ctx: AskContext, question: string, opts: ComposeAnswerOpts = {}): AskAnswer {
  const q = question.toLowerCase().trim();
  const target = ctx.target;
  const base = baseAnswer(ctx);

  if (!q) {
    return {
      ...base,
      answer: "Ask me about the object on this page, or open an object first and I will answer from its evidence.",
      proposal: null,
      partial: true,
    };
  }

  // -- Proposal intents -----------------------------------------------------
  const wantsUpdate = hasWord(q, "propose", "proposing", "update", "change", "edit", "fix", "correct");
  const wantsReplyDraft =
    hasWord(q, "draft", "write", "compose") && hasWord(q, "reply", "response", "comment");
  const field = detectProposableField(q);

  if (wantsReplyDraft && target && target.schema === "ping.social.post@1") {
    const text = extractProposedText(question);
    if (!ctx.viewer.id) {
      return {
        ...base,
        answer: [
          "I can draft that reply, but you need a signed-in identity first: replies are published as someone.",
          "Pick an identity, then ask me again.",
        ].join("\n\n"),
        proposal: null,
        partial: true,
      };
    }
    if (!text) {
      return {
        ...base,
        answer: [
          "Tell me what the reply should say, for example: Draft a reply to this post: Thanks for the update.",
          "I will draft it as a proposal and you approve the exact text before anything is published.",
        ].join("\n\n"),
        proposal: null,
        partial: true,
      };
    }
    const body: ProposalBody = {
      kind: "object_create",
      targetObjectId: null,
      schema: "ping.social.post@1",
      changes: { text, replyTo: target.id },
    };
    const proposal: AskProposal = {
      ...body,
      digest: proposalDigest(body),
      digestAlgorithm: "sha256-canonical-json-v1",
      note: `Approving publishes one post as ${ctx.viewer.displayName ?? "your identity"} replying to ${displayTarget(target, "this post")}. The gateway governs the write.`,
      // PROD-4 (repaired): the user-facing rendering of the reply target
      // goes through displayTarget. changes.replyTo keeps the raw id: it is
      // digest-bound and the governed write + reply-edge derivation consume
      // it as an id. This label is display-only, never digested or submitted.
      displayChangeLabels: { replyTo: displayTarget(target, "this post") },
    };
    return {
      ...base,
      answer: [
        cite(`I drafted a reply to the post ${displayTarget(target, "this post")}.`, [0]),
        "Review the exact text in the proposal below. Approving publishes it as you through the governed event path. I cannot publish it myself.",
      ].join("\n\n"),
      proposal,
      partial: false,
    };
  }

  if (wantsUpdate && target && field) {
    const text = extractProposedText(question);
    const isOwner = ctx.viewer.id !== null && ctx.viewer.id === target.controllerId;
    if (!isOwner) {
      return {
        ...base,
        answer: [
          cite(`Only the controlling identity of ${displayTarget(target, "this record")} can update it.`, [0]),
          "You are not signed in as that identity, so I did not draft a proposal.",
        ].join("\n\n"),
        proposal: null,
        partial: true,
      };
    }
    if (!text) {
      return {
        ...base,
        answer: [
          `Tell me the new ${field}, for example: Propose updating the ${field} to: We now open Sundays.`,
          "I will draft it as a proposal and you approve the exact digest before anything changes.",
        ].join("\n\n"),
        proposal: null,
        partial: true,
      };
    }
    const body: ProposalBody = {
      kind: "object_update",
      targetObjectId: target.id,
      schema: target.schema,
      changes: { [field]: text },
    };
    const proposal: AskProposal = {
      ...body,
      digest: proposalDigest(body),
      digestAlgorithm: "sha256-canonical-json-v1",
      note: `Approving applies this exact change to ${displayTarget(target, "this record")} as ${ctx.viewer.displayName ?? "your identity"}. The gateway governs the write.`,
    };
    return {
      ...base,
      answer: [
        cite(`I drafted an update to the ${field} of ${displayTarget(target, "this record")}.`, [0]),
        "Review the exact change in the proposal below. Approving applies it through the governed event path. I cannot apply it myself.",
      ].join("\n\n"),
      proposal,
      partial: false,
    };
  }

  // -- Factual intents about the target -------------------------------------
  if (target) {
    const sentences: Sentence[] = [];
    const claimClassifications: AskClaimClassification[] = [];
    // Topics the question named that no branch can answer stay UNKNOWN:
    // branches append here; the final assembly carries them on the answer.
    const branchUnknowns: string[] = [];
    const noteUnknown = (w: string): void => {
      if (!branchUnknowns.includes(w)) branchUnknowns.push(w);
    };
    // PROD-3+4-REPAIR-R2: the title feeds user-facing sentences AND
    // claim labels, so a missing title degrades to a neutral noun via
    // displayTarget, never to the raw object id ("website-business-<hex>
    // business profile" was leaking into claimClassifications[].claim).
    const title = displayTarget(target, "this record");
    const conflictedFields = opts.conflictedFields ?? [];
    const conflictIndicesFor = (objectId: string, fields: string[]): number[] => {
      const out: number[] = [];
      for (const c of conflictedFields) {
        if (c.objectId === objectId && fields.includes(c.field)) out.push(...c.evidenceIndices);
      }
      return out;
    };
    const isFieldConflicted = (objectId: string, field: string): boolean =>
      conflictedFields.some((c) => c.objectId === objectId && c.field === field);
    // FYD-Q1 locked public copy for a field with an unresolved conflict.
    // The field is described as unverified, never filled with a disputed
    // value, never reported as merely absent. Internal evidence mechanics
    // stay out of the copy.
    const pushConflictPendingClaim = (objectId: string, fields: string[], claimLabel: string): void => {
      pushClaim(
        "Contact information is being verified.",
        conflictIndicesFor(objectId, fields),
        claimLabel,
        target,
        fields[0] ?? "contact",
        "DERIVED_FACT",
      );
    };
    const desc = target.description || fieldOf(target, "bio", "summary");

    /**
     * Push a factual sentence and bind its evidence class in one step, so
     * every cited claim carries a real classification. Deterministic:
     * same inputs, same claims, same order. `classificationOverride` lets
     * a caller name the evidence class explicitly when the field-level
     * record carries it (owner corrections); otherwise the standard
     * field-class/provenance chain decides.
     */
    const pushClaim = (
      text: string,
      cites: number[],
      claim: string,
      obj: PingObject,
      field: string,
      classificationOverride?: string,
    ): void => {
      sentences.push({ text, cites });
      const refIds: string[] = [];
      for (const i of cites) {
        const id = ctx.evidenceRefs[i]?.id;
        if (id && !refIds.includes(id)) refIds.push(id);
      }
      claimClassifications.push({
        claim,
        classification:
          classificationOverride ?? claimClassification(ctx.fieldClasses, obj, field),
        evidenceRefIds: refIds,
      });
    };

    // Business-name words: defined before the people branch because the
    // people branch's grounded-topic guard excludes them (a business name
    // in the question is identity, never a people topic).
    const titleWords = title
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2);

    // PROD-3: out-of-scope questions ("Who will win the election?", "What
    // is the weather today?") are refused with the scope refusal, never
    // answered with a business blurb. partial: true with no citations
    // marks it a refusal downstream (answerClass UNSUPPORTED). The name in
    // the refusal is the business title, never an internal id.
    if (isOutOfScopeQuestion(q, titleWords)) {
      const scopeName = target.title.trim().length > 0 ? target.title.trim() : "this business";
      return {
        ...base,
        unknowns: [],
        answer: `I can only answer questions about ${scopeName}.`,
        proposal: null,
        partial: true,
      };
    }

    // People questions are answerable only from Person objects. A
    // description dump names nobody, so when the site data has no person
    // records the honest answer says so explicitly instead of guessing.
    // People and association questions are answered from person records
    // and from the active relationships incident to the target. A related
    // object's evidence informs the answer but is cited as THAT object's
    // evidence, never merged into the target's record.
    //
    // Association triggers ("associated", "linked", ...) keep the
    // incident-relationship listing. Pure people questions ("who works
    // here?", "who owns this?") do not dump unrelated associations, and
    // say explicitly when no person records exist instead of answering
    // around the question.
    const asksAssociation = hasWord(
      q,
      "associated",
      "associate",
      "associates",
      "association",
      "affiliated",
      "affiliate",
      "affiliation",
      "connected",
      "linked",
    );
    const asksPeople =
      hasWord(
        q,
        "person",
        "people",
        "owner",
        "owners",
        "owns",
        "owned",
        "founder",
        "founders",
        "staff",
        "team",
        "employee",
        "employees",
        "member",
        "members",
        "employs",
      ) ||
      (hasWord(q, "who") && hasWord(q, "works", "working", "runs", "manages"));
    const persons = [target, ...ctx.relatedObjects].filter((o) =>
      o.schema.toLowerCase().includes("person"),
    );
    // The person listing answers identity/association questions ("who works
    // here?", "what is the owner's name?"). When the question names a
    // SPECIFIC topic beyond the people triggers ("what is the owner's
    // favorite food?") that no person record grounds, the listing would cite
    // a person record for a question it does not answer, mislabeling the
    // whole answer "supported": the branch skips instead, the unmatched
    // topics join unknowns, and the question falls through to the honest
    // fallback. Mirrors the services branch grounded-topic guard. Identity
    // words (the business name) never count as a people topic.
    const peopleNameWords = new Set(titleWords);
    const peopleMatchable = topicWords(q).filter(
      (w) => !peopleNameWords.has(w) && !PEOPLE_TRIGGER_WORDS.has(w),
    );
    const peopleGrounded =
      peopleMatchable.length === 0 ||
      peopleMatchable.some((w) => peopleVocabulary(persons).has(w));
    // The unmatched topics join unknowns only for people-intent questions:
    // other branches own their own topics ("phone number" is the contact
    // branch's, never the people branch's unknown).
    if ((asksPeople || asksAssociation) && !peopleGrounded) {
      for (const w of peopleMatchable) noteUnknown(w);
    }
    if ((asksPeople || asksAssociation) && peopleGrounded) {
      const seenIds = new Set<string>();
      // Claim grouping for the 5-class contract: every person record and
      // every incident association is a distinct direct citation behind
      // the SAME claim (these are associated with the business), so the
      // reducer can honestly report SUPPORTED BY MULTIPLE EVIDENCE.
      // Per-entry classifications stay per-entry: each citation keeps its
      // own epistemic basis via first-match lookup in buildCitations.
      const associationsClaim = `${title} associations`;
      for (const p of persons) {
        seenIds.add(p.id);
        const i = ctx.evidenceRefs.findIndex((e) => e.id === p.id);
        pushClaim(
          `Person on record: ${p.title || p.id}.`,
          i >= 0 ? [i] : [],
          associationsClaim,
          p,
          "name",
        );
      }
      const incident = ctx.relationships
        .filter(
          (r) =>
            r.status === "active" &&
            (r.subject === target.id || r.object === target.id),
        )
        .map((r) => ({
          predicate: r.predicate,
          otherId: r.subject === target.id ? r.object : r.subject,
        }))
        .filter((x) => x.otherId !== target.id)
        .sort((a, b) =>
          a.predicate < b.predicate
            ? -1
            : a.predicate > b.predicate
              ? 1
              : a.otherId < b.otherId
                ? -1
                : 1,
        );
      let associations = 0;
      // The incident-relationship listing answers association questions;
      // for a pure people question it is unrelated noise, so it only
      // runs when the question asked about associations.
      const incidentToList = asksAssociation ? incident : [];
      for (const { predicate, otherId } of incidentToList) {
        if (seenIds.has(otherId)) continue;
        const other = ctx.relatedObjects.find((o) => o.id === otherId);
        if (!other) continue;
        const i = ctx.evidenceRefs.findIndex((e) => e.id === other.id);
        if (i < 0) continue; // every factual sentence stays cited
        seenIds.add(otherId);
        associations += 1;
        pushClaim(
          `Associated with ${title} (${predicate.replace(/_/g, " ")}): ${other.title || other.id}.`,
          [i],
          associationsClaim,
          other,
          "name",
          "relationship_fact",
        );
      }
      // A pure people question with no person records is an honest
      // unknown even when other associations exist: listing services or
      // locations does not answer "who works here?". Association
      // questions keep the listing behavior (associations are the answer).
      if (persons.length === 0 && (associations === 0 || !asksAssociation)) {
        return {
          ...base,
          unknowns: ["people associated with this business"],
          answer: [
            `The site data contains no person records for ${title}, so I cannot answer that: there is no owner or staff information on record.`,
            "I will not guess at names, roles, or personal details that are not on record.",
          ].join("\n\n"),
          proposal: null,
          partial: true,
        };
      }
    }

    // The profile branch answers "what is this business"-style questions
    // only. It must not fire on questions about a specific attribute the
    // context cannot ground ("what is the owner blood type?"): the
    // description does not answer those, and dumping it here is filler
    // that also suppresses the refusal signal downstream.
    const namesBusiness =
      hasWord(q, "business", "company", "shop", "store", "firm", "contractor") ||
      titleWords.some((w) => hasWord(q, w));
    // Note: hasWord is an OR over its words, so "what"+"is" needs an
    // Provenance questions ("how do you know?") are identified early:
    // the services branch below must not claim them via its broad "do"
    // trigger. A provenance question is never a services question; a
    // combined question ("what services ... and how do you know?") still
    // reaches the services branch through an explicit services word.
    const asksProvenance =
      hasWord(q, "source", "sources", "sourcing", "provenance") ||
      (hasWord(q, "how") && hasWord(q, "know")) ||
      (hasWord(q, "where") && hasWord(q, "come") && hasWord(q, "from"));
    // explicit AND here: either word alone ("what services...") is not a
    // profile question.
    const asksWhatIs = hasWord(q, "what") && hasWord(q, "is");
    // PROD-3: the single-word triggers ("who", "tell", "about", ...)
    // fired on questions with no bearing on the business ("Who will win
    // the election?" answered with a business blurb). A profile question
    // must be anchored to the business: name it, or address it directly
    // (this / it / they / you / your).
    // PROD-3+4-REPAIR-R2: structural "this" rule (replaces the
    // PROD-3+4-REPAIR enumerated time-noun list, which was whack-a-mole:
    // "this season", "this quarter", "this semester" evaded it). "this"
    // anchors to the business only when it determines a business noun
    // ("this business", "this shop", "this service", "this post") or
    // stands bare for the object on the page ("What is this?", "Can you
    // fix this?"). "this" + any other noun ("this fall", "this season",
    // "this quarter", "this morning") is a time expression or something
    // else entirely and never anchors. The business name itself is covered
    // by namesBusiness.
    const thisBusinessNoun =
      /\bthis\s+(business|businesses|company|companies|shop|shops|store|stores|service|services|firm|firms|contractor|contractors|place|post|posts|record|records|page|site|team|owner|owners|product|products|offer|offers|offering|offerings)\b/.test(
        q,
      );
    const thisBare = /\bthis\b[^a-z]*$/.test(q);
    const thisAnchors = thisBusinessNoun || thisBare;
    const anchoredToBusiness =
      (hasWord(q, "this") && thisAnchors) ||
      hasWord(q, "it", "they", "you", "your", "yours") ||
      namesBusiness;
    const profileIntent =
      (hasWord(q, "who", "describe", "tell", "about", "profile") && anchoredToBusiness) ||
      (asksWhatIs && anchoredToBusiness);

    if (profileIntent) {
      // PROD-3+4-REPAIR-R3: the profile branch is stricter than the general
      // scope check. The general check lets trades/service words defeat an
      // out-of-scope topic ("Who will win the election, fix this?" names
      // trades work via "fix"), but a business blurb is never the right
      // answer when the question's subject is an out-of-scope topic.
      // Refuse with the same scope refusal, never blurb.
      if (namesOutOfScopeTopic(q)) {
        const scopeName = title.trim().length > 0 ? title.trim() : "this business";
        return {
          ...base,
          unknowns: [],
          answer: `I can only answer questions about ${scopeName}.`,
          proposal: null,
          partial: true,
        };
      }
      if (desc)
        pushClaim(`${title}: ${desc}`, [0], `${title} business profile`, target, "description");
      else
        pushClaim(
          `${title} is a ${ctx.schemaLabel} with no description on record.`,
          [0],
          `${title} has no description on record`,
          target,
          "description",
        );
      const loc = fieldOf(target, "location");
      if (loc)
        pushClaim(`Location on record: ${loc}.`, [0], `${title} location`, target, "location");
      const cat = fieldOf(target, "category", "businessCategory");
      if (cat)
        pushClaim(`Category on record: ${cat}.`, [0], `${title} category`, target, "category");
    }

    // Coverage questions ("what don't you know?") get an evidence-bound
    // limitations answer, not a refusal: which facets the packet supports
    // and which are absent. Missing facets name categories the packet can
    // establish (services, phone, email, website, hours, location, people,
    // pricing, reviews, emergency) without guessing. Fields under an
    // unresolved conflict are described as being verified, never as merely
    // absent. Placed before the services branch: "what don't you know?"
    // names no service topic, so the services branch would otherwise claim
    // it with a general listing.
    const asksCoverage =
      (hasWord(q, "what", "which") &&
        /don't|dont|do not|cannot|can't|will not/.test(q) &&
        hasWord(q, "know", "answer", "tell", "say")) ||
      (hasWord(q, "what", "which", "list") &&
        hasWord(q, "missing", "unknown", "unknowns", "coverage", "limitations", "lacking", "gaps"));
    if (asksCoverage) {
      const serviceObjs = ctx.relatedObjects.filter((o) =>
        ["ping.social.service@1", "ping.social.product@1"].includes(o.schema),
      );
      const located = ctx.relationships.some(
        (r) =>
          r.status === "active" &&
          r.predicate === "located_at" &&
          (r.subject === target.id || r.object === target.id),
      );
      const conflictFacets = new Set<string>();
      for (const c of conflictedFields) {
        if (c.objectId !== target.id) continue;
        if (c.field === "phone" || c.field === "email" || c.field === "website")
          conflictFacets.add(c.field);
        else if (isAddressFamilyField(c.field)) conflictFacets.add("address");
        else conflictFacets.add(c.field);
      }
      const covered: string[] = [];
      const missing: string[] = [];
      const facet = (label: string, present: boolean, conflictKey?: string): void => {
        if (conflictKey && conflictFacets.has(conflictKey)) return;
        (present ? covered : missing).push(label);
      };
      facet("services", serviceObjs.length > 0 || !!fieldOf(target, "services"));
      facet("phone", !!fieldOf(target, "phone"), "phone");
      facet("email", !!fieldOf(target, "email"), "email");
      facet("website", !!fieldOf(target, "website", "url", "domain"), "website");
      facet("hours", !!fieldOf(target, "hours", "businessHours", "openingHours"));
      facet("location", located || !!fieldOf(target, "location", "address", "city", "locality"), "address");
      facet(
        "people",
        [target, ...ctx.relatedObjects].some((o) => o.schema.toLowerCase().includes("person")),
      );
      facet("pricing", !!fieldOf(target, "price", "pricing", "cost", "rates", "rate", "estimate", "quote"));
      facet("reviews", !!fieldOf(target, "review", "reviews", "rating", "testimonial"));
      const emBlob = [
        target.title,
        target.description ?? "",
        ...serviceObjs.map((o) => `${o.title} ${o.description ?? ""}`),
      ].join(" ");
      facet("emergency service", /emergency/i.test(emBlob));
      pushClaim(
        `Here is what I can and cannot answer about ${title}, based only on the site record.`,
        [0],
        `${title} coverage summary`,
        target,
        "coverage",
      );
      if (covered.length > 0)
        pushClaim(`On record: ${covered.join("; ")}.`, [0], `${title} covered facets`, target, "coverage");
      if (missing.length > 0) {
        for (const m of missing) noteUnknown(m);
        pushClaim(
          `Not on record: ${missing.join("; ")}. I will not guess at these.`,
          [],
          `${title} missing facets`,
          target,
          "coverage",
          "INFERENCE",
        );
      }
      if (conflictFacets.size > 0) {
        pushConflictPendingClaim(
          target.id,
          conflictedFields.filter((c) => c.objectId === target.id).map((c) => c.field),
          `${title} coverage conflict pending`,
        );
      }
      // The coverage answer is complete: no other branch may append.
      return {
        ...base,
        answer: sentences.map((s) => cite(s.text, s.cites)).join("\n\n"),
        claimClassifications,
        unknowns: [...branchUnknowns],
        proposal: null,
        partial: false,
      };
    }

    // A profile question about a service object ("tell me about this
    // service") is answered from the service's own record by the profile
    // branch above, not from a service listing.
    const targetIsService = target.schema.toLowerCase().includes("service");
    const asksServices =
      hasWord(q, "service", "services", "offer", "offers", "provide") ||
      (hasWord(q, "do") && !asksProvenance);
    // Services-intent ownership: when the services branch sees a genuine
    // services-intent question (strong triggers, not the loose "do"
    // fallback) whose topics match nothing on record, it skips; the flag
    // stops the contact branch below from re-consuming those same words
    // ("website") as contact triggers.
    let servicesIntentUngrounded = false;
    if (asksServices && !(targetIsService && profileIntent)) {
      const services = fieldOf(target, "services");
      const relatedServices = ctx.relatedObjects.filter((o) =>
        ["ping.social.service@1", "ping.social.product@1", "ping.social.offer@1"].includes(o.schema),
      );
      // The branch fires only with grounded content answering the
      // question: a general services question, or a named offering that
      // matches something on record. A specific topic with no match
      // ("financing") skips the branch, so the question falls through to
      // the honest fallback instead of dumping unrelated offerings.
      const topics = topicWords(q);
      // Identity words (the business name) never count as a service topic:
      // "What services does Coppersmith offer?" is a general services
      // question, not a claim about a "coppersmith" service.
      const nameWords = new Set(titleWords);
      const matchable = topics.filter((w) => !nameWords.has(w));
      const vocab = serviceVocabulary(target, relatedServices);
      const grounded = matchable.length === 0 || matchable.some((w) => vocab.has(w));
      if (grounded) {
        if (services)
          pushClaim(
            `Services on record: ${services}.`,
            [0],
            `${title} services field`,
            target,
            "services",
          );
        // Offers are evidence-chain nodes, not services: the answer names
        // only service/product objects. Each offering carries its own
        // evidence marker in listing order, so every named offering binds
        // to its own service record.
        const named = relatedServices.filter(
          (o) => o.schema !== "ping.social.offer@1",
        );
        if (named.length > 0) {
          // Every named offering binds to its own service record: the
          // context caps related-object refs, so register any missing
          // service ref here (same shape as buildAskContext) rather than
          // leaving an offering uncited.
          const cites = named.map((s) => {
            let idx = ctx.evidenceRefs.findIndex((e) => e.id === s.id);
            if (idx < 0) {
              idx = ctx.evidenceRefs.length;
              ctx.evidenceRefs.push({
                kind: "object",
                id: s.id,
                label: `${schemaLabel(s.schema)}: ${s.title || s.id}`,
              });
            }
            return idx;
          });
          // No sentence-level classification here: each marker must
          // resolve to its own per-service classification below, so a
          // demo-synthetic service keeps its demo basis instead of
          // inheriting the target's website-statement basis.
          sentences.push({
            text: `Related offerings: ${named.map((o) => o.title).join("; ")}.`,
            cites,
          });
          // Claim grouping for the 5-class contract: every named service
          // is a distinct direct citation behind the SAME claim (the
          // business offers these services), so the reducer can honestly
          // report SUPPORTED BY MULTIPLE EVIDENCE. Per-service
          // classifications stay per-entry: each citation keeps its own
          // epistemic basis (a demo-synthetic service keeps its demo
          // basis) via first-match lookup in buildCitations.
          const servicesClaim = `${title} offers these services`;
          for (const s of named) {
            const refId = ctx.evidenceRefs.find((e) => e.id === s.id)?.id;
            claimClassifications.push({
              claim: servicesClaim,
              classification: claimClassification(ctx.fieldClasses, s, "name"),
              evidenceRefIds: refId ? [refId] : [],
            });
          }
        }
        // Topics the question named that no branch can address stay
        // UNKNOWN: they join unknowns, and the answer says so plainly.
        // Hours words are excluded here: the hours branch owns them.
        const unmatched = matchable.filter((w) => !vocab.has(w) && !HOURS_WORDS.has(w));
        for (const w of unmatched) noteUnknown(w);
        if (unmatched.length > 0) {
          pushClaim(
            `The site data has no record addressing ${unmatched.map((w) => `'${w}'`).join(", ")} specifically.`,
            [],
            `${title} unmatched service topics`,
            target,
            "services",
            "INFERENCE",
          );
        }
        if (!services && named.length === 0) {
          return noEvidenceAnswer(ctx, question, ["services offered by this business"]);
        }
      } else if (hasWord(q, "service", "services", "offer", "offers", "provide")) {
        // Genuine services intent (strong triggers, not the loose "do"
        // fallback) with nothing on record ("Does PING offer website
        // design?"): the named topics stay UNKNOWN with the same filter
        // the grounded path uses (hours words belong to the hours
        // branch), and the contact branch below must not re-consume them
        // as contact triggers. A loose-"do" question ("Do you have a
        // website?") is contact intent: it keeps its old routing and its
        // unknowns stay empty.
        for (const w of matchable.filter((w) => !vocab.has(w) && !HOURS_WORDS.has(w))) noteUnknown(w);
        servicesIntentUngrounded = true;
      }
    }

    // Negative guard: a genuine services-intent question whose topics the
    // services branch could not ground must not be re-consumed here as a
    // contact question ("Does PING offer website design?" is not a request
    // for the business website). The loose "do" fallback ("Do you have a
    // website?") still routes here: it is not services intent.
    if (hasWord(q, "website", "contact", "email", "phone", "call", "site") && !servicesIntentUngrounded) {
      const site = fieldOf(target, "website", "url", "domain");
      const email = fieldOf(target, "email");
      const phone = fieldOf(target, "phone");
      // Owner-corrected contact fields keep the SOURCE SAYS X / OWNER SAYS
      // Y distinction in the answer itself: the value stated is the
      // owner's (effective), the site's value is named, and the claim is
      // classified as an owner override. The sentence cites a dedicated
      // FIELD-level evidence ref (the correction), not the business object:
      // citing the object would let the Why-this view mislabel the number
      // as a website statement.
      const pushContactClaim = (
        label: string,
        field: "phone" | "email" | "website",
        value: string,
      ): void => {
        const correction = ownerCorrectionForObject(target, field);
        if (!correction) {
          pushClaim(`${label} on record: ${value}.`, [0], `${title} ${field}`, target, field);
          return;
        }
        const refIdx = ctx.evidenceRefs.length;
        ctx.evidenceRefs.push({
          kind: "field",
          id: `${target.id}#${field}`,
          label: `${label}: owner correction (recorded ${correction.correctedAt.slice(0, 10)})`,
          detail:
            `Owner correction by ${correction.actorLabel}: the owner says ` +
            `${correction.ownerValue}; the site lists ${correction.sourceValue ?? "nothing"}.`,
        });
        pushClaim(
          `${label} on record: ${value}. The owner corrected this ${field === "phone" ? "number" : field}; the site lists ${correction.sourceValue ?? "no " + field}.`,
          [refIdx],
          `${title} ${field}`,
          target,
          field,
          "owner_override",
        );
      };
      // FYD-Q1: a contact field with an unresolved conflict is suppressed
      // in the projection, so site/email/phone read null here. The field
      // is described as being verified: never filled with a disputed value
      // and never reported as merely absent.
      const conflictedContact = (["website", "email", "phone"] as const).filter((f) =>
        isFieldConflicted(target.id, f),
      );
      if (site) pushContactClaim("Website", "website", site);
      if (email) pushContactClaim("Email", "email", email);
      if (phone) pushContactClaim("Phone", "phone", phone);
      if (conflictedContact.length > 0) {
        pushConflictPendingClaim(target.id, [...conflictedContact], `${title} contact conflict pending`);
      } else if (!site && !email && !phone) {
        pushClaim(
          `${title} lists no public contact details in the current context.`,
          [0],
          `${title} has no public contact details on record`,
          target,
          "contact",
        );
      }
    }

    // Hours and availability: schedule words, weekend words, and the
    // emergency qualifier are owned here. Hours on record are stated with
    // their evidence; emergency service with no record is an explicit
    // UNKNOWN, never inferred from a general plumbing offering.
    const asksCloseTime =
      hasWord(q, "close", "closing") &&
      hasWord(q, "what", "when", "time", "hour", "hours", "open", "do", "does");
    if (
      hasWord(
        q,
        "hour", "hours", "emergency", "weekend", "weekends",
        "saturday", "sunday", "open", "schedule",
      ) ||
      asksCloseTime
    ) {
      const hours = fieldOf(target, "hours", "businessHours", "openingHours");
      if (hours)
        pushClaim(`Hours on record: ${hours}.`, [0], `${title} hours`, target, "hours");
      else
        pushClaim(
          `No hours are on record for ${title}.`,
          [0],
          `${title} has no hours on record`,
          target,
          "hours",
        );
      const blob = [
        target.title,
        target.description ?? "",
        ...ctx.relatedObjects.map((o) => `${o.title} ${o.description ?? ""}`),
      ].join(" ");
      if (/emergency/i.test(blob)) {
        const emIdx = ctx.relatedObjects.findIndex((o) =>
          /emergency/i.test(`${o.title} ${o.description ?? ""}`),
        );
        const emRefIdx =
          emIdx >= 0 ? ctx.evidenceRefs.findIndex((e) => e.id === ctx.relatedObjects[emIdx].id) : -1;
        pushClaim(
          `Emergency service is mentioned in the site data.`,
          emRefIdx >= 0 ? [emRefIdx] : [0],
          `${title} emergency service mentioned`,
          target,
          "services",
        );
      } else {
        noteUnknown("emergency");
        pushClaim(
          `${title} does not offer emergency service: nothing in the site record mentions it.`,
          [0],
          `${title} does not offer emergency service`,
          target,
          "services",
          "INFERENCE",
        );
      }
    }

    if (hasWord(q, "where", "location", "address", "based")) {
      // FYD-Q1: an unresolved address conflict suppresses the value in the
      // projection. Describe it as being verified; never select a side.
      const addressConflictFields = conflictedFields
        .filter((c) => c.objectId === target.id && isAddressFamilyField(c.field))
        .map((c) => c.field);
      if (addressConflictFields.length > 0) {
        pushConflictPendingClaim(target.id, addressConflictFields, `${title} address conflict pending`);
      } else {
      // located_at direction: the subject is the located thing, the object
      // is the location. From the target's perspective the location object
      // is either a related object (target is the subject) or the target
      // itself (target is the object). The claim cites the location
      // object's own evidence, never the target's.
      let locationObj: PingObject | null = null;
      let locationName: string | null = null;
      let locationSelf = false;
      for (const r of ctx.relationships) {
        if (r.status !== "active" || r.predicate !== "located_at") continue;
        if (r.subject === target.id && r.object !== target.id) {
          const o = ctx.relatedObjects.find((x) => x.id === r.object);
          if (o) {
            locationObj = o;
            locationName = coarsenLocationTitle(o.title) || fieldOf(o, "locality");
            break;
          }
        } else if (r.object === target.id && r.subject !== target.id) {
          locationObj = target;
          locationName = coarsenLocationTitle(target.title) || fieldOf(target, "locality");
          locationSelf = true;
          break;
        }
      }
      const locationRefIdx = locationObj
        ? ctx.evidenceRefs.findIndex((e) => e.id === locationObj!.id)
        : -1;
      if (locationObj && locationName && locationRefIdx >= 0) {
        if (locationSelf)
          pushClaim(
            `${title} is the location on record.`,
            [locationRefIdx],
            `${title} is a recorded location`,
            locationObj,
            "location",
            "relationship_fact",
          );
        else
          pushClaim(
            `${title} is listed at: ${locationName}.`,
            [locationRefIdx],
            `${title} location`,
            locationObj,
            "location",
            "relationship_fact",
          );
      } else {
        const loc = fieldOf(target, "location", "address", "city", "locality");
        if (loc)
          pushClaim(
            `${title} is listed at: ${loc}.`,
            [0],
            `${title} location`,
            target,
            "location",
          );
        else
          pushClaim(
            `No public location is on record for ${title}.`,
            [0],
            `${title} has no public location on record`,
            target,
            "location",
          );
      }
      }
    }

    if (hasWord(q, "review", "rating", "trust", "proof", "evidence", "verif")) {
      const verified = fieldOf(target, "verified");
      pushClaim(
        verified
          ? `${title} carries an explicit verified mark.`
          : `${title} carries no verified mark in the current context.`,
        [0],
        `${title} verification status`,
        target,
        "verified",
      );
      const followers = fieldOf(target, "followerCount", "followers");
      if (followers)
        pushClaim(
          `Follower count on record: ${followers}.`,
          [0],
          `${title} follower count`,
          target,
          "followerCount",
        );
    }

    if (hasWord(q, "follow", "following")) {
      const followAction = base.suggestedActions.find((a) => a.kind === "follow" || a.kind === "unfollow");
      if (followAction) {
        sentences.push({
          text: `You can ${followAction.kind} ${title} with the ${followAction.label} button. It records a follows relationship event.`,
          cites: [],
        });
      } else {
        sentences.push({ text: "Following is not available for this object.", cites: [] });
      }
    }

    // Provenance questions ("how do you know?") are answered from the
    // target's own record: identity, stated source, derived date, and
    // epistemic basis. Every sentence cites the target's evidence. Placed
    // after the attribute branches: a question that names an attribute
    // ("what services ... and how do you know?") is governed by that
    // attribute's evidence rules first.
    if (asksProvenance) {
      const prov = target.provenance;
      const url = ctx.sourceUrls[0] ?? null;
      const when = (prov.derivedAt || target.updatedAt || "").slice(0, 10);
      pushClaim(
        `I answer from the site record for ${title} (${ctx.schemaLabel}).`,
        [0],
        `${title} record identity`,
        target,
        "provenance",
      );
      if (url)
        pushClaim(
          `The record's stated source is ${url}.`,
          [0],
          `${title} record source`,
          target,
          "provenance",
        );
      if (when)
        pushClaim(
          `The record was derived on ${when}.`,
          [0],
          `${title} record date`,
          target,
          "provenance",
        );
      pushClaim(
        `Basis: ${provenanceBasisLabel(prov.kind)}.`,
        [0],
        `${title} record basis`,
        target,
        "provenance",
      );
    }

    if (sentences.length > 0) {
      return {
        ...base,
        answer: sentences.map((s) => cite(s.text, s.cites)).join("\n\n"),
        claimClassifications,
        unknowns: [...branchUnknowns],
        proposal: null,
        partial: false,
      };
    }

    // Fallback: no branch had grounded content answering the question.
    // Say so explicitly with no citations, so the visitor layer surfaces
    // a refusal. The description is deliberately not dumped here: citing
    // it would look like an answer while answering nothing. Topics a branch
    // named but could not ground ride along as unknowns (honest scoping).
    return noEvidenceAnswer(ctx, question, [...branchUnknowns]);
  }

  // -- No target -------------------------------------------------------------
  if (hasWord(q, "what", "can", "you", "do", "help", "how")) {
    return {
      ...base,
      answer: [
        "I answer questions from PING evidence: objects, relationships, and provenance the BFF hands me.",
        "Open an object and I will summarize it, list its services and contact details, or draft a reply or an update as a proposal you approve.",
        "Every factual sentence I write cites its evidence. When I have none, I say so.",
      ].join("\n\n"),
      proposal: null,
      partial: false,
    };
  }
  return noEvidenceAnswer(ctx, question);
}
