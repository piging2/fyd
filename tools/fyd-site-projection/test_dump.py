#!/usr/bin/env python3
"""Offline unit tests for tools/fyd-site-projection/dump.py apply_overlays.

No journal, no network, no filesystem: pure function checks for the
presentation-intent overlay ops (the owner-correction regen seam).
Run: python3 test_dump.py   (exit 0 = all pass)
"""
import importlib.util
import sys

spec = importlib.util.spec_from_file_location(
    "dump", "/home/nolan/projects/ping/tools/fyd-site-projection/dump.py")
dump = importlib.util.module_from_spec(spec)
spec.loader.exec_module(dump)

PASS = []
FAIL = []


def check(name, fn):
    try:
        fn()
        PASS.append(name)
    except Exception as e:  # noqa: BLE001 - test harness reports
        FAIL.append((name, "%r" % e))


def good_intent_op(intent_id="pi-test-1", digest="abc123"):
    return {
        "op": "set_presentation_intent",
        "intentId": intent_id,
        "siteIntent": {"kind": "toggle_section", "pageSlug": "home",
                       "sectionId": "home:Locations:3", "hidden": True},
        "proposal": {"proposalDigest": digest, "extra": "ok"},
        "approval": {"proposalDigest": digest, "approvedBy": "demo-owner",
                     "approvedAt": "2026-09-24T00:00:00Z",
                     "note": "DEMO OWNER MODE test"},
    }


def ev(eid, ops, ts="2026-09-24T00:00:00Z"):
    return {"event_id": eid, "timestamp": ts, "event_data": {"ops": ops}}


def expect_value_error(fn):
    try:
        fn()
    except ValueError:
        return
    raise AssertionError("expected ValueError, none raised")


def t_unknown_op_kind():
    expect_value_error(lambda: dump.apply_overlays(
        {"objects": [], "relationships": []},
        [ev("neg-1", [{"op": "nuke_everything"}])]))


def t_digest_mismatch():
    op = good_intent_op()
    op["approval"] = dict(op["approval"], proposalDigest="different")
    expect_value_error(lambda: dump.apply_overlays(
        {"objects": [], "relationships": []}, [ev("neg-2", [op])]))


def t_missing_marker():
    op = good_intent_op()
    op["approval"] = dict(op["approval"], note="no marker here")
    expect_value_error(lambda: dump.apply_overlays(
        {"objects": [], "relationships": []}, [ev("neg-3", [op])]))


def t_set_then_clear_roundtrip():
    g = {"objects": [], "relationships": []}
    _, applied, intents = dump.apply_overlays(g, [
        ev("p1", [good_intent_op()]),
        ev("p2", [{"op": "clear_presentation_intent",
                   "intentId": "pi-test-1"}]),
    ])
    assert intents == [], intents
    assert applied == ["p1", "p2"], applied


def t_reapprove_moves_last():
    _, _, intents = dump.apply_overlays(
        {"objects": [], "relationships": []}, [
            ev("r1", [good_intent_op("pi-a", "d1")]),
            ev("r2", [good_intent_op("pi-b", "d2")]),
            ev("r3", [good_intent_op("pi-a", "d3")],
               ts="2026-09-24T00:00:01Z"),
        ])
    order = [d["intentId"] for d in intents]
    assert order == ["pi-b", "pi-a"], order
    assert intents[1]["approval"]["proposalDigest"] == "d3"
    assert intents[1]["approval"]["eventId"] == "r3"


def t_directive_shape():
    _, _, intents = dump.apply_overlays(
        {"objects": [], "relationships": []},
        [ev("s1", [good_intent_op()])])
    (d,) = intents
    assert d["intentId"] == "pi-test-1"
    assert d["siteIntent"]["kind"] == "toggle_section"
    assert d["approval"]["eventId"] == "s1"
    assert set(d["approval"]) == {"proposalDigest", "approvedBy",
                                  "approvedAt", "note", "eventId"}


def t_intent_digest_stable():
    _, _, i1 = dump.apply_overlays(
        {"objects": [], "relationships": []},
        [ev("s1", [good_intent_op()])])
    _, _, i2 = dump.apply_overlays(
        {"objects": [], "relationships": []},
        [ev("s1", [good_intent_op()])])
    block = lambda ds: {"directives": ds, "provenance": {"kind": "x"}}
    h = lambda b: dump.sha256_hex(dump.canonicalize(b).encode("utf-8"))
    assert h(block(i1)) == h(block(i2))


for name in sorted(n for n in list(globals()) if n.startswith("t_")):
    check(name, globals()[name])

print("pass: %d  fail: %d" % (len(PASS), len(FAIL)))
for name, err in FAIL:
    print("FAIL", name, err)
sys.exit(1 if FAIL else 0)
