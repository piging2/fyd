# Structured data extraction: architecture note

Lane: `fyd/sitespec-generator`. Status: implemented 2026-09-21.
The failure that started this build: Coppersmith's Rank Math `@graph`
JSON-LD produced ZERO facts through the old dot-path flattener. This
module is the fix.

## 0. Grill addendum compliance (2026-09-21)

1. **No acquisition machinery in this lane.** The pipeline starts at
   the document/observation level: `parse()` / `parseRich()` take an
   `AcquiredSource` (url, sourceType, raw bytes). No fetching, no
   rendering, no browser, no crawler. Browser-rendered acquisition goes
   behind a mature adapter owned by a parallel worker (Crawl4AI /
   Playwright evaluation); this lane consumes what that adapter
   delivers.
2. **Schema.org v30 is input vocabulary, not a class model.** The
   pipeline translates schema.org terms into the smaller PING/FYD
   object semantics (`ping.social.business@1`,
   `ping.social.location@1`, `ping.social.person@1`,
   `ping.social.external_identity@1`, `service`, `product`, plus
   typed relationships). Schema.org type names appear only as routing
   hints inside the translator (which entity becomes which PING
   object); they are never emitted as classes, never subclassed, and
   never reified into a bespoke ontology. The property tables map
   input terms to PING field names; unmapped input is unsupported
   evidence, not a new class.

## 1. Search / harvest results

