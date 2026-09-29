#!/usr/bin/env python3
"""Canonical ApprovalRequest primitive (ORCA + Mission Control convergence).

Batch-6 adjudication (Nolan, 2026-09-26, authoritative), APPROVAL SURFACE:

    ApprovalRequest { id, proposal_digest, capability, actor,
                      consequence, expires_at? }

    Chat:            approve(id)
    Mission Control: approve(id)

    Both invoke the SAME authorization transition. Neither surface owns
    approval.

Generalized from FYD's owner proposal/approve/apply envelope
(fyd-build/src/fyd/owner/apply.ts + fyd-build/src/fyd/proceduralize/patch.ts):
a proposal is canonicalized (sorted keys, volatile keys excluded),
sha256 digest-pinned, and only the EXACT digest can be approved.

Constitutional invariants enforced here (fail closed):
- An approval BINDS AN EXACT DIGEST. approve() requires the approval id
  AND the expected digest. A digest mismatch refuses without a state
  change. There is no approve-latest / approve-newest: an ambiguous "yes"
  cannot resolve to a request by construction.
- SILENCE IS NEVER APPROVAL. No timer, retry, or expiry path transitions
  to APPROVED. Ever.
- Expiry maps to EXPIRED / DENIED / CANCELLED / SAFE_NOOP per
  mission-class policy (default HOLD -> EXPIRED). There is NO
  EXPIRE_APPROVE type, constant, or branch anywhere in this file, and
  none may be added.
- Approval state is SERVER-CONTROLLED: the ApprovalStore file is the
  authority. Client-supplied state is never trusted. Every transition
  appends a typed MC_APPROVAL_* event to the PING journal (audit trail);
  events carry digests and metadata, never raw sensitive payloads
  (Batch 6: append-only does not mean store everything forever).
"""

import hashlib
import json
import os
import time
from datetime import datetime, timezone

try:
    from emit import emit_approval_event
except ImportError:  # pragma: no cover - defensive for odd import orders
    emit_approval_event = None


# ---------------------------------------------------------------------------
# Vocabulary.
# ---------------------------------------------------------------------------

# Consequence class keys, Batch-6 constitutional correction. Consequence is
# POLICY INPUT to the capability/authorization path, never a new authority.
CONSEQUENCE_KEYS = frozenset({
    "reversibility",
    "external_effect",
    "money",
    "publication",
    "privacy",
    "credential_access",
    "destructive_scope",
    "commitment",
})

# Volatile keys excluded from the digest (mirrors FYD patch.ts).
VOLATILE_KEYS = frozenset({"proposal_digest", "requested_at", "nonce"})

WAITING = "WAITING_APPROVAL"
APPROVED = "APPROVED"
DENIED = "DENIED"
EXPIRED = "EXPIRED"
CANCELLED = "CANCELLED"
SAFE_NOOP = "SAFE_NOOP"

TERMINAL = frozenset({APPROVED, DENIED, EXPIRED, CANCELLED, SAFE_NOOP})

# Mission-class expiry policy -> terminal outcome. Default HOLD.
# Deliberately: no policy maps to APPROVED. Silence is never approval.
EXPIRY_POLICY_OUTCOMES = {
    "HOLD": EXPIRED,
    "EXPIRE_DENY": DENIED,
    "EXPIRE_CANCEL": CANCELLED,
    "EXPIRE_REPLAN": SAFE_NOOP,
}


