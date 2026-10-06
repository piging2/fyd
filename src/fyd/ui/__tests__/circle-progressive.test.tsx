/**
 * Tests for the FYD object layer (Nolan, 2026-09-22 FYD grill, binding
 * course correction): GLYPH -> PEEK -> WORKSPACE.
 *
 * - primaryActionFor: Website first, then Contact, then Ask FYD; null
 *   when none applies.
 * - sampleQuestionsFor: suggestions vary by object type (product, person,
 *   service, business); max 4.
 * - resolveCircleMotion / MOTION_INTENSITY: the canonical MotionTokens
 *   union resolves to concrete values; unknown intensities fail closed;
 *   reduced motion collapses to instant.
 * - flipCardX: expanded cards flip inward from the rail and clamp inside
 *   the viewport edge; no scrolling.
 * - strongestAnchor: deterministic context-anchor selection.
 * - askRequestBody: pageContext is sent when non-empty, omitted otherwise.
 * - compactProjectionFor: the peek's data budget (website, actions,
 *   short description with provenance).
 * - PeekCard markup: identity + one-line description + Ask FYD first;
 *   density budgets actions/suggestions; loading skeletons; never
 *   scrolls; no em dashes.
 * - ViewportCapabilities: width classes at 320/375/390/430/768/desktop,
 *   device classes, density derivation.
 * - PresentationSpec density: compact phones budget fewer actions and
 *   suggestions than comfortable viewports. Same object, no fork.
 * - design-compiler: the default intent reproduces the shipped shell;
 *   SiteSpec tokens compile deterministically.
 * - view-transitions: updates run without the API; identity names are
 *   stable.
 *
 * Run: npx jest --config src/fyd/ui/jest.config.cjs
 */

import * as React from "react";
import { renderToString } from "react-dom/server";
import {
  CIRCLE_MOTION,
  compactProjectionFor,
  primaryActionFor,
  resolveCircleMotion,
  sampleQuestionsFor,
  type CompactAction,
} from "../object-layer/ObjectCircle";
import { PeekCard } from "../object-layer/PeekCard";
import {
  buildPresentationSpec,
  densityFor,
  peekActionBudgetFor,
  peekActionsFor,
  suggestionBudgetFor,
  type PresentationSpec,
} from "../object-layer/presentation-spec";
import {
  deviceClassFor,
  viewportCapabilitiesFor,
  widthClassFor,
} from "../object-layer/viewport";
import {
  compileShell,
  DEFAULT_DESIGN_INTENT,
  designIntentFromTheme,
} from "../object-layer/design-compiler";
import {
  identityTransitionName,
  transitionViews,
} from "../object-layer/view-transitions";
import { flipCardX } from "../object-layer/placement";
import { strongestAnchor } from "../object-layer/MarginObjectLayer";
import { MOTION_INTENSITY } from "@/motion/motionTokens";
import { askRequestBody } from "../ask-object-panel";
import { DEFAULT_FYD_THEME } from "@/fyd/sitespec/types";
import type {
  ContactMethod,
  Fact,
  ObjectProjection,
} from "@/fyd/object/object-projection";

const observed = { state: "observed" as const };

function fact(label: string, value: string): Fact {
  return { label, value, evidence: observed };
}

function phoneMethod(): ContactMethod {
  return {
    kind: "phone",
    label: "Phone",
    value: "+1 (970) 555-0100",
    actionUri: "tel:+19705550100",
    evidence: observed,
  };
}

function businessProjection(
  capabilities: ObjectProjection["capabilities"],
  facts: Fact[] = [],
  contactMethods: ContactMethod[] = [],
): ObjectProjection {
  return {
    id: "happy-place",
    schema: "fyd:Business",
    kindLabel: "Business",
    name: "Happy Place Carpentry LLC",
    category: fact("Category", "Carpentry"),
    location: fact("Location", "Adair Village, OR, US"),
    summary: fact(
      "Summary",
      "Licensed Oregon carpentry contractor building decks and fences.",
    ),
    facts,
    people: [],
    externalIdentities: [],
    serviceRefs: [],
    locationRef: null,
    contact: { phone: null, email: null, website: null },
    contactMethods,
    capabilities,
    provenance: {
      label: "Information observed on happyplacecarpentry.com",
      ref: "website-ingestion:https://happyplacecarpentry.com/",
      derivedAt: "2026-09-21",
    },
    sampleQuestions: [],
    ownerUpdatedAt: null,
    media: [],
  };
}

