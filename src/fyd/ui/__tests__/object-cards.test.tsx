/**
 * Tests for the Circle's compact projection contract and markup rules
 * (Nolan, 2026-09-22; 18:40 redesign BINDING, supersedes the earlier
 * REST -> OBJECT -> ASK oval targets: GLYPH -> PEEK -> WORKSPACE).
 *
 * - compactActionsFor: schema + evidence + capabilities -> ranked actions
 *   (Website, Contact, Follow, Like, Ask FYD last). An action renders only
 *   when the underlying value exists and passes URL safety; the "view"
 *   capability never renders; call+email collapse into one Contact;
 *   address/location schemas never expose Like or Follow.
 * - shortDescriptionFor: one sentence, ~80-140 chars, never invented.
 *   Precedence: owner-authored > derived presentation; null when there is
 *   nothing to project.
 * - compactProjectionFor: the peek's information budget for Happy Place
 *   AND Coppersmith through the same generic projection.
 * - shouldShowFollowReceipt: only a server-confirmed false -> true
 *   transition earns the receipt.
 * - PeekCard markup (STATE 2): identity, one-line description, Ask FYD
 *   primary plus the compact ask entry (suggestions capped at the density
 *   budget); NO scrollbars; the peek is content-budgeted by construction.
 * - askRequestBody: objectId is included only when known.
 *
 * Run: npx jest --config src/fyd/ui/jest.config.cjs
 */

import * as React from "react";
import { renderToString } from "react-dom/server";
import {
  PEEK_H,
  PEEK_W,
  REST_D,
  WORKSPACE_W,
  actionAllowedBySchema,
  compactActionsFor,
  compactProjectionFor,
  shouldShowFollowReceipt,
  shortDescriptionFor,
} from "../object-layer/ObjectCircle";
import { PeekCard } from "../object-layer/PeekCard";
import { buildPresentationSpec } from "../object-layer/presentation-spec";
import { askRequestBody } from "../ask-object-panel";
import type { MarginObjectDescriptor } from "../object-layer/types";
import type {
  Fact,
  ObjectCapability,
  ObjectProjection,
  RelatedRef,
} from "@/fyd/object/object-projection";

const observed = { state: "observed" as const };
const unknown = { state: "unknown" as const };

function fact(label: string, value: string, state: "observed" | "unknown"): Fact {
  return { label, value, evidence: state === "observed" ? observed : unknown };
}

function ref(
  id: string,
  name: string,
  relation: string,
  state: "observed" | "unknown",
): RelatedRef {
  return {
    id,
    name,
    kindLabel: "Service",
    relation,
    evidence: state === "observed" ? observed : unknown,
  };
}

function happyPlaceProjection(): ObjectProjection {
  return {
    id: "happy-place",
    schema: "fyd:Business",
    kindLabel: "Business",
    name: "Happy Place Carpentry LLC",
    category: fact("Category", "Carpentry", "observed"),
    location: fact("Location", "Adair Village, OR, US", "observed"),
    summary: fact(
      "Summary",
      "Licensed Oregon carpentry contractor building decks and fences.",
      "observed",
    ),
    facts: [fact("License", "CCB# 254240", "observed")],
    people: [],
    externalIdentities: [],
    serviceRefs: [
      ref("svc-1", "Repairs", "Offers", "observed"),
      ref("svc-2", "Fencing", "Offers", "observed"),
    ],
    locationRef: null,
    contact: {
      phone: fact("Phone", "(555) 123-4567", "observed"),
      email: null,
      website: null,
    },
    capabilities: [
      { kind: "ask" },
      { kind: "follow" },
      { kind: "like" },
      { kind: "call", href: "tel:+15551234567", label: "Call" },
      { kind: "email", href: "mailto:hello@example.com", label: "Email" },
      { kind: "website", href: "https://happyplacecarpentry.com", label: "Website" },
      { kind: "view" },
    ],
    provenance: {
      label: "Information observed on happyplacecarpentry.com",
      ref: "website-ingestion:https://happyplacecarpentry.com/",
      derivedAt: "2026-09-21",
    },
    sampleQuestions: ["What services do you offer?"],
    ownerUpdatedAt: null,
    media: [],
  };
}

