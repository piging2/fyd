/**
 * Owner intent interpreter: deterministic plain language -> typed
 * OwnerCommand. No AI, no network. Only the documented shapes act; anything
 * else returns null so the surface can answer it as evidence Q&A.
 */

import { createHash } from "node:crypto";
import { knownServices } from "./view";
import type { OwnerCommand } from "./types";

function findServiceId(needle: string, known: Map<string, string>): string | null {
  const n = needle.trim().toLowerCase();
  for (const [id, name] of known) {
    const ln = name.toLowerCase();
    if (ln === n || ln.startsWith(n) || n.startsWith(ln)) return id;
  }
  return null;
}

export interface TextProposal {
  command: OwnerCommand;
  summary: string;
}

/**
 * Interprets one line of owner intent. Returns a typed proposal or null
 * when the text is not an understood command. Never mutates anything.
 */
export function interpretTextCommand(text: string, objectId: string): TextProposal | null {
  const { names } = knownServices(objectId);
  const lower = text.trim().toLowerCase();
  let m: RegExpMatchArray | null;

  if ((m = lower.match(/^put\s+(.+?)\s+first$/))) {
    const id = findServiceId(m[1], names);
    if (!id) return null;
    return {
      command: { type: "move-service", id, to: "first" },
      summary: `Move ${names.get(id)} to the top of the services list.`,
    };
  }
  if ((m = lower.match(/^put\s+(.+?)\s+last$/))) {
    const id = findServiceId(m[1], names);
    if (!id) return null;
    return {
      command: { type: "move-service", id, to: "last" },
      summary: `Move ${names.get(id)} to the end of the services list.`,
    };
  }
  if ((m = lower.match(/^move\s+(.+?)\s+(up|down)$/))) {
    const id = findServiceId(m[1], names);
    if (!id) return null;
    const dir = m[2] as "up" | "down";
    return {
      command: { type: "move-service", id, to: dir },
      summary: `Move ${names.get(id)} one step ${dir} in the services list.`,
    };
  }
  // Address presentation decision (SHOW/HIDE/DEFAULT): placed BEFORE
  // the service hide/show so "hide the address" is not consumed as an
  // unknown service name. The pipeline never owns it; the owner asserts it
  // persistently. MEDIUM consequence: it always goes through propose and
  // digest-bound approval (no automatic undo); an explicit DEFAULT
  // unwinds an explicit SHOW/HIDE through another confirmed command.
  if (
    lower.match(
      /^(?:hide|remove)\s+(?:the\s+)?(?:business\s+)?address$|^make\s+(?:the\s+)?(?:business\s+)?address\s+private$|^make\s+private\s+(?:the\s+)?(?:business\s+)?address$/,
    )
  ) {
    return {
      command: { type: "set-address-visibility", visibility: "hide" },
      summary:
        "Hide the business address from the public page. The address itself is unchanged.",
    };
  }
  if (
    lower.match(
      /^(?:show|display|publish)\s+(?:the\s+)?(?:business\s+)?address$|^make\s+(?:the\s+)?(?:business\s+)?address\s+public$|^make\s+public\s+(?:the\s+)?(?:business\s+)?address$/,
    )
  ) {
    return {
      command: { type: "set-address-visibility", visibility: "show" },
      summary:
        "Show the business address on the public page. The address itself is unchanged.",
    };
  }
  // DEFAULT: the owner withdraws the explicit preference (append-only; the
  // hide/show history stays in the log) and the conservative default
  // applies again.
  if (
    lower.match(
      /^(?:reset|default)\s+(?:the\s+)?(?:business\s+)?address(?:\s+visibility)?$|^use\s+(?:the\s+)?default\s+(?:for\s+)?(?:the\s+)?(?:business\s+)?address$/,
    )
  ) {
    return {
      command: { type: "set-address-visibility", visibility: "default" },
      summary:
        "Return the address to the default presentation (conservative default). The address itself is unchanged.",
    };
  }
  if ((m = lower.match(/^(hide|show)\s+(.+)$/))) {
    const id = findServiceId(m[2], names);
    if (!id) return null;
    const visible = m[1] === "show";
    return {
      command: { type: "set-service-visibility", id, visible },
      summary: visible
        ? `Show ${names.get(id)} on the public page.`
        : `Hide ${names.get(id)} from the public page.`,
    };
  }
  if ((m = lower.match(/^add\s+(.+)$/))) {
    const name = m[1].trim();
    if (!name) return null;
    const pretty = name.charAt(0).toUpperCase() + name.slice(1);
    return {
      command: { type: "add-service", name: pretty },
      summary: `Add "${pretty}" to the services list.`,
    };
  }
  // CONFIRM verb: the owner asserts the current effective value of a contact
  // field is correct. Records an owner assertion (actor + timestamp) without
  // changing any value. Bare phrasings with no field ("that's right", "correct")
  // are ambiguous and return null so the surface can answer them as Q&A.
  // Placed BEFORE the correction patterns so "my phone is correct" is not
  // misread as a correction to the value "correct".
  if ((m = lower.match(/^(?:confirm|verify)\s+(?:(?:the|our|my)\s+)?(phone|email|website)$/))) {
    const field = m[1] as "phone" | "email" | "website";
    return {
      command: { type: "confirm-contact-field", field },
      summary:
        "Record an owner confirmation that the current " +
        field +
        " is correct, with actor and timestamp. The source record is unchanged.",
    };
  }
  if ((m = lower.match(/^(?:(?:our|my|the)\s+)?(phone|email|website)\s+is\s+(?:correct|right|accurate)$/))) {
    const field = m[1] as "phone" | "email" | "website";
    return {
      command: { type: "confirm-contact-field", field },
      summary:
        "Record an owner confirmation that the current " +
        field +
        " is correct, with actor and timestamp. The source record is unchanged.",
    };
  }
  if (
    (m = lower.match(
      /^(?:that's right|yes,?\s+that's (?:right|correct|accurate)),?\s+(?:my|our|the)\s+(phone|email|website)$/,
    ))
  ) {
    const field = m[1] as "phone" | "email" | "website";
    return {
      command: { type: "confirm-contact-field", field },
      summary:
        "Record an owner confirmation that the current " +
        field +
        " is correct, with actor and timestamp. The source record is unchanged.",
    };
  }
  if (
    (m = lower.match(/^(?:correct|right|accurate),?\s+(?:my|our|the)\s+(phone|email|website)$/))
  ) {
    const field = m[1] as "phone" | "email" | "website";
    return {
      command: { type: "confirm-contact-field", field },
      summary:
        "Record an owner confirmation that the current " +
        field +
        " is correct, with actor and timestamp. The source record is unchanged.",
    };
  }
  // Owner contact corrections. The summary names what the owner asserts;
  // the approval path records the source's current value alongside it, so
  // the correction is always SOURCE SAYS X / OWNER SAYS Y, never a silent
  // overwrite.
  if ((m = lower.match(/^(?:correct|change|update|set)\s+(phone|email|website)\s+to\s+(.+)$/))) {
    const field = m[1] as "phone" | "email" | "website";
    const value = m[2].trim();
    if (!value) return null;
    return {
      command: { type: "set-contact-field", field, value },
      summary: `Record an owner correction for ${field}: "${value}". The site's current ${field} stays recorded as what the source says.`,
    };
  }
  if ((m = lower.match(/^(?:our|my|the)\s+(phone|email|website)\s+is\s+(.+)$/))) {
    const field = m[1] as "phone" | "email" | "website";
    const value = m[2].trim();
    if (!value) return null;
    return {
      command: { type: "set-contact-field", field, value },
      summary: `Record an owner correction for ${field}: "${value}". The site's current ${field} stays recorded as what the source says.`,
    };
  }
  if ((m = lower.match(/^(?:revert|undo|remove)\s+(?:the\s+)?(phone|email|website)\s+correction$/))) {
    const field = m[1] as "phone" | "email" | "website";
    return {
      command: { type: "revert-contact-field", field },
      summary: `Revert the owner correction for ${field}; the site's ${field} is shown again.`,
    };
  }
  // Owner service-description corrections. Same SOURCE SAYS X / OWNER SAYS Y
  // contract as contact corrections: the approve stage records the
  // service's current description alongside the owner's value, so the
  // correction is never a silent overwrite of the source record.
  if ((m = lower.match(/^(?:correct|change|update|set)\s+(?:the\s+)?description\s+(?:of|for)\s+(.+?)\s+to\s+(.+)$/))) {
    const id = findServiceId(m[1], names);
    if (!id) return null;
    const value = m[2].trim();
    if (!value) return null;
    return {
      command: { type: "set-service-description", serviceId: id, value },
      summary: `Record an owner correction for the description of ${names.get(id)}: "${value}". The current description stays recorded as what the source says.`,
    };
  }
  if ((m = lower.match(/^(?:revert|undo|remove)\s+(?:the\s+)?description\s+(?:of|for)\s+(.+?)(?:\s+correction)?$/))) {
    const id = findServiceId(m[1], names);
    if (!id) return null;
    return {
      command: { type: "revert-service-description", serviceId: id },
      summary: `Revert the owner description correction for ${names.get(id)}; the service's own description is shown again.`,
    };
  }
  return null;
}

