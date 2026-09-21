import { AttentionController, ATTENTION } from "../controller";

describe("AttentionController", () => {
  test("single primary max; challenger waits out residency", () => {
    const c = new AttentionController();
    expect(c.requestPrimary("a", 0)).toBe(true);
    // Challenger inside residency: denied.
    expect(c.requestPrimary("b", ATTENTION.minResidencyMs - 1)).toBe(false);
    expect(c.getPrimary()).toBe("a");
    // After residency: granted, incumbent demoted to secondary.
    expect(c.requestPrimary("b", ATTENTION.minResidencyMs + 1)).toBe(true);
    expect(c.getPrimary()).toBe("b");
    expect(c.level("a")).toBe("aware");
  });

  test("cooldown blocks immediate re-engage after release", () => {
    const c = new AttentionController();
    c.requestPrimary("a", 0);
    c.release("a", 100);
    expect(c.requestPrimary("a", 100 + ATTENTION.cooldownMs - 1)).toBe(false);
    expect(c.requestPrimary("a", 100 + ATTENTION.cooldownMs + 1)).toBe(true);
  });

  test("locked primary cannot be demoted", () => {
    const c = new AttentionController();
    c.requestPrimary("a", 0);
    c.lock("a");
    expect(c.requestPrimary("b", ATTENTION.minResidencyMs + 100)).toBe(false);
    c.unlock("a");
    expect(c.requestPrimary("b", ATTENTION.minResidencyMs + 100)).toBe(true);
  });

  test("release promotes waiting secondary", () => {
    const c = new AttentionController();
    c.requestPrimary("a", 0);
    c.setAware("b");
    c.release("a", 10);
    expect(c.getPrimary()).toBe("b");
  });

  test("reset quiets everything", () => {
    const c = new AttentionController();
    c.requestPrimary("a", 0);
    c.reset();
    expect(c.getPrimary()).toBeNull();
    expect(c.level("a")).toBe("quiet");
  });
});
