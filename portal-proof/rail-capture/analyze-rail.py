#!/usr/bin/env python3
"""Analyze the portal rail proof capture matrix (Lane E2).

Reads the manifest.json written by portal-proof/rail-capture/rail-capture.mjs,
validates every PNG (non-zero, PNG header), checks the required invariants
(overlapPx == 0, hOverflowPx == 0), and prints the measurements table plus a
findings summary. Exit 0 only if every capture is present and valid; invariant
violations are reported as findings, not as failures.

Usage: analyze-rail.py [manifest.json]
"""
import json
import os
import struct
import sys

PNG_SIG = b"\x89PNG\r\n\x1a\n"


def png_size(path):
    with open(path, "rb") as f:
        data = f.read(33)
    if data[:8] != PNG_SIG:
        return None
    # IHDR width/height are bytes 16..24
    w, h = struct.unpack(">II", data[16:24])
    return w, h


def main():
    manifest_path = sys.argv[1] if len(sys.argv) > 1 else "/tmp/rail-proof/shots-rail/manifest.json"
    out_dir = os.path.dirname(os.path.abspath(manifest_path))
    m = json.load(open(manifest_path))
    rows = m["rows"]

    print(f"manifest: {manifest_path}")
    print(f"generatedAt: {m.get('generatedAt')}")
    print(f"spec rows: {len(rows)}  unique captures: {m.get('uniqueCaptures')}")
    print()
    hdr = ("id", "business", "viewport", "side_param", "resolved", "mode", "scroll",
           "contentW", "leftFree", "rightFree", "overlapPx", "hOverflowPx",
           "portalBox", "file_ok")
    print("| " + " | ".join(hdr) + " |")
    print("|" + "|".join(["---"] * len(hdr)) + "|")

    missing_metrics = []
    bad_files = []
    violations = []
    for r in rows:
        mt = r.get("metrics") or {}
        pb = mt.get("portalBox")
        pbs = (f"{pb['width']}x{pb['height']}@{pb['x']},{pb['y']}" if pb else "null")
        rel = r.get("file")
        file_ok = "?"
        if rel:
            p = os.path.join(out_dir, rel)
            if os.path.isfile(p) and os.path.getsize(p) > 0 and png_size(p):
                file_ok = "yes"
            else:
                file_ok = "NO"
                bad_files.append(r["id"])
        else:
            file_ok = "NO(file=null)"
            bad_files.append(r["id"])
        if r.get("metricsMissing"):
            missing_metrics.append(r["id"])
        inv = r.get("invariants", {})
        if mt and (not inv.get("overlapOk", True) or not inv.get("hOverflowOk", True)):
            violations.append(r)
        vals = [r["id"], r["business"], r["viewport"], r["sideParam"],
                r.get("resolvedSide") or "?", r["mode"], r["scrollLabel"],
                str(mt.get("contentWidth")), str(mt.get("leftFree")),
                str(mt.get("rightFree")), str(inv.get("overlapPx")),
                str(inv.get("hOverflowPx")), pbs, file_ok]
        print("| " + " | ".join(vals) + " |")

    print()
    print("## invariant violations (overlapPx must be 0, hOverflowPx must be 0)")
    if not violations:
        print("none")
    for r in violations:
        inv = r["invariants"]
        print(f"- {r['id']} {r['file']}: overlapPx={inv['overlapPx']} "
              f"hOverflowPx={inv['hOverflowPx']}")

    print()
    print("## auto-rule chosen side per business per viewport")
    for key in sorted(m.get("autoChoices", {})):
        for mode, v in m["autoChoices"][key].items():
            print(f"- {key} [{mode}]: side={v['side']} "
                  f"leftFree={v['leftFree']} rightFree={v['rightFree']}")

    print()
    print("## engaged-in-rail extras")
    for r in rows:
        if r["group"] == "engaged":
            print(f"- {r['id']}: {json.dumps(r.get('extra'))}")

    print()
    print("## narrow-collapse extras")
    for r in rows:
        if r["group"] == "narrow":
            print(f"- {r['id']}: {json.dumps(r.get('extra'))}")

    print()
    print("## scroll series extras")
    for r in rows:
        if r["group"] in ("sticky-scroll", "static-scroll"):
            print(f"- {r['id']}: {json.dumps(r.get('extra'))} notes={r.get('notes')}")

    print()
    print(f"rows with metrics missing: {missing_metrics or 'none'}")
    print(f"rows with bad/missing PNG: {bad_files or 'none'}")
    ok = not missing_metrics and not bad_files
    print("RESULT:", "COMPLETE" if ok else "INCOMPLETE")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