/**
 * Consequence tier of an owner command (locked product law, Nolan's 155
 * grill answers, realigned 2026-09-25 per the FYD product authority
 * directive): FOUR tiers, not three.
 *
 * - "LOW": reversible presentation change (service reorder, non-factual
 *   layout). Applied reversibly with undo: the approve response carries a
 *   ready-to-approve `undo` for one-step reversal. No public fact is
 *   altered. Owner-facing language: "Change the website" (presentation
 *   intent, affects the projection only).
 * - "MEDIUM": factual correction and service visibility (contact
 *   correction/confirm/revert, add service, service visibility, ADDRESS
 *   VISIBILITY hide/show/default). Address visibility moved LOW -> MEDIUM
 *   (2026-09-25): hiding or showing the address alters public factual
 *   presentation, so it demands explicit confirmation and gets no
 *   automatic LOW undo. Proposal + simple confirmation: the full propose
 *   -> digest-bound approve loop,
 *   and the approval records an owner assertion (actor + timestamp). The
 *   source record is never rewritten. Owner-facing language: "Update the
 *   business" (knowledge transition: the site, Ask, search, and all
 *   projections follow).
 * - "HIGH": pricing, credentials, ownership, employee identity, external
 *   publication, messages, booking, provider mutation, financial/legal
 *   claims. Explicit authorization required. No command type exists in
 *   this lane for these: free text matching these categories is refused
 *   at propose with the category named and the authorization requirement
 *   stated. Never silently approved, never silently downgraded.
 * - "CRITICAL": the irreversible subset of HIGH (credentials, ownership
 *   transfer, financial moves, legal commitments). Strong authority +
 *   explicit confirmation + receipt. Refused at propose in any context
 *   that cannot satisfy strong authority; every CRITICAL decision,
 *   allowed or refused, produces a receipt through the external-effects
 *   resolution chain.
 *
 * The switch is exhaustive over the OwnerCommand union on purpose: adding
 * a command type forces its tier to be classified here. A command type
 * that writes to an external provider, moves money, sends a message, or
 * is otherwise irreversible does NOT belong in LOW or MEDIUM: it needs
 * HIGH or CRITICAL, which this tier function must refuse to grant
 * silently.
 */
