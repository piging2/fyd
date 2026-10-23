#!/usr/bin/env python3
"""RSS/Atom deterministic acquisition adapter for Long Ping research.

Fetches configured feeds, normalizes items, dedupes by content hash against
the research inbox, and appends new items as JSONL. Stdlib only, no LLM.

Determinism: items are processed in feed order then published order; the
inbox is append-only and every item carries a stable id.

Usage:
    python3 rss_adapter.py fetch --config feeds.json --inbox research-inbox.jsonl

feeds.json: {"feeds": [{"name": "Example", "url": "https://example.com/feed.xml"}]}
"""

import argparse
import hashlib
import json
import sys
import urllib.request
import xml.etree.ElementTree as ET


def fetch_bytes(url, timeout=30):
    req = urllib.request.Request(url, headers={"User-Agent": "LongPingResearch/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def strip_ns(tag):
    return tag.split("}", 1)[-1] if "}" in tag else tag


def text_of(elem, names):
    for child in elem:
        if strip_ns(child.tag) in names and child.text and child.text.strip():
            return child.text.strip()
    return ""


def parse_feed(data: bytes):
    """Return a list of dicts: title, link, published, summary."""
    root = ET.fromstring(data)
    items = []
    # RSS: channel/item ; Atom: feed/entry
    for item in root.iter():
        tag = strip_ns(item.tag)
        if tag not in ("item", "entry"):
            continue
        title = text_of(item, ("title",))
        link = text_of(item, ("link",))
        if not link:
            # Atom link is often an attribute
            for child in item:
                if strip_ns(child.tag) == "link" and child.get("href"):
                    link = child.get("href")
                    break
        published = text_of(item, ("pubDate", "published", "updated", "date"))
        summary = text_of(item, ("description", "summary",))
        if title or link:
            items.append({
                "title": title,
                "link": link,
                "published": published,
                "summary": summary[:2000],
            })
    return items


def item_id(item):
    basis = item["link"] or (item["title"] + "|" + item["published"])
    return hashlib.sha256(basis.encode("utf-8")).hexdigest()[:16]


def load_known_ids(inbox_path):
    ids = set()
    try:
        with open(inbox_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        ids.add(json.loads(line)["id"])
                    except (KeyError, ValueError):
                        continue
    except FileNotFoundError:
        pass
    return ids


def cmd_fetch(args):
    with open(args.config, "r", encoding="utf-8") as f:
        config = json.load(f)
    known = load_known_ids(args.inbox)
    fetched, added, failed = 0, 0, []
    new_items = []
    for feed in config.get("feeds", []):
        name = feed.get("name", feed.get("url", "?"))
        url = feed["url"]
        try:
            data = fetch_bytes(url)
        except Exception as e:  # noqa: BLE001 - report and continue
            failed.append({"feed": name, "error": str(e)[:200]})
            continue
        try:
            items = parse_feed(data)
        except Exception as e:  # noqa: BLE001
            failed.append({"feed": name, "error": f"parse: {str(e)[:200]}"})
            continue
        fetched += len(items)
        for it in items:
            it["id"] = item_id(it)
            it["feed"] = name
            if it["id"] not in known:
                known.add(it["id"])
                new_items.append(it)
    # deterministic order: feed name, then published, then id
    new_items.sort(key=lambda i: (i["feed"], i["published"], i["id"]))
    if new_items:
        with open(args.inbox, "a", encoding="utf-8") as f:
            for it in new_items:
                f.write(json.dumps(it, sort_keys=True) + "\n")
        added = len(new_items)
    summary = {"fetched": fetched, "added": added, "failed": failed}
    print(json.dumps(summary, indent=2, sort_keys=True))
    return 0 if not failed else 1


def main(argv=None):
    ap = argparse.ArgumentParser(description="Long Ping RSS acquisition adapter")
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("fetch")
    p.add_argument("--config", required=True)
    p.add_argument("--inbox", required=True)
    p.set_defaults(fn=cmd_fetch)
    args = ap.parse_args(argv)
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
