/**
 * Authority-UX lane: consequence classification unit tests.
 *
 * Covers:
 * - Every typed operation has a classification (no unclassified action
 *   reaches the owner): all OwnerCommand variants, all SitePatchOperation
 *   variants, all FydGrant values, every HighConsequenceCategory detection.
 * - Dangerous-misclassification guards (fail closed):
 *   * publishing a private field can NEVER classify below HIGH;
 *   * spending money can NEVER classify below HIGH;
 *   * a pure layout reorder can never classify above LOW;
 *   * a detected HIGH/CRITICAL request is never downgraded;
 *   * an approval never classifies below any action it approves.
 * - Friction wiring per tier (LOW/MEDIUM/HIGH/CRITICAL).
 * - Delegation consistency: OwnerCommand tiers match Track B's locked law
 *   (commandConsequenceTier), never re-decided here.
 * - Owner-facing language: no em dashes, no capability jargon.
 * - Determinism.
 */

import {
  approvalTierForActions,
  approvalTierForSitePatchOperations,
  classifyDetectedRequest,
  classifyFydGrant,
  classifyOwnerAction,
  classifyOwnerCommandAction,
  classifySitePatchOperation,
  CRITICAL_COOLDOWN_SECONDS,
  frictionForTier,
  maxTier,
  publishesPrivateField,
  sampleOwnerCommands,
  sampleSitePatchOperations,
  allFydGrants,
  type ConsequenceTier,
  type OwnerActionInput,
} from "../consequence-classification";
import {
  commandConsequenceTier,
  detectHighConsequenceRequest,
} from "../commands";
import { foldLegacyTier } from "../consequence-tiers";
import type { OwnerCommand } from "../types";
import type { FydGrant, SitePatchOperation } from "../../../lib/ping/types";

