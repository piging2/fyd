/**
 * Authority-UX consequence classification (FYD 24h sprint, authority-UX
 * lane): Nolan's law, "FINE-GRAINED INTERNAL AUTHORITY must compile to
 * HUMAN-UNDERSTANDABLE CONSEQUENCE."
 *
 * This is a PURE FUNCTION over the existing action/operation types. It
 * creates no authority, store, runtime, or capability. Tier decisions
 * already owned elsewhere are DELEGATED, never re-decided:
 *
 * - OwnerCommand tiers are Track B's locked law: commandConsequenceTier
 *   in ./commands (Nolan 2026-09-25). This module adds the owner-facing
 *   consequence sentence and the friction descriptor around it; it never
 *   changes the tier.
 * - HIGH/CRITICAL free-text detection is Track B's detectHighConsequenceRequest
 *   in ./commands. A detected request keeps its detected tier: the
 *   classifier can never downgrade it.
 * - The three-tier product fold (HIGH+CRITICAL -> HIGH) is foldLegacyTier
 *   in ./consequence-tiers.
 *
 * What this module owns:
 * - classifyOwnerAction: every owner-facing action (typed OwnerCommand,
 *   SitePatchOperation, FydGrant, detected HIGH/CRITICAL request) maps to
 *   exactly one of LOW / MEDIUM / HIGH / CRITICAL.
 * - frictionForTier: the UX friction each tier demands, in plain owner
 *   language. LOW -> inline preview + undo offered. MEDIUM -> explicit
 *   confirmation naming the consequence. HIGH -> explicit authorization
 *   (typed confirmation, consequence spelled out). CRITICAL -> typed
 *   authorization + cool-down + audit record (receipt).
 * - approvalTierForActions: approving a proposal classifies at the MAXIMUM
 *   tier of its constituent actions. An approval can never classify below
 *   anything it approves.
 * - The dangerous-misclassification guards: an action that publishes a
 *   private field or spends money can NEVER classify below HIGH; a pure
 *   layout reorder can never classify above LOW.
 *
 * Owner-facing strings are plain language, never capability jargon, and
 * never contain em dashes.
 */

import {
  changeKindForTier,
  commandConsequenceTier,
  type CommandConsequenceTier,
  type HighConsequenceRequest,
  type OwnerChangeKind,
} from "./commands";
import { foldLegacyTier, type ProductConsequenceTier } from "./consequence-tiers";
import type { OwnerCommand } from "./types";
import type { FydGrant, SitePatchOperation } from "../../lib/ping/types";

/** The four-tier authority-UX consequence scale. One type, one owner. */
export type ConsequenceTier = CommandConsequenceTier;

/** The UX friction a tier demands in the owner flow. */
export type FrictionMode =
  | "preview-undo"
  | "confirm"
  | "authorize-typed"
  | "authorize-typed-cooldown";

export interface FrictionDescriptor {
  tier: ConsequenceTier;
  mode: FrictionMode;
  /** Plain-language instruction shown to the owner at the friction step. */
  ownerInstruction: string;
  /** HIGH/CRITICAL: the owner must type the confirmation, not just click. */
  requiresTypedConfirmation: boolean;
  /** LOW: the approve response carries a one-step undo. */
  offersUndo: boolean;
  /**
   * Mandatory wait, in seconds, between completed authorization and
   * execution. 0 for LOW/MEDIUM/HIGH. CRITICAL uses
   * CRITICAL_COOLDOWN_SECONDS: the owner may cancel during the window,
   * and the decision is receipted either way.
   */
  cooldownSeconds: number;
  /** Every classified action is recorded on the decision record. */
  auditRecord: boolean;
}

/**
 * Cool-down between completed CRITICAL authorization and execution
 * (seconds). Standing default; changeable without touching the
 * classifier. The owner may cancel inside the window; execution-side
 * enforcement lives at the external-effect seams, not here.
 */
export const CRITICAL_COOLDOWN_SECONDS = 300;

const TIER_ORDER: Record<ConsequenceTier, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  CRITICAL: 3,
};

/** Maximum tier of a set: an approval can never classify below its worst action. */
export function maxTier(tiers: ReadonlyArray<ConsequenceTier>): ConsequenceTier {
  let best: ConsequenceTier = "LOW";
  for (const t of tiers) {
    if (TIER_ORDER[t] > TIER_ORDER[best]) best = t;
  }
  return best;
}

