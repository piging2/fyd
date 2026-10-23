#!/usr/bin/env python3
"""PODCAST_READY_MINUTES_24H metric for The Long Ping.

A "podcast-ready minute" is one minute of mastered episode audio registered
via `record-master`. The ledger is a JSONL file; each line records one master.

Nolan's target: at least 120 podcast-ready minutes per calendar day.

Usage:
    python3 metrics.py record-master --ledger metrics.jsonl --episode 1 --file ep1.mp3
    python3 metrics.py report --ledger metrics.jsonl [--date 2026-10-07] [--as-of ISO]

`report` prints PODCAST_READY_MINUTES_24H (trailing 24h window) and the
calendar-day total for --date (default: today, local).
"""

import argparse
import datetime
import json
import subprocess
import sys


def ffprobe_duration_secs(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", path],
        capture_output=True, text=True, check=False,
    )
    if out.returncode != 0:
        raise RuntimeError(f"ffprobe failed for {path}: {out.stderr.strip()}")
    return float(out.stdout.strip())


def utcnow():
    return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")


def parse_ts(s):
    return datetime.datetime.fromisoformat(s)


def cmd_record_master(args):
    secs = ffprobe_duration_secs(args.file)
    entry = {
        "episode": args.episode,
        "file": args.file,
        "duration_secs": round(secs, 2),
        "minutes": round(secs / 60.0, 2),
        "recorded_at": args.at or utcnow(),
    }
    with open(args.ledger, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, sort_keys=True) + "\n")
    print(json.dumps(entry, indent=2, sort_keys=True))
    return 0


def load_ledger(path):
    entries = []
    try:
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    entries.append(json.loads(line))
    except FileNotFoundError:
        pass
    return entries


def cmd_report(args):
    entries = load_ledger(args.ledger)
    now = parse_ts(args.as_of) if args.as_of else datetime.datetime.now(datetime.timezone.utc)
    window_start = now - datetime.timedelta(hours=24)

    trailing = [e for e in entries if parse_ts(e["recorded_at"]) >= window_start]

    day = args.date or now.date().isoformat()
    day_entries = [e for e in entries if parse_ts(e["recorded_at"]).date().isoformat() == day]

    report = {
        "metric": "PODCAST_READY_MINUTES_24H",
        "as_of": now.isoformat(timespec="seconds"),
        "target_minutes_per_day": 120,
        "trailing_24h": {
            "minutes": round(sum(e["minutes"] for e in trailing), 2),
            "masters": len(trailing),
            "meets_target": sum(e["minutes"] for e in trailing) >= 120,
        },
        "calendar_day": {
            "date": day,
            "minutes": round(sum(e["minutes"] for e in day_entries), 2),
            "masters": len(day_entries),
            "meets_target": sum(e["minutes"] for e in day_entries) >= 120,
        },
    }
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(description="Long Ping podcast-ready-minutes metric")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("record-master")
    p.add_argument("--ledger", required=True)
    p.add_argument("--episode", type=int, required=True)
    p.add_argument("--file", required=True)
    p.add_argument("--at", default=None, help="ISO timestamp override (for backfill)")
    p.set_defaults(fn=cmd_record_master)

    p = sub.add_parser("report")
    p.add_argument("--ledger", required=True)
    p.add_argument("--date", default=None)
    p.add_argument("--as-of", default=None)
    p.set_defaults(fn=cmd_report)

    args = ap.parse_args(argv)
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