const TIERS: ConsequenceTier[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

const tierRank = (t: ConsequenceTier): number => TIERS.indexOf(t);

describe("every typed operation has a classification", () => {
  test("all OwnerCommand variants classify to exactly one tier", () => {
    const cmds = sampleOwnerCommands();
    // All 7 command types must be represented.
    const types = new Set(cmds.map((c) => c.type));
    expect(types).toEqual(
      new Set([
        "move-service",
        "set-service-visibility",
        "add-service",
        "set-address-visibility",
        "set-contact-field",
        "revert-contact-field",
        "confirm-contact-field",
      ]),
    );
    for (const cmd of cmds) {
      const c = classifyOwnerAction({ kind: "owner-command", command: cmd });
      expect(TIERS).toContain(c.tier);
      expect(c.productTier).toBe(foldLegacyTier(c.tier));
      expect(c.friction.tier).toBe(c.tier);
      expect(typeof c.ownerConsequence).toBe("string");
      expect(c.ownerConsequence.length).toBeGreaterThan(0);
      expect(typeof c.rationale).toBe("string");
      expect(c.rationale.length).toBeGreaterThan(0);
    }
  });

  test("all SitePatchOperation variants classify to exactly one tier", () => {
    const ops = sampleSitePatchOperations();
    const opNames = new Set(ops.map((o) => o.op));
    expect(opNames).toEqual(new Set(["reorder_section_objects", "set_presentation"]));
    for (const op of ops) {
      const c = classifyOwnerAction({ kind: "site-patch-operation", operation: op });
      expect(TIERS).toContain(c.tier);
      expect(c.friction.tier).toBe(c.tier);
    }
  });

  test("all FydGrant values classify to exactly one tier", () => {
    const grants = allFydGrants();
    expect(grants).toHaveLength(9);
    expect(new Set(grants)).toEqual(
      new Set([
        "site.read",
        "site.propose",
        "site.publish",
        "message.send",
        "ad.buy",
        "purchase.make",
        "provider.call",
        "business.mutate",
        "object.reference",
      ]),
    );
    for (const grant of grants) {
      const c = classifyOwnerAction({ kind: "grant", grant });
      expect(TIERS).toContain(c.tier);
      expect(c.friction.tier).toBe(c.tier);
    }
  });

  test("every HighConsequenceCategory detection keeps a HIGH/CRITICAL classification", () => {
    // One imperative action request per Track B category; questions and
    // understood commands must not reach the detector at all.
    const requests: Array<[string, "HIGH" | "CRITICAL"]> = [
      ["raise the price of drain cleaning", "HIGH"],
      ["change the account password", "CRITICAL"],
      ["transfer ownership to my son", "CRITICAL"],
      ["hire a new technician", "HIGH"],
      ["publish the new site", "HIGH"],
      ["send a newsletter to all customers", "HIGH"],
      ["book an appointment for Tuesday", "HIGH"],
      ["connect our calendar", "HIGH"],
      ["disconnect our Stripe account", "CRITICAL"],
      ["issue a refund for the last job", "CRITICAL"],
      ["sign the service contract", "CRITICAL"],
    ];
    for (const [text, expectedTier] of requests) {
      const detected = detectHighConsequenceRequest(text);
      expect(detected).not.toBeNull();
      const c = classifyOwnerAction({ kind: "detected-request", request: detected! });
      expect(c.tier).toBe(expectedTier);
      expect(c.friction.tier).toBe(expectedTier);
    }
  });

  test("classifyOwnerAction covers every input kind", () => {
    const inputs: OwnerActionInput[] = [
      { kind: "owner-command", command: { type: "move-service", id: "a", to: "first" } },
      {
        kind: "site-patch-operation",
        operation: { op: "reorder_section_objects", pageSlug: "h", sectionId: "s", before: ["a"], after: ["a"] },
      },
      { kind: "grant", grant: "site.read" },
      {
        kind: "detected-request",
        request: { tier: "HIGH", category: "pricing", reason: "r" },
      },
    ];
    for (const input of inputs) {
      expect(TIERS).toContain(classifyOwnerAction(input).tier);
    }
  });
});

describe("dangerous misclassification guards", () => {
  test("publishing a private field can NEVER classify below HIGH", () => {
    const publishingOps: SitePatchOperation[] = [
      { op: "set_presentation", pageSlug: "h", sectionId: "s", field: "address", before: "hidden", after: "123 Main St" },
      { op: "set_presentation", pageSlug: "h", sectionId: "s", field: "phone", before: false, after: true },
      { op: "set_presentation", pageSlug: "h", sectionId: "s", field: "contactEmail", before: null, after: "a@b.com" },
      { op: "set_presentation", pageSlug: "h", sectionId: "s", field: "showAddress", before: false, after: true },
    ];
    for (const op of publishingOps) {
      expect(publishesPrivateField(op as Extract<SitePatchOperation, { op: "set_presentation" }>)).toBe(true);
      const tier = classifySitePatchOperation(op).tier;
      expect(tierRank(tier) >= tierRank("HIGH")).toBe(true);
    }
    // And via the unified entry point.
    for (const op of publishingOps) {
      const tier = classifyOwnerAction({ kind: "site-patch-operation", operation: op }).tier;
      expect(tierRank(tier) >= tierRank("HIGH")).toBe(true);
    }
    // The HIGH consequence names the plain-language effect.
    const c = classifySitePatchOperation(publishingOps[0]);
    expect(c.ownerConsequence).toMatch(/visible to everyone on the internet/);
    expect(c.ownerConsequence).toMatch(/explicit authorization/);
  });

  test("publishing-address SHOW command names the public effect (HIGH-class visibility)", () => {
    const cmd: OwnerCommand = { type: "set-address-visibility", visibility: "show" };
    const c = classifyOwnerCommandAction(cmd);
    // Track B locks this lane at MEDIUM (confirmation), which is >= the
    // MEDIUM floor for visibility changes and never below HIGH-class
    // misclassified as LOW. The owner sentence must name the public effect.
    expect(tierRank(c.tier) >= tierRank("MEDIUM")).toBe(true);
    expect(c.ownerConsequence).toMatch(/visible to everyone on the internet/);
  });

  test("spending money can NEVER classify below HIGH", () => {
    for (const grant of ["ad.buy", "purchase.make"] as const) {
      const c = classifyFydGrant(grant);
      expect(tierRank(c.tier) >= tierRank("HIGH")).toBe(true);
      expect(c.tier).toBe("CRITICAL");
      expect(c.ownerConsequence).toMatch(/spends your money/);
    }
  });

  test("a pure layout reorder can never classify above LOW", () => {
    const reorderOps: SitePatchOperation[] = [
      { op: "reorder_section_objects", pageSlug: "h", sectionId: "s", before: ["a", "b", "c"], after: ["c", "a", "b"] },
    ];
    for (const op of reorderOps) {
      expect(classifySitePatchOperation(op).tier).toBe("LOW");
    }
    const move: OwnerCommand = { type: "move-service", id: "svc-a", to: "last" };
    expect(classifyOwnerCommandAction(move).tier).toBe("LOW");
    // Even a no-op-looking reorder stays LOW: still presentation.
    expect(
      classifySitePatchOperation({
        op: "reorder_section_objects",
        pageSlug: "h",
        sectionId: "s",
        before: ["a"],
        after: ["a"],
      }).tier,
    ).toBe("LOW");
  });

  test("a detected HIGH/CRITICAL request is never downgraded by the classifier", () => {
    const detected = detectHighConsequenceRequest("change the account password");
    expect(detected).not.toBeNull();
    expect(detected!.tier).toBe("CRITICAL");
    expect(classifyDetectedRequest(detected!).tier).toBe("CRITICAL");
    const high = detectHighConsequenceRequest("send a newsletter to all customers");
    expect(high!.tier).toBe("HIGH");
    expect(classifyDetectedRequest(high!).tier).toBe("HIGH");
  });

  test("an approval never classifies below any action it approves", () => {
    const lowOnly: OwnerActionInput[] = [
      { kind: "owner-command", command: { type: "move-service", id: "a", to: "first" } },
      {
        kind: "site-patch-operation",
        operation: { op: "set_presentation", pageSlug: "h", sectionId: "s", field: "tone", before: "a", after: "b" },
      },
    ];
    expect(approvalTierForActions(lowOnly)).toBe("LOW");

    const mixed: OwnerActionInput[] = [
      ...lowOnly,
      { kind: "grant", grant: "site.publish" },
    ];
    expect(approvalTierForActions(mixed)).toBe("HIGH");

    const worst: OwnerActionInput[] = [
      ...mixed,
      { kind: "grant", grant: "ad.buy" },
    ];
    expect(approvalTierForActions(worst)).toBe("CRITICAL");

    // The site_patch helper follows the same law.
    const patchOps: SitePatchOperation[] = [
      { op: "reorder_section_objects", pageSlug: "h", sectionId: "s", before: ["a"], after: ["a"] },
      { op: "set_presentation", pageSlug: "h", sectionId: "s", field: "phone", before: false, after: true },
    ];
    expect(approvalTierForSitePatchOperations(patchOps)).toBe("HIGH");

    expect(maxTier([])).toBe("LOW");
    expect(maxTier(["MEDIUM", "LOW", "CRITICAL", "HIGH"])).toBe("CRITICAL");
  });
});

describe("friction wiring per tier", () => {
  test("LOW: inline preview + undo offered", () => {
    const f = frictionForTier("LOW");
    expect(f.mode).toBe("preview-undo");
    expect(f.requiresTypedConfirmation).toBe(false);
    expect(f.offersUndo).toBe(true);
    expect(f.cooldownSeconds).toBe(0);
    expect(f.auditRecord).toBe(true);
    expect(f.ownerInstruction).toMatch(/Before and After/);
  });

  test("MEDIUM: explicit confirmation naming the consequence", () => {
    const f = frictionForTier("MEDIUM");
    expect(f.mode).toBe("confirm");
    expect(f.requiresTypedConfirmation).toBe(false);
    expect(f.offersUndo).toBe(false);
    expect(f.cooldownSeconds).toBe(0);
    expect(f.auditRecord).toBe(true);
    expect(f.ownerInstruction).toMatch(/confirm explicitly/);
  });

  test("HIGH: explicit authorization with typed confirmation", () => {
    const f = frictionForTier("HIGH");
    expect(f.mode).toBe("authorize-typed");
    expect(f.requiresTypedConfirmation).toBe(true);
    expect(f.offersUndo).toBe(false);
    expect(f.cooldownSeconds).toBe(0);
    expect(f.auditRecord).toBe(true);
    expect(f.ownerInstruction).toMatch(/type your confirmation/);
  });

  test("CRITICAL: authorization + cool-down + audit record", () => {
    const f = frictionForTier("CRITICAL");
    expect(f.mode).toBe("authorize-typed-cooldown");
    expect(f.requiresTypedConfirmation).toBe(true);
    expect(f.offersUndo).toBe(false);
    expect(f.cooldownSeconds).toBe(CRITICAL_COOLDOWN_SECONDS);
    expect(f.cooldownSeconds).toBeGreaterThan(0);
    expect(f.auditRecord).toBe(true);
    expect(f.ownerInstruction).toMatch(/cool-down/);
    expect(f.ownerInstruction).toMatch(/receipt/);
  });

  test("the classification record carries the friction that matches its tier", () => {
    for (const tier of TIERS) {
      const grant: FydGrant =
        tier === "LOW" ? "site.read" : tier === "MEDIUM" ? "business.mutate" : tier === "HIGH" ? "site.publish" : "ad.buy";
      const c = classifyOwnerAction({ kind: "grant", grant });
      expect(c.tier).toBe(tier);
      expect(c.friction).toEqual(frictionForTier(tier));
    }
  });
});

describe("delegation consistency with Track B's locked law", () => {
  test("owner-command tiers always equal commandConsequenceTier (never re-decided)", () => {
    for (const cmd of sampleOwnerCommands()) {
      expect(classifyOwnerCommandAction(cmd).tier).toBe(commandConsequenceTier(cmd));
      expect(classifyOwnerAction({ kind: "owner-command", command: cmd }).tier).toBe(
        commandConsequenceTier(cmd),
      );
    }
  });

  test("no owner command is HIGH or CRITICAL in this lane (HIGH lives in the capability seam)", () => {
    for (const cmd of sampleOwnerCommands()) {
      const tier = classifyOwnerCommandAction(cmd).tier;
      expect(tier === "HIGH" || tier === "CRITICAL").toBe(false);
    }
  });

  test("CRITICAL folds to HIGH on the product scale", () => {
    expect(foldLegacyTier("CRITICAL")).toBe("HIGH");
    expect(classifyFydGrant("ad.buy").productTier).toBe("HIGH");
  });
});

describe("owner-facing language law", () => {
  const allConsequences: Array<{ label: string; text: string }> = [];

  beforeAll(() => {
    for (const cmd of sampleOwnerCommands()) {
      allConsequences.push({
        label: "command " + cmd.type,
        text: classifyOwnerCommandAction(cmd).ownerConsequence,
      });
    }
    for (const op of sampleSitePatchOperations()) {
      allConsequences.push({
        label: "op " + op.op,
        text: classifySitePatchOperation(op).ownerConsequence,
      });
    }
    const publishing: SitePatchOperation = {
      op: "set_presentation",
      pageSlug: "h",
      sectionId: "s",
      field: "address",
      before: "hidden",
      after: "123 Main St",
    };
    allConsequences.push({ label: "op publish-private", text: classifySitePatchOperation(publishing).ownerConsequence });
    for (const grant of allFydGrants()) {
      allConsequences.push({ label: "grant " + grant, text: classifyFydGrant(grant).ownerConsequence });
    }
    for (const tier of TIERS) {
      allConsequences.push({ label: "friction " + tier, text: frictionForTier(tier).ownerInstruction });
    }
  });

  test("no em dashes in any owner-facing string", () => {
    for (const { label, text } of allConsequences) {
      expect(text).not.toMatch(/[\u2014\u2013]/);
    }
  });

  test("no capability jargon in owner consequence strings", () => {
    const jargon = /\b(capability|digest|SiteSpec|FydGrant|OwnerCommand|seam|projection)\b/i;
    for (const { label, text } of allConsequences) {
      // Friction instructions may name FYD as the product; the consequence
      // sentences themselves must stay jargon-free.
      if (label.startsWith("friction")) continue;
      expect(label + ": " + text).not.toMatch(jargon);
    }
  });

  test("MEDIUM+ consequences name what the owner should know (public, money, outside)", () => {
    const showAddr = classifyOwnerCommandAction({ type: "set-address-visibility", visibility: "show" });
    expect(showAddr.ownerConsequence).toMatch(/internet/);
    const publish = classifyFydGrant("site.publish");
    expect(publish.ownerConsequence).toMatch(/public internet/);
    const spend = classifyFydGrant("ad.buy");
    expect(spend.ownerConsequence).toMatch(/money/);
  });
});

describe("determinism", () => {
  test("same input always yields the same classification", () => {
    const inputs: OwnerActionInput[] = [
      { kind: "owner-command", command: { type: "set-contact-field", field: "email", value: "a@b.com" } },
      {
        kind: "site-patch-operation",
        operation: { op: "set_presentation", pageSlug: "h", sectionId: "s", field: "tone", before: null, after: "professional" },
      },
      { kind: "grant", grant: "message.send" },
      { kind: "detected-request", request: { tier: "CRITICAL", category: "ownership", reason: "r" } },
    ];
    for (const input of inputs) {
      const a = classifyOwnerAction(input);
      const b = classifyOwnerAction(input);
      expect(a).toEqual(b);
      expect(a.friction).toEqual(frictionForTier(a.tier));
    }
  });
});
