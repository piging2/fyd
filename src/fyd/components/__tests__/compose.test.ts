/**
 * Compose lane tests: customer-surface composition.
 *
 * 1. Motion tokens: restrained defaults when the theme carries none;
 *    the reduced-motion guard collapses decorative motion.
 * 2. Deterministic view-transition names: stable per stable id, distinct
 *    across objects/sections/businesses.
 * 3. Object affordance: canonical schema roles only (service, product,
 *    person, location); business/post/article objects get none.
 * 4. Cards render from graph objects with lazy, dimensioned media and
 *    relationship microcopy from the graph's own predicates.
 * 5. Gallery renders iff acquired gallery media exists.
 * 6. layoutCharacter changes presentation markers, never facts.
 * 7. Reduced motion (intensity NONE) stamps no transition names.
 *
 * Run: npx jest --config src/fyd/components/jest.config.cjs compose
 */

import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  businessViewTransitionName,
  motionAllowed,
  motionForIntent,
  motionTokensForTheme,
  objectViewTransitionName,
  sectionViewTransitionName,
  startViewTransition,
} from "../compose-motion";
import { FydViewportProvider, resolveViewportCapabilities, useViewport, widthClassFor } from "../viewport";
import { affordanceEligible } from "../object-affordance";
import {
  designIntentForTheme,
  galleryEligible,
  renderSection,
  SitePageView,
} from "../renderer";
import { DEFAULT_FYD_THEME } from "../../sitespec/types";
import type {
  FYDPage,
  FYDSection,
  FYDSiteSpec,
  FYDThemeTokens,
  MotionTokens,
  ObjectGraph,
  ViewerContext,
} from "../../sitespec/types";
import type { PingObject } from "@/lib/ping/types";
import type { DisplayMedia } from "../../media/select";

function prov() {
  return {
    kind: "website-derived" as const,
    ref: "website-ingestion:https://example.com/",
    derivedAt: "2026-09-22T00:00:00Z",
  };
}

function obj(partial: Partial<PingObject> & { id: string; schema: string; title: string }): PingObject {
  return {
    controllerId: "test",
    visibility: "public",
    description: "",
    fields: {},
    createdAt: "2026-09-22T00:00:00Z",
    updatedAt: "2026-09-22T00:00:00Z",
    provenance: prov(),
    ...partial,
  };
}

const OWNER = obj({
  id: "biz-1",
  schema: "ping.social.business@1",
  title: "Acme Plumbing",
  description: "Family plumbing shop.",
});
const SERVICE = obj({
  id: "svc-1",
  schema: "ping.social.service@1",
  title: "Drain cleaning",
  description: "Fast drain clearing.",
});
const PERSON = obj({
  id: "per-1",
  schema: "ping.social.person@1",
  title: "Maya Alvarez",
  description: "Master plumber.",
});
const LOCATION = obj({
  id: "loc-1",
  schema: "ping.social.location@1",
  title: "Grand Junction",
});
const POST = obj({
  id: "post-1",
  schema: "ping.social.post@1",
  title: "Spring maintenance tips",
});

const GRAPH: ObjectGraph = {
  objects: [OWNER, SERVICE, PERSON, LOCATION, POST],
  relationships: [
    {
      id: "rel-1",
      subject: "biz-1",
      predicate: "employs",
      object: "per-1",
      status: "active",
      createdAt: "2026-09-22T00:00:00Z",
    },
    {
      id: "rel-2",
      subject: "svc-1",
      predicate: "serves_area",
      object: "loc-1",
      status: "active",
      createdAt: "2026-09-22T00:00:00Z",
    },
  ],
};

function theme(overrides: Partial<FYDThemeTokens> = {}): FYDThemeTokens {
  return { ...DEFAULT_FYD_THEME, ...overrides };
}

function specFor(themeTokens: FYDThemeTokens, sections: FYDSection[]): FYDSiteSpec {
  const page: FYDPage = {
    slug: "home",
    title: "Home",
    navLabel: "Home",
    sections,
  };
  return {
    kind: "fyd.sitespec@1",
    ownerObjectId: "biz-1",
    version: 1,
    generator: {
      name: "fyd-site-generator",
      version: "test",
      generatedAt: "2026-09-22T00:00:00Z",
    },
    themeTokens,
    navigation: [{ label: "Home", pageSlug: "home" }],
    pages: [page],
    provenance: {
      source: "website-ingestion",
      claimKind: "website_statement",
      note: "compose test fixture",
    },
  };
}

function section(
  id: string,
  component: string,
  objectIds: string[] = [],
): FYDSection {
  return {
    id,
    component,
    query: objectIds.length > 0 ? { kind: "reference", objectIds } : { kind: "static" },
    presentation: {},
  };
}