export type CommandConsequenceTier = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

/**
 * Product-directive view (Nolan 2026-09-25): the four-tier scale maps onto
 * three product tiers. HIGH and CRITICAL both fold into HIGH (explicit
 * capability plus approval); see foldLegacyTier in ./consequence-tiers.
 */

export function commandConsequenceTier(cmd: OwnerCommand): CommandConsequenceTier {
  switch (cmd.type) {
    case "move-service":
      return "LOW";
    // Address visibility is MEDIUM, not LOW (FYD product authority
    // directive, Nolan 2026-09-25): hide/show/default alters public factual
    // presentation, so it needs explicit confirmation and no automatic
    // LOW undo. The approve stage keys the ready `undo` off this tier.
    case "set-address-visibility":
    case "set-service-visibility":
    case "set-contact-field":
    case "revert-contact-field":
    case "confirm-contact-field":
    case "set-service-description":
    case "revert-service-description":
    case "add-service":
      return "MEDIUM";
  }
}

/**
 * Owner-facing change kind (language law, locked): "update-business" is a
 * KNOWLEDGE transition ("Update the business", e.g. "we no longer offer
 * drain cleaning": affects the site, Ask, search, and all projections);
 * "change-website" is PRESENTATION intent ("Change the website", e.g.
 * "make drain cleaning less prominent": affects the projection only).
 * Never blurred: LOW is always change-website, MEDIUM is always
 * update-business.
 */
export type OwnerChangeKind = "update-business" | "change-website";

export function changeKindForTier(tier: CommandConsequenceTier): OwnerChangeKind {
  // Only LOW is presentation intent; every consequential tier is a
  // knowledge/external effect, never "change the website".
  return tier === "LOW" ? "change-website" : "update-business";
}

/**
 * The human consequence note for a propose response, in the owner-facing
 * language. LOW speaks as "Change the website"; MEDIUM speaks as "Update
 * the business". (HIGH/CRITICAL never reach propose: they are refused
 * with their own reason and receipt.)
 */
