/**
 * renderToString smoke tests for FydCircle plus direct tests of the
 * capability -> action mapping (the rule that an action is never rendered
 * without its capability).
 *
 * The action row only exists in the expanded state; the pure
 * circleActionsFor() helper is exactly what the component maps over to
 * render it, so testing the helper tests the render rule.
 *
 * Run: npx jest --config src/fyd/ui/jest.config.cjs
 */

import * as React from "react";
import { renderToString } from "react-dom/server";
import {
  FydCircle,
  FydCircleNodeLink,
  circleActionsFor,
  nodeControlFor,
} from "../fyd-circle";
import type { CircleProjection, ObjectCapability } from "@/fyd/object/types";

const baseProjection: CircleProjection = {
  id: "obj-happy-place",
  name: "Happy Place",
  category: "Coffee Shop",
  locationLabel: "Grand Junction, CO",
  tagline: "Good coffee, friendly faces",
  topFacts: ["Family owned", "Open weekends", "Fresh pastries daily", "A fourth fact"],
  background: {
    kind: "gradient",
    css: "radial-gradient(circle, #3a2b1f, #171008)",
    digest: "deadbeef",
    basis: "generated",
  },
  capabilities: [
    { kind: "ask" },
    { kind: "email", href: "mailto:hello@example.com", label: "Email us" },
    { kind: "website", href: "https://example.com", label: "Visit website" },
  ],
  provenanceLabel: "From the business website",
  provenanceDetail: "Observed 2026-09-20 from the homepage.",
  sampleQuestions: ["What are your hours?", "Do you have wifi?"],
};

describe("collapsed markup", () => {
  const html = renderToString(<FydCircle projection={baseProjection} />);

  test("contains the business name in aria-label", () => {
    expect(html).toContain('aria-label="Happy Place"');
  });

  test("is a button with aria-expanded=false", () => {
    expect(html).toContain("<button");
    expect(html).toContain('aria-expanded="false"');
  });

  test("stays circular: border-radius 50% present, no rectangular card elements", () => {
    expect(html).toMatch(/border-radius:50%/);
    expect(html).not.toContain("card");
    expect(html).not.toContain("modal");
  });

  test("collapsed markup is cheap: no action row, no ask UI, no facts", () => {
    // NOTE: the class names also appear inside the <style> block, so match
    // the rendered class attributes, not the bare names.
    expect(html).not.toContain('class="fydc-actions"');
    expect(html).not.toContain('class="fydc-askrow"');
    expect(html).not.toContain('class="fydc-facts"');
  });

  test("no em dashes in user-facing strings", () => {
    expect(html).not.toContain("\u2014");
  });
});

describe("actions derive only from capabilities", () => {
  test("a projection without a call capability yields no call action (no tel: link)", () => {
    const actions = circleActionsFor(baseProjection.capabilities);
    expect(actions.some((a) => a.kind === "call")).toBe(false);
    const hrefs = actions.flatMap((a) =>
      "href" in a && a.href ? [a.href] : []
    );
    expect(hrefs.some((h) => h.startsWith("tel:"))).toBe(false);
    expect(actions.map((a) => a.kind)).toEqual(["ask", "email", "website"]);
  });

  test("a call capability yields a tel: action with its href and label", () => {
    const caps: ObjectCapability[] = [
      ...baseProjection.capabilities,
      { kind: "call", href: "tel:+19705550100", label: "Call us" },
    ];
    const actions = circleActionsFor(caps);
    const call = actions.find((a) => a.kind === "call");
    expect(call).toEqual({ kind: "call", href: "tel:+19705550100", label: "Call us" });
  });

  test('kind "view" is ignored: it never becomes an action', () => {
    const actions = circleActionsFor([{ kind: "view" }, { kind: "ask" }]);
    expect(actions.map((a) => a.kind)).toEqual(["ask"]);
  });

  test("follow capability yields a follow action; absent means none", () => {
    expect(circleActionsFor([{ kind: "follow" }]).map((a) => a.kind)).toEqual(["follow"]);
    expect(circleActionsFor([{ kind: "ask" }]).some((a) => a.kind === "follow")).toBe(false);
  });

  test("empty capabilities yield no actions", () => {
    expect(circleActionsFor([])).toEqual([]);
  });
});

describe("image backgrounds", () => {
  test("an image background renders as a cover url", () => {
    const withImage: CircleProjection = {
      ...baseProjection,
      background: {
        kind: "image",
        src: "https://example.com/hero.jpg",
        digest: "abc123",
        observedAt: "2026-09-20",
        basis: "authorized",
      },
    };
    const html = renderToString(<FydCircle projection={withImage} />);
    expect(html).toContain("https://example.com/hero.jpg");
  });
});

describe("FydCircleNodeLink (Phase 2: optional Open Node control)", () => {
  test("renders a circular link to the node href, never a button or card", () => {
    const html = renderToString(
      <FydCircleNodeLink href="/node/obj-1" name="Happy Place" />,
    );
    expect(html).toContain('href="/node/obj-1"');
    // Circularity comes from the shared fydc-act control class (the same
    // circular control the other actions use), not inline style.
    expect(html).toContain("fydc-act");
    expect(html).toContain("fydc-node");
    expect(html).toContain("<a");
    expect(html).toContain("Open node view of Happy Place");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("card");
  });

  test("node control exists exactly when nodeHref is set (pure helper)", () => {
    // The action row is expanded-state-only (client state); nodeControlFor
    // is exactly what renderExpanded maps over, so testing the helper
    // tests the render rule, mirroring circleActionsFor above.
    expect(nodeControlFor(undefined, "Happy Place")).toBeNull();
    expect(nodeControlFor("", "Happy Place")).toBeNull();
    const el = nodeControlFor("/node/obj-1", "Happy Place");
    expect(el).not.toBeNull();
    const html = renderToString(el!);
    expect(html).toContain('href="/node/obj-1"');
    expect(html).toContain("fydc-node");
  });

  test("circle without nodeHref renders no node control", () => {
    const html = renderToString(<FydCircle projection={baseProjection} />);
    expect(html).not.toContain("fydc-node");
    expect(html).not.toContain("Open node view of");
  });
});
