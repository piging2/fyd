#!/usr/bin/env python3
"""P0-2 tenant binding tests (Nolan, 2026-09-30, binding): TENANT IS
IMMUTABLE PROPOSAL CONTEXT.

Hermetic: every test uses a fresh temp store + temp journal. No fixtures,
no network, no registry. The Python primitive carries the tenant string
immutably on the record; caller-entitlement checks live at the surface
boundary (the :3100 TS gate), which owns registry access.

What is proved here:
  1. request_approval() binds tenant at creation; the record stores it;
     MC_APPROVAL_REQUESTED carries it in event metadata.
  2. tenant=None marks a legacy record (compatibility: no forced
     migration of existing stores).
  3. The canonical transition refuses WAITING -> APPROVED on a legacy
     record (tenant_unknown, fail closed, typed refusal, no state
     change); deny and expiry still work (safe direction).
  4. No transition may modify the tenant (immutability by construction).
  5. Idempotent dedup and id minting are tenant-scoped: the same proposal
     in two tenants is two records, never one shared id.
"""

import json
import os
import sys
import tempfile
import unittest

_THIS = os.path.dirname(os.path.abspath(__file__))
_MC = os.path.normpath(os.path.join(_THIS, ".."))
# emit.py needs pass_policy_engine (resolved from the real outreach tree).
_OUTREACH = os.path.expanduser("~/workspace/outreach")
for _p in (_MC, _OUTREACH):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from approval_request import (  # noqa: E402
    ApprovalStore,
    authorize_approval_transition,
    deny_approval,
    evaluate_expiry,
    request_approval,
    WAITING,
    APPROVED,
    DENIED,
    EXPIRED,
)
from proposal_record import record_proposal  # noqa: E402


def _proposal(n=1):
    return {"kind": "fyd-presentation-patch", "page": "home",
            "change": "test-%d" % n}


def _consequence():
    return {"reversibility": "reversible", "external_effect": False}


class _Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store_path = os.path.join(self.tmp.name, "approvals.json")
        self.journal_path = os.path.join(self.tmp.name, "journal.jsonl")
        self.store = ApprovalStore(self.store_path)

    def tearDown(self):
        self.tmp.cleanup()

    def _request(self, tenant=None, proposal=None, **kw):
        kw.setdefault("capability", "fyd.presentation.patch")
        kw.setdefault("actor", "p0-writer-w4")
        kw.setdefault("consequence", _consequence())
        return request_approval(
            self.store, proposal if proposal is not None else _proposal(),
            journal_file=self.journal_path, tenant=tenant, **kw)

    def _journal_events(self):
        if not os.path.exists(self.journal_path):
            return []
        with open(self.journal_path, encoding="utf-8") as f:
            return [json.loads(line) for line in f if line.strip()]


class TestTenantBinding(_Base):
    def test_creation_binds_tenant(self):
        r = self._request(tenant="demo-owner")
        self.assertTrue(r["ok"], r)
        self.assertTrue(r["created"])
        self.assertEqual(r["record"]["tenant"], "demo-owner")
        # Tenant is carried on the REQUESTED event metadata (audit trail).
        self.assertEqual(r["event"]["event_data"]["tenant"], "demo-owner")
        self.assertEqual(r["event"]["event_type"], "MC_APPROVAL_REQUESTED")

    def test_creation_without_tenant_is_legacy(self):
        r = self._request()
        self.assertTrue(r["ok"], r)
        self.assertIsNone(r["record"]["tenant"])
        self.assertIsNone(r["event"]["event_data"]["tenant"])

    def test_invalid_tenant_rejected(self):
        for bad in ("", 123, ["demo-owner"]):
            r = self._request(tenant=bad)
            self.assertFalse(r["ok"])
            self.assertEqual(r["reason"], "invalid_request")

    def test_record_proposal_tenant_passthrough(self):
        r = record_proposal(
            _proposal(), mission_id="mc-test", store_path=self.store_path,
            journal_file=self.journal_path, tenant="demo-owner")
        self.assertTrue(r["ok"], r)
        self.assertEqual(r["tenant"], "demo-owner")
        # record_proposal opens its own store handle; reload to read back.
        rec = ApprovalStore(self.store_path).get(r["proposal_id"])
        self.assertEqual(rec["tenant"], "demo-owner")

    def test_record_proposal_without_tenant_is_legacy(self):
        r = record_proposal(
            _proposal(), mission_id="mc-test", store_path=self.store_path,
            journal_file=self.journal_path)
        self.assertTrue(r["ok"], r)
        self.assertIsNone(r["tenant"])
        rec = ApprovalStore(self.store_path).get(r["proposal_id"])
        self.assertIsNone(rec["tenant"])


