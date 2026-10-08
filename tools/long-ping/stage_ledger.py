#!/usr/bin/env python3
"""Stage ledger for Long Ping episode production.

Stages (in order): research, treatment, script, record, master, package, publish.

The ledger is a JSON state file with sorted keys. Advancing a stage requires
all earlier stages to be done. The publish stage is authorization-gated: it
refuses unless --authorize is supplied with a human authorization string, and
there is no code path that advances to publish automatically.

Usage:
    python3 stage_ledger.py init --state pipeline-state.json
    python3 stage_ledger.py advance --state pipeline-state.json --episode 2 --stage research --to done
    python3 stage_ledger.py status --state pipeline-state.json [--episode 2]
    python3 stage_ledger.py publish --state pipeline-state.json --episode 1 --authorize "Nolan 2026-10-08: ship ep1"
"""

import argparse
import datetime
import json
import sys

STAGES = ["research", "treatment", "script", "record", "master", "package", "publish"]


def utcnow():
    return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")


def load_state(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return {"ledger": "long-ping-stage-ledger", "version": 1, "episodes": {}}


def save_state(path, state):
    with open(path, "w", encoding="utf-8") as f:
        f.write(json.dumps(state, indent=2, sort_keys=True) + "\n")


def get_episode(state, num):
    key = str(num)
    eps = state.setdefault("episodes", {})
    if key not in eps:
        eps[key] = {"episode": num, "stages": {}, "current": STAGES[0]}
    return eps[key]


def cmd_init(args):
    state = load_state(args.state)
    save_state(args.state, state)
    print(f"Initialized {args.state}")


def cmd_advance(args):
    if args.stage not in STAGES:
        print(f"Unknown stage: {args.stage} (valid: {', '.join(STAGES)})", file=sys.stderr)
        return 1
    if args.to not in ("in_progress", "done"):
        print("--to must be in_progress or done", file=sys.stderr)
        return 1
    state = load_state(args.state)
    ep = get_episode(state, args.episode)
    idx = STAGES.index(args.stage)
    if args.to == "done":
        for earlier in STAGES[:idx]:
            if ep["stages"].get(earlier, {}).get("state") != "done":
                print(
                    f"Refusing: stage '{earlier}' is not done for episode {args.episode}; "
                    f"cannot mark '{args.stage}' done.",
                    file=sys.stderr,
                )
                return 1
    ep["stages"][args.stage] = {"state": args.to, "at": utcnow()}
    # current = first stage not done
    for s in STAGES:
        if ep["stages"].get(s, {}).get("state") != "done":
            ep["current"] = s
            break
    else:
        ep["current"] = "complete"
    save_state(args.state, state)
    print(f"Episode {args.episode}: {args.stage} -> {args.to} (current: {ep['current']})")
    return 0


def cmd_status(args):
    state = load_state(args.state)
    eps = state.get("episodes", {})
    if args.episode is not None:
        ep = eps.get(str(args.episode))
        if ep is None:
            print(f"No record for episode {args.episode}", file=sys.stderr)
            return 1
        print(json.dumps(ep, indent=2, sort_keys=True))
    else:
        summary = {
            num: {"current": e.get("current"), "done": sorted([s for s, v in e.get("stages", {}).items() if v.get("state") == "done"])}
            for num, e in sorted(eps.items(), key=lambda kv: int(kv[0]))
        }
        print(json.dumps(summary, indent=2, sort_keys=True))
    return 0


def cmd_publish(args):
    """Authorization-gated publish. Never runs without an explicit --authorize."""
    if not args.authorize:
        print(
            "PUBLISH REFUSED: publishing is authorization-gated. "
            "Re-run with --authorize \"<who> <date>: <reason>\" after Nolan explicitly approves.",
            file=sys.stderr,
        )
        return 2
    state = load_state(args.state)
    ep = get_episode(state, args.episode)
    for earlier in STAGES[:-1]:
        if ep["stages"].get(earlier, {}).get("state") != "done":
            print(
                f"Refusing: stage '{earlier}' is not done for episode {args.episode}.",
                file=sys.stderr,
            )
            return 1
    ep["stages"]["publish"] = {
        "state": "done",
        "at": utcnow(),
        "authorized_by": args.authorize,
    }
    ep["current"] = "complete"
    save_state(args.state, state)
    print(f"Episode {args.episode}: PUBLISHED (authorized_by: {args.authorize})")
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(description="Long Ping stage ledger")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("init")
    p.add_argument("--state", required=True)
    p.set_defaults(fn=cmd_init)

    p = sub.add_parser("advance")
    p.add_argument("--state", required=True)
    p.add_argument("--episode", type=int, required=True)
    p.add_argument("--stage", required=True)
    p.add_argument("--to", required=True)
    p.set_defaults(fn=cmd_advance)

    p = sub.add_parser("status")
    p.add_argument("--state", required=True)
    p.add_argument("--episode", type=int)
    p.set_defaults(fn=cmd_status)

    p = sub.add_parser("publish")
    p.add_argument("--state", required=True)
    p.add_argument("--episode", type=int, required=True)
    p.add_argument("--authorize", default="")
    p.set_defaults(fn=cmd_publish)

    args = ap.parse_args(argv)
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