export function consequenceNoteFor(tier: CommandConsequenceTier): string {
  return tier === "LOW"
    ? "Change the website: this only affects how the site presents it. " +
      "Reversible, with one-step undo. No public fact is altered."
    : "Update the business: this changes what FYD knows, so the site, " +
      "Ask, search, and all projections follow. Shown clearly before " +
      "anything is written; approving records an owner assertion with " +
      "actor and timestamp. The source record is never rewritten.";
}

/**
 * The exact inverse of a LOW-tier command, for fast undo. The route's
 * approve response carries the inverse pre-bound to post-apply digests,
 * so the owner can reverse a website change in one approve call. Returns
 * null for commands with no exact single-command inverse (all
 * MEDIUM-tier commands): factual assertions are superseded by newer
 * assertions, not inverted; service visibility changes re-propose; and
 * address visibility (MEDIUM since 2026-09-25) unwinds through an
 * explicit DEFAULT in the propose/approve loop, not an automatic undo.
 */
export function invertOwnerCommand(cmd: OwnerCommand): OwnerCommand | null {
  switch (cmd.type) {
    case "move-service": {
      const to =
        cmd.to === "first" ? "last" : cmd.to === "last" ? "first" : cmd.to === "up" ? "down" : "up";
      return { type: "move-service", id: cmd.id, to };
    }
    case "set-address-visibility":
      // MEDIUM since 2026-09-25: no automatic undo. An explicit preference
      // unwinds through an explicit DEFAULT command in the propose/approve
      // loop, never through the LOW fast-undo path.
      return null;
    default:
      return null;
  }
}

/**
 * One-line human summary of a command, for undo affordances. `serviceNames`
 * maps service id -> display name (unknown ids fall back to the id).
 * Undo targets a transition (locked R2-33): "Undo this website change" for
 * LOW reversals, never an ambiguous rewind-everything.
 */
export function describeCommand(
  cmd: OwnerCommand,
  serviceNames: Map<string, string>,
): string {
  const name = (id: string): string => serviceNames.get(id) ?? id;
  switch (cmd.type) {
    case "move-service": {
      const where =
        cmd.to === "first"
          ? "back to the top"
          : cmd.to === "last"
            ? "back to the bottom"
            : cmd.to === "up"
              ? "one step up"
              : "one step down";
      return "Undo this website change: move " + name(cmd.id) + " " + where + ".";
    }
    case "set-service-visibility":
      return cmd.visible
        ? "Show " + name(cmd.id) + " on the public page."
        : "Hide " + name(cmd.id) + " from the public page.";
    case "set-address-visibility":
      return cmd.visibility === "hide"
        ? "Undo this website change: hide the business address again."
        : cmd.visibility === "show"
          ? "Undo this website change: show the business address again."
          : "Undo this website change: return the address visibility to default.";
    case "set-contact-field":
      return "Update the business: record an owner correction for " + cmd.field + ".";
    case "revert-contact-field":
      return "Update the business: revert the owner correction for " + cmd.field + ".";
    case "confirm-contact-field":
      return "Update the business: confirm the " + cmd.field + " is correct.";
    case "set-service-description":
      return (
        "Update the business: record an owner correction for the description of " +
        name(cmd.serviceId) +
        "."
      );
    case "revert-service-description":
      return (
        "Update the business: revert the owner description correction for " +
        name(cmd.serviceId) +
        "."
      );
    case "add-service":
      return "Update the business: add service " + cmd.name + ".";
  }
}

// ---------------------------------------------------------------------------
// HIGH / CRITICAL consequence detection for free text the interpreter does
// not understand as a typed command. Locked tiers (Nolan's 155 grill
// answers):
//   HIGH: pricing, credentials, ownership, employee identity, external
//     publication, messages, booking, provider mutation, financial/legal
//     claims -> explicit authorization required.
//   CRITICAL: the irreversible subset (credentials, ownership transfer,
//     financial moves, legal commitments) -> strong authority + explicit
//     confirmation + receipt.
// Runs AFTER interpretTextCommand: understood commands (contact
// corrections, service visibility, reorder) are LOW/MEDIUM and never reach
// this detector. Questions (ending in "?", or starting with an
// interrogative) are evidence Q&A, not action requests, and return null:
// the detector only fires on imperative action requests.
//
// No provider-specific action authorities: categories are action classes
// (pricing, messages, ...), never provider names. No global AUTONOMOUS
// flag: autonomy is per action class + scope + constraints, and these
// classes grant none in this lane.
// ---------------------------------------------------------------------------