export function frictionForTier(tier: ConsequenceTier): FrictionDescriptor {
  switch (tier) {
    case "LOW":
      return {
        tier,
        mode: "preview-undo",
        ownerInstruction:
          "Review the Before and After preview. Approving applies the change " +
          "and offers one-step undo.",
        requiresTypedConfirmation: false,
        offersUndo: true,
        cooldownSeconds: 0,
        auditRecord: true,
      };
    case "MEDIUM":
      return {
        tier,
        mode: "confirm",
        ownerInstruction:
          "This changes what FYD knows about your business. Read the consequence " +
          "below, then confirm explicitly. There is no automatic undo.",
        requiresTypedConfirmation: false,
        offersUndo: false,
        cooldownSeconds: 0,
        auditRecord: true,
      };
    case "HIGH":
      return {
        tier,
        mode: "authorize-typed",
        ownerInstruction:
          "This action has outside effects. To authorize it, type your confirmation " +
          "exactly as shown after reading the consequence below.",
        requiresTypedConfirmation: true,
        offersUndo: false,
        cooldownSeconds: 0,
        auditRecord: true,
      };
    case "CRITICAL":
      return {
        tier,
        mode: "authorize-typed-cooldown",
        ownerInstruction:
          "This action is irreversible or moves money or control. Type your " +
          "confirmation exactly as shown, then a five minute cool-down runs " +
          "before anything executes, during which you may cancel. Every " +
          "decision here produces a receipt.",
        requiresTypedConfirmation: true,
        offersUndo: false,
        cooldownSeconds: CRITICAL_COOLDOWN_SECONDS,
        auditRecord: true,
      };
  }
}

/** The classified input shapes this lane covers. Exhaustive by construction. */
export type OwnerActionInput =
  | { kind: "owner-command"; command: OwnerCommand }
  | { kind: "site-patch-operation"; operation: SitePatchOperation }
  | { kind: "grant"; grant: FydGrant }
  | { kind: "detected-request"; request: HighConsequenceRequest };

/**
 * The consequence classification that travels with a proposal or decision
 * record, so WHY THIS and audit can show it. The renderer never invents
 * this: it reads it off the record.
 */
export interface ActionConsequence {
  tier: ConsequenceTier;
  /** The four-tier scale folded onto Nolan's three product tiers. */
  productTier: ProductConsequenceTier;
  /** What this means for the owner's business, in plain owner language. */
  ownerConsequence: string;
  /** The real effect the tier was derived from (what becomes public, what
   * is irreversible, what touches money/credentials/external systems). */
  rationale: string;
  friction: FrictionDescriptor;
  changeKind: OwnerChangeKind;
}

function assertNever(x: never, what: string): Error {
  return new Error("consequence-classification: unclassified " + what + ": " + JSON.stringify(x));
}

// ---------------------------------------------------------------------------
// OwnerCommand: delegate the tier to Track B's locked law, add the owner
// sentence and friction around it. NEVER re-decide the tier here.
// ---------------------------------------------------------------------------

function ownerConsequenceForCommand(cmd: OwnerCommand): string {
  switch (cmd.type) {
    case "move-service":
      return (
        "This changes the order of your services on the website. " +
        "Your business facts stay exactly the same, and you can undo it in one step."
      );
    case "set-service-visibility":
      return cmd.visible
        ? "This puts this service on your public website, where anyone on the internet can see it."
        : "This takes this service off your public website. The service still exists in your business record.";
    case "add-service":
      return (
        "This adds a new service to what FYD knows about your business, " +
        "so it appears on the site, in Ask, and in search."
      );
    case "set-address-visibility":
      if (cmd.visibility === "show")
        return "This will make your street address visible to everyone on the internet.";
      if (cmd.visibility === "hide")
        return "This will hide your street address from your public website. The address itself stays in your records.";
      return "This returns your address to the default presentation. Your current hide or show preference is withdrawn.";
    case "set-contact-field":
      return (
        "This records your correction for your " + cmd.field +
        ": what you say replaces what the site currently says everywhere it is shown. " +
        "The original value stays recorded as what the source said."
      );
    case "revert-contact-field":
      return (
        "This withdraws your correction. The site's original " + cmd.field + " shows again."
      );
    case "confirm-contact-field":
      return (
        "This records that you confirmed your " + cmd.field +
        " is correct, with your name and the time. Nothing about the value changes."
      );
    case "set-service-description":
      return (
        "This records your correction for this service's description" +
        ": what you say replaces what the site currently says everywhere it is shown. " +
        "The original description stays recorded as what the source said."
      );
    case "revert-service-description":
      return (
        "This withdraws your description correction. The service's original description shows again."
      );
  }
}

