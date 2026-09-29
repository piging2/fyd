#!/usr/bin/env python3
"""Mission Control-surface adapter for the canonical ApprovalRequest.

Mission Control PROJECTS authority; it does not own it. This adapter
submits the operator's intent to the SAME canonical authorization
transition the chat surface uses. Approving here and approving in chat
produce the identical canonical event because they are the same call.

See chat_approval.py for the chat surface.
"""

import os
import sys

_THIS = os.path.dirname(os.path.abspath(__file__))
_MC = os.path.normpath(os.path.join(_THIS, ".."))
if _MC not in sys.path:
    sys.path.insert(0, _MC)

from approval_request import authorize_approval_transition

# The one canonical transition. Not a copy, not a wrapper with its own
# logic: the same function object both surfaces invoke.
TRANSITION = authorize_approval_transition


def mc_approve(store, approval_id, approver_identity, expected_digest,
               now=None, journal_file=None, dry_run=False):
    """Approve an approval request from Mission Control.

    approver_identity must be the authenticated operator principal.
    Mission Control never approves on its own authority.
    """
    if not approver_identity:
        raise ValueError(
            "mc_approve requires the authenticated operator identity; "
            "Mission Control projects authority, it does not own it")
    return TRANSITION(store, approval_id, approver_identity,
                      expected_digest, now=now, journal_file=journal_file,
                      dry_run=dry_run)
