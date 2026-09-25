/**
 * The evidence-binding verifier: ungrounded, private, or prohibited
 * generated copy fails closed.
 */
import {
  assertGeneratedPresentationVerified,
  copyClassToBindingClassification,
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
    copyClass: "DIRECT_FACT",
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

  test("GENERATED_COPY with no bindings verifies as pure presentation", () => {
    const p = pres({
      slots: [
        {
          slotId: "hero-flourish",
          sectionId: "home:Hero:0",
          text: "Comfort you can count on",
          bindings: [],
          copyClass: "GENERATED_COPY",
        },
      ],
    });
    expect(verifyGeneratedPresentation(p, GRAPH, []).valid).toBe(true);
  });

  test("GENERATED_COPY with evidence bindings fails closed: generated copy may never become a factual claim", () => {
    const p = pres({
      slots: [
        {
          slotId: "hero-flourish",
          sectionId: "home:Hero:0",
          text: "Comfort you can count on, Acme Plumbing",
          bindings: [
            { objectId: "biz-trade", field: "title", claimRef: "website-ingestion:https://example.com/" },
          ],
          copyClass: "GENERATED_COPY",
        },
      ],
    });
    const r = verifyGeneratedPresentation(p, GRAPH, []);
    expect(r.valid).toBe(false);
    expect(r.findings.some((f) => f.code === "generated-copy-with-bindings")).toBe(true);
    expect(() => assertGeneratedPresentationVerified(p, GRAPH, [])).toThrow(
      /generated-copy-with-bindings/,
    );
  });

  test("DERIVED_FACT without bindings fails closed: derived claims need grounding too", () => {
    const p = pres({
      slots: [
        {
          slotId: "service-area",
          sectionId: "home:Services:0",
          text: "Serving the Grand Valley and beyond",
          bindings: [],
          copyClass: "DERIVED_FACT",
        },
      ],
    });
    const r = verifyGeneratedPresentation(p, GRAPH, []);
    expect(r.valid).toBe(false);
    expect(r.findings.some((f) => f.code === "ungrounded-copy")).toBe(true);
  });

  test("USER_COPY binds like a fact and verifies", () => {
    const p = pres({
      slots: [
        {
          slotId: "owner-note",
          sectionId: "home:Hero:0",
          text: "Acme Plumbing",
          bindings: [
            { objectId: "biz-trade", field: "title", claimRef: "website-ingestion:https://example.com/" },
          ],
          copyClass: "USER_COPY",
        },
      ],
    });
    expect(verifyGeneratedPresentation(p, GRAPH, []).valid).toBe(true);
  });

  test("copyClassToBindingClassification bridges to the render binding vocabulary", () => {
    expect(copyClassToBindingClassification("DIRECT_FACT")).toBe("direct");
    expect(copyClassToBindingClassification("DERIVED_FACT")).toBe("derived");
    expect(copyClassToBindingClassification("GENERATED_COPY")).toBe("generated");
    expect(copyClassToBindingClassification("USER_COPY")).toBe("owner_authored");
  });
});