function specFor(
  width: number,
  capabilities: ObjectProjection["capabilities"],
  opts: { facts?: Fact[]; contactMethods?: ContactMethod[]; role?: "visitor" | "owner-demo" } = {},
): PresentationSpec {
  return buildPresentationSpec({
    projection: businessProjection(
      capabilities,
      opts.facts ?? [],
      opts.contactMethods ?? [],
    ),
    descriptor: {
      objectId: "happy-place",
      name: "Happy Place Carpentry LLC",
      websiteUrl: "https://happyplacecarpentry.com",
    },
    viewer: { role: opts.role ?? "visitor" },
    surface: {
      surface: "peek",
      viewport: viewportCapabilitiesFor({ viewportWidth: width }),
    },
  });
}

const websiteAction: CompactAction = {
  kind: "website",
  label: "Website",
  href: "https://happyplacecarpentry.com",
};
const contactAction: CompactAction = {
  kind: "contact",
  label: "Call",
  href: "tel:+15551234567",
};
const askAction: CompactAction = { kind: "ask", label: "Ask FYD", href: "" };
const followAction: CompactAction = { kind: "follow", label: "Follow", href: "" };
const likeAction: CompactAction = { kind: "like", label: "Like", href: "" };

describe("primaryActionFor: one primary contextual action", () => {
  test("Website outranks Contact and Ask FYD", () => {
    expect(primaryActionFor([contactAction, askAction, websiteAction])).toBe(websiteAction);
  });

  test("Contact wins when there is no Website", () => {
    expect(primaryActionFor([askAction, contactAction])).toBe(contactAction);
  });

  test("Ask FYD is the fallback primary", () => {
    expect(primaryActionFor([askAction])).toBe(askAction);
  });

  test("null when no primary-eligible action exists", () => {
    expect(primaryActionFor([followAction, likeAction])).toBeNull();
    expect(primaryActionFor([])).toBeNull();
  });

  test("invalid actions are skipped, never selected", () => {
    const bogus = { kind: "nope", label: "Nope" } as unknown as CompactAction;
    expect(primaryActionFor([bogus])).toBeNull();
    expect(primaryActionFor([bogus, websiteAction])).toBe(websiteAction);
  });
});

describe("sampleQuestionsFor: suggestions vary by object type", () => {
  test("product questions are product-shaped", () => {
    const qs = sampleQuestionsFor("product");
    expect(qs).toContain("How much does it cost?");
    expect(qs.length).toBeLessThanOrEqual(4);
  });

  test("person questions are person-shaped", () => {
    const qs = sampleQuestionsFor("person");
    expect(qs).toContain("What do they do?");
    expect(qs.length).toBeLessThanOrEqual(4);
  });

  test("service questions are service-shaped", () => {
    const qs = sampleQuestionsFor("service");
    expect(qs).toContain("How do I book it?");
    expect(qs.length).toBeLessThanOrEqual(4);
  });

  test("business keeps the established business questions", () => {
    expect(sampleQuestionsFor("business")).toEqual([
      "What services do they offer?",
      "Where do they work?",
      "How do I contact them?",
      "What does FYD know about this company?",
    ]);
  });

  test("unknown kinds fall back to the business set", () => {
    expect(sampleQuestionsFor("event")).toEqual(sampleQuestionsFor("business"));
  });
});

