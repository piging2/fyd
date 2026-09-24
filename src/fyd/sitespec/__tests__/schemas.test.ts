/**
 * Schema derivation tests: one schema definition drives the validator,
 * component eligibility, relationship rules, capability options, and the
 * agent tool description. Unknown schemas fall back to GenericObjectCard.
 */

import { componentForSchema } from "../../components/registry";
import {
  BUSINESS_SCHEMA,
  POST_SCHEMA,
  SCHEMA_ROLES,
  SERVICE_SCHEMA,
  agentToolDescription,
  capabilityOptions,
  eligibleComponents,
  getSchemaDef,
  isAllowedPredicate,
  schemaRole,
  validateAgainstSchema,
} from "../schemas";

function record(over: Record<string, unknown> = {}) {
  return {
    title: "Happy Place Carpentry",
    description: "Decks and fences.",
    fields: { category: "Carpentry", ...over },
  };
}

describe("schema derivations", () => {
  test("exactly three proof schemas", () => {
    expect(getSchemaDef("ping.social.business@1")).toBe(BUSINESS_SCHEMA);
    expect(getSchemaDef("ping.social.service@1")).toBe(SERVICE_SCHEMA);
    expect(getSchemaDef("ping.social.post@1")).toBe(POST_SCHEMA);
    expect(getSchemaDef("ping.social.unknown@1")).toBeUndefined();
  });

  test("validator accepts a complete business, rejects a missing title", () => {
    expect(validateAgainstSchema(BUSINESS_SCHEMA, record(), "o1")).toEqual([]);
    const bad = validateAgainstSchema(
      BUSINESS_SCHEMA,
      { title: "", description: "x", fields: {} },
      "o1",
    );
    expect(bad.some((f) => f.severity === "error" && f.path === "object.title")).toBe(true);
  });

  test("validator flags type changes per the evolution law", () => {
    const bad = validateAgainstSchema(BUSINESS_SCHEMA, record({ socials: "not-an-array" }), "o1");
    expect(bad.some((f) => f.severity === "error" && f.path === "object.socials")).toBe(true);
  });

  test("component eligibility matches the registry", () => {
    expect(eligibleComponents("ping.social.business@1")).toContain("Hero");
    expect(eligibleComponents("ping.social.service@1")).toContain("Services");
    expect(eligibleComponents("ping.social.post@1")).toContain("ObjectFeed");
    expect(eligibleComponents("ping.social.mystery@9")).toEqual(["GenericObjectCard"]);
  });

  test("componentForSchema falls back to GenericObjectCard", () => {
    expect(componentForSchema("ping.social.service@1")).toBe("Services");
    expect(componentForSchema("ping.social.mystery@9")).toBe("GenericObjectCard");
  });

  test("knowledge vocabulary projects onto the proof roles, not new definitions", () => {
    // The proof stays exactly three definitions; knowledge schemas are a
    // projection onto the same roles.
    expect(getSchemaDef("ping.knowledge.business@1")).toBeUndefined();
    expect(schemaRole("ping.knowledge.business@1")).toBe("business");
    expect(schemaRole("ping.knowledge.service@1")).toBe("service");
    expect(schemaRole("ping.knowledge.location@1")).toBe("location");
    expect(schemaRole("ping.knowledge.person@1")).toBe("person");
    expect(schemaRole("ping.knowledge.website@1")).toBeNull();
    expect(schemaRole("ping.social.mystery@9")).toBeNull();
    expect(SCHEMA_ROLES.business).toEqual([
      "ping.social.business@1",
      "ping.knowledge.business@1",
    ]);
  });

  test("knowledge schemas get the same component eligibility", () => {
    expect(eligibleComponents("ping.knowledge.business@1")).toContain("Hero");
    expect(eligibleComponents("ping.knowledge.service@1")).toContain("Services");
    expect(eligibleComponents("ping.knowledge.location@1")).toContain("Locations");
    expect(eligibleComponents("ping.knowledge.person@1")).toContain("People");
    expect(eligibleComponents("ping.knowledge.website@1")).toEqual([
      "ObjectGrid",
      "ObjectFeed",
      "ObjectRail",
    ]);
    expect(componentForSchema("ping.knowledge.service@1")).toBe("Services");
    expect(componentForSchema("ping.knowledge.business@1")).toBe("Hero");
    expect(componentForSchema("ping.knowledge.website@1")).toBe("ObjectGrid");
  });

  test("relationship rules gate predicates", () => {
    expect(isAllowedPredicate("ping.social.business@1", "provides")).toBe(true);
    expect(isAllowedPredicate("ping.social.business@1", "likes")).toBe(false);
    expect(isAllowedPredicate("ping.social.post@1", "replies_to")).toBe(true);
  });

  test("capability options follow the action-planner rules", () => {
    const anon = { viewerId: null, controllerId: "hp", hasWebsite: true };
    expect(capabilityOptions(BUSINESS_SCHEMA, anon)).toEqual(
      expect.arrayContaining(["open", "ask", "reference", "follow", "open_website"]),
    );
    expect(capabilityOptions(BUSINESS_SCHEMA, anon)).not.toContain("like");
    expect(capabilityOptions(SERVICE_SCHEMA, anon)).toContain("like");
    expect(capabilityOptions(SERVICE_SCHEMA, anon)).not.toContain("follow");
    const signedIn = { viewerId: "v1", controllerId: "v1", hasWebsite: false };
    expect(capabilityOptions(POST_SCHEMA, signedIn)).toContain("reply");
    expect(capabilityOptions(POST_SCHEMA, anon)).not.toContain("reply");
    expect(capabilityOptions(BUSINESS_SCHEMA, signedIn)).toContain("propose_update");
  });

  test("agent tool description is derived, deterministic text", () => {
    const a = agentToolDescription(SERVICE_SCHEMA);
    const b = agentToolDescription(SERVICE_SCHEMA);
    expect(a).toBe(b);
    expect(a).toContain("ping.social.service@1");
    expect(a).toContain("provided_by");
  });

  test("article and post are separate roles across both vocabularies", () => {
    expect(schemaRole("ping.social.post@1")).toBe("post");
    expect(schemaRole("ping.knowledge.post@1")).toBe("post");
    expect(schemaRole("ping.social.article@1")).toBe("article");
    expect(schemaRole("ping.knowledge.article@1")).toBe("article");
    expect(SCHEMA_ROLES.post).toEqual(["ping.social.post@1", "ping.knowledge.post@1"]);
    expect(SCHEMA_ROLES.article).toEqual([
      "ping.social.article@1",
      "ping.knowledge.article@1",
    ]);
  });

  test("registry accepts knowledge content schemas through the role map", () => {
    expect(componentForSchema("ping.knowledge.post@1")).toBe("Posts");
    expect(componentForSchema("ping.knowledge.article@1")).toBe("Posts");
    expect(componentForSchema("ping.knowledge.location@1")).toBe("Locations");
    expect(componentForSchema("ping.knowledge.person@1")).toBe("People");
    expect(eligibleComponents("ping.knowledge.post@1")).toContain("RecentObjects");
    expect(eligibleComponents("ping.knowledge.article@1")).toContain("Posts");
  });

  test("schema<->component mapping has a single source (no drift)", () => {
    // The registry DEFINITIONS table is the only hand-written mapping:
    // eligibleComponents is its inversion, componentForSchema its head.
    // If anyone re-adds a second hand table, these pins fail.
    const probe = [
      "ping.social.business@1",
      "ping.social.service@1",
      "ping.social.product@1",
      "ping.social.location@1",
      "ping.social.person@1",
      "ping.social.post@1",
      "ping.social.article@1",
      "ping.knowledge.business@1",
      "ping.knowledge.service@1",
      "ping.knowledge.location@1",
      "ping.knowledge.person@1",
      "ping.knowledge.post@1",
      "ping.knowledge.article@1",
      "ping.knowledge.website@1",
      "ping.social.mystery@9",
    ];
    for (const s of probe) {
      const all = eligibleComponents(s);
      expect(all.length).toBeGreaterThan(0);
      const dedicated = all.filter((n) => n !== "GenericObjectCard");
      expect(componentForSchema(s)).toBe(
        dedicated.length > 0 ? dedicated[0] : "GenericObjectCard",
      );
    }
    // Converged truth (2026-09-23): the registry's component-authored
    // coverage wins over the deleted hand table's stale omissions.
    // Note: ObjectFeed is deliberately absent for business (converged
    // 2026-09-23): the registry's ObjectFeed accepts post/article/service/
    // website only. The deleted hand table's business->ObjectFeed entry was
    // the same class of stale drift as the four omissions fixed here.
    expect(eligibleComponents("ping.social.business@1")).toEqual([
      "Hero",
      "IdentityCard",
      "BusinessSummary",
      "ObjectGrid",
      "RecentObjects",
      "Contact",
      "Links",
      "SocialProof",
      "CTA",
      "AskFYD",
      "ObjectRail",
    ]);
    expect(eligibleComponents("ping.social.service@1")).toContain("RecentObjects");
    expect(eligibleComponents("ping.social.location@1")).toContain("ObjectRail");
  });
});
