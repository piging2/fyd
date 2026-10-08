#!/usr/bin/env python3
"""Tests for stage_ledger.py. Run: python3 test_stage_ledger.py"""
import json
import os
import subprocess
import sys
import tempfile

SCRIPT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "stage_ledger.py")


def run(*argv):
    return subprocess.run([sys.executable, SCRIPT, *argv], capture_output=True, text=True)


def test_init_and_status(tmpdir):
    state = os.path.join(tmpdir, "s.json")
    assert run("init", "--state", state).returncode == 0
    r = run("status", "--state", state)
    assert r.returncode == 0
    assert json.loads(r.stdout) == {}


def test_order_enforced(tmpdir):
    state = os.path.join(tmpdir, "s.json")
    run("init", "--state", state)
    r = run("advance", "--state", state, "--episode", "2", "--stage", "master", "--to", "done")
    assert r.returncode == 1  # record not done
    assert "Refusing" in r.stderr


def test_advance_sequence(tmpdir):
    state = os.path.join(tmpdir, "s.json")
    run("init", "--state", state)
    for s in ["research", "treatment", "script"]:
        assert run("advance", "--state", state, "--episode", "2", "--stage", s, "--to", "done").returncode == 0
    r = run("status", "--state", state, "--episode", "2")
    ep = json.loads(r.stdout)
    assert ep["current"] == "record"


def test_publish_refused_without_authorize(tmpdir):
    state = os.path.join(tmpdir, "s.json")
    run("init", "--state", state)
    for s in ["research", "treatment", "script", "record", "master", "package"]:
        run("advance", "--state", state, "--episode", "1", "--stage", s, "--to", "done")
    r = run("publish", "--state", state, "--episode", "1")
    assert r.returncode == 2
    assert "REFUSED" in r.stderr


def test_publish_with_authorize(tmpdir):
    state = os.path.join(tmpdir, "s.json")
    run("init", "--state", state)
    for s in ["research", "treatment", "script", "record", "master", "package"]:
        run("advance", "--state", state, "--episode", "1", "--stage", s, "--to", "done")
    r = run("publish", "--state", state, "--episode", "1", "--authorize", "Nolan test")
    assert r.returncode == 0
    r = run("status", "--state", state, "--episode", "1")
    ep = json.loads(r.stdout)
    assert ep["stages"]["publish"]["authorized_by"] == "Nolan test"
    assert ep["current"] == "complete"


def test_deterministic_state_bytes(tmpdir):
    state = os.path.join(tmpdir, "s.json")
    run("init", "--state", state)
    run("advance", "--state", state, "--episode", "2", "--stage", "research", "--to", "done")
    with open(state) as f:
        raw = f.read()
    assert raw == json.dumps(json.loads(raw), indent=2, sort_keys=True) + "\n"


if __name__ == "__main__":
    import tempfile as _t
    for fn in [test_init_and_status, test_order_enforced, test_advance_sequence,
               test_publish_refused_without_authorize, test_publish_with_authorize,
               test_deterministic_state_bytes]:
        with _t.TemporaryDirectory() as d:
            fn(d)
    print("test_stage_ledger: 6 passed")
