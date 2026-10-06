#!/usr/bin/env python3
"""Mission Control emit helper (spine lane: engagement-pipeline convergence).

Appends typed MC_* events to the EXISTING append-only PING journal
(fyd-journal-gateway/events.jsonl by default). This is the only write path:
no new store, no new event table. MC events ride the journal's stream model
(event_type MC_*), so existing FYD_SITE_OVERLAY readers are unaffected.

Convergence note (2026-09-26): this module's MC_EVENT_TYPES vocabulary and
the lane/backfill emit_event() signature are shared with the lane-D MC
surface work (same type set, same envelope, same duplicate-refusal
discipline). The two files must be merged, not forked: any new MC_* type
registered here must also exist there and vice versa. The pass-oriented
helpers below (emit_pass_event) are this lane's additive contribution.

Event envelope mirrors the journal's contract:
  {event_id, timestamp, event_type, aggregate_id, aggregate_type, event_data}

Pass events (MC_PASS_*) are built by
outreach/pass_policy_engine.pass_event(): event_id is content-derived
(mc-pass- + 12 hex of sha256 over pass_id|platform|event_type|
canonical(event_data); event_data already binds platform and pass_id, so
the extra platform component in the seed is a redundant binding, not a
collision risk), which makes emission idempotent: a retried stage
re-emits the identical event and the journal keeps one copy (emit refuses
duplicate event_ids).

For backfill events, timestamp = import_timestamp (acceptance), and the
historical triple (source/observation/import) lives inside event_data along
with source_artifact, confidence, and the explicit backfill marker.

Spec: ~/workspace/orca-mc-convergence/PASS-HEALTH-EVENT-SCHEMA.md
"""

import argparse
import hashlib
import json
import os
import sys
from datetime import datetime, timezone

_HERE = os.path.dirname(os.path.abspath(__file__))
_OUTREACH = os.path.normpath(os.path.join(_HERE, "..", "outreach"))
if _OUTREACH not in sys.path:
    sys.path.insert(0, _OUTREACH)
import pass_policy_engine as _PE  # noqa: E402

JOURNAL_FILE = os.environ.get(
    "MC_JOURNAL_FILE",
    os.path.expanduser("~/workspace/fyd-journal-gateway/events.jsonl"),
)

MC_EVENT_TYPES = {
    "MC_LANE_STARTED", "MC_CHECKPOINT", "MC_GATE_RESULT",
    "MC_ARTIFACT_PUBLISHED", "MC_HOLD_RAISED", "MC_HOLD_CLEARED",
    "MC_ESCALATION", "MC_LANE_COMPLETED", "MC_LANE_FAILED", "MC_HEARTBEAT",
    # Engagement-pipeline pass-health events (2026-09-26, engagement
    # convergence track). One per pipeline stage; see
    # ~/workspace/orca-mc-convergence/PASS-HEALTH-EVENT-SCHEMA.md.
    # Additive only: no existing caller is affected.
    "MC_PASS_STARTED", "MC_PASS_DISCOVERY_TIMEOUT", "MC_PASS_DISCOVERY_RETRY",
    "MC_PASS_DISCOVERY_DONE", "MC_PASS_CANDIDATES", "MC_PASS_MANIFEST",
    "MC_PASS_INTENTS", "MC_PASS_EXECUTION_DONE", "MC_PASS_RESTRICTION",
    "MC_PASS_OBSERVATION", "MC_PASS_VERIFY", "MC_PASS_RECOVERY",
    "MC_PASS_ABORTED", "MC_PASS_CLOSED",
    # Audit/PII separation events (2026-09-26, mc/audit-payload-lifecycle).
    # DATA_ERASURE_COMPLETED carries subject_digest + policy, never the raw
    # subject. PAYLOAD_REDACTED marks content replaced behind a reference.
    # Additive only: no existing caller is affected.
    "DATA_ERASURE_COMPLETED", "PAYLOAD_REDACTED",
    # MissionIntent front-door lifecycle events (2026-09-27,
    # mc/sprint-integration-2026-09-27; hardened on mc/frontdoor-hardening
    # @ ddd60eb and mc/tenant-hardening @ 38c7ad0). MC_LANE_UNKNOWN is the
    # unknown-outcome terminal (H5b); MC_REVOKED / REVOKED_AFTER_DISPATCH
    # are the revocation lifecycle (H7); MC_WORK_ORDER_ISSUED is the
    # authority-produced issuance record terminals chain to. Additive only:
    # no existing caller is affected.
    "MC_LANE_UNKNOWN", "MC_REVOKED", "REVOKED_AFTER_DISPATCH",
    "MC_WORK_ORDER_ISSUED",
    # Canonical approval primitive (2026-09-26, mc/approval-request lane,
    # Batch-6 APPROVAL SURFACE + APPROVAL TIMEOUT; harvested into p0/approval
    # 2026-09-27). Chat and Mission Control resolve the SAME ApprovalRequest
    # through the same transition. Additive only: no existing caller is
    # affected.
    # NOTE: there is deliberately NO auto-approve / EXPIRE_APPROVE type.
    # Silence is never approval.
    "MC_APPROVAL_REQUESTED", "MC_APPROVAL_APPROVED", "MC_APPROVAL_DENIED",
    "MC_APPROVAL_EXPIRED", "MC_APPROVAL_REFUSED",
}

