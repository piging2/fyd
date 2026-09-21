# Raw corpus material: provenance

This directory holds REAL fetched website bytes used as the regression
corpus for the structured-data extraction lane (`fyd/sitespec-generator`,
2026-09-21). These are inputs to tests, not fixtures: the corpus tests
read these files and assert on what the pipeline extracts from them.

## happy-place-platform/index.html

- Source: `https://happy-place-platform.vercel.app/`
- Acquired: 2026-09-21 (HTTP 200, 139,618 bytes).
- What it is: Nolan's own portfolio proof asset (Happy Place Carpentry
  LLC demo site). Used with his standing permission as a portfolio
  reference; it is also the "procedural clone" target named in the FYD
  product directive (the first FYD generated site must regenerate an
  existing presence declaratively).
- Structured data inside: one `LocalBusiness` JSON-LD block (Happy
  Place Carpentry LLC) with telephone `+15412865190`, email, nested
  PostalAddress, areaServed, and priceRange.
- Boundary: `/sites/happy-place` (the frozen HPP source) was NOT
  touched. Only the deployed site's served HTML was fetched; HPP stays
  frozen, source archaeology only.

## coppersmith-plumbing/index.html + rss.xml

- Source: `https://www.coppersmithplumbing.com/` (public business website).
- Acquired: 2026-09-21 (HTTP 200). The JSON-LD block is 3,969 chars.
- What it is: a real Rank Math `@graph` block (Place, Plumber +
  Organization, WebSite, ImageObject, WebPage, Person, Article,
  PostalAddress, telephone `970-245-3869`, opening hours, `sameAs`).
  The old dot-path flattener extracted ZERO structured facts from this
  block; it is the failure that started this build.
- Use: public business marketing copy already published by its owner.
  Treated as website-derived evidence with per-fact source tiers, not
  as canonical PING claims.

## Rules for this directory

- Never hand-edit these bytes. If a site changes, re-fetch and note the
  new acquisition date; do not patch the old file to match new tests.
- Tests must assert on semantic extraction (facts, objects,
  relationships), never on byte offsets into these files.
- Private fields (street addresses, precise personal data) found in
  these files are classified private by the pipeline and fail closed;
  they are never written into generated objects. The raw bytes stay on
  disk as test input only.
