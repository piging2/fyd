/**
 * The evidence-binding verifier: ungrounded, private, or prohibited
 * generated copy fails closed.
 */
import {
  assertGeneratedPresentationVerified,
  verifyGeneratedPresentation,
  type GeneratedPresentation,
} from "../generated-presentation";
import { makeObject, tradeGraph } from "./fixtures";
import type { PingObject } from "@/lib/ping/types";

const GRAPH = tradeGraph();

function pres(over: Partial<GeneratedPresentation>): GeneratedPresentation {
  return { version: 1, slots: [], ...over };
}

function slot(text: string, extra?: Record<string, unknown>) {
  return {
    slotId: "hero-tagline",
    sectionId: "home:Hero:0",
    text,
    bindings: [
      { objectId: "biz-trade", field: "title", claimRef: "website-ingestion:https://example.com/" },
    ],
    ...(extra ?? {}),
  };
}

describe("generated presentation verifier", () => {
  test("bound copy verifies", () => {
    const p = pres({ slots: [slot("Acme Plumbing")] });
    expect(verifyGeneratedPresentation(p, GRAPH, []).valid).toBe(true);
    expect(() => assertGeneratedPresentationVerified(p, GRAPH, [])).not.toThrow();
  });

  test("unknown object fails closed", () => {
    const p = pres({
      slots: [slot("Acme Plumbing", { bindings: [{ objectId: "nope", field: "title", claimRef: null }] })],
    });
    const r = verifyGeneratedPresentation(p, GRAPH, []);
    expect(r.valid).toBe(false);
    expect(r.findings.some((f) => f.code === "unknown-object")).toBe(true);
  });

  test("unknown field fails closed", () => {
    const p = pres({
      slots: [slot("Acme Plumbing", { bindings: [{ objectId: "biz-trade", field: "founded", claimRef: null }] })],
    });
    const r = verifyGeneratedPresentation(p, GRAPH, []);
    expect(r.valid).toBe(false);
    expect(r.findings.some((f) => f.code === "unknown-field")).toBe(true);
  });

  test("claim mismatch fails closed: copy must appear in the bound field", () => {
    const p = pres({ slots: [slot("We are the best in the world")] });
    const r = verifyGeneratedPresentation(p, GRAPH, []);
    expect(r.valid).toBe(false);
    expect(r.findings.some((f) => f.code === "claim-mismatch")).toBe(true);
  });

  test("private-source binding fails closed", () => {
    const priv: PingObject = makeObject("biz-secret", "ping.social.business@1", {
      visibility: "private",
      title: "Secret Corp",
    });
    const g = { objects: [...GRAPH.objects, priv], relationships: GRAPH.relationships };
    const p = pres({
      slots: [
        slot("Secret Corp", {
          bindings: [{ objectId: "biz-secret", field: "title", claimRef: "owner-correction:biz-secret" }],
        }),
      ],
    });
    const r = verifyGeneratedPresentation(p, g, []);
    expect(r.valid).toBe(false);
    expect(r.findings.some((f) => f.code === "private-object-in-public-copy")).toBe(true);
  });

  test("ungrounded copy fails closed", () => {
    const p = pres({ slots: [slot("Acme Plumbing", { bindings: [] })] });
    const r = verifyGeneratedPresentation(p, GRAPH, []);
    expect(r.valid).toBe(false);
    expect(r.findings.some((f) => f.code === "ungrounded-copy")).toBe(true);
  });

  test("prohibited positioning fails closed", () => {
    const p = pres({ slots: [slot("Acme Plumbing -- Grand Junction")] });
    const r = verifyGeneratedPresentation(p, GRAPH, ["grand junction"]);
    expect(r.valid).toBe(false);
    expect(r.findings.some((f) => f.code === "prohibited-positioning")).toBe(true);
  });

  test("a verifier failure throws on assert", () => {
    const p = pres({ slots: [slot("We are the best in the world")] });
    expect(() => assertGeneratedPresentationVerified(p, GRAPH, [])).toThrow(/refused/);
  });
});