# The pass-health subset, for the pass-oriented helpers.
MC_PASS_EVENT_TYPES = frozenset(
    t for t in MC_EVENT_TYPES if t.startswith("MC_PASS_"))

# The approval subset, for the approval-oriented helpers.
MC_APPROVAL_EVENT_TYPES = frozenset(
    t for t in MC_EVENT_TYPES if t.startswith("MC_APPROVAL_"))


def mint_event_id(lane, event_type, source_timestamp, summary):
    seed = "|".join([lane, event_type, source_timestamp, summary])
    return "mc-bf-" + hashlib.sha256(seed.encode("utf-8")).hexdigest()[:12]


def mint_approval_event_id(approval_id, event_type, proposal_digest, stamp):
    seed = "|".join([approval_id, event_type, proposal_digest, stamp])
    return "mc-apr-" + hashlib.sha256(seed.encode("utf-8")).hexdigest()[:16]


def existing_event_ids(path):
    ids = set()
    if not os.path.exists(path):
        return ids
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                ids.add(json.loads(line)["event_id"])
            except (json.JSONDecodeError, KeyError):
                continue
    return ids


def _append(event, journal_file, dry_run=False):
    if event["event_id"] in existing_event_ids(journal_file):
        return event, "duplicate-skipped"
    if not dry_run:
        with open(journal_file, "a", encoding="utf-8") as f:
            f.write(json.dumps(event, sort_keys=True) + "\n")
    return event, "appended"


def emit_event(event_type, lane, summary, source_timestamp,
               observation_timestamp, import_timestamp, source_artifact,
               confidence="MEDIUM", status=None, backfill=True,
               evidence_link=None, journal_file=None, dry_run=False):
    """Lane/backfill emission (shared signature with the lane-D MC surface).

    Returns (event, "appended" | "duplicate-skipped"). Raises ValueError on
    an unregistered event type.
    """
    if event_type not in MC_EVENT_TYPES:
        raise ValueError("unknown MC event type: %r" % event_type)
    journal_file = journal_file or JOURNAL_FILE
    event_id = mint_event_id(lane, event_type, source_timestamp, summary)
    event = {
        "event_id": event_id,
        "timestamp": import_timestamp,  # acceptance time in the journal
        "event_type": event_type,
        "aggregate_id": "mc:lane:%s" % lane,
        "aggregate_type": "mc_lane",
        "event_data": {
            "lane": lane,
            "backfill": bool(backfill),
            "source_timestamp": source_timestamp,
            "observation_timestamp": observation_timestamp,
            "import_timestamp": import_timestamp,
            "source_artifact": source_artifact,
            "confidence": confidence,
            "status": status,
            "summary": summary,
            "evidence_link": evidence_link,
        },
    }
    return _append(event, journal_file, dry_run=dry_run)


