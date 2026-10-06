/**
 * Determinism test: the same graph always produces the same SiteSpec.
 * Also asserts the structural laws: fixed page order, fixed section order,
 * no page or section without data, deterministic section ids.
 */

import type { PingObject, PingRelationship } from "@/lib/ping/types";
import { HAPPY_PLACE_RICH_GRAPH } from "../__fixtures__/happy-place-rich-graph";
import { generateSiteSpec } from "../generator";
import { resolveQuery } from "../../components/renderer";

const OPTS = { generatedAt: "2026-09-21T12:00:00.000Z", eventSequences: [65, 83] as [number, number] };

const CONTENT_AT = "2026-09-21T12:00:00.000Z";

/** Minimal knowledge-vocabulary graph: business publishes an article and a post. */
function knowledgeContentGraph(): { objects: PingObject[]; relationships: PingRelationship[] } {
  const provenance = {
    kind: "website-derived" as const,
    ref: "website-ingestion:test",
    derivedAt: CONTENT_AT,
  };
  const mk = (id: string, schema: string, title: string): PingObject => ({
    id,
    schema,
    controllerId: "c1",
    visibility: "public",
    title,
    description: "",
    fields: {},
    createdAt: CONTENT_AT,
    updatedAt: CONTENT_AT,
    provenance,
  });
  const owner: PingObject = {
    ...mk("owner-1", "ping.knowledge.business@1", "Acme"),
    description: "We do things.",
  };
  const article = mk("art-1", "ping.knowledge.article@1", "How we built the deck");
  const post = mk("post-1", "ping.knowledge.post@1", "Shop update");
  const rel = (id: string, object: string): PingRelationship => ({
    id,
    subject: owner.id,
    predicate: "publishes",
    object,
    status: "active",
    createdAt: CONTENT_AT,
    evidenceRef: "ev",
  });
  return {
    objects: [owner, article, post],
    relationships: [rel("r1", article.id), rel("r2", post.id)],
  };
}

