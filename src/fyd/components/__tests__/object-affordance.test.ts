/**
 * ObjectAffordance fail-closed tests (polish lane, 2026-09-26).
 *
 * The affordance is an owner/engineer surface: it renders ONLY for the
 * owner and engineer viewer kinds. "visitor" and an absent viewerKind
 * render nothing, so a future call site that forgets the kind cannot leak
 * platform chrome onto the visitor page.
 *
 * Run: npx jest --config src/fyd/components/jest.config.cjs object-affordance
 */

import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { ObjectAffordance } from "../object-affordance";
import type { RenderViewerKind } from "../../sitespec/render-projection";

const BASE_PROPS = {
  objectId: "svc-1",
  title: "Emergency Repairs",
  kindLabel: "Service",
  evidenceLine: "From the business website",
  schemaId: "ping.social.service@1",
  controllerId: "ctrl-1",
  theme: {
    ink: "#000",
    accent: "#111",
    background: "#fff",
    surface: "#eee",
    border: "#ddd",
    fontDisplay: "serif",
    fontBody: "sans-serif",
  },
};

function renderAffordance(viewerKind?: RenderViewerKind): string {
  return renderToStaticMarkup(
    React.createElement(ObjectAffordance, {
      ...BASE_PROPS,
      theme: BASE_PROPS.theme as never,
      viewerKind,
    }),
  );
}

describe("ObjectAffordance viewer gating", () => {
  test("visitor renders nothing", () => {
    expect(renderAffordance("visitor")).toBe("");
  });

  test("absent viewerKind renders nothing (fail closed)", () => {
    expect(renderAffordance(undefined)).toBe("");
  });

  test("owner renders the affordance", () => {
    const html = renderAffordance("owner");
    expect(html).toContain("data-fyd-affordance");
    expect(html).toContain("svc-1");
  });

  test("engineer renders the affordance", () => {
    const html = renderAffordance("engineer");
    expect(html).toContain("data-fyd-affordance");
    expect(html).toContain("svc-1");
  });

  test("unbound title renders nothing even for owner", () => {
    const html = renderToStaticMarkup(
      React.createElement(ObjectAffordance, {
        ...BASE_PROPS,
        theme: BASE_PROPS.theme as never,
        title: null,
        viewerKind: "owner",
      }),
    );
    expect(html).toBe("");
  });
});
