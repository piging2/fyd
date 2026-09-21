/**
 * Lane B proof: the SAME object data renders as three different projections.
 *
 * - Business: Happy Place via Lane A's buildObjectView + objectViewToProjection.
 * - Person: the real person object in the coppersmith PING projection
 *   (getPingObjectGraphSync), with its real works_for relationship.
 * - Service: "Pergola Design Consultations", the real structured
 *   ping.social.service@1 object in the happy-place PING projection,
 *   linked by a real provides relationship.
 *
 * Circle reuses the EXISTING ObjectCircle primitive (not redesigned).
 * Card/Node are the new lane-B components. Assertions run on
 * renderToStaticMarkup HTML in the node test environment.
 *
 * Anti-invention checks: when the graph lacks contact info there are no
 * tel:/mailto: actions; when a claim has no evidence the value never renders.
 */

import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ObjectCircle } from "../../ui/object-circle";
import { buildObjectView } from "../view";
import type { ObjectView } from "../types";
import type { PingObject } from "@/lib/ping/types";
import { getPingObjectGraphSync } from "../../data/ping-object-source";
import {
  objectViewToProjection,
  type Fact,
  type ObjectProjection,
} from "../object-projection";
import { ObjectCard } from "../card";
import { ObjectNode } from "../node";

const PROJECTIONS = join(
  process.cwd(),
  "src",
  "fyd",
  "object",
  "__tests__",
  "fixtures",
  "projections",
);

beforeEach(() => {
  // Isolate owner state so tests never touch real demo data, and point the
  // PING projection loader at the checked-in fixture projections.
  process.env.FYD_OWNER_DIR = mkdtempSync(join(tmpdir(), "fyd-laneb-test-"));
  process.env.FYD_PROJECTION_DIR = PROJECTIONS;
});

function objectBySchema(graphObjects: PingObject[], schema: string): PingObject {
  const o = graphObjects.find((x) => x.schema === schema && x.visibility === "public");
  if (!o) throw new Error("no object with schema " + schema);
  return o;
}

/** Minimal ObjectView-shaped data for the Circle primitive from a raw object. */
function circleViewFor(o: PingObject, kindLabel: string): ObjectView {
  return {
    id: o.id,
    schema: o.schema,
    name: o.title,
    category: kindLabel,
    locationLabel: null,
    summary: o.description,
    media: [],
    services: [],
    serviceArea: [],
    contact: { phone: null, email: null, website: null, locality: null, addressVisibility: "public" },
    capabilities: [{ kind: "ask" }, { kind: "follow" }, { kind: "like" }],
    provenance: {
      kind: o.provenance.kind,
      ref: o.provenance.ref,
      derivedAt: o.provenance.derivedAt,
      label: "Information from the business website",
    },
    ownerUpdatedAt: null,
    sampleQuestions: [],
  };
}

/* ------------------------------------------------------------------ */
/* Person: real person object from the coppersmith PING projection.    */
/* ------------------------------------------------------------------ */

function personProjection(): ObjectProjection {
  const { graph } = getPingObjectGraphSync("coppersmith-plumbing");
  const person = objectBySchema(graph.objects, "ping.social.person@1");
  const business = objectBySchema(graph.objects, "ping.social.business@1");
  const rel = graph.relationships.find(
    (r) => r.subject === person.id && r.predicate === "works_for" && r.status === "active",
  );
  return {
    id: person.id,
    schema: person.schema,
    kindLabel: "Person",
    name: person.title,
    category: null,
    location: null,
    summary: {
      label: "About",
      value: person.description,
      evidence: {
        state: "inferred",
        receipt: "coppersmithplumbing.com",
        asOf: person.provenance.derivedAt.slice(0, 10),
        steps: [
          { step: "Object field", detail: "description", state: "inferred" },
          { step: "Source", detail: person.provenance.ref, state: "observed" },
        ],
      },
    },
    facts: [],
    // The ONLY related object: the real works_for relationship. No invented
    // people, reactions, or activity.
    people: rel
      ? [
          {
            id: business.id,
            name: business.title,
            kindLabel: "Business",
            relation: "Works for",
            evidence: {
              state: "observed",
              receipt: "website relationship graph",
              asOf: rel.createdAt.slice(0, 10),
              steps: [
                { step: "Relationship", detail: "works_for", state: "observed" },
                { step: "Evidence ref", detail: rel.evidenceRef ?? "", state: "observed" },
              ],
            },
          },
        ]
      : [],
    contact: { phone: null, email: null, website: null },
    capabilities: [{ kind: "ask" }, { kind: "follow" }, { kind: "like" }],
    provenance: {
      label: "Information observed on coppersmithplumbing.com",
      ref: person.provenance.ref,
      derivedAt: person.provenance.derivedAt,
    },
    sampleQuestions: ["Who works at Coppersmith Plumbing?"],
    ownerUpdatedAt: null,
    media: [],
  };
}