function coppersmithProjection(): ObjectProjection {
  return {
    id: "coppersmith-plumbing",
    schema: "fyd:Business",
    kindLabel: "Business",
    name: "Coppersmith Plumbing - HVAC - Mechanical",
    category: fact("Category", "Plumbing", "observed"),
    location: fact("Location", "Grand Junction, CO, US", "observed"),
    summary: fact(
      "Summary",
      "Family-owned plumbing and HVAC company serving the Grand Valley for over two decades.",
      "observed",
    ),
    facts: [],
    people: [],
    externalIdentities: [],
    serviceRefs: [ref("svc-9", "Drain cleaning", "Offers", "observed")],
    locationRef: null,
    contact: {
      phone: fact("Phone", "(970) 555-0199", "observed"),
      email: fact("Email", "hello@coppersmithplumbing.com", "observed"),
      website: null,
    },
    capabilities: [
      { kind: "ask" },
      { kind: "follow" },
      { kind: "like" },
      { kind: "call", href: "tel:+19705550199", label: "Call" },
      { kind: "website", href: "https://coppersmithplumbing.com", label: "Website" },
      { kind: "view" },
    ],
    provenance: {
      label: "Information observed on coppersmithplumbing.com",
      ref: "website-ingestion:https://coppersmithplumbing.com/",
      derivedAt: "2026-09-21",
    },
    sampleQuestions: ["Do you offer emergency service?"],
    ownerUpdatedAt: null,
    media: [],
  };
}

function descriptorFor(objectId: string, name: string, websiteUrl: string | null): MarginObjectDescriptor {
  return {
    objectId,
    name,
    imageSrc: null,
    imageSrcSet: null,
    websiteUrl,
    anchorKey: objectId,
    priority: 100,
  };
}

describe("surface geometry", () => {
  test("rest diameter is the small quiet 40px", () => {
    expect(REST_D).toBe(40);
  });

  test("STATE 2 peek is compact: max width inside the 360-420px directive band", () => {
    expect(PEEK_W).toBeGreaterThanOrEqual(360);
    expect(PEEK_W).toBeLessThanOrEqual(420);
    expect(PEEK_H).toBe(340);
  });

  test("STATE 3 workspace is a restrained sheet inside the 360-420px band", () => {
    expect(WORKSPACE_W).toBeGreaterThanOrEqual(360);
    expect(WORKSPACE_W).toBeLessThanOrEqual(420);
  });
});

describe("compactActionsFor: schema + evidence + capabilities", () => {
  test("empty capabilities -> no actions", () => {
    expect(compactActionsFor("fyd:Business", [], null)).toEqual([]);
  });

  test("the view capability never renders an action", () => {
    expect(compactActionsFor("fyd:Business", [{ kind: "view" }], null)).toEqual([]);
  });

  test("ranked order: website, contact, follow, like, ask last", () => {
    const caps: ObjectCapability[] = [
      { kind: "ask" },
      { kind: "follow" },
      { kind: "like" },
      { kind: "call", href: "tel:+15551234567", label: "Call" },
      { kind: "email", href: "mailto:hello@example.com", label: "Email" },
      { kind: "website", href: "https://happyplacecarpentry.com", label: "Website" },
    ];
    const actions = compactActionsFor("fyd:Business", caps, null);
    expect(actions.map((a) => a.kind)).toEqual([
      "website",
      "contact",
      "follow",
      "like",
      "ask",
    ]);
  });

  test("call and email collapse into one Contact, call preferred", () => {
    const actions = compactActionsFor(
      "fyd:Business",
      [
        { kind: "call", href: "tel:+15551234567", label: "Call" },
        { kind: "email", href: "mailto:hello@example.com", label: "Email" },
      ],
      null,
    );
    expect(actions).toEqual([
      { kind: "contact", label: "Contact", href: "tel:+15551234567" },
    ]);
  });

  test("email-only object gets a mailto Contact", () => {
    const actions = compactActionsFor(
      "fyd:Business",
      [{ kind: "email", href: "mailto:hello@example.com", label: "Email" }],
      null,
    );
    expect(actions).toEqual([
      { kind: "contact", label: "Contact", href: "mailto:hello@example.com" },
    ]);
  });

  test("website falls back to the evidence-backed descriptor URL", () => {
    const actions = compactActionsFor(
      "fyd:Business",
      [{ kind: "ask" }],
      "https://happyplacecarpentry.com",
    );
    expect(actions.map((a) => a.kind)).toEqual(["website", "ask"]);
    expect(actions[0]?.href).toBe("https://happyplacecarpentry.com");
  });

  test("unsafe website URLs never render", () => {
    const actions = compactActionsFor(
      "fyd:Business",
      [{ kind: "website", href: "javascript:alert(1)", label: "Website" }],
      null,
    );
    expect(actions.some((a) => a.kind === "website")).toBe(false);
  });

  test("an address never exposes Like or Follow", () => {
    expect(actionAllowedBySchema("fyd:Address", "like")).toBe(false);
    expect(actionAllowedBySchema("fyd:Address", "follow")).toBe(false);
    expect(actionAllowedBySchema("fyd:Address", "website")).toBe(true);
    const actions = compactActionsFor(
      "fyd:Address",
      [{ kind: "like" }, { kind: "follow" }, { kind: "ask" }],
      null,
    );
    expect(actions.map((a) => a.kind)).toEqual(["ask"]);
  });

  test("a person keeps Follow", () => {
    const actions = compactActionsFor(
      "fyd:Person",
      [{ kind: "follow" }, { kind: "ask" }],
      null,
    );
    expect(actions.map((a) => a.kind)).toEqual(["follow", "ask"]);
  });
});