function ctxFor(spec: FYDSiteSpec, extra: Record<string, unknown> = {}) {
  const viewer: ViewerContext = { viewerId: null, displayName: null };
  return { spec, graph: GRAPH, viewer, ...extra };
}

function galleryItem(): DisplayMedia {
  return {
    id: "fyd-media-test",
    role: "gallery",
    src: "/fyd-media/test/card-768w.webp",
    blurUrl: null,
    width: 768,
    height: 432,
    alt: "Shop photo",
    rightsSource: "public-demo-source",
    rightsBasis: "Demo ingest; no rights transferred.",
    sourceUrl: "https://example.com/photo.jpg",
    digest: "testdigest",
    observedAt: "2026-09-22T00:00:00Z",
  };
}

describe("motion tokens", () => {
  test("restrained defaults when the theme carries none", () => {
    const t = motionTokensForTheme(theme());
    expect(t.motionIntensity).toBe("SUBTLE");
    expect(t.entrance).toBe("FADE_RISE");
    expect(t.objectTransition).toBe("MORPH");
    expect(t.stagger).toBe("TIGHT");
  });

  test("owner tokens override the defaults", () => {
    const expressive: MotionTokens = {
      motionIntensity: "EXPRESSIVE",
      entrance: "REVEAL",
      objectTransition: "CROSSFADE",
      stagger: "RELAXED",
    };
    const t = motionTokensForTheme(theme({ motionTokens: expressive }));
    expect(t.motionIntensity).toBe("EXPRESSIVE");
    expect(t.objectTransition).toBe("CROSSFADE");
  });

  test("intensity NONE collapses decorative motion", () => {
    const none: MotionTokens = {
      motionIntensity: "NONE",
      entrance: "FADE_RISE",
      objectTransition: "MORPH",
      stagger: "NONE",
    };
    const t = motionTokensForTheme(theme({ motionTokens: none }));
    expect(t.motionIntensity).toBe("NONE");
    // The renderer gates named morphs on intensity !== NONE; the card
    // test below proves no transition name is stamped in that case.
  });

  test("motionAllowed honors prefers-reduced-motion", () => {
    expect(motionAllowed(() => ({ matches: true }))).toBe(false);
    expect(motionAllowed(() => ({ matches: false }))).toBe(true);
  });

  test("startViewTransition degrades to a direct update without the API", () => {
    let ran = false;
    startViewTransition(() => {
      ran = true;
    });
    expect(ran).toBe(true);
  });
});

describe("deterministic view-transition names", () => {
  test("stable per id, distinct across ids and kinds", () => {
    expect(objectViewTransitionName("svc-1")).toBe(objectViewTransitionName("svc-1"));
    expect(objectViewTransitionName("svc-1")).not.toBe(objectViewTransitionName("per-1"));
    expect(businessViewTransitionName("biz-1")).toBe(businessViewTransitionName("biz-1"));
    expect(sectionViewTransitionName("home:Services:0")).toBe(
      sectionViewTransitionName("home:Services:0"),
    );
    const names = new Set([
      objectViewTransitionName("x"),
      businessViewTransitionName("x"),
      sectionViewTransitionName("x"),
    ]);
    expect(names.size).toBe(3);
  });
});

describe("object affordance eligibility", () => {
  test("canonical roles only", () => {
    expect(affordanceEligible(SERVICE)).toBe(true);
    expect(affordanceEligible(PERSON)).toBe(true);
    expect(affordanceEligible(LOCATION)).toBe(true);
    expect(
      affordanceEligible(obj({ id: "p", schema: "ping.social.product@1", title: "Wrench" })),
    ).toBe(true);
  });

  test("business, post, article objects get no affordance", () => {
    expect(affordanceEligible(OWNER)).toBe(false);
    expect(affordanceEligible(POST)).toBe(false);
    expect(
      affordanceEligible(obj({ id: "a", schema: "ping.social.article@1", title: "News" })),
    ).toBe(false);
  });
});

