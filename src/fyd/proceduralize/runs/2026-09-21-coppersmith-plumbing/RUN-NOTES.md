# Second-site run notes: Coppersmith Plumbing & HVAC

Grill plan item 2. Site: https://www.coppersmithplumbing.com/ (plumbing, HVAC,
mechanical contractor, Grand Junction CO). Chosen because it is a different
trade (plumbing/HVAC vs carpentry) and a different structure (WordPress
multi-page site with Rank Math JSON-LD vs the Happy Place marketing page).
robots.txt allows the fetch (Disallow: /wp-admin/ only); crawl-delay 10 honored.
Observed at: 2026-09-21T12:01:10.844Z

## Per-field extraction yields (RESOLVE output, real run)

- description: "Coppersmith Plumbing &amp; HVAC has serviced Western Colorado for over 25 years. With a proven track record of quality work and diverse ski... (confidence 1, grade CONFIRMED, source html)
- locale: "en_US" (confidence 1, grade CONFIRMED, source html)
- site_name: "Coppersmith Plumbing - HVAC - Mechanical" (confidence 1, grade CONFIRMED, source html)
- title: "Coppersmith Plumbing" (confidence 1, grade CONFIRMED, source rss)
- type: "website" (confidence 1, grade CONFIRMED, source html)
- updated_time: "2025-10-01T10:31:10-06:00" (confidence 1, grade CONFIRMED, source html)
- website: "https://www.coppersmithplumbing.com/" (confidence 1, grade CONFIRMED, source html)

## Honest failure list

1. JSON-LD @graph envelopes are invisible. flattenJsonLd iterates only
   top-level mapped keys and never recurses into unmapped keys, so the
   @graph array that Rank Math / Yoast (the dominant WordPress SEO
   plugins) use to wrap every schema node is skipped entirely. On this
   real site the JSON-LD block parsed but contributed ZERO facts: the
   organization name, telephone (970-245-3869), openingHours, address,
   and logo URL were all present in the bytes and all missed. This is
   the single most valuable finding: the flagship extraction path was
   never exercised against real @graph JSON-LD before this run.
2. Nested schema.org objects are dropped even when reached. When a
   mapped key holds an object (address -> PostalAddress, logo ->
   ImageObject), flattenJsonLd keeps only strings and string arrays, so
   the address and logo would still be lost after fixing #1. The
   address-coarsening policy in extract() is dead code in practice: it
   only sees flat strings, which the flattener never produces.
3. RESOLVE priority works against the site. discover() emits the
   homepage as sourceType html and parse() tags the JSON-LD/OG/meta
   facts it pulls from that page as html too, so the documented
   json-ld > opengraph > html-meta tiers collapse into one. Effective
   priority on real runs is rss > atom > sitemap > html. Here the RSS
   channel <title> ("Coppersmith Plumbing") outranked the
   organization's own JSON-LD name and the og:title, and became the
   business title with confidence 1.0.
4. The <title> regex misfires on XML. On the RSS feed it grabbed the
   channel <title> as a business title fact with confidence 1.0. On a
   feed whose channel title differs from the business name this injects
   a wrong name at top confidence.
5. No HTML entity decoding. The meta description and og:title carry
   &amp; verbatim into resolved fields.
6. Unmapped og:/meta properties become raw field names (site_name,
   locale, type, updated_time). They flow onto the business object and
   are only tolerated as info findings. No allowlist, no mapping.
7. relate() output is dead. relate() emits links_to pairs for socials,
   but project() neither accepts nor uses them, so no social
   relationships ever reach the graph. (Here there were 0 pairs anyway
   because the Person sameAs died with the JSON-LD in #1.)
8. PROJECT emits only business (+ location when a locality exists).
   The generator's Services, Products, People, and RecentObjects
   sections are unreachable through the current proceduralizer: it
   never emits provides/offers/publishes/employs relationships or
   service objects. Any spec from this pipeline is home + about.
9. PARSE has no sitemap handler. DISCOVER enumerates /sitemap.xml but
   parse() extracts nothing from sitemap XML. The sitemap fetch (and
   its 10s crawl-delay slot) is pure cost.
10. Source limitation, not a pipeline bug: the site's own meta
    description is truncated mid-sentence in the HTML ("our team" with
    nothing after). The pipeline faithfully reproduces the truncation.

## Spec result

- Pages: home, about
- Renderable: true (0 errors, 0 warnings, 0 info)
- Relationships: 0 (relate() pairs: 0, dropped by project())

## Highest-value fix

Teach flattenJsonLd to recurse into unmapped object/array values, starting
with the @graph envelope. That single change makes the JSON-LD on this
site (and on most Rank Math / Yoast WordPress sites) visible: org name,
telephone, openingHours, then (with nested-object leaf handling) the
PostalAddress locality and logo URL. It is the difference between a
thin contact card and a useful generated site for JSON-LD-rich trade
sites, and it un-breaks the documented json-ld-first source priority.
Second: tag facts parsed from the homepage with their true tier
(json-ld vs opengraph vs html-meta) instead of the fetch sourceType, so
RESOLVE priority fires as documented and an RSS channel title can no
longer outrank the organization's own JSON-LD name.
