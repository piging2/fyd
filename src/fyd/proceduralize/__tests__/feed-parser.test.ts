/**
 * Feed parser tests: real Coppersmith bytes, synthetic RSS/Atom items,
 * malformed fail-closed, and the claim-flow integration
 * (parse -> provenance with feed URL + item GUID evidence).
 */
import * as fs from "fs";
import * as path from "path";
import {
  parseFeedXml,
  feedFacts,
  feedEvidenceRef,
} from "../feed-parser";
import {
  parse,
  provenance,
  type AcquiredSource,
} from "../proceduralizer";

const NOW = "2026-09-21T12:00:00.000Z";
const FEED_URL = "https://www.coppersmithplumbing.com/feed/";

const realRss = fs.readFileSync(
  path.join(__dirname, "..", "raw", "coppersmith-plumbing", "rss.xml"),
  "utf8",
);

function acquired(
  raw: string,
  sourceType: AcquiredSource["sourceType"],
  url = FEED_URL,
): AcquiredSource {
  return { url, sourceType, discoveredAt: NOW, raw, ok: true, status: 200 };
}

const RSS_ITEMS =
  `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0">` +
  `<channel><title>Shop</title><link>https://example.com</link>` +
  `<item><title><![CDATA[Fix & repair]]></title><link>https://example.com/1</link>` +
  `<guid isPermaLink="false">item-guid-1</guid>` +
  `<pubDate>Wed, 01 Oct 2025 16:38:38 +0000</pubDate>` +
  `<description>First post</description></item>` +
  `<item><title>Second</title><link>https://example.com/2</link>` +
  `<pubDate>not-a-date</pubDate></item>` +
  `</channel></rss>`;

const ATOM_ITEMS =
  `<?xml version="1.0" encoding="utf-8"?><feed xmlns="http://www.w3.org/2005/Atom">` +
  `<title>Atom Shop</title><link href="https://example.com"/>` +
  `<entry><title>Entry One</title>` +
  `<link rel="alternate" href="https://example.com/e1"/>` +
  `<id>urn:entry-1</id><updated>2025-10-01T00:00:00Z</updated>` +
  `<summary>Summary one</summary></entry>` +
  `</feed>`;

describe("parseFeedXml", () => {
  test("parses the real Coppersmith rss.xml without throwing (zero items)", () => {
    const feed = parseFeedXml(realRss, FEED_URL);
    expect(feed).not.toBeNull();
    expect(feed!.format).toBe("rss");
    expect(feed!.feedTitle).toBe("Coppersmith Plumbing");
    expect(feed!.siteUrl).toBe("https://www.coppersmithplumbing.com");
    expect(feed!.items).toEqual([]);
  });

  test("parses RSS items with guid, link, date normalization", () => {
    const feed = parseFeedXml(RSS_ITEMS, "https://example.com/feed")!;
    expect(feed.items).toHaveLength(2);
    expect(feed.items[0]).toMatchObject({
      title: "Fix & repair",
      link: "https://example.com/1",
      guid: "item-guid-1",
      publishedAt: "2025-10-01T16:38:38.000Z",
      description: "First post",
    });
    // Bad date -> null, guid falls back to link.
    expect(feed.items[1].publishedAt).toBeNull();
    expect(feed.items[1].guid).toBe("https://example.com/2");
  });

  test("parses Atom entries, preferring the alternate link", () => {
    const feed = parseFeedXml(ATOM_ITEMS, "https://example.com/atom")!;
    expect(feed.format).toBe("atom");
    expect(feed.items).toHaveLength(1);
    expect(feed.items[0]).toMatchObject({
      title: "Entry One",
      link: "https://example.com/e1",
      guid: "urn:entry-1",
      publishedAt: "2025-10-01T00:00:00.000Z",
    });
  });

  test("fail-closed on malformed and foreign input", () => {
    expect(parseFeedXml("<rss><channel><title>oops", FEED_URL)).toBeNull();
    expect(parseFeedXml("", FEED_URL)).toBeNull();
    expect(parseFeedXml("<html><body>nope</body></html>", FEED_URL)).toBeNull();
    expect(parseFeedXml("not xml at all", FEED_URL)).toBeNull();
  });
});

describe("feed claim flow", () => {
  test("parse() turns rss items into feed_item facts with true tier", () => {
    const facts = parse(acquired(RSS_ITEMS, "rss"));
    expect(facts).toHaveLength(2);
    for (const f of facts) {
      expect(f.name).toBe("feed_item");
      expect(f.sourceType).toBe("rss");
      expect(f.claimKind).toBe("feed_item");
      expect(f.inferred).toBe(false);
    }
    expect(facts[0].value).toBe("Fix & repair");
    expect(facts[0].evidenceDetail).toBe("item-guid-1");
  });

  test("parse() never emits title facts from feed XML", () => {
    const facts = parse(acquired(RSS_ITEMS, "rss"));
    expect(facts.filter((f) => f.name === "title")).toHaveLength(0);
  });

  test("provenance() grades feed_item with feed URL + item GUID evidence", () => {
    const facts = parse(acquired(RSS_ITEMS, "rss"));
    const fields = provenance(
      { url: FEED_URL, sourceType: "rss", discoveredAt: NOW },
      facts,
      NOW,
      (f) => feedEvidenceRef(FEED_URL, f),
    );
    expect(fields).toHaveLength(2);
    for (const fd of fields) {
      expect(fd.claimKind).toBe("feed_item");
      expect(fd.confidence).toBe(1.0);
      expect(fd.public).toBe(true);
    }
    expect(fields[0].evidenceRef).toBe(`${FEED_URL}#guid:item-guid-1`);
  });

  test("broken feed bytes yield zero facts, never a throw", () => {
    expect(parse(acquired("<rss><broken", "rss"))).toEqual([]);
    expect(feedFacts(acquired("", "atom"))).toEqual([]);
  });
});
