mc-approval/ vendored deployment copy (P0, 2026-09-27, writer W4).

Canonical source: the mission-control repo, branch p0/approval,
files mission-control/approval_request.py, emit.py (approval vocabulary
merged), adapters/chat_approval.py, adapters/mc_approval.py,
proposal_validate.py, proposal_record.py, approval_cli.py
(harvested from dormant branch mc/approval-request @ cacf7b2; the
ApprovalRequest primitive is the single canonical approval model).

This directory is a DEPLOY copy so the :3100 approvals route can invoke
the canonical Python primitive via spawnSync. Do not edit here; change
the source branch and re-vendor.
