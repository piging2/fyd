/**
 * INV-10: one object change invalidates only dependent projections.
 *
 * Machinery under test (real, on the Pig):
 *   src/fyd/refresh/dependency-index.ts DependencyIndex
 *
 * The law: when a claim changes on object O, exactly the sections
 * registered for O invalidate, never the whole site. Sections shared
 * with other objects re-render; objects/sections with no dependency
 * on O never appear in the invalidation set.
 */

import {
  DependencyIndex,
  happyPlaceSeedIndex,
} from "../../refresh/dependency-index";
import type { ChangeRecord } from "../../refresh/types";

describe("INV-10 one object change invalidates only dependent projections", () => {
  const idx = DependencyIndex.fromSeed(happyPlaceSeedIndex());

  test("invalidating one service touches only its registered sections", () => {
    expect(idx.invalidate("svc:decks")).toEqual([
      "estimate-form",
      "service-detail",
      "services",
    ]);
  });

  test("invalidating the business touches only business sections", () => {
    expect(idx.invalidate("fyd:business:happy-place-carpentry")).toEqual([
      "about",
      "contact",
      "estimate-form",
      "footer",
      "hero",
    ]);
  });

  test("unknown object invalidates nothing", () => {
    expect(idx.invalidate("svc:does-not-exist")).toEqual([]);
  });

  test("change records map to scoped invalidation sets", () => {
    const changes: ChangeRecord[] = [
      { type: "changed", entityId: "svc:decks", field: "hours" },
      {
        type: "changed",
        entityId: "fyd:reviews:happy-place-carpentry",
        field: "rating",
      },
    ];
    const out = idx.invalidateForChanges(changes);
    expect(out.byObjectId["svc:decks"]).toEqual([
      "estimate-form",
      "service-detail",
      "services",
    ]);
    expect(out.byObjectId["fyd:reviews:happy-place-carpentry"]).toEqual([
      "reviews",
    ]);
    expect(out.allSections).toEqual([
      "estimate-form",
      "reviews",
      "service-detail",
      "services",
    ]);
    // Business-only sections are untouched by a service+reviews change.
    expect(out.allSections).not.toContain("hero");
    expect(out.allSections).not.toContain("about");
  });

  test("shared sections re-render, unrelated objects are never implicated", () => {
    // estimate-form is shared by the business and every service: a deck
    // change re-renders it, but the fence object is not implicated.
    expect(idx.objectsFor("estimate-form")).toContain("svc:decks");
    expect(idx.objectsFor("estimate-form")).toContain(
      "fyd:business:happy-place-carpentry",
    );
    const out = idx.invalidateForChanges([
      { type: "changed", entityId: "svc:decks", field: "hours" },
    ]);
    expect(out.byObjectId["svc:fences"]).toBeUndefined();
    expect(idx.invalidate("svc:fences")).not.toContain("hero");
  });

  test("merge() extends the registry without disturbing existing scopes", () => {
    const i2 = DependencyIndex.fromSeed(happyPlaceSeedIndex());
    i2.merge({ "svc:new-gutters": ["services", "service-detail"] });
    expect(i2.invalidate("svc:new-gutters")).toEqual([
      "service-detail",
      "services",
    ]);
    // Existing registrations are unchanged by the merge.
    expect(i2.invalidate("svc:decks")).toEqual([
      "estimate-form",
      "service-detail",
      "services",
    ]);
    expect(i2.invalidate("fyd:business:happy-place-carpentry")).toEqual([
      "about",
      "contact",
      "estimate-form",
      "footer",
      "hero",
    ]);
  });
});