# ---------------------------------------------------------------------------
# Canonical digest (MC APPROVAL domain).
#
# SIBLING CANONICALIZER (do not mix up): src/fyd/proceduralize/patch.ts
# proposalDigest serves the FYD overlay / site_patch domain, not the MC
# approval domain. The two digests cover different bytes: this one digests
# the MC ApprovalRequest proposal body; the TS one digests the
# overlay-format SitePatchBody. Both are correct; neither verifies the
# other, and feeding one domain's bytes to the other's canonicalizer
# produces a valid-looking but WRONG digest.
#
# The two agree on pure-ASCII input but differ by design: (1) volatile
# exclusion sets differ in naming and membership (here:
# proposal_digest/requested_at/nonce; there:
# proposalDigest/createdAt/generatedAt/nonce); (2) here ensure_ascii=True
# escapes non-ASCII to \uXXXX while there JSON.stringify keeps non-ASCII
# raw; (3) key sort is Unicode code points here vs UTF-16 code units
# there, which diverges only for astral characters.
# Cross-check: src/fyd/proceduralize/__tests__/canonicalizer-agreement.test.ts.
# ---------------------------------------------------------------------------

def _canonicalize(value):
    if value is None:
        return None
    if isinstance(value, (list, tuple)):
        return [_canonicalize(v) for v in value]
    if isinstance(value, dict):
        out = {}
        for key in sorted(value.keys()):
            if key in VOLATILE_KEYS:
                continue
            out[key] = _canonicalize(value[key])
        return out
    return value


def canonical_proposal_bytes(proposal):
    """Canonical bytes of a proposal: sorted keys, compact JSON, UTF-8."""
    if not isinstance(proposal, dict) or not proposal:
        raise ValueError("proposal must be a non-empty dict")
    return json.dumps(
        _canonicalize(proposal),
        separators=(",", ":"),
        ensure_ascii=True,
    ).encode("utf-8")


def proposal_digest(proposal):
    """sha256 hex of the canonical proposal bytes (FYD patch.ts pattern)."""
    return hashlib.sha256(canonical_proposal_bytes(proposal)).hexdigest()


def _mint_id(digest, capability, actor, seq):
    seed = "|".join([digest, capability, actor, str(seq)])
    return "apr-" + hashlib.sha256(seed.encode("utf-8")).hexdigest()[:16]


# ---------------------------------------------------------------------------
# Clock.
# ---------------------------------------------------------------------------

def _epoch(now):
    return time.time() if now is None else float(now)


def _iso(epoch):
    return datetime.fromtimestamp(epoch, tz=timezone.utc).strftime(
        "%Y-%m-%dT%H:%M:%SZ")


def _parse_iso(value):
    return datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ").replace(
        tzinfo=timezone.utc).timestamp()


def _normalize_expires_at(expires_at):
    if expires_at is None:
        return None
    if isinstance(expires_at, (int, float)):
        return _iso(float(expires_at))
    if isinstance(expires_at, str):
        _parse_iso(expires_at)  # validates format
        return expires_at
    raise ValueError("expires_at must be epoch seconds or an ISO-8601 UTC string")


# ---------------------------------------------------------------------------
# Server-controlled durable store.
# ---------------------------------------------------------------------------

class ApprovalStore:
    """Server-side approval state. The file is the authority; client
    claims about state are never trusted. Writes are atomic
    (temp file + rename)."""

    def __init__(self, path):
        self.path = path
        self._records = {}
        self._load()

    def _load(self):
        if not os.path.exists(self.path):
            return
        with open(self.path, encoding="utf-8") as f:
            data = json.load(f)
        records = data.get("records", {})
        if isinstance(records, dict):
            self._records = records

    def _save(self):
        parent = os.path.dirname(self.path)
        if parent:
            os.makedirs(parent, exist_ok=True)
        tmp = self.path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump({"records": self._records}, f, sort_keys=True, indent=2)
            f.write("\n")
        os.replace(tmp, self.path)

    def get(self, approval_id):
        return self._records.get(approval_id)

    def all(self):
        return dict(self._records)

    def put(self, record):
        self._records[record["id"]] = record
        self._save()


def _validate_consequence(consequence):
    if not isinstance(consequence, dict):
        raise ValueError("consequence must be a dict")
    unknown = set(consequence.keys()) - CONSEQUENCE_KEYS
    if unknown:
        raise ValueError("unknown consequence keys: %s" % sorted(unknown))
    return dict(consequence)


