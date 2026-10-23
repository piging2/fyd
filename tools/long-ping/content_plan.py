#!/usr/bin/env python3
"""Deterministic ContentPlan for The Long Ping.

Reads the episode topic registry (markdown), enforces the no-core-topic-reuse
rule, and emits a canonical ContentPlan.json.

Determinism contract: identical registry bytes produce identical plan bytes.
Output JSON uses sorted keys and indent=2. The plan records the SHA-256 of the
registry it was derived from, so any regeneration can be verified.

Usage:
    python3 content_plan.py --registry episode-topic-registry.md --out ContentPlan.json
    python3 content_plan.py --registry episode-topic-registry.md --check   # validate only
"""

import argparse
import hashlib
import json
import re
import sys

EPISODE_RE = re.compile(r"^##\s+Episode\s+(\d+)\b(.*)$")
FRAMING_RE = re.compile(r"[Ff]raming question:\s*(.+?)(?:\n|$)")


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def normalize_topic(topic: str) -> str:
    """Normalize a core topic for reuse comparison."""
    t = topic.lower()
    t = re.sub(r"\([^)]*\)", "", t)  # drop parenthetical asides
    t = re.sub(r"[^a-z0-9]+", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def parse_registry(text: str):
    """Parse the registry markdown into a list of episode dicts.

    Supports two section-table shapes:
      | N | file | core topic |
      | N | core topic |
    """
    episodes = []
    current = None
    for line in text.splitlines():
        m = EPISODE_RE.match(line.strip())
        if m:
            rest0 = m.group(2).strip()
            # Skip non-episode headers such as "## Episode 2 candidate pool ..."
            if re.search(r"(?i)candidate pool", rest0):
                if current:
                    episodes.append(current)
                    current = None
                continue
            if current:
                episodes.append(current)
            num = int(m.group(1))
            rest = rest0
            # strip parenthetical status like "(shipped audio, video in production)"
            title_hint = re.sub(r"\s*\(.*\)\s*$", "", rest).strip(" -")
            current = {
                "episode": num,
                "label": title_hint,
                "framing_question": "",
                "sections": [],
            }
            continue
        if current is None:
            continue
        fm = FRAMING_RE.search(line)
        if fm and not current["framing_question"]:
            current["framing_question"] = fm.group(1).strip()
        s = line.strip()
        if s.startswith("|") and not re.match(r"^\|[\s\-\:|]+\|$", s):
            cells = [c.strip() for c in s.strip("|").split("|")]
            if cells and cells[0].isdigit():
                # header rows have non-numeric first cells; skip them
                if len(cells) >= 3:
                    topic = cells[2]
                elif len(cells) == 2:
                    topic = cells[1]
                else:
                    continue
                if re.match(r"(?i)^(section|file|core topic)$", topic):
                    continue
                current["sections"].append(
                    {
                        "section": int(cells[0]),
                        "core_topic": topic,
                        "core_topic_key": normalize_topic(topic),
                    }
                )
    if current:
        episodes.append(current)
    episodes.sort(key=lambda e: e["episode"])
    for ep in episodes:
        ep["sections"].sort(key=lambda s: s["section"])
    return episodes


def check_no_reuse(episodes):
    """Return a list of reuse violations. Empty means the registry is clean."""
    seen = {}
    violations = []
    for ep in episodes:
        for sec in ep["sections"]:
            key = sec["core_topic_key"]
            if not key:
                continue
            if key in seen:
                prev_ep, prev_sec = seen[key]
                violations.append(
                    {
                        "topic_key": key,
                        "topic": sec["core_topic"],
                        "first": {"episode": prev_ep, "section": prev_sec},
                        "repeat": {"episode": ep["episode"], "section": sec["section"]},
                    }
                )
            else:
                seen[key] = (ep["episode"], sec["section"])
    return violations


def build_plan(registry_text: str):
    episodes = parse_registry(registry_text)
    violations = check_no_reuse(episodes)
    plan = {
        "plan": "long-ping-content-plan",
        "version": 1,
        "registry_sha256": sha256_bytes(registry_text.encode("utf-8")),
        "episode_count": len(episodes),
        "episodes": episodes,
        "reuse_violations": violations,
    }
    return plan


def canonical_json(obj) -> str:
    return json.dumps(obj, indent=2, sort_keys=True) + "\n"


def main(argv=None):
    ap = argparse.ArgumentParser(description="Deterministic Long Ping ContentPlan")
    ap.add_argument("--registry", required=True, help="Path to episode-topic-registry.md")
    ap.add_argument("--out", help="Write ContentPlan.json here (default: stdout)")
    ap.add_argument("--check", action="store_true", help="Validate only; exit 1 on reuse")
    args = ap.parse_args(argv)

    with open(args.registry, "r", encoding="utf-8") as f:
        registry_text = f.read()

    plan = build_plan(registry_text)

    if args.check:
        if plan["reuse_violations"]:
            print(json.dumps(plan["reuse_violations"], indent=2, sort_keys=True))
            print(
                f"REUSE VIOLATIONS: {len(plan['reuse_violations'])}",
                file=sys.stderr,
            )
            return 1
        print(f"OK: {plan['episode_count']} episodes, no core-topic reuse.")
        return 0

    out = canonical_json(plan)
    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            f.write(out)
        print(f"Wrote {args.out} ({len(out)} bytes, registry {plan['registry_sha256'][:12]})")
    else:
        sys.stdout.write(out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
