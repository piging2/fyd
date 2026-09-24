/**
 * Projection-seam attack gauntlet (security lane).
 *
 * Invariant under test: NO EXECUTABLE SOURCE CONTENT CROSSES THE
 * PROJECTION SEAM. Source fixture data (object titles, descriptions,
 * fields, ids, URLs) is untrusted text. The rendered public HTML must
 * never contain executable content derived from it:
 *   - no script/iframe/object/embed markup from source,
 *   - no event-handler attributes (onerror, onload, ...),
 *   - no javascript:/data:/vbscript:/file:/blob: URLs in href/src/action,
 *   - no unescaped source markup anywhere in the output,
 *   - no CSS expression()/javascript: payloads in style attributes.
 *
 * Path under test (the real one, same as projection-boundary.test.ts):
 *   synthetic hostile ObjectGraph -> generateSiteSpec ->
 *   buildRenderContext (owner visibility projection) ->
 *   renderToStaticMarkup(SitePageView) for every page.
 *
 * Also under test: private objects and owner-hidden fields never appear
 * in public output.
 *
 * Every bypass of the invariant is a FAILING test. That is the point:
 * a failing test here is a found hole, not a broken test.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { SitePageView, buildRenderContext } from "../../components/renderer";
import { generateSiteSpec } from "../../proceduralize/generator";
import { planSite } from "../../builder/planner";
import { COPPERSMITH_VECTOR } from "../../builder/dimensions";
import type { FieldVisibilityDecision } from "../../sitespec/field-visibility";
import type { ObjectGraph, ViewerContext } from "../../sitespec/types";
import type { PingObject } from "@/lib/ping/types";

const OBS = "2026-09-23T18:30:00Z";
const VIEWER: ViewerContext = { viewerId: null, displayName: null };
const EVIL_REF = "website-ingestion:https://evil.example/";

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

function makeObject(
  id: string,
  schema: string,
  title: string,
  description: string,
  fields: Record<string, string | string[]>,
  visibility: "public" | "private" = "public",
): PingObject {
  return {
    id,
    schema,
    controllerId: "identity_seam_attack_test",
    visibility,
    title,
    description,
    fields,
    createdAt: OBS,
    updatedAt: OBS,
    provenance: { kind: "website-derived", ref: EVIL_REF, derivedAt: OBS },
  };
}

function makeRelationship(id: string, subject: string, predicate: string, object: string) {
  return {
    id,
    subject,
    predicate,
    object,
    status: "active" as const,
    createdAt: OBS,
    evidenceRef: EVIL_REF,
  };
}

/** Render every page of a hostile graph to one HTML string. */
function renderPages(graph: ObjectGraph, decisions: FieldVisibilityDecision[] = []): string {
  const spec = generateSiteSpec(graph, { generatedAt: OBS });
  const ctx = buildRenderContext(spec, graph, VIEWER, decisions);
  return spec.pages.map((page) => renderToStaticMarkup(SitePageView({ page, ctx }))).join("\n");
}

function ownerDecision(
  objectId: string,
  field: string,
  policy: FieldVisibilityDecision["policy"],
): FieldVisibilityDecision {
  return {
    objectId,
    field,
    policy,
    decidedBy: "owner",
    decidedAt: OBS,
    source: "owner_override",
    version: 1,
  };
}

/** Standard hostile graph: evil business + service + location. Extra objects
 *  can be appended by each test. */
function hostileBase(extraObjects: PingObject[] = [], extraRels: ReturnType<typeof makeRelationship>[] = []): ObjectGraph {
  const biz = makeObject(
    "biz-evil",
    "ping.social.business@1",
    "Evil Business <SEAM-TITLE>",
    "Base description. SEAM-CANARY-BASE",
    {
      phone: "+19705550100",
      email: "hello@evil.example",
      website: "https://evil.example/",
    },
  );
  const svc = makeObject(
    "svc-evil-1",
    "ping.social.service@1",
    "Evil Service",
    "Service description.",
    { name: "Evil Service" },
  );
  const loc = makeObject(
    "loc-evil-1",
    "ping.social.location@1",
    "Evil Town, CO",
    "Location description.",
    { address_locality: "Evil Town" },
  );
  return {
    objects: [biz, svc, loc, ...extraObjects],
    relationships: [
      makeRelationship("rel-evil-1", "biz-evil", "offers", "svc-evil-1"),
      makeRelationship("rel-evil-2", "biz-evil", "located_at", "loc-evil-1"),
      ...extraRels,
    ],
  };
}