# ---------------------------------------------------------------------------
# request / propose -> WAITING_APPROVAL.
# ---------------------------------------------------------------------------

def request_approval(store, proposal, capability, actor, consequence,
                     summary="", why="", cost=None, expires_at=None,
                     expiry_policy="HOLD", now=None, journal_file=None,
                     dry_run=False, approval_id=None):
    """Propose something that needs human authorization.

    Creates an ApprovalRequest in WAITING_APPROVAL and emits
    MC_APPROVAL_REQUESTED. Idempotent: an identical WAITING request for the
    same (proposal_digest, capability, actor) returns the existing record
    instead of creating a duplicate.

    p0/approval adaptation (2026-09-27): callers may pass approval_id to pin
    the record id deterministically (e.g. derived from mission_id +
    proposal digest). When the pinned id already exists, the existing record
    is returned (idempotent). Otherwise the id is minted as before.
    """
    if not capability or not isinstance(capability, str):
        return {"ok": False, "reason": "missing_capability"}
    if not actor or not isinstance(actor, str):
        return {"ok": False, "reason": "missing_actor"}
    if expiry_policy not in EXPIRY_POLICY_OUTCOMES:
        return {"ok": False, "reason": "unknown_expiry_policy",
                "policy": expiry_policy}
    try:
        digest = proposal_digest(proposal)
        consequence = _validate_consequence(consequence)
        expires_iso = _normalize_expires_at(expires_at)
    except ValueError as e:
        return {"ok": False, "reason": "invalid_request", "error": str(e)}

    for rec in store.all().values():
        if (rec["status"] == WAITING
                and rec["proposal_digest"] == digest
                and rec["capability"] == capability
                and rec["actor"] == actor):
            return {"ok": True, "created": False, "record": rec,
                    "event": None, "how": "existing"}

    if approval_id:
        if not isinstance(approval_id, str) or not approval_id.strip():
            return {"ok": False, "reason": "invalid_request",
                    "error": "approval_id must be a non-empty string"}
        existing = store.get(approval_id)
        if existing is not None:
            return {"ok": True, "created": False, "record": existing,
                    "event": None, "how": "existing-pinned-id"}
        record_id = approval_id
    else:
        seq = sum(1 for r in store.all().values()
                  if r["proposal_digest"] == digest
                  and r["capability"] == capability
                  and r["actor"] == actor)
        record_id = _mint_id(digest, capability, actor, seq)
    requested_at = _iso(_epoch(now))
    record = {
        "id": record_id,
        "proposal_digest": digest,
        # Full proposal body lives in the server store only. Journal events
        # carry the digest + metadata, never the raw body (Batch 6: audit
        # metadata vs erasable payload).
        "proposal": _canonicalize(proposal),
        "capability": capability,
        "actor": actor,
        "consequence": consequence,
        "summary": summary,
        "why": why,
        "cost": cost,
        "status": WAITING,
        "requested_at": requested_at,
        "expires_at": expires_iso,
        "expiry_policy": expiry_policy,
        "decided_at": None,
        "decided_by": None,
    }
    store.put(record)
    event, how = _emit("MC_APPROVAL_REQUESTED", record["id"], {
        "proposal_digest": digest,
        "capability": capability,
        "actor": actor,
        "consequence": consequence,
        "summary": summary,
        "why": why,
        "cost": cost,
        "expires_at": expires_iso,
        "expiry_policy": expiry_policy,
        "stamp": requested_at,
    }, journal_file, dry_run)
    return {"ok": True, "created": True, "record": record,
            "event": event, "how": how}


# ---------------------------------------------------------------------------
# The single canonical authorization transition.
# ---------------------------------------------------------------------------

