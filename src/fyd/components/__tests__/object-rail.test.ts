/**
 * ObjectRail placement law tests.
 *
 * resolvePresenceMode is pure: mode hidden or zero objects is hidden;
 * explicit rail/drawer are honored at any width; auto resolves from the
 * collapseBelow breakpoint token, never a hardcoded px. The projection
 * adapter is honest: title and description only, observed evidence, the
 * always-available capability set, nothing invented.
 */

import type { PingObject } from "@/lib/ping/types";
import { presenceForBuild } from "../../../app/build/[siteId]/build-client";
import { HAPPY_PLACE_RICH_GRAPH } from "../../proceduralize/__fixtures__/happy-place-rich-graph";
import { evidenceScore, pingObjectToProjection, pingObjectToView, resolvePresenceMode, richestObject } from "../object-rail";
import { generateSiteSpec } from "../../proceduralize/generator";
import type { FYDThemeTokens, ObjectPresence } from "../../sitespec/types";

const AT = "2026-09-21T12:00:00.000Z";

const THEME: FYDThemeTokens = {
  accent: "#000000",
  accentForeground: "#ffffff",
  surface: "#ffffff",
  ink: "#111111",
  radius: "md",
  fontDisplay: "serif",
  fontBody: "sans",
  breakpoints: { sm: 640, md: 768, lg: 1024, xl: 1280 },
};

function presence(mode: ObjectPresence["mode"], key = "lg"): ObjectPresence {
  return { mode, objects: ["a", "b"], rules: { collapseBelow: key } };
}

function mkObject(id: string, schema: string, title: string, description = ""): PingObject {
  return {
    id,
    schema,
    controllerId: "c1",
    visibility: "public",
    title,
    description,
    fields: {},
    createdAt: AT,
    updatedAt: AT,
    provenance: { kind: "website-derived", ref: "website-ingestion:test", derivedAt: AT },
  };
}

describe("resolvePresenceMode", () => {
  test("undefined or hidden presence is hidden", () => {
    expect(resolvePresenceMode(undefined, 1024, THEME)).toBe("hidden");
    expect(resolvePresenceMode(presence("hidden"), 1024, THEME)).toBe("hidden");
  });

  test("zero objects is hidden in every mode", () => {
    const empty: ObjectPresence = { mode: "rail", objects: [], rules: { collapseBelow: "lg" } };
    expect(resolvePresenceMode(empty, 2000, THEME)).toBe("hidden");
  });

  test("explicit rail and drawer are honored at any width", () => {
    expect(resolvePresenceMode(presence("rail"), 320, THEME)).toBe("rail");
    expect(resolvePresenceMode(presence("rail"), 2000, THEME)).toBe("rail");
    expect(resolvePresenceMode(presence("drawer"), 320, THEME)).toBe("drawer");
    expect(resolvePresenceMode(presence("drawer"), 2000, THEME)).toBe("drawer");
  });

  test("auto resolves rail at/above the collapseBelow breakpoint", () => {
    expect(resolvePresenceMode(presence("auto", "lg"), 1024, THEME)).toBe("rail");
    expect(resolvePresenceMode(presence("auto", "lg"), 2000, THEME)).toBe("rail");
    expect(resolvePresenceMode(presence("auto", "lg"), 1023, THEME)).toBe("drawer");
    expect(resolvePresenceMode(presence("auto", "lg"), 320, THEME)).toBe("drawer");
  });

  test("auto honors other breakpoint keys and falls back to lg", () => {
    expect(resolvePresenceMode(presence("auto", "md"), 800, THEME)).toBe("rail");
    expect(resolvePresenceMode(presence("auto", "md"), 700, THEME)).toBe("drawer");
    expect(resolvePresenceMode(presence("auto", "nope"), 1200, THEME)).toBe("rail");
    expect(resolvePresenceMode(presence("auto", "nope"), 800, THEME)).toBe("drawer");
  });

  test("resolution is deterministic", () => {
    const p = presence("auto", "lg");
    expect(resolvePresenceMode(p, 900, THEME)).toBe(resolvePresenceMode(p, 900, THEME));
  });
});

describe("pingObjectToProjection", () => {
  test("maps identity and description with observed evidence", () => {
    const proj = pingObjectToProjection(
      mkObject("svc-1", "ping.social.service@1", "Deck builds", "We build decks."),
    );
    expect(proj.id).toBe("svc-1");
    expect(proj.name).toBe("Deck builds");
    expect(proj.kindLabel).toBe("Service");
    expect(proj.summary?.value).toBe("We build decks.");
    expect(proj.summary?.evidence.state).toBe("observed");
    expect(proj.summary?.evidence.receipt).toBe("website-ingestion:test");
  });

  test("omits summary instead of inventing prose", () => {
    const proj = pingObjectToProjection(mkObject("svc-2", "ping.social.service@1", "Fences"));
    expect(proj.summary).toBeNull();
  });

  test("grants only the always-available capabilities, no invented data", () => {
    const proj = pingObjectToProjection(mkObject("svc-3", "ping.social.service@1", "Sheds", "x"));
    expect(proj.capabilities.map((c) => c.kind)).toEqual(["view", "ask"]);
    expect(proj.facts).toEqual([]);
    expect(proj.media).toEqual([]);
    expect(proj.contact.phone).toBeNull();
    expect(proj.contact.email).toBeNull();
    expect(proj.contact.website).toBeNull();
  });
});

