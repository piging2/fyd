# Lane D: customize-with-FYD

The conversational customization loop:

```
plain-English intent -> typed intent -> deterministic SiteSpec proposal
  -> explicit demo-owner approval -> apply -> render -> persist
```

## Files

- `types.ts` — `ParsedIntent`, `ParseResult`, `UnsupportedIntent`,
  `ResolveResult`, `PresentationIntentDirective`, `PresentationIntentBlock`.
- `intent.ts` — deterministic exact parser plus resolution against the
  site's evidence.
- `propose.ts` — resolved intent -> digest-bound `site_patch` proposal
  (reuses `src/fyd/proceduralize/patch.ts`; no fork of the format).
- `apply-layer.ts` — pure apply of approved directives OVER the compiled
  spec.
- `server.ts` — SERVER ONLY. Projection -> spec -> layered spec; demo
  journal event emission.
- `__tests__/` — intent + apply-layer tests.

## The layer law (frozen)

- **FACTS** (object graph): never written by this lane. An intent that
  would manufacture a factual claim (e.g. "emergency service" when no
  such object exists) resolves to an honest `unresolved`, never a claim.
- **PRESENTATION INTENT** (`PresentationIntentBlock` in the projection,
  journaled as `FYD_SITE_OVERLAY` ops): approved directives applied over
  the compiled spec at render time. Source re-observation rebuilds the
  base; the journal replays on top, so re-observation never deletes
  owner intent. A directive whose target no longer exists is `unresolved`
  (surfaced, kept, not dropped, not guessed).
- **DESIGN SYSTEM** (theme tokens): directives touching it are refused,
  never coerced.

## Journal contract (the PING-side dump honors this)

`FYD_SITE_OVERLAY` events carry `presentation_intent` ops:

```json
{ "op": "set_presentation_intent",
  "intentId": "pi-<16 hex>",
  "siteIntent": { "kind": "reorder_section", ... },
  "proposal": { "kind": "site_patch", "proposalDigest": "...", ... },
  "approval": { "proposalDigest": "...",
                "approvedBy": "demo-owner (seeded, unverified)",
                "approvedAt": "2026-09-21T...Z",
                "note": "DEMO OWNER MODE - not real authentication. ..." } }
{ "op": "clear_presentation_intent", "intentId": "pi-<16 hex>" }
```

The dump validates each op, upserts by `intentId`, fills
`approval.eventId` from the journal event, writes the block under
`presentationIntent`, and digests it as `meta.presentationIntentDigest`
(dumper version `fyd-projection-dump@1.1.0`).

The read seam (`src/fyd/data/ping-object-source.ts`) verifies the block
against `meta.presentationIntentDigest` and fails closed on mismatch,
exactly like the graph digest.

## Demo-owner gate

Approval endpoints (`approve`, `clear`) require:

1. `NEXT_PUBLIC_FYD_DEMO_OWNER_MODE=1`, AND
2. a localhost/private-network Host, AND
3. capability `owner.customize-approve` (deny-by-default; granted only to
   the seeded demo controller).

Every approval response carries the "DEMO OWNER MODE - not real
authentication" marker. Approve re-derives the entire chain from the
text against the current spec and re-verifies every digest; a stale
spec, stale digest, or altered proposal is a 409/422, never an apply.

## What this wave does NOT do

- No customer-specific branches or copy anywhere in the lane.
- No DOM editing, no generated-JSX mutation, no arbitrary CSS.
- No fixture fallback: missing projection data fails honestly.
- No apply before explicit approval.
- "Emergency service" (or any non-evidence target) is never invented.
