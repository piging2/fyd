/**
 * Ask FYD site-spec surface contract.
 *
 * The SiteSpec generator lives in the sibling lane (src/fyd/sitespec); this
 * module defines the MINIMAL digest-bound summary Ask FYD needs to draft
 * site-patch proposals, plus the provider seam the generator plugs into.
 * Ask FYD never imports the generator directly (one-writer rule): the
 * generator registers a provider here.
 *
 * The summary binds the exact spec digest the agent reasoned over, so a
 * proposal's siteSpecDigest can be re-verified against the current spec
 * before anything is applied.
 */

import type { FYDPage } from "../sitespec/types";

/** The digest-bound page summary Ask FYD reasons over. */
export interface SiteSpecSummary {
  /** Stable site id (the owning business/organization object id). */
  siteId: string;
  /** Page slug from the sibling spec, e.g. "home". */
  pageSlug: string;
  /** SHA-256 hex of the canonical SiteSpec JSON this summary was cut from. */
  digest: string;
  /** The sibling lane's page: sections, queries, presentation. Read-only here. */
  page: FYDPage;
  /** sectionId -> object ids in current display order. */
  sectionObjects: Record<string, string[]>;
  /**
   * sectionId -> current presentation values the agent may propose changes
   * to (heading, copy, featuredIds, tone, ...). The sibling lane decides how
   * these persist; Ask FYD only drafts transitions between stated values.
   */
  presentation: Record<string, Record<string, string | string[] | boolean | null>>;
}

/** The seam the SiteSpec lane implements. */
export interface SiteSpecProvider {
  getSummary(siteId: string): Promise<SiteSpecSummary | null>;
}

const nullProvider: SiteSpecProvider = {
  async getSummary() {
    return null;
  },
};

let provider: SiteSpecProvider = nullProvider;

/**
 * The SiteSpec lane registers its generator-backed provider here.
 * Default is the null provider: Ask FYD honestly reports it has no spec.
 */
export function registerSiteSpecProvider(next: SiteSpecProvider): void {
  provider = next;
}

export function getSiteSpecProvider(): SiteSpecProvider {
  return provider;
}
