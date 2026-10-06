#!/usr/bin/env python3
"""P0 W4: proposal record + WAITING_APPROVAL.

Takes a VALIDATED proposal (canonical envelope shape, see
proposal_validate.py), computes the canonical JSON bytes and sha256
digest (via approval_request.canonical_proposal_bytes / proposal_digest:
sorted keys, compact JSON, UTF-8; volatile keys excluded), mints a
deterministic proposal_id from mission_id + digest, and records it through
the canonical ApprovalRequest primitive (request_approval), which emits
MC_APPROVAL_REQUESTED to the journal with status WAITING_APPROVAL.

The digest binds the EXACT bytes. No normalization happens after
digesting: the stored proposal body is the canonicalized form that was
digested.

Digest-boundary rule: canonicalization (sorted keys, compact separators)
is the ONE normalization step, and it happens BEFORE the digest. Anything
after the digest is byte-identical or it is a different proposal.
"""

import hashlib
import os
import sys

_THIS = os.path.dirname(os.path.abspath(__file__))
if _THIS not in sys.path:
    sys.path.insert(0, _THIS)

from approval_request import (  # noqa: E402
    ApprovalStore,
    canonical_proposal_bytes,
    proposal_digest,
    request_approval,
    WAITING,
)

# Consequence class for a website presentation patch awaiting owner
# approval: fully reversible, no external effect until applied, no money,
# publication only through the owner's explicit approve step.
PATCH_CONSEQUENCE = {
    "reversibility": "reversible",
    "external_effect": "none-until-applied",
    "money": "0",
    "publication": "owner-gated",
    "privacy": "none",
    "credential_access": "none",
    "destructive_scope": "none",
    "commitment": "none",
}

CAPABILITY = "fyd.sitespec.patch"


def mint_proposal_id(mission_id, digest):
    """Deterministic proposal id from mission_id + proposal digest."""
    seed = "proposal|%s|%s" % (mission_id, digest)
    return "p0prop-" + hashlib.sha256(seed.encode("utf-8")).hexdigest()[:16]


def record_proposal(proposal, mission_id, store_path, journal_file,
                    actor="p0-writer-w4", summary="", why="", now=None,
                    dry_run=False, tenant=None):
    """Record a validated proposal. Returns the record dict.

    proposal must already have passed proposal_validate.py; this function
    does not re-validate semantics, it binds bytes.

    P0-2 (2026-09-30): tenant is immutable proposal context, bound here at
    creation and passed through to request_approval. tenant=None marks a
    legacy record without tenant provenance (fails closed on approve).
    The tenant string comes from the existing operator-provisioned caller
    registry; this function never invents or resolves tenant identity.
    """
    if not isinstance(proposal, dict) or not proposal:
        return {"ok": False, "reason": "invalid_proposal"}
    digest = proposal_digest(proposal)
    proposal_id = mint_proposal_id(mission_id, digest)
    store = ApprovalStore(store_path)
    result = request_approval(
        store,
        proposal,
        capability=CAPABILITY,
        actor=actor,
        consequence=dict(PATCH_CONSEQUENCE),
        summary=summary or "FYD presentation patch for %s" % mission_id,
        why=why or "Agent-proposed SiteSpec presentation change awaiting "
                   "owner approval; validated against the FYDPresentation "
                   "contract.",
        journal_file=journal_file,
        now=now,
        dry_run=dry_run,
        approval_id=proposal_id,
        tenant=tenant,
    )
    if not result.get("ok"):
        return result
    rec = result["record"]
    return {
        "ok": True,
        "created": result.get("created"),
        "proposal_id": proposal_id,
        "digest": digest,
        "status": rec["status"],
        "tenant": rec.get("tenant"),
        "expected_waiting": WAITING,
        "canonical_bytes": canonical_proposal_bytes(proposal).decode("utf-8"),
        "event": result.get("event"),
        "how": result.get("how"),
    }