describe("MotionTokens: canonical shape and resolution", () => {
  test("CIRCLE_MOTION carries exactly the canonical four fields", () => {
    expect(Object.keys(CIRCLE_MOTION).sort()).toEqual([
      "entrance",
      "motionIntensity",
      "objectTransition",
      "stagger",
    ]);
    expect(CIRCLE_MOTION.motionIntensity).toBe("SUBTLE");
    expect(CIRCLE_MOTION.objectTransition).toBe("MORPH");
  });

  test("MOTION_INTENSITY resolves each intensity to concrete presets", () => {
    expect(MOTION_INTENSITY.NONE).toEqual({
      durationScale: 0,
      spring: null,
      decorative: false,
    });
    expect(MOTION_INTENSITY.SUBTLE).toEqual({
      durationScale: 0.6,
      spring: "gentle",
      decorative: true,
    });
    expect(MOTION_INTENSITY.EXPRESSIVE).toEqual({
      durationScale: 1,
      spring: "snappy",
      decorative: true,
    });
  });

  test("SUBTLE default: quiet, quick, no theater", () => {
    const m = resolveCircleMotion(CIRCLE_MOTION, null);
    // 120ms: inside the 100-180ms first-response budget.
    expect(m.appearDuration).toBeCloseTo(0.12, 5);
    expect(m.staggerDelay).toBe(0); // the default profile staggers nothing
    expect(m.decorative).toBe(true);
    expect(m.objectTransition).toBe("MORPH");
  });

  test("TIGHT stagger sequences grouped children", () => {
    const m = resolveCircleMotion({ ...CIRCLE_MOTION, stagger: "TIGHT" }, null);
    expect(m.staggerDelay).toBeCloseTo(0.05, 5);
  });

  test("NONE collapses to ~instant, no decorative motion", () => {
    const m = resolveCircleMotion(
      { motionIntensity: "NONE", entrance: "FADE_RISE", objectTransition: "CROSSFADE", stagger: "TIGHT" },
      null,
    );
    expect(m.appearDuration).toBeCloseTo(0.01, 5);
    expect(m.staggerDelay).toBe(0);
    expect(m.decorative).toBe(false);
    expect(m.objectTransition).toBe("CROSSFADE");
  });

  test("EXPRESSIVE runs full scale with relaxed stagger", () => {
    const m = resolveCircleMotion(
      { motionIntensity: "EXPRESSIVE", entrance: "SCALE", objectTransition: "MORPH", stagger: "RELAXED" },
      null,
    );
    expect(m.appearDuration).toBeCloseTo(0.16, 5);
    expect(m.staggerDelay).toBeCloseTo(0.15, 5);
    expect(m.decorative).toBe(true);
  });

  test("reduced motion always wins: ~instant, no stagger, crossfade", () => {
    const m = resolveCircleMotion(CIRCLE_MOTION, true);
    expect(m.appearDuration).toBeCloseTo(0.01, 5);
    expect(m.staggerDelay).toBe(0);
    expect(m.decorative).toBe(false);
    expect(m.objectTransition).toBe("CROSSFADE");
  });

  test("unknown intensities fail closed to no motion", () => {
    const m = resolveCircleMotion(
      { motionIntensity: "LOUD" as "NONE", entrance: "REVEAL", objectTransition: "MORPH", stagger: "TIGHT" },
      null,
    );
    expect(m.appearDuration).toBeCloseTo(0.01, 5);
    expect(m.staggerDelay).toBe(0);
    expect(m.decorative).toBe(false);
    expect(m.objectTransition).toBe("CROSSFADE");
  });
});

describe("flipCardX: expanded cards flip inward, never past the edge", () => {
  test("right rail grows left/inward", () => {
    expect(flipCardX(1352, 40, "right", 300, 1440)).toEqual({
      cardX: 1092,
      growth: "inward-left",
    });
  });

  test("left rail grows right/inward", () => {
    expect(flipCardX(48, 40, "left", 300, 1440)).toEqual({
      cardX: 48,
      growth: "inward-right",
    });
  });

  test("right edge clamps inward without scrolling", () => {
    expect(flipCardX(1400, 40, "right", 300, 1440)).toEqual({
      cardX: 1116,
      growth: "clamped",
    });
  });

  test("left edge clamps inward without scrolling", () => {
    expect(flipCardX(0, 40, "left", 300, 1440)).toEqual({
      cardX: 24,
      growth: "clamped",
    });
  });

  test("narrow viewport (320px): margins shrink so the card stays inside", () => {
    const { cardX, growth } = flipCardX(280, 40, "right", 300, 320);
    expect(growth).toBe("clamped");
    expect(cardX).toBeGreaterThanOrEqual(0);
    expect(cardX + 300).toBeLessThanOrEqual(320);
  });
});