describe("presenceForBuild", () => {
  const OPTS = { generatedAt: AT };

  test("prefers the spec own objectPresence", () => {
    const spec = generateSiteSpec(HAPPY_PLACE_RICH_GRAPH, OPTS);
    const custom: ObjectPresence = { mode: "drawer", objects: ["z"], rules: { collapseBelow: "md" } };
    expect(presenceForBuild({ ...spec, objectPresence: custom }, HAPPY_PLACE_RICH_GRAPH)).toBe(custom);
  });

  test("derives from the graph when the spec has none", () => {
    const spec = generateSiteSpec(HAPPY_PLACE_RICH_GRAPH, OPTS);
    const out = presenceForBuild(spec, HAPPY_PLACE_RICH_GRAPH);
    expect(out).toBeDefined();
    expect(out!.mode).toBe("auto");
    const expected = HAPPY_PLACE_RICH_GRAPH.objects
      .filter((o) => o.visibility === "public" && o.id !== spec.ownerObjectId)
      .map((o) => o.id)
      .sort();
    expect(expected.length).toBeGreaterThan(0);
    expect(out!.objects).toEqual(expected);
    expect(out!.rules.collapseBelow).toBe("lg");
  });

  test("undefined when no public non-owner objects exist", () => {
    const spec = generateSiteSpec(HAPPY_PLACE_RICH_GRAPH, OPTS);
    const ownerOnly = {
      objects: HAPPY_PLACE_RICH_GRAPH.objects.filter((o) => o.id === spec.ownerObjectId),
      relationships: [],
    };
    expect(presenceForBuild(spec, ownerOnly)).toBeUndefined();
  });
});

describe("pingObjectToView", () => {
  test("maps carried fields and emits no dead capabilities", () => {
    const o = mkObject(
      "svc-1",
      "ping.social.service@1",
      "Pergola Design Consultations",
      "On-site pergola design consultations.",
    );
    const view = pingObjectToView(o);
    expect(view.id).toBe("svc-1");
    expect(view.name).toBe("Pergola Design Consultations");
    expect(view.category).toBe("Service");
    expect(view.summary).toBe("On-site pergola design consultations.");
    // The /o/ node route serves site slugs only; view/ask would be dead
    // links on a non-owner object, so no actions are emitted.
    expect(view.capabilities).toEqual([]);
    expect(view.media).toEqual([]);
    expect(view.provenance.label).toBe("Observed on test");
  });

  test("unclassified schemas fall back to Object", () => {
    const o = mkObject("ext-1", "ping.social.external_identity@1", "example.com", "External profile.");
    expect(pingObjectToView(o).category).toBe("Object");
  });

  test("unknown schemas fall back to Object", () => {
    const o = mkObject("x-1", "weird@9", "Weird", "desc");
    expect(pingObjectToView(o).category).toBe("Object");
  });
});

describe("evidenceScore", () => {
  test("rewards description words most", () => {
    const thin = mkObject("a", "ping.social.location@1", "Loc", "one two three");
    const rich = mkObject("b", "ping.social.service@1", "Svc", "one two three four five six");
    expect(evidenceScore(rich)).toBeGreaterThan(evidenceScore(thin));
  });

  test("is deterministic", () => {
    const o = mkObject("a", "ping.social.service@1", "Svc", "some words here");
    expect(evidenceScore(o)).toBe(evidenceScore(o));
  });
});

describe("richestObject", () => {
  const OWNER = "owner-1";

  test("picks the highest score and excludes the owner", () => {
    const owner = mkObject(OWNER, "ping.social.business@1", "Owner", "word ".repeat(100));
    const loc = mkObject("loc-1", "ping.social.location@1", "Loc", "one two three four five six seven eight nine");
    const svc = {
      ...mkObject("svc-1", "ping.social.service@1", "Svc", "one two three four five six seven eight nine ten eleven twelve"),
      fields: { a: "x", b: "y" },
    };
    // loc: 9*4 + 0 + 5 = 41; svc: 12*4 + 2*3 + 5 = 59. Owner excluded despite 100 words.
    expect(richestObject([owner, loc, svc], OWNER)?.id).toBe("svc-1");
  });

  test("ties keep the lowest id", () => {
    const a = mkObject("t-b", "ping.social.service@1", "B", "same words here");
    const b = mkObject("t-a", "ping.social.service@1", "A", "same words here");
    expect(richestObject([a, b], OWNER)?.id).toBe("t-a");
  });

  test("returns null when no public non-owner object exists", () => {
    const owner = mkObject(OWNER, "ping.social.business@1", "Owner", "desc");
    expect(richestObject([owner], OWNER)).toBeNull();
    expect(richestObject([], OWNER)).toBeNull();
  });

  test("skips non-public objects", () => {
    const hidden = { ...mkObject("h-1", "ping.social.service@1", "Hidden", "word ".repeat(50)), visibility: "private" as const };
    const shown = mkObject("s-1", "ping.social.service@1", "Shown", "a b c");
    expect(richestObject([hidden, shown], OWNER)?.id).toBe("s-1");
  });
});
