/**
 * Registry tests: the ObjectRail entry declares its full contract, and
 * existing entries are unchanged (all new metadata fields stay optional).
 */

import { getComponentDef } from "../registry";

describe("component registry", () => {
  test("ObjectRail entry declares its contract", () => {
    const def = getComponentDef("ObjectRail");
    expect(def).toBeDefined();
    expect(def!.name).toBe("ObjectRail");
    expect(def!.ownerBound).toBe(false);
    expect(def!.requiresData).toBe(true);
    expect(def!.responsive?.behavior).toBe("rail-to-drawer");
    expect(def!.responsive?.collapseBelow).toBe("lg");
    expect(def!.responsive?.touchTargetMinPx).toBe(44);
    expect(def!.capabilities).toEqual(["preview"]);
    expect(def!.requiredData).toContain("objectPresence.objects");
    expect(def!.variants).toEqual(["rail", "drawer", "auto"]);
    expect(def!.editableProperties).toContain("objectPresence.mode");
  });

  test("existing entries are unchanged: metadata stays optional", () => {
    const hero = getComponentDef("Hero");
    expect(hero).toBeDefined();
    expect(hero!.ownerBound).toBe(true);
    expect(hero!.requiredData).toBeUndefined();
    expect(hero!.capabilities).toBeUndefined();
    expect(hero!.responsive).toBeUndefined();
    expect(hero!.editableProperties).toBeUndefined();
    expect(hero!.variants).toBeUndefined();
    const ask = getComponentDef("AskFYD");
    expect(ask!.requiresData).toBe(false);
    expect(ask!.responsive).toBeUndefined();
  });

  test("unknown components are still undefined", () => {
    expect(getComponentDef("Nope")).toBeUndefined();
  });
});
