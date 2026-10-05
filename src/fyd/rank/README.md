# Discovery rank, sponsored placement, and event boundary

## Existing authority audit

- `object-ranker.ts` already deliberately demoted followed + liked objects; its existing test calls this completed interaction. The arithmetic is unchanged. `relationshipSaturationPenalty` now names that policy. A like alone has no rank boost. This does not mean liking is a negative opinion.
- `object/consequence-classification.ts` classifies `ad.buy` as CRITICAL. `ask/capabilities.ts` denies agent authority for that effect. These authorities are unchanged.
- No campaign, payer-budget, or sponsored-placement model was found in the current `src` tree. UTM campaign attribution is not a campaign authority.
- `types/events.ts` / `lib/events.ts` are HPP marketing events with an in-memory repository. `object/owner-events.ts` records owner decisions. Neither is reused as an assumed FYD discovery Event Authority.

## Concrete unchanged ranking examples

All examples use proximity 0.5, three capabilities, full slot stability, no collision, and no prior interaction unless stated. Base relevance is 0.375. These are fixtures, not production objects.

| Fixture | Relationship | Saturation | Recency | Sponsorship | Organic score | Reason |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Unfollowed / unliked | 0 | 0 | 0 | 0 | 0.375 | Context and available actions |
| Followed | +0.25 | 0 | 0 | 0 | 0.625 | You follow this business |
| Liked | 0 | 0 | 0 | 0 | 0.375 | A like alone does not change rank |
| Followed + liked | +0.25 | -0.30 | 0 | 0 | 0.325 | Reduce repeated discovery after both actions |
| Just interacted | 0 | 0 | +0.15 | 0 | 0.525 | Recent interaction |
| Dismissed | — | — | — | — | Excluded | Suppress this instance; do not convert dismissal to a like |
| Sponsored | 0 | 0 | 0 | 0 | 0.375 | Placement composition changes position, never organic score |

Explanations use actual inputs. A default proximity score cannot claim geographic proximity, category relevance, or even page context. `semanticTargetPresent: true` is required for a page-context reason and for sponsored relevance eligibility. No raw score is needed in user-facing copy.

## Contract and constraints

`SponsoredPlacement` contains placement truth: object reference, campaign reference, payer, disclosure, surface, active dates, and a contextual reason/source. It has no business facts, owner status, evidence, ratings, or relationship fields.

`evaluateSponsoredPlacement` requires an active scoped campaign, payer and disclosure, a non-suppressed relevant candidate with an actual semantic target, a fresh existing-authority decision reference for `ad.buy`, a budget-scope reference, and a fresh private viewer/session frequency snapshot. Missing or expired information fails closed. It emits a narrow immutable branded presentation projection. `getSponsoredPresentation` rejects a different object/surface or expired context, including deep links without the original placement context.

The brand is a compile-time boundary, not a signature. An authority-reference string is not proof of authority. Production must bind trusted campaign, budget, frequency, and policy adapters before supplying these inputs. There is no production campaign fixture, request endpoint, spending function, budget reservation, or automatic persistence here. Revalidate at render and before any future billed event; this projection cannot authorize spend.

`composeObjectPlacements` applies actual-capacity share limits, total sponsored limits, spacing, suppression, and duplicate prevention after organic scoring. Money has no score field. Hidden, dismissed and not-interested inputs are excluded; the relationship repository remains responsible for their scope and duration. Organic order and scores are unchanged when no sponsored candidate is eligible.

## Event integration is explicitly unbound

An impression requires a rendered object, at least 50% visibility, and a foreground document continuously for at least 1 second. Interrupted visits do not accumulate. Each rendered instance emits at most one draft. Candidate generation, ranking and composition emit nothing. A future host collector must feed intersection and document-visibility changes and recheck after the dwell timer. This unit is not browser-verified or wired to a collector.

Distinct user actions are OBJECT_OPEN, OBJECT_CLOSE, WEBSITE_OPEN, FOLLOW, UNFOLLOW, LIKE, UNLIKE, CALL, DIRECTIONS, MESSAGE, ASK_FYD and EVIDENCE_OPEN. They require a trusted pointer/keyboard activation and an interaction ID. Follow/like/call/message intent is a REQUESTED event; it never claims persistence, a completed call, or a sent message. Successful FOLLOWED / UNFOLLOWED / LIKED / UNLIKED events must come from the canonical relationship write result once the Event Authority adapter is resolved.

Drafts retain object, optional eligible placement, surface, correlation, render instance and time. Viewer/session IDs are omitted unless authorized by the existing privacy boundary. `UNBOUND_OBJECT_EVENT_ADAPTER.publish` returns `unbound`; it never reports a receipt, writes a store, or creates a second analytics truth database. The canonical adapter must own durable event identity, dedupe, receipt validation and mutation retry policy. Opening an object is not a billable campaign event by itself.

## Safe parallel reads

Ranking, explanation, placement eligibility and composition are pure for explicit inputs and time. Identity, relationship, evidence and trusted campaign snapshots can be read concurrently after object/viewer/surface context exists. Eligibility waits for rank relevance, authority/budget and private frequency snapshots. Composition waits for eligibility. Render visibility and user actions occur afterward and can never be speculated as impressions, clicks or mutations.
