/**
 * Tiny evidence extractor over fetched HTML (onboarding order G).
 *
 * This is OBSERVED text only: it reads what the page says and reports it
 * verbatim. It never infers, fills gaps, or manufactures facts. Missing
 * fields are null, not guesses.
 *
 * Hostile-input note: <script> and <style> blocks are stripped before text
 * extraction so injected markup cannot plant fake contact facts.
 */
export interface PageEvidence {
  title: string | null;
  description: string | null;
  headings: string[];
  phone: string | null;
  email: string | null;
  address: string | null;
  services: string[];
  hours: string[];
  social: string[];
}

function stripScriptsAndStyles(html: string): string {
  return html
    .replace(/<script[\s>][\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<style[\s>][\s\S]*?<\/style\s*>/gi, " ");
}

function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, " ");
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/\s+/g, " ")
    .trim();
}

function cleanText(s: string): string {
  return decodeEntities(stripTags(s));
}

function firstMatch(html: string, re: RegExp): string | null {
  const m = re.exec(html);
  return m ? cleanText(m[1]) : null;
}

function metaContent(html: string, attr: string, value: string): string | null {
  const tagRe = new RegExp(
    "<meta\\s+[^>]*" + attr + '=["\']' + value + '["\'][^>]*>',
    "i",
  );
  const tag = tagRe.exec(html);
  if (!tag) return null;
  const content = /content=["']([\s\S]*?)["']/i.exec(tag[0]);
  return content ? decodeEntities(content[1].trim()) : null;
}

const PHONE_RE = /(?<!\d)(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/;
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;

function firstPhoneFromLinks(html: string): string | null {
  const m = /<a\s+[^>]*href=["']tel:([^"']+)["']/i.exec(html);
  return m ? decodeEntities(m[1].trim()) : null;
}

function firstEmailFromLinks(html: string): string | null {
  const m = /<a\s+[^>]*href=["']mailto:([^"'>?]+)/i.exec(html);
  return m ? decodeEntities(m[1].trim()) : null;
}

function collectHeadings(html: string): string[] {
  const out: string[] = [];
  const re = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.length < 10) {
    const t = cleanText(m[1]);
    if (t && t.length <= 140 && !out.includes(t)) out.push(t);
  }
  return out;
}

function collectListItems(html: string): string[] {
  const out: string[] = [];
  const re = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.length < 20) {
    const t = cleanText(m[1]);
    if (t && t.length > 2 && t.length <= 120 && !out.includes(t)) out.push(t);
  }
  return out;
}

const SOCIAL_HOSTS = [
  "facebook.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "linkedin.com",
  "youtube.com",
  "tiktok.com",
];

function collectSocial(html: string): string[] {
  const out: string[] = [];
  const re = /<a\s+[^>]*href=["'](https?:\/\/[^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const href = m[1].toLowerCase();
    if (SOCIAL_HOSTS.some((h) => href.includes(h)) && !out.includes(m[1])) {
      out.push(m[1]);
      if (out.length >= 10) break;
    }
  }
  return out;
}

interface JsonLdBusiness {
  name?: string;
  telephone?: string;
  email?: string;
  address?: string | Record<string, string>;
  openingHours?: string | string[];
  description?: string;
}

function parseJsonLd(html: string): JsonLdBusiness | null {
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const parsed: unknown = JSON.parse(m[1]);
      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      for (const c of candidates) {
        if (typeof c !== "object" || c === null) continue;
        const t = (c as Record<string, unknown>)["@type"];
        const types = Array.isArray(t) ? t : [t];
        if (
          types.some(
            (x) =>
              typeof x === "string" &&
              /localbusiness|organization|store|restaurant|plumber/i.test(x),
          )
        ) {
          return c as JsonLdBusiness;
        }
      }
    } catch {
      // Malformed JSON-LD is not evidence; ignore.
    }
  }
  return null;
}

function formatAddress(a: string | Record<string, string>): string {
  if (typeof a === "string") return a.trim();
  const parts = [
    a.streetAddress,
    a.addressLocality,
    a.addressRegion,
    a.postalCode,
  ].filter((x) => typeof x === "string" && x.trim());
  return parts.join(", ");
}

const HOURS_RE =
  /\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)(?:day)?(?:\s*[-–]\s*(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)(?:day)?)?\s*:?\s*\d{1,2}(?::\d{2})?\s*(?:am|pm|AM|PM)?\s*[-–]\s*\d{1,2}(?::\d{2})?\s*(?:am|pm|AM|PM)?/;

function collectHours(text: string, jsonLd: JsonLdBusiness | null): string[] {
  const out: string[] = [];
  if (jsonLd?.openingHours) {
    const hrs = Array.isArray(jsonLd.openingHours) ? jsonLd.openingHours : [jsonLd.openingHours];
    for (const h of hrs) {
      if (typeof h === "string" && h.trim() && !out.includes(h.trim())) out.push(h.trim());
    }
  }
  const m = HOURS_RE.exec(text);
  if (m && !out.includes(m[0].trim())) out.push(m[0].trim());
  return out.slice(0, 6);
}

export function extractPageEvidence(html: string, _finalUrl: string): PageEvidence {
  const safe = stripScriptsAndStyles(html);
  const jsonLd = parseJsonLd(html);
  const text = cleanText(safe);

  const title =
    firstMatch(safe, /<title[^>]*>([\s\S]*?)<\/title>/i) ??
    metaContent(safe, "property", "og:title");
  const description =
    metaContent(safe, "name", "description") ??
    metaContent(safe, "property", "og:description") ??
    jsonLd?.description?.trim() ??
    null;

  const phone =
    firstPhoneFromLinks(safe) ??
    (jsonLd?.telephone ? String(jsonLd.telephone).trim() : null) ??
    PHONE_RE.exec(text)?.[0] ??
    null;
  const email =
    firstEmailFromLinks(safe) ??
    (jsonLd?.email ? String(jsonLd.email).trim() : null) ??
    EMAIL_RE.exec(text)?.[0] ??
    null;
  const address = jsonLd?.address ? formatAddress(jsonLd.address) : null;

  return {
    title,
    description,
    headings: collectHeadings(safe),
    phone,
    email,
    address,
    services: collectListItems(safe),
    hours: collectHours(text, jsonLd),
    social: collectSocial(safe),
  };
}