describe("strongestAnchor: deterministic context selection", () => {
  test("picks the anchor with the highest intersection ratio", () => {
    expect(
      strongestAnchor(
        new Map([
          ["a", 0.2],
          ["b", 0.8],
          ["c", 0.5],
        ]),
      ),
    ).toBe("b");
  });

  test("ties break by observation order", () => {
    expect(
      strongestAnchor(
        new Map([
          ["a", 0.5],
          ["b", 0.5],
        ]),
      ),
    ).toBe("a");
  });

  test("null when nothing intersects", () => {
    expect(strongestAnchor(new Map())).toBeNull();
    expect(
      strongestAnchor(
        new Map([
          ["a", 0],
          ["b", 0],
        ]),
      ),
    ).toBeNull();
  });
});

describe("askRequestBody: page context", () => {
  const ctx = { visibleObjectIds: ["happy-place", "coppersmith"], contextObjectId: "happy-place" };

  test("includes pageContext when it is non-empty", () => {
    expect(askRequestBody("happy-place", "happy-place", "What do you do?", ctx)).toEqual({
      siteId: "happy-place",
      objectId: "happy-place",
      question: "What do you do?",
      mode: "visitor",
      pageContext: ctx,
    });
  });

  test("omits pageContext when absent", () => {
    const body = askRequestBody("happy-place", "happy-place", "What do you do?");
    expect(body).not.toHaveProperty("pageContext");
  });

  test("omits pageContext when it carries nothing", () => {
    const body = askRequestBody("happy-place", "happy-place", "What do you do?", {
      visibleObjectIds: [],
      contextObjectId: null,
    });
    expect(body).not.toHaveProperty("pageContext");
  });
});

describe("compactProjectionFor: the peek's data budget", () => {
  const websiteCap = {
    kind: "website" as const,
    href: "https://happyplacecarpentry.com",
    label: "Website",
  };

  test("derives website, actions, and the owner-tier short description", () => {
    const p = businessProjection([websiteCap, { kind: "ask" }], [
      fact("Summary", "Licensed Oregon carpentry contractor building decks and fences."),
    ]);
    const c = compactProjectionFor(p);
    expect(c.name).toBe("Happy Place Carpentry LLC");
    expect(c.kindLabel).toBe("Business");
    expect(c.websiteUrl).toBe("https://happyplacecarpentry.com");
    expect(c.shortDescription?.source).toBe("owner");
    expect(c.shortDescription?.text).toContain("Licensed Oregon carpentry");
    expect(c.actions.map((a) => a.kind)).toEqual(
      expect.arrayContaining(["website", "ask"]),
    );
    expect(c.sampleQuestions.length).toBeLessThanOrEqual(4);
  });

  test("no facts: no short description, never invented", () => {
    const c = compactProjectionFor(businessProjection([websiteCap]));
    expect(c.shortDescription).toBeNull();
  });
});

