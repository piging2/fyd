---
title: "Evidence and provenance for autonomous systems"
date: "2026-09-13"
excerpt: "Never claim what you cannot prove: how PING attaches evidence to claims, grades verification, and makes failures visible instead of silent."
tags: ["evidence", "agents", "principles"]
status: "published"
---

The most dangerous sentence an autonomous system can produce is a confident claim with no backing. Not because the claim is wrong, every system is wrong sometimes, but because a confident unbacked claim gives its supervisor nothing to check. Evidence and provenance are how PING keeps every claim checkable.

## The claim-evidence gap

AI systems are optimized to produce plausible text. Plausible text is not the same as a justified claim, but it is very good at impersonating one. The failure mode:

1. The system asserts something (a fact, a recommendation, a status).
2. The assertion reads well, so nobody checks it.
3. It was wrong, or it was right for the wrong reasons, and the error propagates downstream.

Multiply this by autonomous operation, where nobody reads the output before it acts, and the claim-evidence gap becomes a systemic risk. The fix is not better assertions. It is assertions that carry their backing with them.

## What provenance means in practice

Every claim in PING answers three questions:

- **Where did this come from?** The source: which event, which observation, which artifact, which human.
- **How was it derived?** The transformation: raw observation to extracted statement to verified claim, each step preserved.
- **How confident is it?** Not a vibes-based percentage, but a verification grade from a defined scale.

The grades matter because they make uncertainty operational. A claim graded as verified-by-multiple-sources can drive action. A claim graded as single-unverified-source can drive a follow-up check. A claim graded as failed-verification is not hidden; it is recorded with its failure, so the system and its supervisors can see what did not hold up. Failures are information, not embarrassment.

## Evidence lineage

The unit is the lineage chain:

```
raw artifact
  -> extracted observations (statement + source span + confidence)
  -> per-observation verification
  -> preserved contradictions
  -> verified claim
```

Nothing is discarded along the way. The raw artifact stays. The source span stays. When two observations contradict, both are preserved with their provenance rather than averaged into a comfortable false consensus. A supervisor reviewing a claim can walk the chain backward to the source and forward through the reasoning. That walkability is the difference between trust and faith.

This is also why summaries are treated with suspicion. A summary is a derived artifact; treating it as a substitute for its source is a provenance break. PING keeps the source reachable from every derivation. The summary is for humans; the lineage is for verification.

## Never manufacture certainty

Three rules govern the whole system:

1. **Never turn absence of evidence into evidence of absence.** "No results" and "the search failed" are different states. Reporting the first when the second happened is a lie with a clean interface.
2. **Never hide a failure behind an empty result.** A service failure that renders as an empty list is the system lying to its supervisor. Failures get typed semantics: what failed, where, whether it is retryable, whether state changed.
3. **Never let uncertainty look like confidence.** If the evidence is weak, the claim says so. A system that admits what it does not know is checkable. A system that performs confidence is not.

These rules apply to agents acting autonomously more than anywhere else, because there is no human in the loop to notice the confident tone. The tone is not the claim. The evidence is the claim.

## Evidence as product

For the businesses PING serves, this is not philosophy. It is the difference between "the AI said the job went well" and "here is what happened on the job, with the records." Customers, owners, and regulators all ask the same question eventually: prove it. A system built on evidence and provenance can answer. A system built on plausible text cannot.

Marketing makes the same demand at scale. PING's marketing rule is that claims must be demonstrable: deterministic replay, traceable evidence, explicit provenance. These are not slogans; they are capabilities the architecture actually provides. The strongest marketing asset is a capability that can be demonstrated, and demonstration requires evidence.

Build systems that can show their work. Everything else is performance.
