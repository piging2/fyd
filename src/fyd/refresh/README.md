# FYD refresh lane: temporal observation, conflict, diff, dependency index

Owner: temporal-refresh agent. One-writer rule: this lane owns new files under
`src/fyd/refresh/` only. Sibling lanes own `src/fyd/proceduralize|sitespec|components`
(SiteSpec generator) and `src/fyd/ask` (Ask FYD). Do not edit their areas.

## What this lane does

1. **Second-source ingestion** (`website-observe.ts`, `facebook-source.ts`).
   The website adapter turns a fetched page into claims graded
   `website_statement`. The Facebook adapter checks availability
   (`checkFacebookAvailability`), keeps the real ingest path wired
   (`fromFacebookCliJson`, for the day an authorized page ID exists), and
   provides a clearly-labeled synthetic fixture for proving the conflict
   machinery tonight.
2. **Conflict as a feature** (`conflict.ts`). Same entity, same field,
   different normalized value, different source: one Conflict record, both
   claims kept with provenance, human-readable `surfaceText`, status stays
   `open` until a human resolves it. Resolution records the decision; the
   losing claim is never deleted.
3. **Temporal diff** (`diff.ts`). Snapshot-to-snapshot comparison producing
   typed change records (added/removed/changed with before/after claims).
   Identical snapshots produce an empty array, reported honestly as
   "no changes detected".
4. **Dependency index** (`dependency-index.ts`). `object_id -> [section ids]`.
   Changing one object invalidates only its registered sections. The SiteSpec
   generator lane owns the rendered section registry; this index consumes it
   through `merge()` at render time. `pagesForSections` turns invalidated
   sections into the pages to regenerate.
5. **Runner** (`run-t2.ts`). Reads a fetched page from disk, builds the
   observation, persists a snapshot, diffs against the previous snapshot,
   runs conflict detection, prints a JSON report. No journal writes.

## Tonight's findings (2026-09-21)

- Facebook: genuinely unavailable for this entity. The website publishes no
  Facebook link; an authorized social.search sweep on Facebook for
  "Happy Place Carpentry" (Corvallis, OR) surfaced only unrelated "happy
  place" woodworking content; facebook-cli is not installed on the Pig and
  sandbox-side reads require a page/profile ID from prior authorized output,
  which does not exist. Conflict machinery is proved on a labeled synthetic
  fixture instead. No fake accounts, no impersonation, no invented data.
- T2 observation of https://happy-place-platform.vercel.app/ completed
  2026-09-21 ~11:25 UTC. The T1 baseline (the 19 journal events at sequences
  65-83) lives in the PING journal behind gateway auth this lane does not
  hold, so the T1->T2 comparison is not runnable here; the T2 snapshot is
  persisted as the baseline for future runs, and the diff machinery is proved
  on a controlled synthetic variant, clearly labeled.

## Running the tests

Node's built-in runner (repo jest has no TS transform configured):

```
node --test src/fyd/refresh/__tests__/*.test.ts
```

## Running the T2 refresh

```
npx tsx src/fyd/refresh/run-t2.ts /path/to/fetched.html src/fyd/refresh/snapshots
```

The runner never fetches over the network itself; feed it bytes you fetched.

## Next valuable improvement

Wire the real Facebook ingest the day an authorized page ID exists: call
`fromFacebookCliJson` with parsed facebook-cli output and drop the synthetic
fixture from the runner. Then promote conflict resolution into the Ask FYD
proposal flow so a resolved conflict drafts a governed site_patch proposal
through the existing human-approval path.