describe("PeekCard: the transient peek markup", () => {
  const websiteCap = {
    kind: "website" as const,
    href: "https://happyplacecarpentry.com",
    label: "Website",
  };
  const caps = [websiteCap, { kind: "ask" }, { kind: "follow" }, { kind: "like" }] as const;

  function renderPeek(
    width: number,
    options: { loading?: boolean; role?: "visitor" | "owner-demo"; transitionId?: string } = {},
  ) {
    const spec = specFor(width, [...caps] as ObjectProjection["capabilities"], {
      facts: [fact("Summary", "Licensed Oregon carpentry contractor building decks and fences.")],
      contactMethods: [phoneMethod()],
      role: options.role,
    });
    const html = renderToString(
      React.createElement(PeekCard, {
        spec,
        loading: options.loading ?? false,
        transitionId: options.transitionId,
        onAction: () => undefined,
        onAsk: () => undefined,
        onClose: () => undefined,
      }),
    );
    return { spec, html };
  }

  test("identity, one line, Ask FYD first; never scrolls", () => {
    const { spec, html } = renderPeek(1280);
    // Identity first, one punchy description second.
    expect(html).toContain("Happy Place Carpentry LLC");
    expect(html).toContain("Licensed Oregon carpentry contractor building decks and fences.");
    // Ask FYD present and first among actions.
    const actions = peekActionsFor(spec);
    expect(actions.map((a) => a.kind)).toEqual(["ask", "website", "contact", "follow"]);
    expect(html).toContain("Ask FYD");
    // Transient peek surface, not the workspace.
    expect(html).toContain('data-fyd-surface="peek"');
    // No scroll regions: the composition must fit, not scroll.
    expect(html).not.toMatch(/overflow-(y|x):(auto|scroll)/);
    expect(html).not.toContain("max-h-");
    // Plain prose: no em dashes.
    expect(html).not.toContain("\u2014");
  });

  test("compact phone budgets fewer actions and suggestions than comfortable", () => {
    const phone = specFor(375, [...caps] as ObjectProjection["capabilities"], {
      facts: [fact("Summary", "Licensed Oregon carpentry contractor building decks and fences.")],
      contactMethods: [phoneMethod()],
    });
    const desktop = specFor(1280, [...caps] as ObjectProjection["capabilities"], {
      facts: [fact("Summary", "Licensed Oregon carpentry contractor building decks and fences.")],
      contactMethods: [phoneMethod()],
    });
    expect(phone.density).toBe("compact");
    expect(desktop.density).toBe("comfortable");
    // Five eligible actions: ask, website, contact, follow, like.
    expect(peekActionsFor(phone).length).toBe(3);
    expect(peekActionsFor(desktop).length).toBe(4);
    expect(phone.suggestions.length).toBeLessThanOrEqual(2);
    expect(desktop.suggestions.length).toBeLessThanOrEqual(3);
    // Ask FYD stays first on both.
    expect(peekActionsFor(phone)[0].kind).toBe("ask");
    expect(peekActionsFor(desktop)[0].kind).toBe("ask");
  });

  test("loading reserves space with skeletons, never an empty box", () => {
    // While loading, the projection has not arrived: no facts, no
    // capabilities yet. Descriptor-known identity is safe to show;
    // projection-derived content gets skeletons, not blank space.
    const spec = specFor(375, [], { facts: [] });
    const html = renderToString(
      React.createElement(PeekCard, {
        spec,
        loading: true,
        onAction: () => undefined,
        onAsk: () => undefined,
        onClose: () => undefined,
      }),
    );
    expect(html).toContain("Happy Place Carpentry LLC");
    expect(html).toContain("data-fyd-skeleton");
    // Capabilities are not known yet: no Ask FYD form.
    expect(html).not.toContain("What do you want to know?");
    // No scroll regions even while loading.
    expect(html).not.toMatch(/overflow-(y|x):(auto|scroll)/);
  });

  test("owner demo actions are excluded from the peek's visible actions", () => {
    const { spec } = renderPeek(1280, { role: "owner-demo" });
    // Customize lives in the workspace Owner tab; the peek stays visitor-quiet.
    expect(peekActionsFor(spec).some((a) => a.kind === "demo-owner")).toBe(false);
  });
});

describe("ViewportCapabilities: one seam, no fork", () => {
  test("width classes at the mandated evaluation widths", () => {
    expect(widthClassFor(320)).toBe("xs");
    expect(widthClassFor(375)).toBe("sm");
    expect(widthClassFor(390)).toBe("sm");
    expect(widthClassFor(393)).toBe("sm");
    expect(widthClassFor(430)).toBe("sm");
    expect(widthClassFor(768)).toBe("md");
    expect(widthClassFor(1024)).toBe("lg");
    expect(widthClassFor(1280)).toBe("lg");
    expect(widthClassFor(1440)).toBe("xl");
  });

  test("device classes separate phones, tablets, and desktops", () => {
    expect(deviceClassFor(375, "coarse")).toBe("phone");
    expect(deviceClassFor(430, "coarse")).toBe("phone");
    expect(deviceClassFor(768, "coarse")).toBe("tablet");
    expect(deviceClassFor(768, "fine")).toBe("tablet");
    expect(deviceClassFor(1440, "fine")).toBe("desktop");
    // Large but touch-first still gets touch ergonomics.
    expect(deviceClassFor(1024, "coarse")).toBe("tablet");
  });

  test("density: phones compact, tablets and up comfortable", () => {
    const capsFor = (w: number) => densityFor(viewportCapabilitiesFor({ viewportWidth: w }));
    expect(capsFor(320)).toBe("compact");
    expect(capsFor(375)).toBe("compact");
    expect(capsFor(430)).toBe("compact");
    expect(capsFor(768)).toBe("comfortable");
    expect(capsFor(1280)).toBe("comfortable");
    expect(capsFor(1440)).toBe("comfortable");
  });

  test("density budgets: compact shows less", () => {
    expect(peekActionBudgetFor("compact")).toBe(3);
    expect(peekActionBudgetFor("comfortable")).toBe(4);
    expect(suggestionBudgetFor("compact")).toBe(2);
    expect(suggestionBudgetFor("comfortable")).toBe(3);
  });

  test("viewportCapabilitiesFor defaults sensibly", () => {
    const caps = viewportCapabilitiesFor({ viewportWidth: 1280 });
    expect(caps.widthClass).toBe("lg");
    expect(caps.deviceClass).toBe("desktop");
    expect(caps.pointer).toBe("fine");
    expect(caps.hover).toBe("hover");
    expect(caps.reducedMotion).toBe(false);
    expect(caps.colorScheme).toBe("light");
  });

  test("fine pointer with wide width is a desktop", () => {
    const caps = viewportCapabilitiesFor({ viewportWidth: 1440, pointer: "fine" });
    expect(caps.deviceClass).toBe("desktop");
    expect(caps.hover).toBe("hover");
    expect(caps.pointer).toBe("fine");
  });

  test("coarse pointer without hover is still fully usable", () => {
    const caps = viewportCapabilitiesFor({
      viewportWidth: 375,
      pointer: "coarse",
      hover: "none",
    });
    expect(caps.deviceClass).toBe("phone");
    expect(caps.hover).toBe("none");
    // No feature may depend on hover: the spec seam budgets identically.
    expect(densityFor(caps)).toBe("compact");
  });
});