Searched the repo for any reusable JSON-LD / schema.org processor:
`src/fyd/`, `src/lib/`, `src/app/` contain none. The refresh lane
(`src/fyd/refresh/*`) harvests OG/title meta only and does not solve
JSON-LD. An entity-resolution spike exists at `src/fyd/resolve/spike/*`;
only its URL normalization was reused (vendored, because the spike's
`.ts`-extension imports do not resolve under this lane's Jest config).

Externally, `jsonld` (npm, v9.0.0, pinned exact) is the W3C JSON-LD
processor (digitalbazaar). Decision: ADOPT `jsonld.flatten()` for
expansion. No hand-written `@graph` walker, no hand-written `@id`
resolver, no hand-written multi-type merger. The library owns JSON-LD
semantics; this module owns schema.org-to-PING projection semantics.

## 2. How it works

`src/fyd/proceduralize/structured-data.ts`:

1. **Discover**: regex-free-ish scan for
   `<script type="application/ld+json">` blocks (attribute order tolerant).
   Malformed JSON becomes `unsupported` evidence; it never aborts the
   other blocks.
2. **Expand**: every block is rewritten from the remote
   `https://schema.org` context to an inline `{"@vocab":
   "https://schema.org/"}` context, then `jsonld.flatten()` expands it.
   A block with NO declared `@context` gets the same inline `@vocab`
   as a documented default: JSON-LD embedded in HTML without a context
   is overwhelmingly schema.org, and the property tables only know
   schema.org terms. A wrong-vocabulary block would already be
   unreadable; the default keeps the common case working instead of
   dropping every term.
   The `documentLoader` REFUSES every remote load: it serves only the
   inline `@vocab` document and throws (caught -> unsupported evidence)
   for anything else. Expansion is fully offline; a remote-only context
   term that never reaches us is an honest gap, not a silent fetch.
   The inline-`@vocab` expansion is approximate: aliases and language
   maps behave like schema.org only where JSON-LD core semantics define
   them. Anything the library cannot expand is reported, never guessed.
   (Implementation note, recorded: `jsonld.flatten(input, ctx?,
   options?)` takes the documentLoader in the THIRD argument; passing
   it as the second makes the library read it as a `@context` and
   fail with "@context term values must be strings or objects". Also:
   flatten resolves to a JSON-LD ARRAY of nodes, not an `@graph`
   object; the node extractor handles both.)
3. **Entity candidates**: every expanded node is a candidate. Multi-type
   kept (sorted). `@id` references (`located_at`, `authored_by`,
   `works_for`, ...) become typed `StructuredRelation` rows, never
   strings. Site-chrome nodes (WebSite, WebPage, SearchAction,
   BreadcrumbList, ItemList) are visited and counted, then skipped as
   entities so they do not pollute the business graph.
3b. **Vocabulary gate (fail closed, 2026-09-28)**: before any mapping
   table is consulted, each candidate's observed `@type` IRIs are
   classified by `vocabulary.ts`: inside the schema.org namespace
   (`http(s)://schema.org/`) or unknown. An entity with NO
   schema.org-namespaced type is QUARANTINED: no facts, no
   relationships, no entity record, and no primary-business selection;
   its raw IRIs survive as `unknown-vocabulary` unsupported evidence and
   as entries in the deterministic `reconciliation` work-queue
   projection (derived per call from the evidence, not a store).
   Mixed-vocabulary entities stay canonical on their KNOWN types only;
   the unknown IRIs are preserved as evidence. A foreign-namespace type
   whose suffix matches a schema.org name (e.g.
   `https://evil.example/Plumber`) never compacts to that name, so it
   can never collide with the real term. Microdata `itemtype` values get
   the same gate: foreign-namespace scopes are refused with their
   evidence preserved, never emitted as records. Unknown vocabulary
   never poisons canonical meaning; useful source evidence is never
   discarded.
4. **Blank-node identity**: blank nodes are re-keyed by a canonical
   content hash (`blank:<sha256 of the node's canonical JSON>`), never
   `_:bN` allocation labels. Two runs with the same content in different
   order produce the same keys. This is where determinism lives.
5. **Fact extraction**: per-entity property tables map schema.org terms
   to fact names (`telephone` -> `phone`, `openingHoursSpecification` ->
   `hours`, ...). Unknown properties are NOT dropped silently; they are
   recorded as `unsupported-property` evidence with an escalation rule:
   a property that blocks a FYD field the compiler needs goes to the AI
   escalation path (human-confirmed mapping), everything else stays
   evidence.
6. **Privacy (Grill 19)**: `streetAddress` and `postOfficeBoxNumber`
   facts are tagged `visibility: "private"` at emission. `resolve()` and
   `project()` fail closed on private facts: they never reach resolved
   fields or generated objects. `extractStructuredData` reports
   `stats.privateFactsWithheld` so the drop is auditable. Coarse
   fields (`addressLocality`, `addressRegion`, `postalCode`,
   `addressCountry`) stay `public`; the projection derives a public
   `locality` string from them (`DERIVED_FACT`).
7. **Primary entity**: deterministic pick among Organization /
   LocalBusiness / business-subtype candidates: prefers the entity whose
   `@id` matches the page URL, then the one with a `sameAs` backlink,
   then the one with the most facts, then lexicographic key order.
   Deterministic, no heuristics from content ranking.

## 3. Fact classes (Grill 7)

`proceduralizer.ts` now requires on every `ParsedFact`:
`factClass: DIRECT_FACT | DERIVED_FACT | INFERENCE | GENERATED_COPY | USER_OVERRIDE`
and `visibility: "public" | "private"`. JSON-LD and OG/meta facts are
`DIRECT_FACT`; composed fields (`locality`, RSS `content_item_count`)
are `DERIVED_FACT`. The projected graph carries a per-object
`fieldClasses` sidecar (`graph.fieldClasses[objectId][field] =
factClass`) so the renderer and the compiler can see the epistemic
status of every field they consume.

## 4. Source tiers (Grill 3, 17)

Every fact carries a per-fact `sourceType` (the actual tier), not the
fetch that carried it: `json-ld` outranks `opengraph`, which outranks
`meta`, `structured`, `rss`, `heuristic`. The old bug
(`resolve` preferring og:title over the business name) is fixed by
`SOURCE_TIER` weights; JSON-LD `name` beats og:title even when both
arrive in the same HTML fetch. `@GRAPH VERIFIED` is reported per run
as `stats.nodesVisited` / `stats.nodeIds`: every node the expansion
visited, named.

## 5. Identity authority verdict: KEEP

The canonical PING IdentityAuthority
(`/home/nolan/ping/runtime/authorities/identity_authority.py`) mints
UUIDv7 for canonical identities. FYD's website-derived projection keys
(`biz:<sha256>`, `loc:<sha256>`, relationship IDs) are NOT canonical
PING identities: they must be stable across replay of the same source
material, which UUIDv7 is not. Verdict: **KEEP** the bespoke
deterministic IDs for the projection layer. When a projected entity is
promoted into canonical PING space, identity MUST be minted through the
runtime IdentityAuthority at the promotion boundary. That boundary does
not exist yet; when it is built, this note must be re-grilled.

## 6. Harvested vs hand-written

- Harvested (library): JSON-LD expansion, `@graph` traversal, `@id`
  resolution, multi-type merge, blank-node handling, nested object
  materialization. ~0 new LOC; `jsonld@9.0.0` (exact pin) +
  `@types/jsonld` (dev, exact pin).
- Rejected from library: none needed; `jsonld.toRDF`/framing were
  evaluated and not required.
- Hand-written: discovery, offline context rewriting, site-chrome
  filtering, blank-node content hashing, property->fact tables,
  privacy tagging, primary-entity selection, relationship predicates,
  projection of entities to ping.social objects, pipeline merge,
  determinism tests. Measured 2026-09-21: `structured-data.ts`
  (611 LOC, new), `proceduralizer.ts` delta (831 changed lines against
  the pre-existing file), fixtures (253 LOC: 237 locked fixtures +
  16 verbatim Coppersmith block), tests (605 LOC across the three new
  suites + probe, plus edits to the two pre-existing suites).
- Vendored: URL normalization from the resolve spike (import fails
  under this lane's Jest resolver due the spike's `.ts` extension
  import; vendored verbatim with attribution comment).

## 7. Unsupported semantics (honest gaps)

Recorded as `unsupported` evidence per run, kinds: `malformed-block`,
`expansion-failed` (incl. remote-context refusal), `unsupported-type`
(e.g. FAQPage, HowTo, Review, AggregateRating are visited but not
projected), `unsupported-property` (e.g. `geo`, `review`, `aggregateRating`,
`makesOffer` terms we have no PING field for yet), `site-chrome-node`,
`unknown-relation`, `unmapped-entity`. Anything on this list that the
SiteSpec compiler needs becomes an AI-escalation mapping task; the rest
stays evidence.

## 8. Determinism contract

Same source bytes + same `observedAt` -> byte-identical facts, entity
keys, object IDs, relationships, and reports, across: repeated runs in
one process, different prior ingestions, different fixture orders,
different source orders, a fresh module registry, and separate OS
processes. Proven by `__tests__/structured-determinism.test.ts`
(hostile) and the corpus tests (byte-identical reruns). `observedAt`
is an explicit input; wall-clock time never enters IDs.

## 9. Field rules (no-LLM guarantees)

- `telephone` is used verbatim; never parsed, normalized, or
  reformatted.
- `email` is used verbatim.
- `openingHoursSpecification` dayOfWeek/time ranges are carried as
  `hours` strings.
- `sameAs[]` URLs become `socials` facts, then `external_identity`
  objects + `links_to` relationships. The primary entity's `sameAs`
  flows through page-scope `relate()`; non-primary entities' `sameAs`
  flows through entity projection. Both paths tested.
- Nested `PostalAddress` is a real entity linked by the unified
  `located_at` predicate (both `address` and `location` references map
  to it; identical triples are deduped), not a dot-flattened string.
  Street address is private; the coarse locality is derived public.
- Person entities (`author`, etc.) become `ping.social.person@1`
  objects with `works_for` relationships.
- Service/Product entities become `service`/`product` objects with
  `offers` relationships (provider/offer links).