describe("generateSiteSpec determinism", () => {
  test("same graph produces byte-identical specs", () => {
    const a = generateSiteSpec(HAPPY_PLACE_RICH_GRAPH, OPTS);
    const b = generateSiteSpec(HAPPY_PLACE_RICH_GRAPH, OPTS);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  test("spec is stable under object and relationship reordering", () => {
    const shuffled = {
      objects: [...HAPPY_PLACE_RICH_GRAPH.objects].reverse(),
      relationships: [...HAPPY_PLACE_RICH_GRAPH.relationships].reverse(),
    };
    const a = generateSiteSpec(HAPPY_PLACE_RICH_GRAPH, OPTS);
    const b = generateSiteSpec(shuffled, OPTS);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  test("pages arrive in fixed order with data only", () => {
    const spec = generateSiteSpec(HAPPY_PLACE_RICH_GRAPH, OPTS);
    expect(spec.pages.map((p) => p.slug)).toEqual(["home", "about", "services", "explore"]);
    expect(spec.navigation.map((n) => n.pageSlug)).toEqual(["home", "about", "services", "explore"]);
  });

  test("home sections arrive in the fixed component order", () => {
    const spec = generateSiteSpec(HAPPY_PLACE_RICH_GRAPH, OPTS);
    const home = spec.pages.find((p) => p.slug === "home")!;
    // No products, no posts/articles: Products and RecentObjects are absent.
    // Contact survives on the business phone; Links survives on the website
    // object linked by has_website. CTA is the visitor action block on every
    // home page; ObjectRail appears because the owner has 4 services + 2
    // people to feature through the inline circle doorway.
    expect(home.sections.map((s) => s.component)).toEqual([
      "Hero",
      "BusinessSummary",
      "Services",
      "Locations",
      "People",
      "Contact",
      "Links",
      "CTA",
      "AskFYD",
      "ObjectRail",
    ]);
  });

  test("section ids are deterministic", () => {
    const spec = generateSiteSpec(HAPPY_PLACE_RICH_GRAPH, OPTS);
    for (const page of spec.pages) {
      page.sections.forEach((s, i) => {
        expect(s.id).toBe(page.slug + ":" + s.component + ":" + i);
      });
    }
  });

  test("missing data means the section does not exist", () => {
    const withoutServices = {
      objects: HAPPY_PLACE_RICH_GRAPH.objects.filter(
        (o) => o.schema !== "ping.knowledge.service@1" && o.schema !== "ping.social.service@1",
      ),
      relationships: HAPPY_PLACE_RICH_GRAPH.relationships,
    };
    const spec = generateSiteSpec(withoutServices, OPTS);
    expect(spec.pages.map((p) => p.slug)).toEqual(["home", "about", "explore"]);
    const home = spec.pages.find((p) => p.slug === "home")!;
    expect(home.sections.map((s) => s.component)).not.toContain("Services");
  });

  test("no owner means no pages", () => {
    const spec = generateSiteSpec({ objects: [], relationships: [] }, OPTS);
    expect(spec.pages).toEqual([]);
    expect(spec.navigation).toEqual([]);
  });

  test("provenance labels website claims", () => {
    const spec = generateSiteSpec(HAPPY_PLACE_RICH_GRAPH, OPTS);
    expect(spec.provenance.source).toBe("website-ingestion");
    expect(spec.provenance.claimKind).toBe("website_statement");
    expect(spec.provenance.eventSequences).toEqual([65, 83]);
  });

  test("canonical services resolve with no invented copy", () => {
    const spec = generateSiteSpec(HAPPY_PLACE_RICH_GRAPH, OPTS);
    const services = spec.pages.find((p) => p.slug === "services")!;
    expect(services.sections).toHaveLength(1);
    const query = services.sections[0].query;
    expect(query.kind).toBe("related");
    if (query.kind !== "related") return;
    // The query matches both vocabulary dialects, in canonical order,
    // forward predicates first, then the inverse (direction-agnostic).
    expect(query.predicates).toEqual(["provides", "offers", "provided_by"]);
    expect(query.schemas).toEqual(["ping.social.service@1", "ping.knowledge.service@1"]);
    const resolved = resolveQuery(query, HAPPY_PLACE_RICH_GRAPH, spec.ownerObjectId);
    expect(resolved.map((o) => o.title)).toEqual([
      "Remodels",
      "Fences",
      "Home repair and restoration",
      "Decks",
    ]);
    // The four canonical services carry no descriptions; the spec must not
    // invent any. "Custom carpentry" was the old illustrative invention.
    for (const o of resolved) {
      expect(o.description).toBe("");
    }
    expect(JSON.stringify(spec)).not.toContain("Custom carpentry");
  });

  test("social and knowledge dialects compile to the same structure", () => {
    // Translate the canonical graph into the social vocabulary: the
    // generator must not care which dialect a graph speaks.
    const dialect: Record<string, string> = {
      "ping.knowledge.business@1": "ping.social.business@1",
      "ping.knowledge.service@1": "ping.social.service@1",
      "ping.knowledge.location@1": "ping.social.location@1",
      "ping.knowledge.person@1": "ping.social.person@1",
    };
    const socialGraph = {
      objects: HAPPY_PLACE_RICH_GRAPH.objects.map((o) => ({
        ...o,
        schema: dialect[o.schema] ?? o.schema,
      })),
      relationships: HAPPY_PLACE_RICH_GRAPH.relationships.map((r) => ({
        ...r,
        predicate: r.predicate === "offers" ? "provides" : r.predicate,
      })),
    };
    const a = generateSiteSpec(HAPPY_PLACE_RICH_GRAPH, OPTS);
    const b = generateSiteSpec(socialGraph, OPTS);
    expect(b.pages.map((p) => p.slug)).toEqual(a.pages.map((p) => p.slug));
    for (const page of a.pages) {
      const other = b.pages.find((p) => p.slug === page.slug)!;
      expect(other.sections.map((s) => s.component)).toEqual(
        page.sections.map((s) => s.component),
      );
    }
    // The services section resolves the same four objects either way.
    const serviceSection = (s: typeof a) =>
      s.pages.find((p) => p.slug === "services")!.sections[0];
    const qa = serviceSection(a).query;
    const qb = serviceSection(b).query;
    expect(qa).toEqual(qb);
    if (qa.kind === "related" && qb.kind === "related") {
      expect(
        resolveQuery(qa, HAPPY_PLACE_RICH_GRAPH, a.ownerObjectId).map((o) => o.id),
      ).toEqual(resolveQuery(qb, socialGraph, b.ownerObjectId).map((o) => o.id));
    }
  });

  test("knowledge articles and posts compile through the role map", () => {
    const graph = knowledgeContentGraph();
    const spec = generateSiteSpec(graph, OPTS);
    const home = spec.pages.find((p) => p.slug === "home")!;
    const recent = home.sections.find((s) => s.component === "RecentObjects");
    expect(recent).toBeDefined();
    const query = recent!.query;
    expect(query.kind).toBe("related");
    if (query.kind !== "related") return;
    // Canonical role-map order: post role schemas, then article role schemas.
    expect(query.schemas).toEqual([
      "ping.social.post@1",
      "ping.knowledge.post@1",
      "ping.social.article@1",
      "ping.knowledge.article@1",
    ]);
    expect(query.predicates).toEqual(["publishes", "published_by"]);
    const resolved = resolveQuery(query, graph, spec.ownerObjectId);
    expect(resolved.map((o) => o.id).sort()).toEqual(["art-1", "post-1"]);
  });

  test("an article alone is enough for RecentObjects", () => {
    const graph = knowledgeContentGraph();
    const onlyArticle = {
      objects: graph.objects.filter((o) => o.id !== "post-1"),
      relationships: graph.relationships.filter((r) => r.object !== "post-1"),
    };
    const spec = generateSiteSpec(onlyArticle, OPTS);
    const home = spec.pages.find((p) => p.slug === "home")!;
    expect(home.sections.map((s) => s.component)).toContain("RecentObjects");
  });

  /**
   * The first broken step, pinned at the generator level: a person joined
   * to the owner ONLY by works_for (person -> business, the direction
   * website-ingested graphs record) must still select a People section.
   * Before the fix this relationship was dropped by the forward-only
   * traversal and materially different graphs compiled to identical specs.
   */
  function worksForGraph(linked: boolean): { objects: PingObject[]; relationships: PingRelationship[] } {
    const provenance = {
      kind: "website-derived" as const,
      ref: "website-ingestion:test",
      derivedAt: CONTENT_AT,
    };
    const owner: PingObject = {
      id: "owner-wf",
      schema: "ping.social.business@1",
      controllerId: "c1",
      visibility: "public",
      title: "Solo Electric",
      description: "One-person shop.",
      fields: {},
      createdAt: CONTENT_AT,
      updatedAt: CONTENT_AT,
      provenance,
    };
    const tech: PingObject = {
      ...owner,
      id: "person-sam",
      schema: "ping.social.person@1",
      title: "Sam Torres",
      description: "",
    };
    const relationships: PingRelationship[] = linked
      ? [
          {
            id: "r-wf",
            subject: "person-sam",
            predicate: "works_for",
            object: "owner-wf",
            status: "active",
            createdAt: CONTENT_AT,
            evidenceRef: "ev",
          },
        ]
      : [];
    return { objects: [owner, tech], relationships };
  }

  test("a person linked only by works_for selects a People section", () => {
    const graph = worksForGraph(true);
    const spec = generateSiteSpec(graph, OPTS);
    const home = spec.pages.find((p) => p.slug === "home")!;
    const people = home.sections.find((s) => s.component === "People");
    expect(people).toBeDefined();
    // The section binds the person through the inverse edge.
    const resolved = resolveQuery(people!.query, graph, spec.ownerObjectId);
    expect(resolved.map((o) => o.id)).toEqual(["person-sam"]);
  });

  test("the same person object with no relationship selects no People section", () => {
    const graph = worksForGraph(false);
    const spec = generateSiteSpec(graph, OPTS);
    const components = spec.pages.flatMap((p) => p.sections.map((s) => s.component));
    expect(components).not.toContain("People");
  });

  test("a pair linked in both directions resolves once, not twice", () => {
    // The rich fixture links each person twice: business employs person
    // (forward) and person member_of business (backward).
    const spec = generateSiteSpec(HAPPY_PLACE_RICH_GRAPH, OPTS);
    const home = spec.pages.find((p) => p.slug === "home")!;
    const people = home.sections.find((s) => s.component === "People")!;
    const resolved = resolveQuery(people.query, HAPPY_PLACE_RICH_GRAPH, spec.ownerObjectId);
    expect(resolved.map((o) => o.id)).toEqual([
      "object_5b5b3d32bca8145b",
      "object_9f01b2dede1da5d0",
    ]);
  });
});

describe("generateSiteSpec Gallery emission (media-backed)", () => {
  /** Minimal graph: one public business owner, no related objects. */
  function ownerOnlyGraph() {
    const owner: PingObject = {
      id: "owner-1",
      schema: "ping.social.business@1",
      controllerId: "c1",
      visibility: "public",
      title: "Acme Plumbing",
      description: "We fix pipes.",
      fields: {},
      createdAt: CONTENT_AT,
      updatedAt: CONTENT_AT,
      provenance: {
        kind: "website-derived" as const,
        ref: "website-ingestion:test",
        derivedAt: CONTENT_AT,
      },
    };
    return { objects: [owner], relationships: [] as PingRelationship[] };
  }

  const homeComponents = (spec: ReturnType<typeof generateSiteSpec>) =>
    spec.pages.find((p) => p.slug === "home")!.sections.map((s) => s.component);

  test("emits a Gallery section when the site manifest has gallery assets", () => {
    const spec = generateSiteSpec(ownerOnlyGraph(), {
      ...OPTS,
      siteId: "coppersmith-plumbing",
    });
    const home = spec.pages.find((p) => p.slug === "home")!;
    const gallery = home.sections.find((s) => s.component === "Gallery");
    expect(gallery).toBeDefined();
    // Deterministic section id following the pageSlug:component:index law.
    const idx = home.sections.indexOf(gallery!);
    expect(gallery!.id).toBe("home:Gallery:" + idx);
    // Static query: the gallery resolves no graph objects; its media
    // arrives via the render context (same seam as heroMedia).
    expect(gallery!.query).toEqual({ kind: "static" });
  });

  test("emits no Gallery section when the site manifest has no gallery assets", () => {
    const spec = generateSiteSpec(ownerOnlyGraph(), {
      ...OPTS,
      siteId: "happy-place",
    });
    expect(homeComponents(spec)).not.toContain("Gallery");
  });

  test("emits no Gallery section for an unknown site id (no manifest)", () => {
    const spec = generateSiteSpec(ownerOnlyGraph(), {
      ...OPTS,
      siteId: "no-such-site",
    });
    expect(homeComponents(spec)).not.toContain("Gallery");
  });

  test("emits no Gallery section without siteId: byte-identical pure-graph compile", () => {
    const without = generateSiteSpec(ownerOnlyGraph(), OPTS);
    const withUnknownSite = generateSiteSpec(ownerOnlyGraph(), {
      ...OPTS,
      siteId: "no-such-site",
    });
    expect(homeComponents(without)).not.toContain("Gallery");
    expect(JSON.stringify(without)).toBe(JSON.stringify(withUnknownSite));
  });
});