describe("design-compiler: semantic intent to compiled shell", () => {
  test("the default intent reproduces the shipped FYD shell exactly", () => {
    const s = compileShell(DEFAULT_DESIGN_INTENT);
    expect(s.radius).toEqual({ peek: 16, workspace: 18, control: 10, chip: 999 });
    expect(s.spacing).toEqual({ peekPad: 16, workspacePad: 20, sectionGap: 16, rowGap: 8 });
    expect(s.type).toEqual({ name: 15, desc: 13, action: 14, caption: 12 });
    expect(s.elevation.peek).toContain("0 12px 32px");
    expect(s.elevation.workspace).toContain("0 24px 64px");
    expect(s.touchTarget).toBe(44);
  });

  test("compact density tightens the same shell, never forks it", () => {
    const s = compileShell({ ...DEFAULT_DESIGN_INTENT, density: "compact" });
    // 0.75 tighten of the {xs:4, sm:8, md:16, lg:20, xl:32} rhythm.
    expect(s.spacing).toEqual({ peekPad: 12, workspacePad: 15, sectionGap: 12, rowGap: 6 });
    expect(s.radius).toEqual({ peek: 16, workspace: 18, control: 10, chip: 999 });
    expect(s.touchTarget).toBe(44);
  });

  test("the SiteSpec theme compiles deterministically", () => {
    const a = compileShell(designIntentFromTheme(DEFAULT_FYD_THEME));
    const b = compileShell(designIntentFromTheme(DEFAULT_FYD_THEME));
    expect(a).toEqual(b);
    expect(a.radius.peek).toBe(16);
    expect(a.touchTarget).toBe(44);
  });

  test("compilation has no network, clock, or randomness inputs", () => {
    const first = compileShell({ ...DEFAULT_DESIGN_INTENT, density: "comfortable" });
    const second = compileShell({ ...DEFAULT_DESIGN_INTENT, density: "comfortable" });
    expect(first).toEqual(second);
  });
});

describe("view-transitions: progressive object continuity", () => {
  test("updates run synchronously when the transition API is absent", () => {
    // This suite runs in a node environment (no window, no document):
    // progressive enhancement means the update is correct either way.
    expect(typeof window).toBe("undefined");
    let ran = false;
    transitionViews(() => {
      ran = true;
    });
    expect(ran).toBe(true);
  });

  test("identity names are stable, namespaced, and safe", () => {
    expect(identityTransitionName("happy-place")).toBe("fyd-identity-happy-place");
    expect(identityTransitionName("happy-place")).toBe(identityTransitionName("happy-place"));
    expect(identityTransitionName("A B/C")).toBe("fyd-identity-a-b-c");
  });
});