class TestTenantScopedIdentity(_Base):
    def test_dedup_is_tenant_scoped(self):
        proposal = _proposal()
        first = self._request(tenant="tenant-a", proposal=proposal)
        self.assertTrue(first["created"])
        # Same tenant: idempotent dedup, no new record.
        again = self._request(tenant="tenant-a", proposal=proposal)
        self.assertTrue(again["ok"])
        self.assertFalse(again["created"])
        self.assertEqual(again["record"]["id"], first["record"]["id"])
        self.assertEqual(again["how"], "existing")
        # Different tenant: a NEW record, never the shared one.
        other = self._request(tenant="tenant-b", proposal=proposal)
        self.assertTrue(other["ok"])
        self.assertTrue(other["created"])
        self.assertNotEqual(other["record"]["id"], first["record"]["id"])
        self.assertEqual(other["record"]["tenant"], "tenant-b")

    def test_legacy_dedup_does_not_collide_with_tenanted(self):
        proposal = _proposal()
        legacy = self._request(proposal=proposal)
        tenanted = self._request(tenant="demo-owner", proposal=proposal)
        self.assertTrue(tenanted["created"])
        self.assertNotEqual(tenanted["record"]["id"],
                            legacy["record"]["id"])


class TestApproveFailClosed(_Base):
    def test_approve_tenanted_record_succeeds(self):
        r = self._request(tenant="demo-owner")
        t = authorize_approval_transition(
            self.store, r["record"]["id"], "nolan:demo-owner",
            r["record"]["proposal_digest"], journal_file=self.journal_path)
        self.assertTrue(t["ok"], t)
        self.assertEqual(t["record"]["status"], APPROVED)

    def test_approve_legacy_waiting_fails_closed(self):
        r = self._request()  # no tenant provenance
        rec_id = r["record"]["id"]
        t = authorize_approval_transition(
            self.store, rec_id, "nolan:demo-owner",
            r["record"]["proposal_digest"], journal_file=self.journal_path)
        self.assertFalse(t["ok"])
        self.assertEqual(t["reason"], "tenant_unknown")
        # No state change: still waiting, nothing stranded, nothing granted.
        self.assertEqual(self.store.get(rec_id)["status"], WAITING)
        events = self._journal_events()
        refused = [e for e in events
                   if e["event_type"] == "MC_APPROVAL_REFUSED"
                   and e["aggregate_id"] == "mc:approval:%s" % rec_id]
        self.assertEqual(len(refused), 1)
        self.assertEqual(refused[0]["event_data"]["reason"],
                         "tenant_unknown")

    def test_deny_legacy_waiting_allowed(self):
        # Deny is the safe direction: missing tenant provenance must not
        # strand a legacy record.
        r = self._request()
        rec_id = r["record"]["id"]
        d = deny_approval(self.store, rec_id, "nolan:demo-owner",
                          reason="no longer needed",
                          journal_file=self.journal_path)
        self.assertTrue(d["ok"], d)
        self.assertEqual(d["record"]["status"], DENIED)

    def test_expiry_legacy_still_works(self):
        r = self._request(expires_at="2020-01-01T00:00:00Z")
        rec_id = r["record"]["id"]
        e = evaluate_expiry(self.store, rec_id,
                            journal_file=self.journal_path)
        self.assertEqual(e["outcome"], EXPIRED)
        self.assertEqual(self.store.get(rec_id)["status"], EXPIRED)


class TestTenantImmutable(_Base):
    def test_tenant_unchanged_by_approve(self):
        r = self._request(tenant="demo-owner")
        rec_id = r["record"]["id"]
        t = authorize_approval_transition(
            self.store, rec_id, "nolan:demo-owner",
            r["record"]["proposal_digest"], journal_file=self.journal_path)
        self.assertTrue(t["ok"], t)
        self.assertEqual(self.store.get(rec_id)["tenant"], "demo-owner")

    def test_tenant_unchanged_by_deny(self):
        r = self._request(tenant="demo-owner")
        rec_id = r["record"]["id"]
        d = deny_approval(self.store, rec_id, "nolan:demo-owner",
                          journal_file=self.journal_path)
        self.assertTrue(d["ok"], d)
        self.assertEqual(self.store.get(rec_id)["tenant"], "demo-owner")

    def test_tenant_unchanged_by_expiry(self):
        r = self._request(tenant="demo-owner",
                          expires_at="2020-01-01T00:00:00Z")
        rec_id = r["record"]["id"]
        e = evaluate_expiry(self.store, rec_id,
                            journal_file=self.journal_path)
        self.assertEqual(e["outcome"], EXPIRED)
        self.assertEqual(self.store.get(rec_id)["tenant"], "demo-owner")


if __name__ == "__main__":
    unittest.main()