/** Action classes that make a free-text request HIGH or CRITICAL. */
export type HighConsequenceCategory =
  | "pricing"
  | "credentials"
  | "ownership"
  | "employee-identity"
  | "external-publication"
  | "messages"
  | "booking"
  | "provider-mutation"
  | "financial-legal";

export interface HighConsequenceRequest {
  tier: "HIGH" | "CRITICAL";
  category: HighConsequenceCategory;
  /** Owner-facing reason: what was detected and what it requires. */
  reason: string;
}

/** Interrogative openers: evidence Q&A, never an action request. */
const QUESTION_OPENER =
  /^(what|when|where|who|why|how|which|is|are|do|does|did|can|could|would|should|tell me|show me|list)\b/;

/** [tier, category, pattern, owner-facing reason] */
const HIGH_CONSEQUENCE_PATTERNS: ReadonlyArray<
  readonly ["HIGH" | "CRITICAL", HighConsequenceCategory, RegExp, string]
> = [
  // CRITICAL: irreversible identity / security / money / legal.
  [
    "CRITICAL",
    "credentials",
    /\b(password|api key|secret|credential|access token|2fa|two-factor)\b.*\b(change|reset|rotate|update|reveal|share|give|send)\b|\b(change|reset|rotate|update|reveal|share|give|send)\b.*\b(password|api key|secret|credential|access token|2fa|two-factor)\b/,
    "Credentials are identity and security material. Changing them needs strong authority, explicit confirmation, and a receipt; this lane cannot provide that.",
  ],
  [
    "CRITICAL",
    "ownership",
    /\b(transfer|change|sell|give away)\b.*\b(owner|ownership)\b|\bnew owner\b|\bchange (the )?owner\b|\btransfer ownership\b/,
    "Ownership transfer changes who controls the business record. It needs strong authority, explicit confirmation, and a receipt; this lane cannot provide that.",
  ],
  [
    "CRITICAL",
    "financial-legal",
    /\b(issue|send|make|process|authorize)\b.*\b(refund|charge|payment|invoice|payout)\b|\b(bank account|payment method|routing number)\b/,
    "Moving money or touching payment instruments needs strong authority, explicit confirmation, and a receipt; this lane cannot provide that.",
  ],
  [
    "CRITICAL",
    "financial-legal",
    /\b(sign|draft|file|send)\b.*\b(contract|lawsuit|legal|attorney)\b|\b(sue|legal claim|terms of service|settlement)\b/,
    "Legal commitments need strong authority, explicit confirmation, and a receipt; this lane cannot provide that.",
  ],
  // HIGH: consequential, needs explicit authorization.
  [
    "HIGH",
    "pricing",
    /\b(change|update|set|raise|lower|edit|modify|discount)\b.*\b(price|pricing|cost|rate|fee|quote)\b|\b(price|pricing|cost|rate|fee)\b.*\b(change|update|set|raise|lower)\b/,
    "Pricing changes affect what customers are promised. They need explicit authorization; this lane cannot approve them.",
  ],
  [
    "HIGH",
    "employee-identity",
    /\b(hire|fire|add|remove)\b.*\b(employee|staff member|team member|technician)\b/,
    "Employee identity changes need explicit authorization; this lane cannot approve them.",
  ],
  [
    "HIGH",
    "external-publication",
    /\b(publish|post|share|announce)\b.*\b(on|to)\b.*\b(facebook|instagram|tiktok|twitter|\bx\b|linkedin|google|youtube|social)\b|\b(publish|go live|launch)\b.*\b(the )?(site|website|page)\b/,
    "Publishing outside FYD is an external effect. It needs explicit authorization; this lane cannot approve it.",
  ],
  [
    "HIGH",
    "messages",
    /\b(send|blast)\b.*\b(message|email|text|sms|newsletter|campaign)\b.*\b(all|customer|client|list|subscriber|everyone)\b|\b(newsletter|campaign|broadcast)\b/,
    "Messaging customers as the business is an external effect. It needs explicit authorization; this lane cannot approve it.",
  ],
  [
    "HIGH",
    "booking",
    /\b(book|schedule|cancel|reschedule)\b.*\b(appointment|booking|job|visit|service call)\b/,
    "Booking actions commit the business to a customer. They need explicit authorization; this lane cannot approve them.",
  ],
  [
    "HIGH",
    "provider-mutation",
    /\b(connect|sync|integrate|link)\b.*\b(calendar|email|google business|stripe|crm|quickbooks|provider|integration|account)\b/,
    "Changing provider connections mutates external systems. It needs explicit authorization; this lane cannot approve it.",
  ],
  [
    "CRITICAL",
    "provider-mutation",
    /\b(disconnect|unlink|remove)\b.*\b(calendar|email|google business|stripe|crm|quickbooks|provider|integration|account)\b/,
    "Disconnecting a provider severs an external integration. It needs strong authority and explicit confirmation, always with a receipt; this lane cannot approve it.",
  ],
];