describe("cards render from graph objects", () => {
  const spec = specFor(theme(), [section("home:Services:0", "Services", ["svc-1"])]);

  test("object title and description render from the projection", () => {
    const html = renderToStaticMarkup(
      React.createElement(SitePageView, {
        page: spec.pages[0],
        ctx: ctxFor(spec),
      }),
    );
    expect(html).toContain("Drain cleaning");
    expect(html).toContain("Fast drain clearing.");
  });

  test("card title links the generic detail seam by stable object id", () => {
    const html = renderToStaticMarkup(
      React.createElement(SitePageView, {
        page: spec.pages[0],
        ctx: ctxFor(spec),
      }),
    );
    expect(html).toContain('href="/o/svc-1"');
  });

  test("card carries the deterministic object transition name when MORPH is active", () => {
    const html = renderToStaticMarkup(
      React.createElement(SitePageView, {
        page: spec.pages[0],
        ctx: ctxFor(spec),
      }),
    );
    expect(html).toContain(objectViewTransitionName("svc-1"));
  });

  test("intensity NONE stamps no transition names", () => {
    const none: MotionTokens = {
      motionIntensity: "NONE",
      entrance: "FADE_RISE",
      objectTransition: "MORPH",
      stagger: "NONE",
    };
    const still = specFor(theme({ motionTokens: none }), [
      section("home:Services:0", "Services", ["svc-1"]),
    ]);
    const html = renderToStaticMarkup(
      React.createElement(SitePageView, {
        page: still.pages[0],
        ctx: ctxFor(still),
      }),
    );
    expect(html).not.toContain(objectViewTransitionName("svc-1"));
  });

  test("relationship microcopy names the graph connection", () => {
    const people = specFor(theme(), [section("home:People:0", "People", ["per-1"])]);
    const html = renderToStaticMarkup(
      React.createElement(SitePageView, {
        page: people.pages[0],
        ctx: ctxFor(people),
      }),
    );
    expect(html).toContain("Maya Alvarez");
    expect(html).toContain("Acme Plumbing");
    const services = specFor(theme(), [section("home:Services:0", "Services", ["svc-1"])]);
    const html2 = renderToStaticMarkup(
      React.createElement(SitePageView, {
        page: services.pages[0],
        ctx: ctxFor(services),
      }),
    );
    expect(html2).toContain("Available in Grand Junction");
  });

  test("media covers are lazy with explicit dimensions", () => {
    const html = renderToStaticMarkup(
      React.createElement(SitePageView, {
        page: spec.pages[0],
        ctx: ctxFor(spec, { objectMedia: { "svc-1": [galleryItem()] } }),
      }),
    );
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('width="768"');
    expect(html).toContain('height="432"');
    expect(html).toContain("/fyd-media/test/card-768w.webp");
  });

  test("no media means no cover image, honest text fallback", () => {
    const html = renderToStaticMarkup(
      React.createElement(SitePageView, {
        page: spec.pages[0],
        ctx: ctxFor(spec),
      }),
    );
    expect(html).toContain("Drain cleaning");
    expect(html).not.toContain("/fyd-media/");
  });
});

describe("gallery", () => {
  const gallerySection = section("home:Gallery:0", "Gallery");

  test("eligible only when gallery media exists", () => {
    const spec = specFor(theme(), [gallerySection]);
    expect(galleryEligible(ctxFor(spec, { galleryMedia: [galleryItem()] }))).toBe(true);
    expect(galleryEligible(ctxFor(spec, { galleryMedia: [] }))).toBe(false);
    expect(galleryEligible(ctxFor(spec))).toBe(false);
  });

  test("renders images with lazy loading, dimensions, and provenance", () => {
    const spec = specFor(theme(), [gallerySection]);
    const html = renderToStaticMarkup(
      renderSection(gallerySection, ctxFor(spec, { galleryMedia: [galleryItem()] })) as React.ReactElement,
    );
    expect(html).toContain("/fyd-media/test/card-768w.webp");
    expect(html).toContain('loading="lazy"');
    expect(html).toContain("example.com");
  });

  test("renders nothing when gallery media is absent", () => {
    const spec = specFor(theme(), [gallerySection]);
    const empty = renderToStaticMarkup(
      renderSection(gallerySection, ctxFor(spec, { galleryMedia: [] })) as React.ReactElement,
    );
    expect(empty).toBe("");
  });
});

describe("layoutCharacter", () => {  const sections = [section("home:Services:0", "Services", ["svc-1"])];

  test("changes presentation markers but not facts", () => {
    const craft = specFor(theme({ layoutCharacter: "CRAFT" }), sections);
    const editorial = specFor(theme(), sections);
    const craftHtml = renderToStaticMarkup(
      React.createElement(SitePageView, { page: craft.pages[0], ctx: ctxFor(craft) }),
    );
    const editorialHtml = renderToStaticMarkup(
      React.createElement(SitePageView, { page: editorial.pages[0], ctx: ctxFor(editorial) }),
    );
    expect(craftHtml).toContain('data-layout-character="CRAFT"');
    expect(editorialHtml).toContain('data-layout-character="EDITORIAL"');
    expect(craftHtml).not.toBe(editorialHtml);
    // Facts identical across characters (facts rendered on this page).
    for (const fact of ["Drain cleaning", "Fast drain clearing.", "Available in Grand Junction"]) {
      expect(craftHtml).toContain(fact);
      expect(editorialHtml).toContain(fact);
    }
  });
});