describe("short description: one sentence, budgeted, never invented", () => {
  test("owner-authored copy wins and is marked owner", () => {
    const d = shortDescriptionFor({
      ownerShortDescription: "Custom carpentry, repairs, and finish work built to last.",
      category: "Carpentry",
    });
    expect(d?.source).toBe("owner");
    expect(d?.text).toBe("Custom carpentry, repairs, and finish work built to last.");
  });

  test("derived presentation composes category, services, location", () => {
    const d = shortDescriptionFor({
      category: "Carpentry",
      location: "Adair Village, OR, US",
      services: ["Repairs", "Fencing"],
    });
    expect(d?.source).toBe("derived");
    expect(d?.text).toBe("Carpentry, Repairs, Fencing, in Adair Village, OR, US.");
  });

  test("only the known tiers feed the description: a bare summary yields null", () => {
    expect(
      shortDescriptionFor({
        summary: "Licensed Oregon carpentry contractor building decks and fences.",
      }),
    ).toBeNull();
  });

  test("long text is cut at a word boundary within budget", () => {
    const long =
      "Licensed Oregon carpentry contractor building decks and fences and pergolas and gazebos and outdoor kitchens and custom staircases for lovely clients everywhere.";
    const d = shortDescriptionFor({ ownerShortDescription: long });
    expect(d!.text.length).toBeLessThanOrEqual(140);
    expect(d!.text.endsWith("…")).toBe(true);
    expect(d!.text).not.toMatch(/\S…$/);
  });

  test("null when there is nothing to project", () => {
    expect(shortDescriptionFor({})).toBeNull();
  });
});

describe("compactProjectionFor: the peek's information budget", () => {
  test("Happy Place projects identity, description, website, actions", () => {
    const c = compactProjectionFor(happyPlaceProjection());
    expect(c.name).toBe("Happy Place Carpentry LLC");
    expect(c.kindLabel).toBe("Business");
    expect(c.websiteUrl).toBe("https://happyplacecarpentry.com");
    expect(c.shortDescription?.text).toBe("CCB# 254240");
    expect(c.shortDescription!.text.length).toBeLessThanOrEqual(140);
    expect(c.actions.map((a) => a.kind)).toEqual([
      "website",
      "contact",
      "follow",
      "like",
      "ask",
    ]);
    expect(c.sampleQuestions).toEqual(["What services do you offer?"]);
  });

  test("Coppersmith projects through the same projection with different data", () => {
    const hpDesc = compactProjectionFor(happyPlaceProjection()).shortDescription?.text;
    const cp = compactProjectionFor(coppersmithProjection());
    expect(cp.name).toBe("Coppersmith Plumbing - HVAC - Mechanical");
    expect(cp.websiteUrl).toBe("https://coppersmithplumbing.com");
    expect(cp.actions.map((a) => a.kind)).toEqual([
      "website",
      "contact",
      "follow",
      "like",
      "ask",
    ]);
    expect(cp.shortDescription).toBeNull();
    expect(hpDesc).toBe("CCB# 254240");
    expect(hpDesc).not.toBe(cp.shortDescription?.text);
  });

  test("unknown-evidence values are omitted, never guessed", () => {
    const p = happyPlaceProjection();
    p.facts = [];
    p.capabilities = p.capabilities.filter((c) => c.kind !== "website");
    const c = compactProjectionFor(p);
    expect(c.shortDescription).toBeNull();
    expect(c.websiteUrl).toBeNull();
    expect(c.actions.map((a) => a.kind)).toEqual(["contact", "follow", "like", "ask"]);
  });
});