def authorize_approval_transition(store, approval_id, approver_identity,
                                  expected_digest, now=None,
                                  journal_file=None, dry_run=False):
    """THE authorization transition. Both surfaces (chat adapter, Mission
    Control adapter) call this function and no other.

    Verifies the expected digest against the server record, then performs
    the WAITING_APPROVAL -> APPROVED transition exactly once. Refuses
    (typed, no state change) on: unknown id, expired request, wrong state,
    or digest mismatch. Double-approve with the correct digest is
    idempotent-safe (no second event).
    """
    if not approval_id or not approver_identity or not expected_digest:
        return {"ok": False, "reason": "missing_argument",
                "error": "approval_id, approver_identity, and "
                         "expected_digest are all required"}
    rec = store.get(approval_id)
    if rec is None:
        return {"ok": False, "reason": "unknown_id", "id": approval_id}

    epoch = _epoch(now)
    if rec["expires_at"] and epoch >= _parse_iso(rec["expires_at"]):
        # Expired: expiry evaluation decides. Never approval.
        expiry = evaluate_expiry(store, approval_id, now=epoch,
                                 journal_file=journal_file, dry_run=dry_run)
        return {"ok": False, "reason": "expired",
                "expiry_outcome": expiry.get("outcome")}

    if rec["status"] == APPROVED:
        if expected_digest == rec["proposal_digest"]:
            return {"ok": True, "idempotent": True, "record": rec,
                    "event": None, "how": "already-approved"}
        event, how = _emit("MC_APPROVAL_REFUSED", approval_id, {
            "proposal_digest": rec["proposal_digest"],
            "reason": "digest_mismatch",
            "detail": "request already approved; presented digest differs",
            "stamp": _iso(epoch),
        }, journal_file, dry_run)
        return {"ok": False, "reason": "digest_mismatch",
                "status": APPROVED, "event": event, "how": how}

    if rec["status"] != WAITING:
        event, how = _emit("MC_APPROVAL_REFUSED", approval_id, {
            "proposal_digest": rec["proposal_digest"],
            "reason": "wrong_state",
            "status": rec["status"],
            "stamp": _iso(epoch),
        }, journal_file, dry_run)
        return {"ok": False, "reason": "wrong_state",
                "status": rec["status"], "event": event, "how": how}

    if expected_digest != rec["proposal_digest"]:
        # The approval binds an EXACT digest. Refuse; no state change.
        event, how = _emit("MC_APPROVAL_REFUSED", approval_id, {
            "proposal_digest": rec["proposal_digest"],
            "reason": "digest_mismatch",
            "stamp": _iso(epoch),
        }, journal_file, dry_run)
        return {"ok": False, "reason": "digest_mismatch",
                "event": event, "how": how}

    rec["status"] = APPROVED
    rec["decided_at"] = _iso(epoch)
    rec["decided_by"] = approver_identity
    store.put(rec)
    event, how = _emit("MC_APPROVAL_APPROVED", approval_id, {
        "proposal_digest": rec["proposal_digest"],
        "expected_digest": expected_digest,
        "capability": rec["capability"],
        "actor": rec["actor"],
        "approver_identity": approver_identity,
        "stamp": rec["decided_at"],
    }, journal_file, dry_run)
    return {"ok": True, "idempotent": False, "record": rec,
            "event": event, "how": how}


def deny_approval(store, approval_id, approver_identity, reason="",
                  now=None, journal_file=None, dry_run=False):
    """Typed denial: WAITING_APPROVAL -> DENIED + MC_APPROVAL_DENIED."""
    if not approval_id or not approver_identity:
        return {"ok": False, "reason": "missing_argument"}
    rec = store.get(approval_id)
    if rec is None:
        return {"ok": False, "reason": "unknown_id", "id": approval_id}
    if rec["status"] != WAITING:
        return {"ok": False, "reason": "wrong_state",
                "status": rec["status"]}
    epoch = _epoch(now)
    rec["status"] = DENIED
    rec["decided_at"] = _iso(epoch)
    rec["decided_by"] = approver_identity
    store.put(rec)
    event, how = _emit("MC_APPROVAL_DENIED", approval_id, {
        "proposal_digest": rec["proposal_digest"],
        "capability": rec["capability"],
        "actor": rec["actor"],
        "approver_identity": approver_identity,
        "reason": reason,
        "stamp": rec["decided_at"],
    }, journal_file, dry_run)
    return {"ok": True, "record": rec, "event": event, "how": how}