function rationaleForCommandTier(cmd: OwnerCommand, tier: ConsequenceTier): string {
  switch (tier) {
    case "LOW":
      return (
        "Reversible presentation change (command " + cmd.type + "): no public " +
        "fact is altered, so preview plus one-step undo is enough friction."
      );
    case "MEDIUM":
      return (
        "Public factual presentation change (command " + cmd.type + "): it " +
        "alters what the public sees about the business, so it needs explicit " +
        "confirmation with an owner assertion recorded."
      );
    case "HIGH":
      return (
        "External or otherwise consequential effect (command " + cmd.type + "): " +
        "explicit authorization required."
      );
    case "CRITICAL":
      return (
        "Irreversible effect (command " + cmd.type + "): strong authority plus " +
        "explicit confirmation plus receipt."
      );
  }
}

/** Classify a typed OwnerCommand. The tier is Track B's locked law. */
export function classifyOwnerCommandAction(command: OwnerCommand): ActionConsequence {
  const tier = commandConsequenceTier(command);
  return {
    tier,
    productTier: foldLegacyTier(tier),
    ownerConsequence: ownerConsequenceForCommand(command),
    rationale: rationaleForCommandTier(command, tier),
    friction: frictionForTier(tier),
    changeKind: changeKindForTier(tier),
  };
}

// ---------------------------------------------------------------------------
// SitePatchOperation (Arrow 6's proposal mechanics, read-only here).
// reorder_section_objects is a pure layout reorder: LOW, never above LOW.
// set_presentation is presentation: LOW, UNLESS it publishes a private
// field, which can NEVER classify below HIGH.
// ---------------------------------------------------------------------------

/** Field names that name private information in a presentation op. */
const PRIVATE_FIELD_PATTERN =
  /\b(address|street|phone|tel|mobile|email|mail|private|internal|home|ssn|social|dob|birth)\b/i;

/**
 * Split a field name into matchable tokens: camelCase, snake_case, and
 * kebab-case all break into words, so "contactEmail" and "showAddress"
 * match like "contact email" and "show address" do. A plain substring
 * regex would false-positive ("tel" inside "hotel"); tokenizing keeps the
 * match precise while failing closed on realistic field names.
 */
function fieldTokens(field: string): string {
  return field.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ");
}

function hiddenValue(v: unknown): boolean {
  return (
    v === null ||
    v === undefined ||
    v === false ||
    v === "" ||
    v === "hidden" ||
    v === "private" ||
    (Array.isArray(v) && v.length === 0)
  );
}

function shownValue(v: unknown): boolean {
  return (
    v === true ||
    v === "public" ||
    v === "visible" ||
    v === "show" ||
    (typeof v === "string" && v.length > 0) ||
    (Array.isArray(v) && v.length > 0)
  );
}

/**
 * True when a set_presentation op moves a private field from hidden to
 * shown. Conservative: a false negative falls back to LOW presentation
 * plus human review of the Before/After card, never to silent publish.
 */
export function publishesPrivateField(op: Extract<SitePatchOperation, { op: "set_presentation" }>): boolean {
  return (
    PRIVATE_FIELD_PATTERN.test(fieldTokens(op.field)) &&
    hiddenValue(op.before) &&
    shownValue(op.after)
  );
}

function humanFieldLabel(field: string): string {
  const f = field.toLowerCase();
  if (/\baddress\b/.test(f) || /\bstreet\b/.test(f)) return "street address";
  if (/\bphone\b|\btel\b|\bmobile\b/.test(f)) return "phone number";
  if (/\bemail\b|\bmail\b/.test(f)) return "email address";
  return field;
}