describe("shouldShowFollowReceipt", () => {
  test("server-confirmed false -> true earns the receipt", () => {
    expect(shouldShowFollowReceipt(false, true)).toBe(true);
  });

  test("initial load never earns the receipt", () => {
    expect(shouldShowFollowReceipt(null, true)).toBe(false);
    expect(shouldShowFollowReceipt(null, false)).toBe(false);
  });

  test("no transition, no receipt", () => {
    expect(shouldShowFollowReceipt(true, true)).toBe(false);
    expect(shouldShowFollowReceipt(false, false)).toBe(false);
    expect(shouldShowFollowReceipt(true, false)).toBe(false);
    expect(shouldShowFollowReceipt(null, null)).toBe(false);
  });
});

describe("PeekCard markup: STATE 2, compact, never scrolls", () => {
  function renderPeek(p: ObjectProjection): string {
    const spec = buildPresentationSpec({
      projection: p,
      descriptor: descriptorFor(p.id, p.name, null),
      viewer: { role: "visitor" },
      surface: { surface: "peek", viewport: { widthClass: "md" } },
    });
    return renderToString(
      <PeekCard spec={spec} onAction={() => {}} onAsk={() => {}} onClose={() => {}} />,
    );
  }

  const hp = happyPlaceProjection();
  const html = renderPeek(hp);

  test("name, kind, and description are immediately visible", () => {
    expect(html).toContain("Happy Place Carpentry LLC");
    expect(html).toContain("Business");
    expect(html).toContain("CCB# 254240");
  });

  test("no scrollbars: no overflow scrolling anywhere in the peek", () => {
    expect(html).not.toContain("overflow-y:auto");
    expect(html).not.toContain("overflow-y:scroll");
    expect(html).not.toContain("overflow:auto");
    expect(html).not.toContain("overflow-x:auto");
    expect(html).not.toContain("overflow-x:scroll");
  });

  test("Website is a first-class action", () => {
    expect(html).toContain("Website");
    expect(html).toContain('href="https://happyplacecarpentry.com"');
  });

  test("Follow and Like render as actions", () => {
    expect(html).toContain("Follow");
    expect(html).toContain("Like");
  });

  test("Ask FYD is primary and the ask entry stays compact", () => {
    expect(html).toContain("Ask FYD");
    expect(html).toContain("What do you want to know?");
  });

  test("ask suggestions live in the ask entry, capped at the density budget", () => {
    expect(html).toContain("What services do you offer?");
    const many = happyPlaceProjection();
    many.sampleQuestions = ["Q1", "Q2", "Q3", "Q4", "Q5"];
    const capped = renderPeek(many);
    expect(capped).toContain("Q1");
    expect(capped).toContain("Q2");
    expect(capped).toContain("Q3");
    expect(capped).not.toContain("Q4");
    expect(capped).not.toContain("Q5");
  });

  test("same spec builder renders Coppersmith with its own data", () => {
    const cHtml = renderPeek(coppersmithProjection());
    expect(cHtml).toContain("Coppersmith Plumbing - HVAC - Mechanical");
    expect(cHtml).toContain("Website");
    expect(cHtml).not.toContain("Happy Place Carpentry LLC");
  });

  test("no em dashes in rendered strings", () => {
    expect(html).not.toContain("—");
  });
});

describe("askRequestBody: object targeting", () => {
  test("includes objectId when known", () => {
    expect(askRequestBody("happy-place", "happy-place", "What do you do?")).toEqual({
      siteId: "happy-place",
      objectId: "happy-place",
      question: "What do you do?",
      mode: "visitor",
    });
  });

  test("omits objectId when unknown", () => {
    const body = askRequestBody("happy-place", undefined, "What do you do?");
    expect(body).toEqual({
      siteId: "happy-place",
      question: "What do you do?",
      mode: "visitor",
    });
    expect("objectId" in body).toBe(false);
  });
});