/**
 * Detect a HIGH/CRITICAL-consequence request in free text. Returns null
 * for questions (evidence Q&A), for text with no action verb on a
 * consequential category, and for everything the interpreter already
 * understood. Never throws; a null means "not a high-consequence action".
 */
export function detectHighConsequenceRequest(
  text: string,
): HighConsequenceRequest | null {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  if (!lower) return null;
  // Questions are evidence Q&A, not action requests.
  if (trimmed.endsWith("?") || QUESTION_OPENER.test(lower)) return null;
  for (const [tier, category, pattern, reason] of HIGH_CONSEQUENCE_PATTERNS) {
    if (pattern.test(lower)) return { tier, category, reason };
  }
  return null;
}

// ---------------------------------------------------------------------------
// External-effects resolution (locked law): every HIGH/CRITICAL decision
// resolves through ACTOR / INTENT / TARGET / CAPABILITY / POLICY /
// AUTHORITY / EXECUTION / RECEIPT / OUTCOME. The receipt is the returned
// record of the decision (it is returned in the refusal response, not
// persisted to the event log); CRITICAL always produces one. Autonomy is per action class + scope + constraints (named
// below); there is no global AUTONOMOUS flag and no provider-specific
// action authority anywhere in this module.
// ---------------------------------------------------------------------------

export interface EffectResolutionInput {
  actor: { id: string; label: string; demo: boolean };
  intentText: string;
  category: HighConsequenceCategory;
  tier: "HIGH" | "CRITICAL";
  target: { tenantId: string; objectId: string };
  capability: { name: string; allowed: boolean; reason: string };
  /** The tier policy that decided the outcome, in plain language. */
  policy: string;
  /** What authority the decision rested on (demo scaffolding or verified). */
  authorityNote: string;
}

/**
 * The decision receipt for a HIGH/CRITICAL request: the nine-element
 * resolution chain as returned data. receiptId is deterministic over the
 * request (tenant + object + intent text + tier + category); decidedAt is
 * the wall-clock decision time. The receipt is returned in the refusal
 * response; it is not persisted. In this lane HIGH/CRITICAL requests are
 * always refused at propose, so execution is "not-executed" and the
 * outcome is "refused": the receipt records the refusal, never an action.
 */
export interface EffectReceipt {
  receiptId: string;
  tier: "HIGH" | "CRITICAL";
  actor: { id: string; label: string; demo: boolean };
  intent: { text: string; category: HighConsequenceCategory };
  target: { tenantId: string; objectId: string };
  capability: { name: string; allowed: boolean; reason: string };
  policy: string;
  authority: string;
  execution: "not-executed";
  receipt: true;
  outcome: "refused";
  reason: string;
  decidedAt: string;
}

export function buildEffectReceipt(input: EffectResolutionInput): EffectReceipt {
  const receiptId =
    "rcpt-" +
    createHash("sha256")
      .update(
        JSON.stringify({
          tenantId: input.target.tenantId,
          objectId: input.target.objectId,
          intentText: input.intentText,
          tier: input.tier,
          category: input.category,
        }),
      )
      .digest("hex")
      .slice(0, 16);
  const requirement =
    input.tier === "CRITICAL"
      ? "strong authority, explicit confirmation, and a receipt"
      : "explicit authorization";
  return {
    receiptId,
    tier: input.tier,
    actor: input.actor,
    intent: { text: input.intentText, category: input.category },
    target: input.target,
    capability: input.capability,
    policy: input.policy,
    authority: input.authorityNote,
    execution: "not-executed",
    receipt: true,
    outcome: "refused",
    reason:
      "Refused: a " +
      input.category +
      " request (" +
      input.tier +
      ") needs " +
      requirement +
      ", which this lane cannot satisfy. Nothing was executed. " +
      "Autonomy for this action class: none granted (per action class + " +
      "scope + constraints; no global autonomous flag exists).",
    decidedAt: new Date().toISOString(),
  };
}
