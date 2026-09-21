/**
 * Dependency index tests: changing one object invalidates only its sections,
 * never the whole site; merge lets the SiteSpec generator own the registry.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DependencyIndex,
  happyPlaceSeedIndex,
  pagesForSections,
} from "../dependency-index.ts";
import type { ChangeRecord } from "../types.ts";

test("changing one service invalidates only its sections", () => {
  const index = DependencyIndex.fromSeed(happyPlaceSeedIndex());
  const sections = index.invalidate("svc:bathroom-remodels");
  assert.deepEqual(sections, ["estimate-form", "service-detail", "services"]);
});

test("business object change does not invalidate service sections", () => {
  const index = DependencyIndex.fromSeed(happyPlaceSeedIndex());
  const sections = index.invalidate("fyd:business:happy-place-carpentry");
  assert.ok(sections.includes("hero"));
  assert.ok(sections.includes("contact"));
  assert.ok(!sections.includes("services"));
  assert.ok(!sections.includes("service-detail"));
});

test("unknown object invalidates nothing", () => {
  const index = DependencyIndex.fromSeed(happyPlaceSeedIndex());
  assert.deepEqual(index.invalidate("svc:does-not-exist"), []);
});

test("reverse lookup finds objects for a section", () => {
  const index = DependencyIndex.fromSeed(happyPlaceSeedIndex());
  const objects = index.objectsFor("services");
  assert.ok(objects.length >= 9);
  assert.ok(objects.includes("svc:decks"));
});

test("merge extends the index with the generator's registry", () => {
  const index = DependencyIndex.fromSeed(happyPlaceSeedIndex());
  index.merge({ "svc:solar": ["services", "service-detail", "solar-landing"] });
  assert.ok(index.invalidate("svc:solar").includes("solar-landing"));
  assert.ok(index.objectsFor("services").includes("svc:solar"));
});

test("invalidateForChanges maps changes to sections and pages", () => {
  const index = DependencyIndex.fromSeed(happyPlaceSeedIndex());
  const changes: ChangeRecord[] = [
    { type: "changed", entityId: "svc:bathroom-remodels", field: "description" },
  ];
  const { byObjectId, allSections } = index.invalidateForChanges(changes);
  assert.deepEqual(byObjectId["svc:bathroom-remodels"], ["estimate-form", "service-detail", "services"]);
  assert.deepEqual(allSections, ["estimate-form", "service-detail", "services"]);
  const pages = pagesForSections(allSections);
  assert.ok(pages.includes("/"));
  assert.ok(!pages.includes("/work"));
});

test("register dedupes repeated sections", () => {
  const index = new DependencyIndex();
  index.register("o1", ["a", "b"]);
  index.register("o1", ["b", "c"]);
  assert.deepEqual(index.sectionsFor("o1"), ["a", "b", "c"]);
});