/* ------------------------------------------------------------------ */
/* Service: the real structured service object in the happy-place     */
/* PING projection. Every claim is labeled with its evidence basis     */
/* from the object's own provenance.                                   */
/* ------------------------------------------------------------------ */

function serviceProjection(): ObjectProjection {
  const { graph } = getPingObjectGraphSync("happy-place");
  const svc = objectBySchema(graph.objects, "ping.social.service@1");
  const business = objectBySchema(graph.objects, "ping.social.business@1");
  const provides = graph.relationships.find(
    (r) =>
      r.subject === business.id &&
      r.object === svc.id &&
      ["provides", "offers"].includes(r.predicate) &&
      r.status === "active",
  );
  const observedAt = svc.provenance.derivedAt.slice(0, 10);
  const steps = (fieldLabel: string) => [
    { step: "Object field", detail: fieldLabel, state: "observed" as const },
    { step: "Source", detail: svc.provenance.ref, state: "observed" as const },
  ];
  return {
    id: svc.id,
    schema: svc.schema,
    kindLabel: "Service",
    name: svc.title,
    category: {
      label: "Category",
      value: "Carpentry",
      evidence: {
        state: "inferred",
        receipt: "Website keywords",
        asOf: observedAt,
        steps: [
          { step: "Derived", detail: "Category mapped from the website's keywords by fixed rules", state: "inferred" },
          { step: "Source", detail: svc.provenance.ref, state: "observed" },
        ],
      },
    },
    location: null,
    summary: {
      label: "About",
      value: svc.description,
      evidence: {
        state: "observed",
        receipt: svc.provenance.ref,
        asOf: observedAt,
        steps: steps("description"),
      },
    },
    facts: [
      {
        label: "Offered by",
        value: business.title,
        evidence: provides
          ? {
              state: "observed",
              receipt: provides.evidenceRef,
              asOf: provides.createdAt.slice(0, 10),
              steps: [
                { step: "Relationship", detail: provides.predicate, state: "observed" },
                { step: "Evidence ref", detail: provides.evidenceRef, state: "observed" },
              ],
            }
          : { state: "unknown", receipt: "No provides relationship in the graph" },
      },
      // This claim has NO evidence: the projection must render its label
      // with an Unknown mark and never a value.
      {
        label: "Typical project length",
        value: "",
        evidence: { state: "unknown", receipt: "No source states this" },
      } satisfies Fact,
    ],
    people: [],
    contact: { phone: null, email: null, website: null },
    capabilities: [{ kind: "ask" }, { kind: "follow" }, { kind: "like" }],
    provenance: {
      label: "Information observed on happyplacecarpentry.com",
      ref: svc.provenance.ref,
      derivedAt: svc.provenance.derivedAt,
    },
    sampleQuestions: ["Do you design pergolas?"],
    ownerUpdatedAt: null,
    media: [],
  };
}

/* ------------------------------------------------------------------ */

describe("objectViewToProjection adapter (Lane A ObjectView -> generic prop)", () => {
  test("happy-place business maps with honest evidence basis", () => {
    const view = buildObjectView("happy-place");
    expect(view).not.toBeNull();
    const p = objectViewToProjection(view!);
    expect(p.kindLabel).toBe("Business");
    expect(p.name).toBe("Happy Place Carpentry LLC");
    // Capabilities pass through unchanged.
    expect(p.capabilities.map((c) => c.kind)).toEqual(
      view!.capabilities.map((c) => c.kind),
    );
    // Category is inferred; summary is observed; phone is observed.
    expect(p.category?.evidence.state).toBe("inferred");
    expect(p.summary?.evidence.state).toBe("observed");
    expect(p.contact.phone?.evidence.state).toBe("observed");
    expect(p.contact.phone?.value).toBe("+15412865190");
    // Structured services carry the observed basis; area is inferred.
    const svc = p.facts.find(
      (f) => f.label === "Service" && f.value === "Pergola Design Consultations",
    );
    expect(svc?.evidence.state).toBe("observed");
    const area = p.facts.find((f) => f.label === "Service area");
    expect(area?.evidence.state).toBe("inferred");
    // Provenance survives the adapter.
    expect(p.provenance.label).toContain("happyplacecarpentry.com");
  });

  test("hidden address becomes a withheld location, never a leak", () => {
    const view = buildObjectView("happy-place");
    expect(view).not.toBeNull();
    const hidden: ObjectView = {
      ...view!,
      contact: { ...view!.contact, addressVisibility: "hidden" },
    };
    const p = objectViewToProjection(hidden);
    expect(p.location?.evidence.state).toBe("withheld");
    expect(p.location?.value).toBe("");
  });
});