/** Classify one SiteSpec transition. */
export function classifySitePatchOperation(operation: SitePatchOperation): ActionConsequence {
  switch (operation.op) {
    case "reorder_section_objects": {
      const tier: ConsequenceTier = "LOW";
      return {
        tier,
        productTier: foldLegacyTier(tier),
        ownerConsequence:
          "This changes the order of items on your website. Your business facts " +
          "stay the same, and you can undo it in one step.",
        rationale:
          "Pure layout reorder: no fact is created, removed, or made public, " +
          "so it can never classify above LOW.",
        friction: frictionForTier(tier),
        changeKind: changeKindForTier(tier),
      };
    }
    case "set_presentation": {
      if (publishesPrivateField(operation)) {
        const tier: ConsequenceTier = "HIGH";
        return {
          tier,
          productTier: foldLegacyTier(tier),
          ownerConsequence:
            "This will make your private " + humanFieldLabel(operation.field) +
            " visible to everyone on the internet. Publishing private information " +
            "needs your explicit authorization.",
          rationale:
            "The presentation change publishes a private field (field " +
            operation.field + " moves from hidden to shown). Publishing private " +
            "information can never classify below HIGH.",
          friction: frictionForTier(tier),
          changeKind: changeKindForTier(tier),
        };
      }
      const tier: ConsequenceTier = "LOW";
      return {
        tier,
        productTier: foldLegacyTier(tier),
        ownerConsequence:
          "This changes how your website presents " + operation.field +
          ". Your business facts stay the same, and you can undo it in one step.",
        rationale:
          "Presentation-only change: the underlying business facts are untouched, " +
          "so preview plus one-step undo is enough friction.",
        friction: frictionForTier(tier),
        changeKind: changeKindForTier(tier),
      };
    }
    default:
      throw assertNever(operation, "site-patch operation");
  }
}

/** Approval of a site_patch: the max tier of its operations. Never below any op. */
export function approvalTierForSitePatchOperations(
  operations: ReadonlyArray<SitePatchOperation>,
): ConsequenceTier {
  return maxTier(operations.map((op) => classifySitePatchOperation(op).tier));
}

// ---------------------------------------------------------------------------
// FydGrant: the publish/action grants behind Ask FYD. Classified by real
// effect: what becomes public, what touches an external system, what
// spends money.
// ---------------------------------------------------------------------------

/**
 * Classify a grant. Exhaustive over FydGrant: adding a grant forces its
 * classification here, so no grant reaches an owner-facing surface
 * unclassified.
 */
export function classifyFydGrant(grant: FydGrant): ActionConsequence {
  const build = (tier: ConsequenceTier, ownerConsequence: string, rationale: string): ActionConsequence => ({
    tier,
    productTier: foldLegacyTier(tier),
    ownerConsequence,
    rationale,
    friction: frictionForTier(tier),
    changeKind: changeKindForTier(tier),
  });
  switch (grant) {
    case "site.read":
      return build(
        "LOW",
        "This only reads your site. Nothing changes.",
        "Read-only: no effect exists to be consequential.",
      );
    case "site.propose":
      return build(
        "LOW",
        "This drafts a proposal for your review. Nothing changes until you approve the exact proposal.",
        "Drafting is not an effect: no fact is published and nothing is written.",
      );
    case "object.reference":
      return build(
        "LOW",
        "This links another object for reference. The link is presentation and can be removed.",
        "A reference link alters no fact and touches no external system.",
      );
    case "business.mutate":
      return build(
        "MEDIUM",
        "This changes what FYD knows about your business, so the site, Ask, and search follow. " +
          "It stays inside FYD and touches no outside system.",
        "Knowledge transition inside FYD: public factual presentation may change, " +
          "but nothing external is touched and no money moves.",
      );
    case "site.publish":
      return build(
        "HIGH",
        "This publishes your site to the public internet. Once live, anyone can see it.",
        "External publication: content leaves FYD for the public internet.",
      );
    case "message.send":
      return build(
        "HIGH",
        "This sends a message as your business to people outside FYD.",
        "External communication: a message leaves as the business.",
      );
    case "provider.call":
      return build(
        "HIGH",
        "This acts on an outside system, like your calendar, email, or CRM, on your behalf.",
        "External system effect: state outside FYD changes.",
      );
    case "ad.buy":
      return build(
        "CRITICAL",
        "This spends your money on advertising. Ad spend cannot be taken back once the platform runs it.",
        "Money moves to an external platform and is not recoverable: the irreversible subset of HIGH.",
      );
    case "purchase.make":
      return build(
        "CRITICAL",
        "This spends your money on a purchase. Money moves are irreversible.",
        "Money moves: the irreversible subset of HIGH.",
      );
    default:
      throw assertNever(grant, "FYD grant");
  }
}

