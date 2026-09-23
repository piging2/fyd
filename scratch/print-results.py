#!/usr/bin/env python3
"""Print acceptance results compactly."""
import json, sys
path = sys.argv[1]
results = json.load(open(path))
for r in results:
    print("MODEL:", r["model"])
    for name, c in r["cases"].items():
        status = "PASS" if c.get("pass") else "FAIL"
        if c.get("error"):
            print(f"  {name}: ERROR {c['error']}")
            continue
        print(f"  {name}: {status}  reasons={c.get('reasons') or []}")
        out = (c.get("output") or "").replace("\n", " | ")
        print(f"    out: {out[:420]}")
    print()
