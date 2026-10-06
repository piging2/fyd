#!/usr/bin/env python3
"""Chat-surface adapter for the canonical ApprovalRequest primitive.

Chat is an AUTHENTICATED INPUT, never an authority. The chat runtime MUST
supply the authenticated principal identity; this adapter never invents,
defaults, or infers an identity, and a bare "yes" with no approval id
cannot reach the transition by construction (approval_id is a required
positional argument; there is no approve-latest).

Both surfaces call the SAME function: authorize_approval_transition.
See mc_approval.py for the Mission Control surface.
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


def chat_approve(store, approval_id, approver_identity, expected_digest,
                 now=None, journal_file=None, dry_run=False):
    """Approve an approval request from chat.

    approver_identity must be the authenticated principal supplied by the
    chat runtime. Chat never self-authorizes.
    """
    if not approver_identity:
        raise ValueError(
            "chat_approve requires the authenticated approver identity; "
            "chat is an input, not an authority")
    return TRANSITION(store, approval_id, approver_identity,
                      expected_digest, now=now, journal_file=journal_file,
                      dry_run=dry_run)
