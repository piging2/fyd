/**
 * Dependency index: object_id -> rendered section ids.
 *
 * When a claim changes on object O, only the sections registered for O
 * invalidate, never the whole site. This is the seam the SiteSpec generator
 * lane owns the section registry for: the generator can push its real
 * section map through merge() at render time, replacing or extending this
 * seed. The contract (register/merge/invalidate) is the stable part.
 */

import type { ChangeRecord } from "./types.ts";

export type SectionId = string;
export type ObjectId = string;

export interface DependencyIndexData {
  [objectId: string]: SectionId[];
}

export class DependencyIndex {
  private forward = new Map<ObjectId, Set<SectionId>>();
  private reverse = new Map<SectionId, Set<ObjectId>>();

  static fromSeed(seed: DependencyIndexData): DependencyIndex {
    const idx = new DependencyIndex();
    idx.merge(seed);
    return idx;
  }

  register(objectId: ObjectId, sectionIds: SectionId[]): void {
    let set = this.forward.get(objectId);
    if (!set) {
      set = new Set<SectionId>();
      this.forward.set(objectId, set);
    }
    for (const s of sectionIds) {
      set.add(s);
      let rev = this.reverse.get(s);
      if (!rev) {
        rev = new Set<ObjectId>();
        this.reverse.set(s, rev);
      }
      rev.add(objectId);
    }
  }

  /** Merge a SiteSpec-generated section map (generator lane owns the shape). */
  merge(data: DependencyIndexData): void {
    for (const objectId of Object.keys(data)) {
      this.register(objectId, data[objectId]);
    }
  }

  sectionsFor(objectId: ObjectId): SectionId[] {
    const set = this.forward.get(objectId);
    return set ? [...set].sort() : [];
  }

  objectsFor(sectionId: SectionId): ObjectId[] {
    const set = this.reverse.get(sectionId);
    return set ? [...set].sort() : [];
  }

  /**
   * Invalidation set for one changed object: exactly the sections registered
   * for that object. Sections shared with other objects are returned too
   * (they must re-render), but objects/sections with no dependency on this
   * object never appear.
   */
  invalidate(objectId: ObjectId): SectionId[] {
    return this.sectionsFor(objectId);
  }

  /** Map change records to their invalidation sets: affected object -> sections. */
  invalidateForChanges(
    changes: ChangeRecord[],
  ): { byObjectId: Record<ObjectId, SectionId[]>; allSections: SectionId[] } {
    const byObjectId: Record<ObjectId, SectionId[]> = {};
    const all = new Set<SectionId>();
    for (const c of changes) {
      const sections = this.invalidate(c.entityId);
      byObjectId[c.entityId] = sections;
      for (const s of sections) all.add(s);
    }
    return { byObjectId, allSections: [...all].sort() };
  }

  size(): number {
    return this.forward.size;
  }
}

/**
 * Seed index for the Happy Place proof site. Section ids are the rendered
 * section names of the SiteSpec/proof renderer. The generator lane replaces
 * this seed with the real registry via merge().
 */
export function happyPlaceSeedIndex(): DependencyIndexData {
  const business = "fyd:business:happy-place-carpentry";
  const seed: DependencyIndexData = {
    [business]: ["hero", "about", "contact", "footer", "estimate-form"],
  };
  const services: Array<[string, string]> = [
    ["svc:decks", "Decks"],
    ["svc:fences", "Fences"],
    ["svc:pergolas", "Pergolas"],
    ["svc:bathroom-remodels", "Bathroom remodels"],
    ["svc:finish-carpentry", "Finish carpentry"],
    ["svc:exterior-painting", "Exterior painting"],
    ["svc:outdoor-structures", "Outdoor structures"],
    ["svc:repairs", "Repairs"],
    ["svc:custom-work", "Custom work"],
  ];
  for (const [id] of services) {
    seed[id] = ["services", "service-detail", "estimate-form"];
  }
  seed["fyd:reviews:happy-place-carpentry"] = ["reviews"];
  seed["fyd:projects:happy-place-carpentry"] = ["projects"];
  return seed;
}

/**
 * Page -> section map for the proof site, so an invalidation set can be
 * turned into "regenerate these pages". Pages reference sections; sections
 * reference objects. Owned by this lane; the generator may override.
 */
export const PAGE_SECTIONS: Record<string, SectionId[]> = {
  "/": ["hero", "services", "projects", "reviews", "about", "contact"],
  "/work": ["projects"],
  "/reviews": ["reviews"],
  "/contact": ["contact", "estimate-form"],
  "/estimate": ["estimate-form"],
};

/** Given invalidated sections, which pages need regeneration? */
export function pagesForSections(sections: SectionId[]): string[] {
  const set = new Set(sections);
  return Object.keys(PAGE_SECTIONS).filter((page) =>
    PAGE_SECTIONS[page].some((s) => set.has(s)),
  );
}
