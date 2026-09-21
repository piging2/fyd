/**
 * resolveWebsiteUrl: the website field wins; otherwise the url of the
 * website object linked by has_website. Generic, deterministic.
 */

import type { PingObject, PingRelationship } from "@/lib/ping/types";
import { resolveWebsiteUrl } from "../graph";
import type { ObjectGraph } from "../types";

const T = "2026-09-21T02:44:00Z";

function obj(id: string, fields: Record<string, string | string[]> = {}): PingObject {
  return {
    id,
    schema: "ping.social.business@1",
    controllerId: "c1",
    visibility: "public",
    title: id,
    description: "",
    fields,
    createdAt: T,
    updatedAt: T,
    provenance: { kind: "website-derived", ref: "r", derivedAt: T },
  };
}

function webObj(id: string, url: string): PingObject {
  return { ...obj(id), schema: "ping.knowledge.website@1", fields: { url } };
}

function rel(id: string, subject: string, predicate: string, object: string, status: "active" | "inactive" = "active"): PingRelationship {
  return { id, subject, predicate, object, status, createdAt: T, evidenceRef: "e" };
}

function graph(objects: PingObject[], relationships: PingRelationship[]): ObjectGraph {
  return { objects, relationships };
}

describe("resolveWebsiteUrl", () => {
  test("website field on the business wins", () => {
    const g = graph(
      [obj("b", { website: "https://direct.example/" }), webObj("w", "https://linked.example/")],
      [rel("r1", "b", "has_website", "w")],
    );
    expect(resolveWebsiteUrl(g, "b")).toBe("https://direct.example/");
  });

  test("falls back to the website object via has_website", () => {
    const g = graph(
      [obj("b"), webObj("w", "https://happy-place-platform.vercel.app/")],
      [rel("r1", "b", "has_website", "w")],
    );
    expect(resolveWebsiteUrl(g, "b")).toBe("https://happy-place-platform.vercel.app/");
  });

  test("inactive relationships are ignored", () => {
    const g = graph(
      [obj("b"), webObj("w", "https://linked.example/")],
      [rel("r1", "b", "has_website", "w", "inactive")],
    );
    expect(resolveWebsiteUrl(g, "b")).toBe("");
  });

  test("no website anywhere means empty string", () => {
    const g = graph([obj("b")], []);
    expect(resolveWebsiteUrl(g, "b")).toBe("");
  });

  test("deterministic across relationship order", () => {
    const g = graph(
      [obj("b"), webObj("w1", "https://b.example/"), webObj("w2", "https://a.example/")],
      [rel("r1", "b", "has_website", "w1"), rel("r2", "b", "has_website", "w2")],
    );
    const rev = graph(
      [obj("b"), webObj("w1", "https://b.example/"), webObj("w2", "https://a.example/")],
      [rel("r2", "b", "has_website", "w2"), rel("r1", "b", "has_website", "w1")],
    );
    expect(resolveWebsiteUrl(g, "b")).toBe("https://a.example/");
    expect(resolveWebsiteUrl(rev, "b")).toBe("https://a.example/");
  });
});