// ---------------------------------------------------------------------------
// Executable-content detector
// ---------------------------------------------------------------------------

const EVENT_HANDLERS =
  "onload|onerror|onclick|ondblclick|onmouseover|onmouseout|onmouseenter|onmouseleave|" +
  "onfocus|onblur|onsubmit|onchange|oninput|onkeydown|onkeyup|onkeypress|oncontextmenu|" +
  "onwheel|onscroll|ontoggle|onanimationstart|onanimationend|ontransitionend|" +
  "onpointerdown|onpointerup|ontouchstart|ontouchend|ondragstart|ondrop|" +
  "onpaste|oncopy|oncut|onformdata|oninvalid|onreset|onselect|onauxclick";

/** Real (unescaped) tags in the HTML, with quote-aware matching so a raw
 *  ">" inside a quoted attribute value cannot confuse the tokenizer.
 *  Escaped source text can never match: it contains no raw < or >. */
function realTags(html: string): string[] {
  const tags: string[] = [];
  const re = /<[a-zA-Z](?:"[^"]*"|'[^']*'|[^<>"'])*>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) tags.push(m[0]);
  return tags;
}

/**
 * Event-handler attributes found on REAL tags only. Attribute VALUES are
 * stripped before matching: a handler name is only dangerous as an
 * attribute name. Source payloads that React escaped into inert attribute
 * values (e.g. aria-label="... &lt;svg onload= ...&gt;") are text, not
 * handlers, and must not trip the detector.
 *
 * Soundness note: this scans React-emitted HTML, where attributes are
 * always space-separated and source text can never inject raw attribute
 * syntax (React escapes & < > " ' in both text and attribute values).
 * It is a test detector, not a sanitizer: the seam's real defense is
 * React escaping + resolveSafeLink, which these tests verify.
 */
function realTagHandlers(html: string): string[] {
  const found: string[] = [];
  const handlerRe = new RegExp(`\\s(${EVENT_HANDLERS})\\s*=`, "i");
  for (const tag of realTags(html)) {
    const namesOnly = tag.replace(/"[^"]*"|'[^']*'/g, "");
    const h = namesOnly.match(handlerRe);
    if (h) found.push(`${h[1].toLowerCase()} in ${tag.slice(0, 70)}`);
  }
  return [...new Set(found)];
}

/** Returns a human-readable list of executable-content findings. Empty = clean. */
function executableFindings(html: string): string[] {
  const findings: string[] = [];
  if (/<\/?script/i.test(html)) findings.push("raw <script> tag");
  if (/<\/?(iframe|frame|frameset|object|embed)\b/i.test(html))
    findings.push("raw frame/object/embed tag");
  const handlers = realTagHandlers(html);
  if (handlers.length > 0) findings.push("event-handler attributes: " + handlers.join("; "));
  for (const m of html.matchAll(/\b(?:href|src|action|xlink:href)\s*=\s*"([^"]*)"/gi)) {
    if (/^\s*(javascript|data|vbscript|file|blob)\s*:/i.test(m[1]))
      findings.push("executable URL in attribute: " + m[0].slice(0, 90));
  }
  for (const m of html.matchAll(/\bstyle\s*=\s*"([^"]*)"/gi)) {
    if (/expression\s*\(|javascript\s*:|vbscript\s*:|behaviou?r\s*\(|-moz-binding/i.test(m[1]))
      findings.push("CSS payload in style attribute: " + m[1].slice(0, 90));
  }
  return findings;
}