describe("Business: Happy Place x Circle / Card / Node (same object data)", () => {
  const view = () => objectViewToProjection(buildObjectView("happy-place")!);

  test("Circle (existing primitive) renders the business", () => {
    const html = renderToStaticMarkup(
      <ObjectCircle view={buildObjectView("happy-place")!} />,
    );
    expect(html).toContain("Happy Place Carpentry LLC");
    expect(html).toContain("Carpentry");
  });

  test("Card renders name, structured service, call action, provenance", () => {
    const html = renderToStaticMarkup(<ObjectCard projection={view()} />);
    expect(html).toContain("Happy Place Carpentry LLC");
    expect(html).toContain("Pergola Design Consultations");
    // Capability-gated: the phone exists, so the Call action renders.
    expect(html).toContain("tel:+15412865190");
    expect(html).toContain("happyplacecarpentry.com");
    // Evidence marks travel with the claims.
    expect(html).toContain("Why this?");
  });

  test("Node renders center facts and the margins context plane", () => {
    const html = renderToStaticMarkup(<ObjectNode projection={view()} />);
    expect(html).toContain("Happy Place Carpentry LLC");
    expect(html).toContain("Licensed Oregon carpentry contractor");
    expect(html).toContain("Ask FYD");
    expect(html).toContain("What kind of");
    expect(html).toContain("Provenance");
    expect(html).toContain("tel:+15412865190");
  });
});

describe("Person: fixture person x Circle / Card / Node (same object data)", () => {
  test("Circle (existing primitive) renders the person", () => {
    const { graph } = getPingObjectGraphSync("coppersmith-plumbing");
    const person = objectBySchema(graph.objects, "ping.social.person@1");
    const html = renderToStaticMarkup(
      <ObjectCircle view={circleViewFor(person, "Person")} />,
    );
    expect(html).toContain("coppersmithplm");
  });

  test("Card renders the person with the real works_for relation", () => {
    const html = renderToStaticMarkup(<ObjectCard projection={personProjection()} />);
    expect(html).toContain("coppersmithplm");
    expect(html).toContain("Works for");
    expect(html).toContain("Coppersmith Plumbing");
  });

  test("Node renders the person and its single real relation", () => {
    const html = renderToStaticMarkup(<ObjectNode projection={personProjection()} />);
    expect(html).toContain("coppersmithplm");
    expect(html).toContain("Related");
    expect(html).toContain("Coppersmith Plumbing");
  });

  test("no invented contact: the person graph has no phone/email, so no tel:/mailto: actions", () => {
    const card = renderToStaticMarkup(<ObjectCard projection={personProjection()} />);
    const node = renderToStaticMarkup(<ObjectNode projection={personProjection()} />);
    for (const html of [card, node]) {
      expect(html).not.toContain("tel:");
      expect(html).not.toContain("mailto:");
    }
  });
});

describe("Service: Pergola Design Consultations x Circle / Card / Node", () => {
  const svcObject = () => {
    const { graph } = getPingObjectGraphSync("happy-place");
    return objectBySchema(graph.objects, "ping.social.service@1");
  };

  test("the service is a real structured object in the projection", () => {
    const svc = svcObject();
    expect(svc.title).toBe("Pergola Design Consultations");
    expect(svc.provenance.ref).not.toBe("");
  });

  test("Circle (existing primitive) renders the service", () => {
    const html = renderToStaticMarkup(
      <ObjectCircle view={circleViewFor(svcObject(), "Service")} />,
    );
    expect(html).toContain("Pergola Design Consultations");
  });

  test("Card renders the service with observed basis", () => {
    const html = renderToStaticMarkup(<ObjectCard projection={serviceProjection()} />);
    expect(html).toContain("Pergola Design Consultations");
    expect(html).toContain("On-site pergola design consultations");
    expect(html).toContain("Observed");
  });

  test("Node renders the service; the evidence-less claim never renders as fact", () => {
    const html = renderToStaticMarkup(<ObjectNode projection={serviceProjection()} />);
    expect(html).toContain("Pergola Design Consultations");
    // The label renders with its Unknown mark and an honest "No evidence"
    // placeholder...
    expect(html).toContain("Typical project length");
    expect(html).toContain("Unknown");
    expect(html).toContain("No evidence");
    // ...but no value was ever authored, so nothing that looks like a
    // duration can render.
    expect(html).not.toMatch(/Typical project length[\s\S]{0,200}week/i);
  });

  test("no invented service contact actions", () => {
    const html = renderToStaticMarkup(<ObjectCard projection={serviceProjection()} />);
    expect(html).not.toContain("tel:");
    expect(html).not.toContain("mailto:");
  });
});
