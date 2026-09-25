/**
 * Tests for the owner CONFIRM verb, the owner-assertion semantic contract,
 * the authority gradient (consequence tiers + fast undo), and the
 * presentation-decision assertions (address SHOW/HIDE).
 *
 * Binding: FYD-24H-BUILDER-DECISIONS 2026-09-22 (OWNER ASSERTIONS,
 * AUTHORITY GRADIENT, MEDIA/presentation decision).
 *
 * Every assertion carries the explicit contract: actor, subject/object,
 * field/path, operation, value, visibility, timestamp, superseded
 * assertion, source/evidence relationship. The event log is the durable
 * audit seam; the projection is the operational read shape over it.
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyOwnerCommand,
  confirmationSourceDrifted,
  OwnerCommandError,
  type OwnerCommand,
} from "../owner-store";
import {
  changeKindForTier,
  commandConsequenceTier,
  consequenceNoteFor,
  describeCommand,
  interpretTextCommand,
  invertOwnerCommand,
} from "../commands";
import { projectOwnerState, readOwnerEvents } from "../owner-events";

const KNOWN_IDS = ["svc-decks", "svc-fences"];
const KNOWN_NAMES = new Map([
  ["svc-decks", "Decks"],
  ["svc-fences", "Fences"],
]);

beforeEach(() => {
  process.env.FYD_OWNER_DIR = mkdtempSync(join(tmpdir(), "fyd-confirm-test-"));
});

function confirmPhone(
  objectId: string,
  sourceValue: string | null,
  actorLabel?: string,
) {
  return applyOwnerCommand(
    objectId,
    { type: "confirm-contact-field", field: "phone" },
    KNOWN_IDS,
    KNOWN_NAMES,
    { sourceValue, actorLabel },
  );
}

describe("CONFIRM verb (natural language)", () => {
  test.each([
    ["confirm phone", "phone"],
    ["verify the website", "website"],
    ["my phone is correct", "phone"],
    ["our email is right", "email"],
    ["the website is accurate", "website"],
    ["that's right, my phone", "phone"],
    ["yes that's correct, our email", "email"],
    ["correct, our email", "email"],
    ["right, my phone", "phone"],
  ])("field-targeted %p -> confirm-contact-field(%s)", (text, field) => {
    const proposal = interpretTextCommand(text, "demo-confirm-1");
    expect(proposal).not.toBeNull();
    expect(proposal!.command).toEqual({
      type: "confirm-contact-field",
      field,
    });
  });

  test.each([["confirm"], ["that's right"], ["correct"], ["yes that's accurate"]])(
    "bare %p does not guess a field (fail closed)",
    (text) => {
      // Ambiguous with no field: the surface answers as Q&A instead of
      // recording an assertion about the wrong fact.
      expect(interpretTextCommand(text, "demo-confirm-1")).toBeNull();
    },
  );
});

describe("CONFIRM assertion record", () => {
  test("records the full assertion contract: actor, subject, path, operation, value, visibility, timestamp, supersession, evidence", () => {
    const o = confirmPhone("demo-confirm-1", "+1 555 000 1111", "Nolan (demo)");
    const c = o.fieldConfirmations["phone"];
    expect(c).toBeDefined();
    // Value half.
    expect(c.confirmedValue).toBe("+1 555 000 1111");
    expect(c.sourceValue).toBe("+1 555 000 1111");
    // Contract half.
    expect(c.subject).toBe("demo-confirm-1");
    expect(c.path).toBe("contact:phone");
    expect(c.operation).toBe("confirm");
    expect(c.value).toBe("+1 555 000 1111");
    expect(c.visibility).toBe("unchanged");
    expect(c.actor).toEqual({ kind: "demo", label: "Nolan (demo)" });
    expect(typeof c.at).toBe("string");
    expect(Number.isNaN(Date.parse(c.at))).toBe(false);
    expect(c.supersedes).toBeNull();
    expect(c.evidence.kind).toBe("source-snapshot");
    expect(c.evidence.ref).toBe("projection:raw");
    expect(typeof c.eventId).toBe("string");
    expect(c.eventId.length).toBeGreaterThan(0);
    // Read-model aliases.
    expect(c.confirmedAt).toBe(c.at);
    expect(c.actorLabel).toBe("Nolan (demo)");
  });

  test("the event log carries the assertion (durable audit seam)", () => {
    confirmPhone("demo-confirm-2", "+1 555 000 2222", "Nolan (demo)");
    const events = readOwnerEvents("demo-confirm-2");
    expect(events.length).toBe(1);
    const e = events[0];
    expect(e.type).toBe("owner.confirmed-fact");
    expect(e.target).toBe("contact:phone");
    expect(e.objectId).toBe("demo-confirm-2");
    expect((e.newValue as Record<string, unknown>).confirmation).toBe(true);
    expect(
      (e.previousBasis as Record<string, unknown>).supersedesEventId,
    ).toBeNull();
  });

  test("a second confirmation supersedes the first (explicit chain)", () => {
    const first = confirmPhone("demo-confirm-3", "+1 555 000 3333");
    const firstId = first.fieldConfirmations["phone"].eventId;
    const second = confirmPhone("demo-confirm-3", "+1 555 000 3334");
    const c = second.fieldConfirmations["phone"];
    expect(c.supersedes).toBe(firstId);
    expect(c.sourceValue).toBe("+1 555 000 3334");
    const events = readOwnerEvents("demo-confirm-3");
    expect(events.length).toBe(2);
    expect(
      (events[1].previousBasis as Record<string, unknown>).supersedesEventId,
    ).toBe(firstId);
  });

  test("confirmation survives re-projection from the log (regeneration)", () => {
    const before = confirmPhone("demo-confirm-4", "+1 555 000 4444", "Nolan (demo)");
    // Simulated regeneration: throw away the in-memory state and
    // re-project from the durable event log.
    const after = projectOwnerState("demo-confirm-4");
    expect(after.fieldConfirmations["phone"]).toEqual(
      before.fieldConfirmations["phone"],
    );
  });

  test("refuses when there is no recorded value to assert about", () => {
    expect(() => confirmPhone("demo-confirm-5", null)).toThrow(OwnerCommandError);
    expect(readOwnerEvents("demo-confirm-5")).toEqual([]);
  });

  test("a correction is the asserted value when one exists", () => {
    applyOwnerCommand(
      "demo-confirm-6",
      { type: "set-contact-field", field: "phone", value: "+1 555 000 6666" },
      KNOWN_IDS,
      KNOWN_NAMES,
      { sourceValue: "+1 555 000 6000" },
    );
    const o = confirmPhone("demo-confirm-6", "+1 555 000 6000");
    const c = o.fieldConfirmations["phone"];
    expect(c.confirmedValue).toBe("+1 555 000 6666");
    expect(c.sourceValue).toBe("+1 555 000 6000");
  });
});

describe("source drift on a confirmed field", () => {
  test("sourceDrifted surfaces when the source moves after confirmation", () => {
    const o = confirmPhone("demo-confirm-7", "+1 555 000 7777");
    const c = o.fieldConfirmations["phone"];
    // Unchanged source: no drift.
    expect(confirmationSourceDrifted(c, "+1 555 000 7777")).toBe(false);
    // Re-observed source moved: drift surfaces. The confirmed value
    // still wins; this only flags the movement.
    expect(confirmationSourceDrifted(c, "+1 555 000 7778")).toBe(true);
    expect(confirmationSourceDrifted(c, null)).toBe(true);
  });
});

describe("address presentation decision (SHOW/HIDE assertions)", () => {
  test("hide records a persistent HIDE assertion with the full contract", () => {
    const o = applyOwnerCommand(
      "demo-confirm-8",
      { type: "set-address-visibility", visibility: "hide" },
      KNOWN_IDS,
      KNOWN_NAMES,
    );
    expect(o.addressVisibility).toBe("hide");
    const a = o.addressVisibilityAssertion;
    expect(a).not.toBeNull();
    expect(a!.subject).toBe("demo-confirm-8");
    expect(a!.path).toBe("contact:address");
    expect(a!.operation).toBe("hide");
    expect(a!.value).toBe("hide");
    expect(a!.visibility).toBe("hide");
    expect(a!.actor.kind).toBe("demo");
    expect(a!.supersedes).toBeNull();
    expect(typeof a!.eventId).toBe("string");
  });

  test("show supersedes hide; the assertion survives re-projection", () => {
    const hid = applyOwnerCommand(
      "demo-confirm-9",
      { type: "set-address-visibility", visibility: "hide" },
      KNOWN_IDS,
      KNOWN_NAMES,
    );
    const hideId = hid.addressVisibilityAssertion!.eventId;
    const shown = applyOwnerCommand(
      "demo-confirm-9",
      { type: "set-address-visibility", visibility: "show" },
      KNOWN_IDS,
      KNOWN_NAMES,
    );
    expect(shown.addressVisibility).toBe("show");
    expect(shown.addressVisibilityAssertion!.operation).toBe("show");
    expect(shown.addressVisibilityAssertion!.supersedes).toBe(hideId);
    const reread = projectOwnerState("demo-confirm-9");
    expect(reread.addressVisibilityAssertion).toEqual(
      shown.addressVisibilityAssertion,
    );
  });

  test.each([
    ["hide the address", "hide"],
    ["hide the business address", "hide"],
    ["show the address", "show"],
    ["show the business address", "show"],
    ["make the address public", "show"],
  ])("interpreter: %p -> set-address-visibility(%s)", (text, visibility) => {
    const proposal = interpretTextCommand(text, "demo-confirm-1");
    expect(proposal).not.toBeNull();
    expect(proposal!.command).toEqual({
      type: "set-address-visibility",
      visibility,
    });
  });
});

describe("consequence tiers (locked: LOW / MEDIUM / HIGH / CRITICAL)", () => {
  test.each([
    [{ type: "move-service", id: "svc-decks", to: "first" }, "LOW"],
    // Address visibility is MEDIUM (FYD product authority directive,
    // Nolan 2026-09-25): it alters public factual presentation, so it
    // needs explicit confirmation and no automatic LOW undo.
    [{ type: "set-address-visibility", visibility: "hide" }, "MEDIUM"],
    // Service visibility is MEDIUM per the locked tiers (factual
    // visibility), not a reversible LOW presentation change.
    [{ type: "set-service-visibility", id: "svc-decks", visible: false }, "MEDIUM"],
    [{ type: "set-contact-field", field: "phone", value: "x" }, "MEDIUM"],
    [{ type: "revert-contact-field", field: "phone" }, "MEDIUM"],
    [{ type: "confirm-contact-field", field: "phone" }, "MEDIUM"],
    [{ type: "add-service", name: "Decks" }, "MEDIUM"],
  ])("%p is tier %s", (command, tier) => {
    expect(commandConsequenceTier(command as OwnerCommand)).toBe(tier);
  });

  test("LOW is change-website; MEDIUM is update-business (language law)", () => {
    expect(changeKindForTier("LOW")).toBe("change-website");
    expect(changeKindForTier("MEDIUM")).toBe("update-business");
    expect(consequenceNoteFor("LOW")).toMatch(/Change the website/);
    expect(consequenceNoteFor("MEDIUM")).toMatch(/Update the business/);
  });
});

describe("consequence tiers: exact inverses (fast undo, LOW only)", () => {
  test.each([
    [
      { type: "move-service", id: "svc-decks", to: "first" },
      { type: "move-service", id: "svc-decks", to: "last" },
    ],
    [
      { type: "move-service", id: "svc-decks", to: "up" },
      { type: "move-service", id: "svc-decks", to: "down" },
    ],
  ])("%p inverts to %p", (command, inverse) => {
    expect(invertOwnerCommand(command as OwnerCommand)).toEqual(inverse);
  });

  test.each([
    { type: "set-service-visibility", id: "svc-decks", visible: false },
    // Address visibility is MEDIUM (FYD product authority directive, Nolan
    // 2026-09-25): no automatic undo; it unwinds via explicit DEFAULT.
    { type: "set-address-visibility", visibility: "hide" },
    { type: "set-contact-field", field: "phone", value: "x" },
    { type: "revert-contact-field", field: "phone" },
    { type: "confirm-contact-field", field: "phone" },
    { type: "add-service", name: "Decks" },
  ])("MEDIUM %p has no exact inverse", (command) => {
    expect(invertOwnerCommand(command as OwnerCommand)).toBeNull();
  });

  test("undo round trip at the store level restores LOW presentation state", () => {
    const moved = applyOwnerCommand(
      "demo-confirm-10",
      { type: "move-service", id: "svc-fences", to: "first" },
      KNOWN_IDS,
      KNOWN_NAMES,
    );
    expect(moved.serviceOrder).toEqual(["svc-fences", "svc-decks"]);
    const inverse = invertOwnerCommand({
      type: "move-service",
      id: "svc-fences",
      to: "first",
    });
    expect(inverse).not.toBeNull();
    expect(describeCommand(inverse!, KNOWN_NAMES)).toMatch(/Undo this website change/i);
    const undone = applyOwnerCommand(
      "demo-confirm-10",
      inverse!,
      KNOWN_IDS,
      KNOWN_NAMES,
    );
    expect(undone.serviceOrder).toEqual(["svc-decks", "svc-fences"]);
  });

  test("address visibility (MEDIUM) has no automatic undo; explicit DEFAULT unwinds it", () => {
    const hid = applyOwnerCommand(
      "demo-confirm-11",
      { type: "set-address-visibility", visibility: "hide" },
      KNOWN_IDS,
      KNOWN_NAMES,
    );
    expect(hid.addressVisibility).toBe("hide");
    // MEDIUM: no fast undo.
    expect(
      invertOwnerCommand({ type: "set-address-visibility", visibility: "hide" }),
    ).toBeNull();
    // The explicit preference unwinds through an explicit DEFAULT command
    // in the normal propose/approve path (append-only; the hide event stays
    // in the log).
    const back = applyOwnerCommand(
      "demo-confirm-11",
      { type: "set-address-visibility", visibility: "default" },
      KNOWN_IDS,
      KNOWN_NAMES,
    );
    expect(back.addressVisibility).toBe("default");
  });
});
