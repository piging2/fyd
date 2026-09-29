#!/usr/bin/env python3
"""CLI over the canonical ApprovalRequest primitive for the :3100 API.

Subcommands (all print a single JSON object to stdout):
  record  validated proposal -> WAITING_APPROVAL + MC_APPROVAL_REQUESTED
  decide  approve|deny a recorded proposal (exact-digest binding enforced)
  get     read a recorded proposal (read-only)

The Next.js route src/app/api/mc/approvals/route.ts shells to this CLI;
the primitive (approval_request.py) stays the single canonical model.
"""

import json
import os
import sys

_THIS = os.path.dirname(os.path.abspath(__file__))
_ADAPTERS = os.path.join(_THIS, "adapters")
for _p in (_THIS, _ADAPTERS):
    if _p not in sys.path:
        sys.path.insert(0, _p)

# emit.py imports pass_policy_engine at module top (resolved from
# <mc>/../outreach relative to its own file). When this CLI is vendored
# next to the :3100 app, point it at the real outreach tree explicitly.
_OUTREACH = os.environ.get("MC_OUTREACH_PATH") or os.path.normpath(
    os.path.join(_THIS, "..", "outreach"))
if os.path.isdir(_OUTREACH) and _OUTREACH not in sys.path:
    sys.path.insert(0, _OUTREACH)

from approval_request import ApprovalStore, authorize_approval_transition, deny_approval  # noqa: E402
from proposal_record import record_proposal  # noqa: E402


def cmd_record(a):
    with open(a.proposal_json, encoding="utf-8") as f:
        proposal = json.load(f)
    return record_proposal(
        proposal,
        mission_id=a.mission_id,
        store_path=a.store,
        journal_file=a.journal,
        actor=a.actor,
        summary=a.summary,
        why=a.why,
    )


def cmd_decide(a):
    store = ApprovalStore(a.store)
    if a.decision == "approve":
        # Mission Control surface: projects the operator's authority, owns
        # none. mc_approve requires a non-empty approver identity.
        from mc_approval import mc_approve
        return mc_approve(store, a.proposal_id, a.approver, a.digest,
                          journal_file=a.journal)
    if a.decision == "deny":
        return deny_approval(store, a.proposal_id, a.approver,
                             reason=a.reason or "",
                             journal_file=a.journal)
    return {"ok": False, "reason": "bad_decision",
            "error": "decision must be approve or deny"}


def cmd_get(a):
    store = ApprovalStore(a.store)
    rec = store.get(a.proposal_id)
    if rec is None:
        return {"ok": False, "reason": "unknown_id", "id": a.proposal_id}
    return {"ok": True, "record": rec}


def main(argv):
    import argparse
    ap = argparse.ArgumentParser(
        description="ApprovalRequest CLI for the :3100 approvals API.")
    sub = ap.add_subparsers(dest="cmd", required=True)

    r = sub.add_parser("record")
    r.add_argument("--store", required=True)
    r.add_argument("--journal", required=True)
    r.add_argument("--proposal-json", required=True)
    r.add_argument("--mission-id", required=True)
    r.add_argument("--actor", default="p0-writer-w4")
    r.add_argument("--summary", default="")
    r.add_argument("--why", default="")

    d = sub.add_parser("decide")
    d.add_argument("--store", required=True)
    d.add_argument("--journal", required=True)
    d.add_argument("--proposal-id", required=True)
    d.add_argument("--digest", required=True)
    d.add_argument("--decision", required=True, choices=["approve", "deny"])
    d.add_argument("--approver", default="nolan:demo-owner")
    d.add_argument("--reason", default="")

    g = sub.add_parser("get")
    g.add_argument("--store", required=True)
    g.add_argument("--proposal-id", required=True)

    args = ap.parse_args(argv)
    try:
        if args.cmd == "record":
            result = cmd_record(args)
        elif args.cmd == "decide":
            result = cmd_decide(args)
        else:
            result = cmd_get(args)
    except ValueError as e:
        result = {"ok": False, "reason": "invalid_argument",
                  "error": str(e)}
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