# ---------------------------------------------------------------------------
# Expiry: EXPIRED / DENIED / CANCELLED / SAFE_NOOP. Never approval.
# ---------------------------------------------------------------------------

def evaluate_expiry(store, approval_id, now=None, journal_file=None,
                    dry_run=False):
    """Evaluate expiry for one request.

    A WAITING request past expires_at transitions to the terminal outcome
    of its mission-class expiry policy (default HOLD -> EXPIRED).
    No policy, path, or silence ever transitions to APPROVED.
    """
    rec = store.get(approval_id)
    if rec is None:
        return {"ok": False, "reason": "unknown_id", "id": approval_id}
    if rec["status"] != WAITING:
        return {"ok": True, "transitioned": False, "status": rec["status"]}
    epoch = _epoch(now)
    if not rec["expires_at"] or epoch < _parse_iso(rec["expires_at"]):
        return {"ok": True, "transitioned": False, "status": WAITING}
    outcome = EXPIRY_POLICY_OUTCOMES[rec["expiry_policy"]]
    # Hard invariant, in code as well as in prose: expiry never approves.
    assert outcome != APPROVED, "expiry policy must never map to APPROVED"
    rec["status"] = outcome
    rec["decided_at"] = _iso(epoch)
    rec["decided_by"] = "expiry-policy:" + rec["expiry_policy"]
    store.put(rec)
    event, how = _emit("MC_APPROVAL_EXPIRED", approval_id, {
        "proposal_digest": rec["proposal_digest"],
        "capability": rec["capability"],
        "actor": rec["actor"],
        "outcome": outcome,
        "expiry_policy": rec["expiry_policy"],
        "stamp": rec["decided_at"],
    }, journal_file, dry_run)
    return {"ok": True, "transitioned": True, "outcome": outcome,
            "record": rec, "event": event, "how": how}


# ---------------------------------------------------------------------------
# Projection: WHAT IS WAITING FOR ME?
# ---------------------------------------------------------------------------

def list_waiting_approvals(store, now=None, journal_file=None,
                           dry_run=False):
    """WAITING_APPROVAL projection for Mission Control.

    Answers: what / why / who / cost / consequence / waiting-since.
    Expiry is evaluated first (a clock fact, never a guess), so an expired
    request never renders as waiting.
    """
    epoch = _epoch(now)
    rows = []
    for rec in sorted(store.all().values(),
                      key=lambda r: r["requested_at"]):
        if rec["status"] != WAITING:
            continue
        ev = evaluate_expiry(store, rec["id"], now=epoch,
                             journal_file=journal_file, dry_run=dry_run)
        if ev.get("transitioned"):
            continue
        rows.append({
            "id": rec["id"],
            "what": rec["summary"],
            "why": rec["why"],
            "who": rec["actor"],
            "cost": rec["cost"],
            "consequence": rec["consequence"],
            "capability": rec["capability"],
            "proposal_digest": rec["proposal_digest"],
            "waiting_since": rec["requested_at"],
            "expires_at": rec["expires_at"],
        })
    return rows


# ---------------------------------------------------------------------------
# Internal.
# ---------------------------------------------------------------------------

def _emit(event_type, approval_id, data, journal_file, dry_run):
    if emit_approval_event is None:  # pragma: no cover
        raise RuntimeError("emit_approval_event unavailable")
    return emit_approval_event(event_type, approval_id, data,
                               journal_file=journal_file, dry_run=dry_run)