def emit_pass_event(event_type, pass_id, platform, data,
                    journal_file=None, dry_run=False):
    """Emit one MC_PASS_* event for an engagement pass.

    The envelope is built by pass_policy_engine.pass_event (content-derived
    event_id, aggregate mc:pass:<platform>:<pass_id>), so emission is
    idempotent across observer retries. Returns
    (event, "appended" | "duplicate-skipped"). Raises ValueError on a
    non-MC_PASS_* type.

    Phase-1 contract: the observer calls this AFTER the pass ran, folding
    the pass's real artifacts. It never changes what the pass decided.
    """
    if event_type not in MC_PASS_EVENT_TYPES:
        raise ValueError("pass events must be MC_PASS_*, got %r"
                         % event_type)
    journal_file = journal_file or JOURNAL_FILE
    event = _PE.pass_event(pass_id, platform, event_type, data)
    return _append(event, journal_file, dry_run=dry_run)


def emit_pass_events(events, journal_file=None, dry_run=False):
    """Emit an ordered list of (event_type, pass_id, platform, data)
    tuples. Returns a list of (event, how) results."""
    return [emit_pass_event(t, p, plat, d, journal_file=journal_file,
                            dry_run=dry_run)
            for (t, p, plat, d) in events]


def emit_approval_event(event_type, approval_id, data,
                        journal_file=None, dry_run=False):
    """Emit one MC_APPROVAL_* event for an approval request.

    Envelope matches the journal contract
    {event_id, timestamp, event_type, aggregate_id, aggregate_type,
    event_data}; aggregate is mc:approval:<id>. event_id is
    content-derived (approval id + type + digest + decision stamp), so
    re-emission of the same transition is idempotent.

    event_data carries digests and metadata only, never the raw proposal
    body (Batch 6: audit metadata vs erasable payload).

    Returns (event, "appended" | "duplicate-skipped"). Raises ValueError
    on a non-MC_APPROVAL_* type.
    """
    if event_type not in MC_APPROVAL_EVENT_TYPES:
        raise ValueError("approval events must be MC_APPROVAL_*, got %r"
                         % event_type)
    journal_file = journal_file or JOURNAL_FILE
    stamp = data.get("stamp") or datetime.now(timezone.utc).strftime(
        "%Y-%m-%dT%H:%M:%SZ")
    event_id = mint_approval_event_id(
        approval_id, event_type, data.get("proposal_digest", ""), stamp)
    event = {
        "event_id": event_id,
        "timestamp": stamp,  # decision/acceptance time
        "event_type": event_type,
        "aggregate_id": "mc:approval:%s" % approval_id,
        "aggregate_type": "mc_approval",
        "event_data": dict(data),
    }
    return _append(event, journal_file, dry_run=dry_run)


def _cli():
    ap = argparse.ArgumentParser(
        description="Append MC_PASS_* events to the PING journal.")
    ap.add_argument("--type", required=True,
                    help="MC_PASS_* event type")
    ap.add_argument("--pass-id", required=True)
    ap.add_argument("--platform", required=True)
    ap.add_argument("--data-json", default="{}",
                    help="JSON object for event_data")
    ap.add_argument("--journal", default=None)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    data = json.loads(args.data_json)
    event, how = emit_pass_event(args.type, args.pass_id, args.platform,
                                 data, journal_file=args.journal,
                                 dry_run=args.dry_run)
    print(json.dumps({"event_id": event["event_id"], "how": how}))


if __name__ == "__main__":
    _cli()
