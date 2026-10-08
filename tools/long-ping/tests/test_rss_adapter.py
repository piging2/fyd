#!/usr/bin/env python3
"""Tests for rss_adapter.py (parse/dedupe only; network not touched). Run: python3 test_rss_adapter.py"""
import json
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from rss_adapter import item_id, load_known_ids, parse_feed  # noqa: E402

RSS = b"""<?xml version="1.0"?>
<rss version="2.0"><channel><title>Ex</title>
<item><title>Alpha</title><link>https://ex.com/a</link><pubDate>Mon, 06 Oct 2026 10:00:00 GMT</pubDate>
<description>First story</description></item>
<item><title>Beta</title><link>https://ex.com/b</link><pubDate>Tue, 07 Oct 2026 10:00:00 GMT</pubDate></item>
</channel></rss>"""

ATOM = b"""<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>Ax</title>
<entry><title>Gamma</title><link href="https://ex.com/g"/><updated>2026-10-07T10:00:00Z</updated>
<summary>Third story</summary></entry>
</feed>"""


def test_parse_rss():
    items = parse_feed(RSS)
    assert len(items) == 2, items
    assert items[0]["title"] == "Alpha"
    assert items[0]["link"] == "https://ex.com/a"
    assert "First story" in items[0]["summary"]


def test_parse_atom():
    items = parse_feed(ATOM)
    assert len(items) == 1, items
    assert items[0]["link"] == "https://ex.com/g"
    assert items[0]["title"] == "Gamma"


def test_item_id_stable():
    items = parse_feed(RSS)
    assert item_id(items[0]) == item_id(parse_feed(RSS)[0])
    assert item_id(items[0]) != item_id(items[1])
    assert len(item_id(items[0])) == 16


def test_dedupe_roundtrip():
    with tempfile.TemporaryDirectory() as d:
        inbox = os.path.join(d, "inbox.jsonl")
        items = parse_feed(RSS)
        with open(inbox, "w") as f:
            for it in items:
                it["id"] = item_id(it)
                it["feed"] = "Ex"
                f.write(json.dumps(it, sort_keys=True) + "\n")
        known = load_known_ids(inbox)
        assert len(known) == 2
        # re-parse: all known -> zero new
        fresh = [it for it in parse_feed(RSS) if item_id(it) not in known]
        assert fresh == []


if __name__ == "__main__":
    test_parse_rss()
    test_parse_atom()
    test_item_id_stable()
    test_dedupe_roundtrip()
    print("test_rss_adapter: 4 passed")