function expectNoExecutable(html: string): void {
  expect(executableFindings(html)).toEqual([]);
}

// ---------------------------------------------------------------------------
// Payloads
// ---------------------------------------------------------------------------

const HOSTILE_URLS = [
  "javascript:alert('SEAM-URL-1')",
  "JaVaScRiPt:alert('SEAM-URL-2')",
  "   javascript:alert('SEAM-URL-3')   ",
  "java\tscript:alert('SEAM-URL-4')",
  "java\nscript:alert('SEAM-URL-5')",
  "data:text/html,<script>alert('SEAM-URL-6')</script>",
  "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
  "vbscript:msgbox('SEAM-URL-7')",
  "file:///etc/passwd",
  "blob:https://evil.example/SEAM-URL-8",
  "java\0script:alert('SEAM-URL-9')",
  "&#106;avascript:alert('SEAM-URL-10')",
];

const MALFORMED_URLS = [
  "http://[::1:80",
  "://missing-scheme",
  "https://",
  "http://",
  "https://exa mple.com/seam",
  "\0https://evil.example/",
];

/** Markup payloads. Each carries a unique SEAM marker. The exact raw string
 *  must never appear in output HTML; the markers may only appear escaped. */
const MARKUP_PAYLOADS = [
  "<script>alert('SEAM-M1')</script>",
  "<SCRIPT SRC=x onerror=alert('SEAM-M2')>",
  "<iframe src=\"https://evil.example/\" title=\"SEAM-M3\"></iframe>",
  "<object data=\"https://evil.example/x\" data-seam=\"SEAM-M4\"></object>",
  "<embed src=\"https://evil.example/x\" data-seam=\"SEAM-M5\">",
  "<img src=x onerror=\"alert('SEAM-M6')\">",
  "\"><svg onload=\"alert('SEAM-M7')\">",
  "<svg><g onload=\"alert('SEAM-M8')\"><circle r=10 /></g></svg>",
  "<svg><image xlink:href=\"javascript:alert('SEAM-M9')\" /></svg>",
  "<math><mi xlink:href=\"javascript:alert('SEAM-M10')\">x</mi></math>",
  "<form action=\"javascript:alert('SEAM-M11')\"><input type=submit></form>",
  "<a href=\"javascript:alert('SEAM-M12')\">SEAM-CLICK</a>",
  "<div style=\"background:url(javascript:alert('SEAM-M13'))\">x</div>",
  "<div style=\"width:expression(alert('SEAM-M14'))\">x</div>",
  "<style>body{background:url('javascript:alert(\"SEAM-M15\")')}</style>",
  "';alert('SEAM-M16');//",
  "\";alert('SEAM-M17');//",
  "`;alert('SEAM-M18');//",
  "${alert('SEAM-M19')}",
  "{{constructor.constructor('alert(\\'SEAM-M20\\')')()}}",
  "&lt;script&gt;alert('SEAM-M21')&lt;/script&gt;",
  "&amp;lt;script&amp;gt;alert('SEAM-M22')&amp;lt;/script&amp;gt;",
];

