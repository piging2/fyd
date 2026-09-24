/**
 * LANE-OWNER tests: the visibility policy.
 *
 * Pinned behaviors:
 * - FACT / VISIBILITY / PRESENTATION are separate: the policy never edits
 *   facts, only governs which reach the public projection;
 * - a hidden fact never reaches the public render (absent, not redacted);
 * - owner overrides are honored within safety bounds;
 * - the business name (identity) cannot be hidden;
 * - HIDE assertions from the corrections layer hide facts;
 * - conservative defaults: location hidden, everything else public.
 *
 * Run with: npx jest --config src/fyd/owner-mode/jest.config.cjs
 */

import {
  assertCorrection,
} from "../corrections";
import { demoProvenance } from "../provenance";
import { extractSiteFacts, type SiteFact } from "../facts";
import {
  conservativeDefaultFor,
  hiddenFactIds,
  projectPublicFacts,
  resolveFactVisibility,
  setFactVisibility,
} from "../visibility-policy";
import type { ObjectGraph } from "../../sitespec/types";
import type { PingObject } from "@/lib/ping/types";

const T0 = "2026-09-23T18:00:00.000Z";
const nowT0 = () => T0;

function graph(): ObjectGraph {
  const biz: PingObject = {
    id: "biz-1",
    schema: "ping.social.business@1",
    controllerId: "ctrl-1",
    visibility: "public",
    title: "Acme Plumbing",
    description: "",
    fields: {
      name: "Acme Plumbing",
      phone: "(970) 555-0100",
      street_address: "123 Main St, Grand Junction, CO 81501",
      facebook: "https://facebook.com/acme",
    },
    createdAt: T0,
    updatedAt: T0,
    provenance: { ref: "test" } as unknown as PingObject["provenance"],
  };
  return { objects: [biz], relationships: [] };
}

function facts(): SiteFact[] {
  return extractSiteFacts(graph(), T0);
}

function byField(fs: SiteFact[], field: string): SiteFact {
  const f = fs.find((x) => x.field === field);
  if (!f) throw new Error("no fact for field " + field);
  return f;
}

describe("conservative defaults", () => {
  it("hides location facts and shows everything else by default", () => {
    expect(conservativeDefaultFor("location")).toBe("hidden");
    expect(conservativeDefaultFor("contact")).toBe("public");
    expect(conservativeDefaultFor("identity")).toBe("public");
    expect(conservativeDefaultFor("social")).toBe("public");
    const fs = facts();
    const addr = byField(fs, "street_address");
    expect(resolveFactVisibility(addr, []).visibility).toBe("hidden");
    expect(resolveFactVisibility(addr, []).source).toBe("conservative_default");
    const phone = byField(fs, "phone");
    expect(resolveFactVisibility(phone, []).visibility).toBe("public");
  });
});

describe("projectPublicFacts", () => {
  it("excludes hidden facts from the public render entirely", () => {
    const fs = facts();
    const { publicFacts, hiddenFacts } = projectPublicFacts(fs, []);
    // street_address is location: hidden by conservative default.
    const addr = byField(fs, "street_address");
    expect(hiddenFacts.map((f) => f.factId)).toContain(addr.factId);
    expect(publicFacts.map((f) => f.factId)).not.toContain(addr.factId);
    // And the hidden value appears nowhere in the public projection.
    expect(JSON.stringify(publicFacts)).not.toContain("123 Main St");
  });

  it("an owner HIDE assertion withholds the fact from the public render", () => {
    const fs = facts();
    const fb = byField(fs, "facebook");
    const hide = assertCorrection({
      factRef: { objectId: "biz-1", field: "facebook" },
      op: "HIDE",
      provenance: demoProvenance(null, nowT0),
      sourceValueSeen: fb.value,
    });
    const { publicFacts, hiddenFacts } = projectPublicFacts(fs, [], [hide]);
    expect(
      resolveFactVisibility(fb, [], [hide]),
    ).toEqual({ visibility: "hidden", source: "hide_assertion" });
    expect(publicFacts.map((f) => f.factId)).not.toContain(fb.factId);
    expect(hiddenFacts.map((f) => f.factId)).toContain(fb.factId);
    expect(JSON.stringify(publicFacts)).not.toContain("facebook.com/acme");
  });

  it("an explicit owner decision overrides the conservative default", () => {
    const fs = facts();
    const addr = byField(fs, "street_address");
    const shown = setFactVisibility(
      fs,
      [],
      addr.factId,
      "public",
      demoProvenance(null, nowT0),
    );
    expect(shown.ok).toBe(true);
    if (!shown.ok) throw new Error("unreachable");
    const proj = projectPublicFacts(fs, shown.decisions);
    expect(proj.publicFacts.map((f) => f.factId)).toContain(addr.factId);
    expect(
      resolveFactVisibility(addr, shown.decisions).source,
    ).toBe("owner_override");

    // And the latest decision wins over an earlier one.
    const hidden = setFactVisibility(
      fs,
      shown.decisions,
      addr.factId,
      "hidden",
      demoProvenance(null, nowT0),
    );
    if (!hidden.ok) throw new Error("unreachable");
    expect(
      projectPublicFacts(fs, hidden.decisions).publicFacts.map(
        (f) => f.factId,
      ),
    ).not.toContain(addr.factId);
  });

  it("an explicit owner decision overrides a HIDE assertion", () => {
    const fs = facts();
    const fb = byField(fs, "facebook");
    const hide = assertCorrection({
      factRef: { objectId: "biz-1", field: "facebook" },
      op: "HIDE",
      provenance: demoProvenance(null, nowT0),
      sourceValueSeen: fb.value,
    });
    const shown = setFactVisibility(
      fs,
      [],
      fb.factId,
      "public",
      demoProvenance(null, nowT0),
    );
    if (!shown.ok) throw new Error("unreachable");
    const proj = projectPublicFacts(fs, shown.decisions, [hide]);
    expect(proj.publicFacts.map((f) => f.factId)).toContain(fb.factId);
  });
});

describe("safety bounds", () => {
  it("refuses to hide the business name (identity fact)", () => {
    const fs = facts();
    const name = byField(fs, "name");
    expect(name.kind).toBe("identity");
    const out = setFactVisibility(
      fs,
      [],
      name.factId,
      "hidden",
      demoProvenance(null, nowT0),
    );
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error("unreachable");
    expect(out.reason).toMatch(/cannot be hidden/);
    // The refusal changes nothing: the name stays public.
    expect(
      projectPublicFacts(fs, []).publicFacts.map((f) => f.factId),
    ).toContain(name.factId);
  });

  it("refuses visibility for facts the extractor never observed", () => {
    const fs = facts();
    const out = setFactVisibility(
      fs,
      [],
      "fact-deadbeefdeadbeef",
      "hidden",
      demoProvenance(null, nowT0),
    );
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error("unreachable");
    expect(out.reason).toMatch(/Unknown fact/);
  });

  it("hiddenFactIds lists exactly the withheld facts", () => {
    const fs = facts();
    const ids = hiddenFactIds(fs, []);
    expect(ids).toEqual([byField(fs, "street_address").factId]);
  });
});
