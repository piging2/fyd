#!/usr/bin/env python3
"""Tests for metrics.py (ffprobe is stubbed via a fake binary). Run: python3 test_metrics.py"""
import json
import os
import stat
import subprocess
import sys
import tempfile

SCRIPT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "metrics.py")


def make_fake_ffprobe(tmpdir, secs="270.0"):
    path = os.path.join(tmpdir, "ffprobe")
    with open(path, "w") as f:
        f.write("#!/bin/sh\necho '%s'\n" % secs)
    os.chmod(path, os.stat(path).st_mode | stat.S_IEXEC)
    return tmpdir  # prepend to PATH


def run(env, *argv):
    return subprocess.run([sys.executable, SCRIPT, *argv], capture_output=True, text=True, env=env)


def test_record_and_report(tmpdir):
    bindir = make_fake_ffprobe(tmpdir)
    env = dict(os.environ, PATH=bindir + ":" + os.environ["PATH"])
    ledger = os.path.join(tmpdir, "m.jsonl")
    r = run(env, "record-master", "--ledger", ledger, "--episode", "1", "--file", "ep1.mp3",
            "--at", "2026-10-07T12:00:00+00:00")
    assert r.returncode == 0, r.stderr
    entry = json.loads(r.stdout)
    assert entry["minutes"] == 4.5
    assert entry["duration_secs"] == 270.0

    r = run(env, "report", "--ledger", ledger, "--as-of", "2026-10-07T13:00:00+00:00", "--date", "2026-10-07")
    rep = json.loads(r.stdout)
    assert rep["metric"] == "PODCAST_READY_MINUTES_24H"
    assert rep["trailing_24h"]["minutes"] == 4.5
    assert rep["trailing_24h"]["meets_target"] is False
    assert rep["calendar_day"]["date"] == "2026-10-07"
    assert rep["calendar_day"]["minutes"] == 4.5


def test_trailing_window_excludes_old(tmpdir):
    bindir = make_fake_ffprobe(tmpdir)
    env = dict(os.environ, PATH=bindir + ":" + os.environ["PATH"])
    ledger = os.path.join(tmpdir, "m.jsonl")
    run(env, "record-master", "--ledger", ledger, "--episode", "1", "--file", "a.mp3",
        "--at", "2026-10-05T10:00:00+00:00")
    run(env, "record-master", "--ledger", ledger, "--episode", "2", "--file", "b.mp3",
        "--at", "2026-10-07T12:00:00+00:00")
    r = run(env, "report", "--ledger", ledger, "--as-of", "2026-10-07T13:00:00+00:00")
    rep = json.loads(r.stdout)
    assert rep["trailing_24h"]["masters"] == 1
    assert rep["trailing_24h"]["minutes"] == 4.5


def test_target_met(tmpdir):
    bindir = make_fake_ffprobe(tmpdir, secs="7380.0")  # 123 minutes
    env = dict(os.environ, PATH=bindir + ":" + os.environ["PATH"])
    ledger = os.path.join(tmpdir, "m.jsonl")
    run(env, "record-master", "--ledger", ledger, "--episode", "1", "--file", "a.mp3",
        "--at", "2026-10-07T12:00:00+00:00")
    r = run(env, "report", "--ledger", ledger, "--as-of", "2026-10-07T13:00:00+00:00")
    rep = json.loads(r.stdout)
    assert rep["trailing_24h"]["meets_target"] is True


def test_empty_ledger(tmpdir):
    ledger = os.path.join(tmpdir, "missing.jsonl")
    r = run(dict(os.environ), "report", "--ledger", ledger)
    assert r.returncode == 0
    rep = json.loads(r.stdout)
    assert rep["trailing_24h"]["minutes"] == 0


if __name__ == "__main__":
    import tempfile as _t
    for fn in [test_record_and_report, test_trailing_window_excludes_old, test_target_met, test_empty_ledger]:
        with _t.TemporaryDirectory() as d:
            fn(d)
    print("test_metrics: 4 passed")