const BIDI_PAYLOAD = "\u202ASEAM-BIDI-1\u202C"; // U+202A LTR embedding ... U+202C pop
const BIDI_RLO = "\u202ESEAM-BIDI-2\u202C"; // U+202E RTL override ... U+202C pop
const ZW_PAYLOAD = "\u200BSEAM-ZW-1\u200C\uFEFF"; // U+200B ZWSP, U+200C ZWNJ, U+FEFF around a contiguous marker
const NULL_PAYLOAD = "SEAM-NULL-1\0TRUNC?";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("projection seam: hostile URLs", () => {
  test("javascript:/data:/vbscript: URLs in every URL field never become executable hrefs", () => {
    for (const hostile of HOSTILE_URLS) {
      const graph = hostileBase();
      graph.objects[0] = {
        ...graph.objects[0],
        fields: { ...graph.objects[0].fields, website: hostile, email: hostile },
      };
      // Related website object carrying the hostile URL in its `url` field.
      const site = makeObject("site-evil-1", "ping.social.website@1", "Evil Site", "Site desc.", {
        url: hostile,
      });
      graph.objects.push(site);
      graph.relationships.push(makeRelationship("rel-site", "biz-evil", "has_website", "site-evil-1"));
      let html: string;
      expect(() => {
        html = renderPages(graph);
      }).not.toThrow();
      expectNoExecutable(html!);
      // The hostile string itself must not echo into the output at all.
      expect(html!).not.toContain(hostile.replace(/\0/g, ""));
    }
  });

  test("malformed URLs are non-navigable and never throw", () => {
    for (const bad of MALFORMED_URLS) {
      const graph = hostileBase();
      graph.objects[0] = {
        ...graph.objects[0],
        fields: { ...graph.objects[0].fields, website: bad },
      };
      let html = "";
      expect(() => {
        html = renderPages(graph);
      }).not.toThrow();
      expectNoExecutable(html);
    }
  });

  test("mailto: smuggling stays inert: javascript: inside a mailto: value is not an executable href", () => {
    const graph = hostileBase();
    const sneaky = "javascript:alert('SEAM-EM')@evil.example";
    graph.objects[0] = {
      ...graph.objects[0],
      fields: { ...graph.objects[0].fields, email: sneaky },
    };
    const html = renderPages(graph);
    expectNoExecutable(html);
    // If a mailto: link is emitted at all, it must start with the mailto: scheme.
    for (const m of html.matchAll(/href="([^"]*)"/gi)) {
      expect(m[1]).not.toMatch(/^javascript:/i);
    }
  });
});