// ---------------------------------------------------------------------------
// Detected HIGH/CRITICAL requests: the tier comes from Track B's detector.
// The classifier preserves it; it can never be downgraded here.
// ---------------------------------------------------------------------------

/** Classify a detected HIGH/CRITICAL request. The detected tier is preserved. */
export function classifyDetectedRequest(request: HighConsequenceRequest): ActionConsequence {
  const tier: ConsequenceTier = request.tier;
  return {
    tier,
    productTier: foldLegacyTier(tier),
    ownerConsequence: request.reason,
    rationale:
      "Free-text request detected as " + request.category + " (" + request.tier +
      ") by the consequence detector. Detected tiers are preserved, never downgraded.",
    friction: frictionForTier(tier),
    changeKind: changeKindForTier(tier),
  };
}

// ---------------------------------------------------------------------------
// The unified classification function: every owner-facing action maps to
// exactly one tier.
// ---------------------------------------------------------------------------

/**
 * Classify any owner-facing action to exactly one consequence tier, with
 * the plain-language consequence and the friction the tier demands. Pure:
 * no authority consulted, nothing written.
 */
export function classifyOwnerAction(input: OwnerActionInput): ActionConsequence {
  switch (input.kind) {
    case "owner-command":
      return classifyOwnerCommandAction(input.command);
    case "site-patch-operation":
      return classifySitePatchOperation(input.operation);
    case "grant":
      return classifyFydGrant(input.grant);
    case "detected-request":
      return classifyDetectedRequest(input.request);
    default:
      throw assertNever(input, "owner action");
  }
}

/**
 * Approval of a proposal classifies at the MAXIMUM tier of its constituent
 * actions. An approval can never classify below anything it approves: a
 * proposal containing a HIGH action is HIGH even if every other action is
 * LOW.
 */
export function approvalTierForActions(inputs: ReadonlyArray<OwnerActionInput>): ConsequenceTier {
  return maxTier(inputs.map((i) => classifyOwnerAction(i).tier));
}

// ---------------------------------------------------------------------------
// Enumeration helpers for the exhaustiveness tests: every typed operation
// must have a classification, or it cannot reach the owner.
// ---------------------------------------------------------------------------

/** One sample of every OwnerCommand variant. */
export function sampleOwnerCommands(): OwnerCommand[] {
  return [
    { type: "move-service", id: "svc-a", to: "first" },
    { type: "set-service-visibility", id: "svc-a", visible: false },
    { type: "set-service-visibility", id: "svc-a", visible: true },
    { type: "add-service", name: "Drain cleaning" },
    { type: "set-address-visibility", visibility: "hide" },
    { type: "set-address-visibility", visibility: "show" },
    { type: "set-address-visibility", visibility: "default" },
    { type: "set-contact-field", field: "phone", value: "+1 555 123 4567" },
    { type: "revert-contact-field", field: "phone" },
    { type: "confirm-contact-field", field: "phone" },
  ];
}

/** One sample of every SitePatchOperation variant (presentation-only). */
export function sampleSitePatchOperations(): SitePatchOperation[] {
  return [
    { op: "reorder_section_objects", pageSlug: "home", sectionId: "s1", before: ["a", "b"], after: ["b", "a"] },
    { op: "set_presentation", pageSlug: "home", sectionId: "s1", field: "tone", before: "casual", after: "professional" },
    { op: "set_presentation", pageSlug: "home", sectionId: "s1", field: "featuredIds", before: [], after: ["o1"] },
  ];
}

/** Every FydGrant. */
export function allFydGrants(): FydGrant[] {
  return [
    "site.read",
    "site.propose",
    "site.publish",
    "message.send",
    "ad.buy",
    "purchase.make",
    "provider.call",
    "business.mutate",
    "object.reference",
  ];
}