describe("viewport capabilities", () => {
  test("width classes follow the documented cut points", () => {
    expect(widthClassFor(320)).toBe("xs");
    expect(widthClassFor(375)).toBe("xs");
    expect(widthClassFor(479)).toBe("xs");
    expect(widthClassFor(480)).toBe("sm");
    expect(widthClassFor(768)).toBe("md");
    expect(widthClassFor(1023)).toBe("md");
    expect(widthClassFor(1024)).toBe("lg");
    expect(widthClassFor(1440)).toBe("xl");
  });

  test("server-safe: null capabilities without a window (compact baseline)", () => {
    expect(resolveViewportCapabilities()).toBeNull();
  });

  test("provider renders children and exposes null before mount", () => {
    let seen: unknown = "unset";
    function Probe() {
      seen = useViewport();
      return null;
    }
    renderToStaticMarkup(
      React.createElement(
        FydViewportProvider,
        null,
        React.createElement(Probe),
      ),
    );
    expect(seen).toBeNull();
  });
});

describe("design-system compiler", () => {
  test("character map seeds the intent", () => {
    const craft = designIntentForTheme(theme({ layoutCharacter: "CRAFT" }));
    expect(craft.density).toBe("comfortable");
    expect(craft.mediaTreatment).toBe("edge-to-edge");
    expect(craft.contentWidthPx).toBe(1024);
    const technical = designIntentForTheme(theme({ layoutCharacter: "TECHNICAL" }));
    expect(technical.density).toBe("compact");
    expect(technical.objectEmphasis).toBe("quiet");
  });

  test("owner designIntent overrides win field-by-field", () => {
    const compiled = designIntentForTheme(
      theme({
        layoutCharacter: "CRAFT",
        designIntent: { density: "compact", contentWidthPx: 800 },
      }),
    );
    expect(compiled.density).toBe("compact");
    expect(compiled.contentWidthPx).toBe(800);
    // Untouched fields still come from the character seed.
    expect(compiled.mediaTreatment).toBe("edge-to-edge");
    expect(compiled.objectEmphasis).toBe("balanced");
  });

  test("intent reaches the gallery surface as a data attribute", () => {
    const spec = specFor(theme({ layoutCharacter: "CRAFT" }), [
      section("home:Gallery:0", "Gallery"),
    ]);
    const html = renderToStaticMarkup(
      renderSection(
        spec.pages[0].sections[0],
        ctxFor(spec, { galleryMedia: [galleryItem()] }),
      ) as React.ReactElement,
    );
    expect(html).toContain('data-media-treatment="edge-to-edge"');
  });
});

describe("semantic motion intents", () => {
  const subtle = motionTokensForTheme(theme());
  const noneTokens = motionTokensForTheme(
    theme({
      motionTokens: {
        motionIntensity: "NONE",
        entrance: "FADE_RISE",
        objectTransition: "MORPH",
        stagger: "NONE",
      },
    }),
  );

  test("ENTER and EXPAND are implemented; the rest collapse", () => {
    expect(motionForIntent("ENTER", subtle)).not.toBeNull();
    expect(motionForIntent("EXPAND", subtle)).not.toBeNull();
    for (const intent of [
      "EXIT",
      "COLLAPSE",
      "REORDER",
      "CONFIRM",
      "RELATIONSHIP_CREATED",
      "OBJECT_UPDATED",
    ] as const) {
      expect(motionForIntent(intent, subtle)).toBeNull();
    }
  });

  test("intensity NONE collapses every intent", () => {
    for (const intent of ["ENTER", "EXPAND"] as const) {
      expect(motionForIntent(intent, noneTokens)).toBeNull();
    }
  });
});

describe("mobile composition markers", () => {
  test("cards carry the adaptive projection classes", () => {
    const spec = specFor(theme(), [section("home:Services:0", "Services", ["svc-1"])]);
    const html = renderToStaticMarkup(
      React.createElement(SitePageView, {
        page: spec.pages[0],
        ctx: ctxFor(spec),
      }),
    );
    expect(html).toContain("fyd-card-rich");
    expect(html).toContain("fyd-card-desc");
  });

  test("composition CSS is not gated on reduced motion", () => {
    const spec = specFor(theme(), [section("home:Services:0", "Services", ["svc-1"])]);
    const html = renderToStaticMarkup(
      React.createElement(SitePageView, {
        page: spec.pages[0],
        ctx: ctxFor(spec),
      }),
    );
    // Mobile composition rules ship in the same style tag but outside the
    // prefers-reduced-motion gate: layout must work with motion off.
    expect(html).toContain(".fyd-card { display: grid;");
    expect(html).toContain("min-height: 44px");
    expect(html).toContain("env(safe-area-inset-bottom)");
  });

  test("people rail carries the gesture-friendly class", () => {
    const spec = specFor(theme(), [section("home:People:0", "People", ["per-1"])]);
    const html = renderToStaticMarkup(
      React.createElement(SitePageView, {
        page: spec.pages[0],
        ctx: ctxFor(spec, { objectMedia: { "per-1": [galleryItem()] } }),
      }),
    );
    expect(html).toContain("fyd-people-rail");
  });
});