describe("projection seam: hostile markup in text fields", () => {
  function markupGraph(): ObjectGraph {
    const graph = hostileBase();
    const blob = MARKUP_PAYLOADS.join("\n");
    graph.objects[0] = {
      ...graph.objects[0],
      title: "Evil <b>Business</b> SEAM-TITLE-MARKUP",
      description: blob + "\n" + BIDI_PAYLOAD + "\n" + ZW_PAYLOAD + "\nSEAM-CANARY-MARKUP",
      fields: {
        ...graph.objects[0].fields,
        description: blob,
        tagline: "Buy now! \"onmouseover=alert('SEAM-ATTR')\"",
      },
    };
    return graph;
  }

  test("no markup payload crosses the seam unescaped", () => {
    const html = renderPages(markupGraph());
    expectNoExecutable(html);
    for (const payload of MARKUP_PAYLOADS) {
      expect(html).not.toContain(payload);
    }
    // The hostile title's raw markup never echoes either.
    expect(html).not.toContain("<b>Business</b>");
  });

  test("hostile text still renders as inert text (the test is not vacuous)", () => {
    const html = renderPages(markupGraph());
    // Canary proves the hostile description reached the renderer.
    expect(html).toContain("SEAM-CANARY-MARKUP");
    // And the escaped form of a markup payload proves escaping happened.
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>alert('SEAM-M1')</script>");
  });

  test("no event-handler attribute materializes from source text", () => {
    const graph = hostileBase();
    graph.objects[0] = {
      ...graph.objects[0],
      title: "<img src=x onerror=\"alert('SEAM-EH1')\"> Evil",
      description: "x <svg onload=\"alert('SEAM-EH2')\"> y <body onfocus=\"alert('SEAM-EH3')\">",
    };
    const html = renderPages(graph);
    expectNoExecutable(html);
    // Real tags carry no event handlers at all; the payloads only exist as escaped text.
    expect(realTagHandlers(html)).toEqual([]);
    expect(html).not.toContain('<img src=x onerror=');
    expect(html).not.toContain('<svg onload=');
    expect(html).not.toContain('<body onfocus=');
  });

  test("form action hijacking is impossible: no javascript: form action", () => {
    const graph = hostileBase();
    graph.objects[0] = {
      ...graph.objects[0],
      description: "<form action=\"javascript:alert('SEAM-FORM')\"><input type=submit></form>",
    };
    const html = renderPages(graph);
    expectNoExecutable(html);
    expect(html).not.toMatch(/\baction\s*=\s*"[^"]*javascript:/i);
    expect(html).not.toMatch(/\baction\s*=\s*"[^"]*data:/i);
  });

  test("SVG and MathML with onload/xlink:href stay inert", () => {
    const graph = hostileBase();
    graph.objects[1] = {
      ...graph.objects[1],
      title: "Svc <svg onload=alert('SEAM-SVG')>",
      description: "<math><mi xlink:href=\"javascript:alert('SEAM-MATH')\">x</mi></math>",
    };
    const html = renderPages(graph);
    expectNoExecutable(html);
    expect(html).not.toContain("<svg onload");
    expect(html).not.toContain("javascript:alert('SEAM-MATH')");
  });

  test("double-encoded entities stay inert text (no decode-then-execute)", () => {
    const graph = hostileBase();
    graph.objects[0] = {
      ...graph.objects[0],
      description: "&amp;lt;script&amp;gt;alert('SEAM-DENC')&amp;lt;/script&amp;gt;",
    };
    const html = renderPages(graph);
    expectNoExecutable(html);
    // Rendered double-escaped: visible to the reader as "&lt;script&gt;", never a tag.
    expect(html).toContain("&amp;amp;lt;script&amp;amp;gt;");
  });

  test("hostile object ids cannot break out of attributes", () => {
    const evilId = "svc-evil\"><img src=x onerror=alert('SEAM-ID1')>";
    const svc = makeObject(evilId, "ping.social.service@1", "Evil Svc", "Desc.", { name: "Evil" });
    const graph = hostileBase([svc], [makeRelationship("rel-id", "biz-evil", "offers", evilId)]);
    const html = renderPages(graph);
    expectNoExecutable(html);
    expect(realTagHandlers(html)).toEqual([]);
    expect(html).not.toContain("svc-evil\">");
    expect(html).not.toContain("<img src=x onerror=alert");
  });

  test("CSS expression()/url(javascript:) payloads never reach style attributes", () => {
    const graph = hostileBase();
    graph.objects[0] = {
      ...graph.objects[0],
      fields: {
        ...graph.objects[0].fields,
        accent_color: "red;expression(alert('SEAM-CSS1'))",
        brand_style: "background:url(javascript:alert('SEAM-CSS2'))",
        custom_css: "-moz-binding:url('https://evil.example/xss.xml#xss')",
      },
      description: "<div style=\"width:expression(alert('SEAM-CSS3'))\">x</div>",
    };
    const html = renderPages(graph);
    expectNoExecutable(html);
    expect(html).not.toContain("expression(alert('SEAM-CSS1'))");
  });
});

describe("projection seam: unicode and control characters", () => {
  test("bidi overrides and zero-width chars are inert text, not executable", () => {
    const graph = hostileBase();
    graph.objects[0] = {
      ...graph.objects[0],
      title: BIDI_RLO + " Evil Business",
      description: ZW_PAYLOAD + " " + BIDI_PAYLOAD,
    };
    const html = renderPages(graph);
    expectNoExecutable(html);
    // They pass through as inert text (documented behavior); markers prove reachability.
    expect(html).toContain("SEAM-BIDI-2");
    expect(html).toContain("SEAM-ZW-1");
  });

  test("null bytes do not crash the render and never execute", () => {
    const graph = hostileBase();
    graph.objects[0] = {
      ...graph.objects[0],
      title: "Evil\0Business",
      description: NULL_PAYLOAD,
      fields: { ...graph.objects[0].fields, notes: "a\0b" },
    };
    let html = "";
    expect(() => {
      html = renderPages(graph);
    }).not.toThrow();
    expectNoExecutable(html);
  });
});

