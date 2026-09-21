/**
 * Tests for the action wiring verifier.
 * Law under test: unknown or unwired actions never verify as performable.
 */

import {
  can,
  renderableActions,
  verifyAction,
  wiringTable,
  type ActionProbes,
  type CapabilityViewer,
} from "../action-verifier";

const OFF: ActionProbes = {
  askEndpoint: false,
  persistEndpoint: false,
  followCapable: false,
  shareCapable: false,
};

const ON: ActionProbes = {
  askEndpoint: true,
  persistEndpoint: true,
  followCapable: true,
  shareCapable: true,
};

const VISITOR: CapabilityViewer = { capabilities: [] };
const OWNER: CapabilityViewer = {
  capabilities: ["site.propose", "site.approve", "field.visibility.change"],
};

describe("can", () => {
  test("grants only listed capabilities; null viewer grants nothing", () => {
    expect(can(OWNER, "site.propose")).toBe(true);
    expect(can(VISITOR, "site.propose")).toBe(false);
    expect(can(null, "site.propose")).toBe(false);
    expect(can(OWNER, "nope")).toBe(false);
  });
});

describe("verifyAction", () => {
  test("unknown actions fail closed", () => {
    const w = verifyAction("admin.self_destruct", OWNER, ON);
    expect(w.performable).toBe(false);
    expect(w.status).toBe("unwired");
  });

  test("visitor cannot propose or approve; owner can propose and preview", () => {
    expect(verifyAction("patch.propose", VISITOR, OFF).performable).toBe(false);
    expect(verifyAction("patch.propose", OWNER, OFF).performable).toBe(true);
    const preview = verifyAction("patch.apply_preview", OWNER, OFF);
    expect(preview.performable).toBe(true);
    expect(preview.status).toBe("degraded");
    expect(preview.reason).toMatch(/preview only/i);
  });

  test("persist is unwired until the transition store probe passes", () => {
    const off = verifyAction("patch.persist", OWNER, OFF);
    expect(off.performable).toBe(false);
    expect(off.reason).toMatch(/not wired yet/i);
    const on = verifyAction("patch.persist", OWNER, ON);
    expect(on.performable).toBe(true);
    expect(on.status).toBe("wired");
  });

  test("ask.submit is unwired until the endpoint probe passes", () => {
    expect(verifyAction("ask.submit", VISITOR, OFF).performable).toBe(false);
    expect(verifyAction("ask.submit", VISITOR, ON).performable).toBe(true);
  });

  test("owner correction actions stay unwired until the review surface mounts", () => {
    // Even the owner with the capability gets unwired: the UI is not mounted.
    const w = verifyAction("owner.correct_fact", OWNER, ON);
    expect(w.performable).toBe(false);
    expect(w.requiresCapability).toBe("field.visibility.change");
  });

  test("follow is unwired until the tenant wires it; share follows the browser", () => {
    expect(verifyAction("social.follow", VISITOR, OFF).performable).toBe(false);
    expect(verifyAction("social.follow", VISITOR, ON).performable).toBe(true);
    expect(verifyAction("social.share", VISITOR, OFF).performable).toBe(false);
    expect(verifyAction("social.share", VISITOR, ON).status).toBe("degraded");
  });
});

describe("wiringTable", () => {
  test("the table covers every known action and renderableActions only returns performable ones", () => {
    const table = wiringTable(VISITOR, OFF);
    expect(table.length).toBe(12);
    for (const row of renderableActions(VISITOR, OFF)) {
      expect(row.performable).toBe(true);
    }
    // With everything off, a visitor still gets page nav and conditional
    // contact links (each link re-verified at render through the safe gate).
    const ids = renderableActions(VISITOR, OFF).map((r) => r.action);
    expect(ids).toContain("nav.switch_page");
    expect(ids).not.toContain("patch.persist");
    expect(ids).not.toContain("ask.submit");
  });
});
