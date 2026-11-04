import { XMLParser } from "fast-xml-parser";
import { buildRssFeed, escapeXml, formatRssDate, BLOG_FEED_TITLE, BLOG_FEED_DESCRIPTION } from "../rss";

/**
 * Wave 28 (B-21): the blog RSS feed builder emits valid RSS 2.0 from
 * fixture posts, in the order it is given, with RFC 822 dates and
 * XML escaping for special characters in titles and excerpts.
 */
const FIXTURE_POSTS = [
  {
    slug: "fish-and-chips",
    title: "Fish & Chips <Deluxe> \"Edition\"",
    date: "2026-11-03",
    excerpt: "A post about 5 > 3 & 2 < 4, with a \"quote\" inside.",
  },
  {
    slug: "older-post",
    title: "An Older Post",
    date: "2026-10-01",
    excerpt: "Plain excerpt.",
  },
];

describe("formatRssDate", () => {
  it("formats a post date as RFC 822 at UTC midnight", () => {
    expect(formatRssDate("2026-11-03")).toBe("Tue, 03 Nov 2026 00:00:00 GMT");
    expect(formatRssDate("2026-10-01")).toBe("Thu, 01 Oct 2026 00:00:00 GMT");
  });
});

describe("escapeXml", () => {
  it("escapes the five XML special characters", () => {
    expect(escapeXml("a & b < c > d")).toBe("a &amp; b &lt; c &gt; d");
    expect(escapeXml("say \"hi\"")).toBe("say &quot;hi&quot;");
  });
});

describe("buildRssFeed", () => {
  const xml = buildRssFeed(FIXTURE_POSTS, "https://example.test");
  const parsed = new XMLParser({ ignoreAttributes: false }).parse(xml);

  it("parses as XML and is RSS 2.0 with the real blog channel identity", () => {
    expect(parsed["?xml"]).toBeDefined();
    expect(parsed.rss["@_version"]).toBe("2.0");
    expect(parsed.rss.channel.title).toBe(BLOG_FEED_TITLE);
    expect(parsed.rss.channel.link).toBe("https://example.test/blog");
    expect(parsed.rss.channel.description).toBe(BLOG_FEED_DESCRIPTION);
  });

  it("contains one item per post, in the order given, with link, guid and date", () => {
    const items = parsed.rss.channel.item;
    expect(items).toHaveLength(2);
    expect(items[0].link).toBe("https://example.test/blog/fish-and-chips");
    expect(items[0].guid["#text"]).toBe("https://example.test/blog/fish-and-chips");
    expect(items[0].guid["@_isPermaLink"]).toBe("true");
    expect(items[0].pubDate).toBe("Tue, 03 Nov 2026 00:00:00 GMT");
    expect(items[1].link).toBe("https://example.test/blog/older-post");
    expect(items[1].pubDate).toBe("Thu, 01 Oct 2026 00:00:00 GMT");
  });

  it("escapes special characters in titles and excerpts in the raw XML", () => {
    expect(xml).toContain("Fish &amp; Chips &lt;Deluxe&gt; &quot;Edition&quot;");
    expect(xml).toContain("5 &gt; 3 &amp; 2 &lt; 4");
    expect(xml).not.toContain("Fish & Chips");
    expect(parsed.rss.channel.item[0].title).toBe("Fish & Chips <Deluxe> \"Edition\"");
    expect(parsed.rss.channel.item[0].description).toContain("5 > 3 & 2 < 4");
  });

  it("handles a trailing slash on the site URL without doubling it", () => {
    const withSlash = buildRssFeed(FIXTURE_POSTS, "https://example.test/");
    expect(withSlash).toContain("<link>https://example.test/blog</link>");
    expect(withSlash).not.toContain("example.test//blog");
  });
});