describe("projection seam: resource exhaustion", () => {
  test("1MB string field renders without executable content", () => {
    const big = "SEAM-BIG " + "x".repeat(1024 * 1024);
    const graph = hostileBase();
    graph.objects[0] = {
      ...graph.objects[0],
      fields: { ...graph.objects[0].fields, notes: big },
    };
    let html = "";
    expect(() => {
      html = renderPages(graph);
    }).not.toThrow();
    // If the field renders, it renders big; either way nothing executes.
    expectNoExecutable(html);
  }, 30000);
});

describe("projection seam: visibility", () => {
  test("private objects never appear in public output", () => {
    const secret = makeObject(
      "priv-evil-1",
      "ping.social.business@1",
      "PRIVATE-SEAM-MARKER-77 Secret Business",
      "PRIVATE-SEAM-MARKER-77 <script>alert('SEAM-PRIV')</script>",
      { phone: "+19705550999", internal_notes: "PRIVATE-SEAM-MARKER-77" },
      "private",
    );
    const graph = hostileBase(
      [secret],
      [makeRelationship("rel-priv", "biz-evil", "related_to", "priv-evil-1")],
    );
    const html = renderPages(graph);
    expectNoExecutable(html);
    expect(html).not.toContain("PRIVATE-SEAM-MARKER-77");
    expect(html).not.toContain("priv-evil-1");
    expect(html).not.toContain("+19705550999");
  });

  test("owner-hidden fields never appear in public output", () => {
    const graph = hostileBase();
    graph.objects[0] = {
      ...graph.objects[0],
      fields: { ...graph.objects[0].fields, secret_note: "HIDDEN-SEAM-MARKER-88" },
    };
    const decisions = [ownerDecision("biz-evil", "secret_note", "hide")];
    const spec = generateSiteSpec(graph, { generatedAt: OBS });
    const ctx = buildRenderContext(spec, graph, VIEWER, decisions);
    const html = spec.pages
      .map((page) => renderToStaticMarkup(SitePageView({ page, ctx })))
      .join("\n");
    expectNoExecutable(html);
    expect(html).not.toContain("HIDDEN-SEAM-MARKER-88");
    // Dropped from the projection...
    expect(ctx.graph.objects.find((o) => o.id === "biz-evil")!.fields["secret_note"]).toBeUndefined();
    // ...but source truth is untouched.
    expect(graph.objects.find((o) => o.id === "biz-evil")!.fields["secret_note"]).toBe(
      "HIDDEN-SEAM-MARKER-88",
    );
  });

  test("private field values do not leak through related public objects", () => {
    const secretLoc = makeObject(
      "loc-priv-1",
      "ping.social.location@1",
      "PRIVATE-SEAM-MARKER-99 Hidden Place",
      "PRIVATE-SEAM-MARKER-99",
      { address: "1 Secret Lane, Nowhere, CO" },
      "private",
    );
    const graph = hostileBase(
      [secretLoc],
      [makeRelationship("rel-privloc", "biz-evil", "located_at", "loc-priv-1")],
    );
    const html = renderPages(graph);
    expect(html).not.toContain("PRIVATE-SEAM-MARKER-99");
    expect(html).not.toContain("Secret Lane");
  });
});

