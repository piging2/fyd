/**
 * Feed XML parsing for the acquisition path (proceduralizer stage 3: PARSE).
 *
 * RSS 2.0 and Atom -> feed items -> ParsedFact[] with claimKind "feed_item".
 * Every item carries its provenance: the feed URL plus the item GUID, so a
 * downstream claim can always be traced back to the exact feed entry it
 * came from.
 *
 * Pure and fail-closed: malformed XML, unknown formats, empty or absurdly
 * large payloads yield null / zero facts, never a throw. The machine never
 * invents feed items.
 */

import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { AcquiredSource, ClaimKind, ParsedFact } from "./proceduralizer";

/** One normalized feed entry. */
export interface FeedItem {
  title: string;
  link: string;
  /** Item GUID (falls back to link, then title, then a stable index id). */
  guid: string;
  /** ISO-8601 when the feed date parses, null otherwise. */
  publishedAt: string | null;
  description: string;
}

/** A successfully parsed feed document. */
export interface ParsedFeed {
  format: "rss" | "atom";
  feedTitle: string;
  siteUrl: string;
  items: FeedItem[];
}

const MAX_XML_BYTES = 5 * 1024 * 1024;
const MAX_ITEMS = 200;
const MAX_TITLE_CHARS = 500;
const MAX_DESC_CHARS = 2000;

const FEED_CLAIM_KIND: ClaimKind = "feed_item";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  trimValues: true,
  // Keep values as strings; dates and guids must not be coerced to numbers.
  parseTagValue: false,
});

type XmlNode = Record<string, unknown>;

function asRecord(v: unknown): XmlNode | null {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as XmlNode) : null;
}

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

/** Text of a node that may be a bare string or a { "#text": ... } record. */
function textOf(v: unknown): string {
  if (typeof v === "string") return v;
  const r = asRecord(v);
  if (r && typeof r["#text"] === "string") return r["#text"];
  return "";
}

function trunc(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) : s;
}

function isoDate(raw: string): string | null {
  if (!raw) return null;
  const t = new Date(raw);
  return Number.isNaN(t.getTime()) ? null : t.toISOString();
}

/** Prefer the alternate link, else the first link with an href. */
function pickLink(links: unknown): string {
  const list = asArray<unknown>(links);
  let first = "";
  for (const l of list) {
    if (typeof l === "string") {
      if (!first) first = l;
      continue;
    }
    const r = asRecord(l);
    const href = r && typeof r["@_href"] === "string" ? r["@_href"] : "";
    if (!href) continue;
    if (!first) first = href;
    if (r && r["@_rel"] === "alternate") return href;
  }
  return first;
}

function rssItems(channel: XmlNode): FeedItem[] {
  return asArray<unknown>(channel["item"]).map((raw, i) => {
    const it = asRecord(raw) ?? {};
    const title = trunc(textOf(it["title"]), MAX_TITLE_CHARS);
    const link = textOf(it["link"]);
    const guidRaw = textOf(it["guid"]);
    const description = trunc(
      textOf(it["content:encoded"]) || textOf(it["description"]),
      MAX_DESC_CHARS,
    );
    return {
      title,
      link,
      guid: guidRaw || link || title || `item-${i}`,
      publishedAt: isoDate(textOf(it["pubDate"]) || textOf(it["dc:date"])),
      description,
    };
  });
}

function atomEntries(feed: XmlNode): FeedItem[] {
  return asArray<unknown>(feed["entry"]).map((raw, i) => {
    const e = asRecord(raw) ?? {};
    const title = trunc(textOf(e["title"]), MAX_TITLE_CHARS);
    const link = pickLink(e["link"]);
    const idRaw = textOf(e["id"]);
    const content = asRecord(e["content"]);
    const description = trunc(
      textOf(e["summary"]) || (content ? textOf(content) : textOf(e["content"])),
      MAX_DESC_CHARS,
    );
    return {
      title,
      link,
      guid: idRaw || link || title || `entry-${i}`,
      publishedAt: isoDate(textOf(e["published"]) || textOf(e["updated"])),
      description,
    };
  });
}

/**
 * Parse raw feed XML. Returns null when the document is not a readable
 * RSS 2.0 or Atom feed. Never throws.
 */
export function parseFeedXml(xml: string, feedUrl: string): ParsedFeed | null {
  try {
    if (!xml || xml.length > MAX_XML_BYTES) return null;
    if (XMLValidator.validate(xml) !== true) return null;
    const doc = asRecord(parser.parse(xml));
    if (!doc) return null;

    const rss = asRecord(doc["rss"]);
    if (rss) {
      const channel = asRecord(rss["channel"]);
      if (!channel) return null;
      return {
        format: "rss",
        feedTitle: trunc(textOf(channel["title"]), MAX_TITLE_CHARS),
        siteUrl: textOf(channel["link"]),
        items: rssItems(channel).slice(0, MAX_ITEMS),
      };
    }

    const feed = asRecord(doc["feed"]);
    if (feed) {
      return {
        format: "atom",
        feedTitle: trunc(textOf(feed["title"]), MAX_TITLE_CHARS),
        siteUrl: pickLink(feed["link"]),
        items: atomEntries(feed).slice(0, MAX_ITEMS),
      };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Stage-3 PARSE adapter: an acquired rss/atom source -> ParsedFacts.
 * Facts carry the true tier ("rss" | "atom") as sourceType and the
 * "feed_item" claim kind; the item GUID rides in evidenceDetail so
 * provenance() can build a feed-URL + GUID evidence reference.
 */
export function feedFacts(acquired: AcquiredSource): ParsedFact[] {
  if (!acquired.ok || !acquired.raw) return [];
  const feed = parseFeedXml(acquired.raw, acquired.url);
  if (!feed) return [];
  return feed.items.map((item) => ({
    name: "feed_item",
    value: item.title || item.guid,
    sourceType: acquired.sourceType,
    inferred: false,
    claimKind: FEED_CLAIM_KIND,
    evidenceDetail: item.guid,
  }));
}

/**
 * Evidence reference builder for the provenance() stage: feed URL plus
 * the item GUID. Non-feed facts keep the plain source URL.
 */
export function feedEvidenceRef(feedUrl: string, fact: ParsedFact): string {
  if (fact.claimKind === FEED_CLAIM_KIND && fact.evidenceDetail) {
    return `${feedUrl}#guid:${fact.evidenceDetail}`;
  }
  return feedUrl;
}
