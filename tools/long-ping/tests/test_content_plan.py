#!/usr/bin/env python3
"""Tests for content_plan.py. Run: python3 test_content_plan.py"""
import json
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from content_plan import (  # noqa: E402
    build_plan,
    canonical_json,
    check_no_reuse,
    normalize_topic,
    parse_registry,
)

REGISTRY = """# Registry

## Episode 1 (shipped)
Framing question: what survives?

| Section | File | Core topic |
|---|---|---|
| 1 | f1.md | The 10,000-Year Message |
| 2 | f2.md | The Rain Computer |

## Episode 2 (treatment)
Framing question: what runs abandoned?

| Section | Core topic |
|---|---|
| 1 | Moon Archive |
| 2 | Last Server No OS |
"""


def test_parse_two_episodes():
    eps = parse_registry(REGISTRY)
    assert len(eps) == 2, eps
    assert eps[0]["episode"] == 1
    assert len(eps[0]["sections"]) == 2
    assert eps[1]["sections"][0]["core_topic"] == "Moon Archive"
    assert eps[0]["framing_question"] == "what survives?"


def test_no_reuse_clean():
    eps = parse_registry(REGISTRY)
    assert check_no_reuse(eps) == []


def test_reuse_detected():
    bad = REGISTRY + "\n## Episode 3 (x)\n| Section | Core topic |\n|---|---|\n| 1 | moon archive |\n"
    eps = parse_registry(bad)
    v = check_no_reuse(eps)
    assert len(v) == 1, v
    assert v[0]["topic_key"] == "moon archive"
    assert v[0]["first"]["episode"] == 2
    assert v[0]["repeat"]["episode"] == 3


def test_normalize():
    assert normalize_topic("Moon Archive (passive vault)") == "moon archive"
    assert normalize_topic("  Radio  No-IP ") == "radio no ip"


def test_deterministic_bytes():
    p1 = canonical_json(build_plan(REGISTRY))
    p2 = canonical_json(build_plan(REGISTRY))
    assert p1 == p2
    # registry sha recorded
    plan = json.loads(p1)
    assert len(plan["registry_sha256"]) == 64
    assert plan["episode_count"] == 2


def test_candidate_pool_header_skipped():
    reg = REGISTRY + "\n## Episode 2 candidate pool (superseded)\n\n1. **Moon Archive**\n"
    eps = parse_registry(reg)
    assert len(eps) == 2, [e["episode"] for e in eps]
    assert all(e["label"] != "candidate pool" for e in eps)


def test_check_mode_reuse_exit(tmp=None):
    import subprocess
    with tempfile.NamedTemporaryFile("w", suffix=".md", delete=False) as f:
        f.write(REGISTRY + "\n## Episode 3\n| Section | Core topic |\n| 1 | Moon Archive |\n")
        path = f.name
    try:
        r = subprocess.run(
            [sys.executable, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "content_plan.py"),
             "--registry", path, "--check"],
            capture_output=True, text=True)
        assert r.returncode == 1, r.stdout
    finally:
        os.unlink(path)


if __name__ == "__main__":
    test_parse_two_episodes()
    test_no_reuse_clean()
    test_reuse_detected()
    test_normalize()
    test_candidate_pool_header_skipped()
    test_deterministic_bytes()
    test_check_mode_reuse_exit()
    print("test_content_plan: 7 passed")