describe("production builder path: planSite -> renderer", () => {
  /**
   * The route src/app/build/[siteId]/page.tsx plans with planSite (not the
   * proceduralize generator), so the gauntlet replays the attack battery
   * through that exact builder too.
   */
  function renderViaPlanner(graph: ObjectGraph, decisions: FieldVisibilityDecision[] = []): string {
    const planned = planSite({
      ctx: { tenantId: "seam-attack-tenant" },
      graph,
      vector: COPPERSMITH_VECTOR,
      generatedAt: OBS,
    });
    const ctx = buildRenderContext(planned.spec, graph, VIEWER, decisions);
    return planned.spec.pages
      .map((page) => renderToStaticMarkup(SitePageView({ page, ctx })))
      .join("\n");
  }

  /** One graph carrying every payload class at once. */
  function kitchenSink(): { graph: ObjectGraph; decisions: FieldVisibilityDecision[] } {
    const evilId = "svc-evil\"><img src=x onerror=alert('SEAM-PS-ID1')>";
    const svc = makeObject(evilId, "ping.social.service@1", "Svc <svg onload=alert('SEAM-PS-SVG')>", "Svc desc <math><mi xlink:href=\"javascript:alert('SEAM-PS-MATH')\">x</mi></math>", {
      name: "Evil Svc",
    });
    const secret = makeObject(
      "priv-ps-1",
      "ping.social.business@1",
      "PRIVATE-PS-MARKER-1 Secret",
      "PRIVATE-PS-MARKER-1 <script>alert('SEAM-PS-PRIV')</script>",
      { internal: "PRIVATE-PS-MARKER-1" },
      "private",
    );
    const graph = hostileBase(
      [svc, secret],
      [
        makeRelationship("rel-ps-id", "biz-evil", "offers", evilId),
        makeRelationship("rel-ps-priv", "biz-evil", "related_to", "priv-ps-1"),
      ],
    );
    const blob = MARKUP_PAYLOADS.join("\n");
    graph.objects[0] = {
      ...graph.objects[0],
      title: "Evil <b>Biz</b> SEAM-PS-TITLE\0",
      description: blob + "\n" + BIDI_PAYLOAD + "\n" + ZW_PAYLOAD + "\nSEAM-PS-CANARY",
      fields: {
        ...graph.objects[0].fields,
        website: "javascript:alert('SEAM-PS-URL')",
        email: "data:text/html,<script>alert('SEAM-PS-URL2')</script>",
        description: blob,
        accent_color: "red;expression(alert('SEAM-PS-CSS'))",
        secret_note: "HIDDEN-PS-MARKER-2",
        notes: "SEAM-PS-BIG " + "x".repeat(1024 * 1024),
      },
    };
    const decisions = [ownerDecision("biz-evil", "secret_note", "hide")];
    return { graph, decisions };
  }

  test("kitchen-sink hostile graph through planSite: no executable content", () => {
    const { graph, decisions } = kitchenSink();
    let html = "";
    expect(() => {
      html = renderViaPlanner(graph, decisions);
    }).not.toThrow();
    expectNoExecutable(html);
    expect(realTagHandlers(html)).toEqual([]);
    // Every markup payload stays escaped or absent.
    for (const payload of MARKUP_PAYLOADS) {
      expect(html).not.toContain(payload);
    }
    // Canary proves the hostile description reached the planner's renderer.
    expect(html).toContain("SEAM-PS-CANARY");
    // Hostile URL never became a link.
    expect(html).not.toContain("javascript:alert('SEAM-PS-URL')");
    // Private object and hidden field stayed out.
    expect(html).not.toContain("PRIVATE-PS-MARKER-1");
    expect(html).not.toContain("priv-ps-1");
    expect(html).not.toContain("HIDDEN-PS-MARKER-2");
    // Hostile id never broke out.
    expect(html).not.toContain("svc-evil\">");
  }, 30000);

  test("hostile URL loop through planSite", () => {
    for (const hostile of HOSTILE_URLS) {
      const graph = hostileBase();
      graph.objects[0] = {
        ...graph.objects[0],
        fields: { ...graph.objects[0].fields, website: hostile },
      };
      let html = "";
      expect(() => {
        html = renderViaPlanner(graph);
      }).not.toThrow();
      expectNoExecutable(html);
      expect(html).not.toContain(hostile.replace(/\0/g, ""));
    }
  }, 60000);

  test("malformed URLs through planSite are non-navigable", () => {
    for (const bad of MALFORMED_URLS) {
      const graph = hostileBase();
      graph.objects[0] = {
        ...graph.objects[0],
        fields: { ...graph.objects[0].fields, website: bad },
      };
      let html = "";
      expect(() => {
        html = renderViaPlanner(graph);
      }).not.toThrow();
      expectNoExecutable(html);
    }
  }, 60000);
});

