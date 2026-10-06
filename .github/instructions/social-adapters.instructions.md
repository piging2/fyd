---
applyTo: "src/fyd/social/**,src/fyd/adapters/**,src/app/api/fyd/social/**,src/fyd/placement/**"
---

# Social / protocol adapters instructions (read-only research lane)

These paths are a READ-ONLY research lane. The question they serve: how can
the same PING object/relationship/capability substrate eventually support
discovery, recommendations, sponsorship, and advertising without turning
FYD into a centralized surveillance ad network.

## Rules

- Research only. No social/ad research code enters the product branch
  unless it directly improves the current FYD proof, is independently
  tested, creates no new authority, preserves canonical boundaries, and
  the coordinator approves the merge.
- Harvest patterns from ActivityPub, ATProto, Nostr, Farcaster, and MCP.
  For each external system ask: what hard problem did they already solve
  that we should not solve again. Return ADOPT / ADAPT / REJECT with
  evidence.
- The canonical object stays PING. Protocol representations are
  projections/adapters, never competing truth. Do not create AdAuthority or
  any new authority.
- Contextual before surveillance. Relevance comes from object context plus
  viewer-allowed context plus explicit relationships plus capabilities plus
  current intent. Do not build covert behavioral dossiers. Do not infer
  sensitive traits for targeting.
- Future model sketch (harvest toward, do not build): Business creates an
  Offer/Object; Campaign references the Offer and declares AudienceIntent;
  Publisher/Node exposes PlacementCapability; a planner matches Campaign x
  Context x Placement; the viewer sees a labeled SPONSORED OBJECT;
  interaction produces an evidence/outcome receipt. Signed offers,
  sponsored-object labeling, campaign objects, audience queries, publisher
  inventory, conversion/outcome receipts, privacy-preserving and contextual
  targeting, capability-based delivery, budget constraints, frequency caps,
  attribution, fraud resistance, and portable reputation are the concepts to
  harvest, reusing PING primitives wherever they actually fit.

## Agent output contract

Return: QUESTION / EVIDENCE / FILES INSPECTED / CODE/HISTORY HARVESTED /
EXTERNAL MATERIAL REVIEWED / ASSUMPTIONS FALSIFIED / RECOMMENDATION /
ADOPT / ADAPT / REJECT / TEST COMMAND / RISKS / NEXT HIGHEST-LEVERAGE
ACTION. No architecture essays without evidence.
