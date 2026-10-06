/**
 * LANE-OWNER tests: the conversational command compiler and the
 * preview -> approve -> apply -> replay proposal loop.
 *
 * Pinned behaviors:
 * - each of the 9 commands compiles to the right typed proposal kind;
 * - proposals are data (preview before/after), never direct DOM edits;
 * - approval is capability-gated and digest-verified; refusals are honest;
 * - apply is pure and idempotent;
 * - replay over a fresh base is deterministic.
 *
 * Run with: npx jest --config src/fyd/customize/jest.config.cjs
 */

import {
  compileOwnerCommand,
} from "../owner-command-compiler";
import {
  applyOwnerProposal,
  approveOwnerProposal,
  draftOwnerProposal,
  emptyOwnerSiteState,
  ownerStateDigest,
  replayOwnerJournal,
  runOwnerCommand,
  type DraftContext,
  type OwnerProposal,
} from "../owner-proposal";
import { extractSiteFacts } from "../../owner-mode/facts";
import { setFactVisibility } from "../../owner-mode/visibility-policy";
import { demoProvenance } from "../../owner-mode/provenance";
import {
  DEMO_OWNER_ACTOR,
  evaluateCapability,
  resolveDemoRelationship,
  type CapabilityVerdict,
} from "../../owner-mode/capability";
import type {
  FYDSiteSpec,
  FYDThemeTokens,
  ObjectGraph,
} from "../../sitespec/types";
import type { PingObject } from "@/lib/ping/types";

const T0 = "2026-09-23T18:00:00.000Z";
const T1 = "2026-09-23T19:00:00.000Z";
const nowT0 = () => T0;
const nowT1 = () => T1;
const SITE = "demo-site";

function obj(
  id: string,
  title: string,
  fields: Record<string, string | string[]> = {},
): PingObject {
  return {
    id,
    schema: "ping.social.business@1",
    controllerId: "ctrl-1",
    visibility: "public",
    title,
    description: "",
    fields,
    createdAt: T0,
    updatedAt: T0,
    provenance: { ref: "test" } as unknown as PingObject["provenance"],
  };
}

function graph(): ObjectGraph {
  return {
    objects: [
      obj("biz-1", "Acme Plumbing", {
        name: "Acme Plumbing",
        phone: "(970) 555-0100",
        email: "hello@acme.example",
        street_address: "123 Main St, Grand Junction, CO 81501",
        facebook: "https://facebook.com/acmeplumbing",
        instagram: "https://instagram.com/acmeplumbing",
      }),
      obj("svc-emergency", "Emergency Service"),
      obj("svc-commercial", "Commercial Work"),
      obj("person-alice", "Alice", { role: "Owner" }),
      obj("loc-1", "Downtown Shop", {
        street_address: "10 Main St, Grand Junction, CO",
      }),
      obj("loc-2", "North Branch", {
        street_address: "99 North Ave, Grand Junction, CO",
      }),
    ],
    relationships: [],
  };
}

function section(
  id: string,
  component: string,
  query: { kind: string; objectIds?: string[] },
  heading?: string,
) {
  return {
    id,
    component,
    query: query as { kind: "reference"; objectIds: string[] },
    presentation: heading ? { heading } : {},
  };
}

function spec(): FYDSiteSpec {
  return {
    kind: "fyd.sitespec@1",
    ownerObjectId: "biz-1",
    version: 1,
    generator: {
      name: "fyd-site-generator",
      version: "test",
      generatedAt: T0,
    },
    themeTokens: {} as unknown as FYDThemeTokens,
    navigation: [],
    pages: [
      {
        slug: "home",
        title: "Home",
        navLabel: "Home",
        sections: [
          {
            id: "home:Hero:0",
            component: "Hero",
            query: { kind: "owner" },
            presentation: {},
          },
          section("home:Services:1", "Services", {
            kind: "reference",
            objectIds: ["svc-emergency", "svc-commercial"],
          }),
          {
            id: "home:Emergency:2",
            component: "Emergency",
            query: { kind: "static" },
            presentation: { heading: "Emergency Service" },
          },
          section("home:Team:3", "Team", {
            kind: "reference",
            objectIds: ["person-alice"],
          }),
          section("home:Locations:4", "Locations", {
            kind: "reference",
            objectIds: ["loc-1", "loc-2"],
          }),
          {
            id: "home:Contact:5",
            component: "Contact",
            query: { kind: "owner" },
            presentation: {},
          },
        ],
      },
    ],
    provenance: { ref: "test" } as unknown as FYDSiteSpec["provenance"],
  };
}

function draftCtx(over: Partial<DraftContext> = {}): DraftContext {
  const g = graph();
  return {
    spec: spec(),
    graph: g,
    facts: extractSiteFacts(g, T0),
    decisions: [],
    assertions: [],
    nowIso: nowT0,
    ...over,
  };
}

function allowedVerdict(capability: Parameters<typeof evaluateCapability>[2]): CapabilityVerdict {
  return evaluateCapability(
    DEMO_OWNER_ACTOR,
    resolveDemoRelationship(SITE, DEMO_OWNER_ACTOR),
    capability,
  );
}

/** Compile + draft one command; throws on honest refusal (test bug). */
function draftCommand(
  text: string,
  over: Partial<DraftContext> = {},
): OwnerProposal {
  const ctx = draftCtx(over);
  const compiled = compileOwnerCommand(text);
  if (!compiled.ok) throw new Error("compile refused: " + compiled.reason);
  const drafted = draftOwnerProposal(text, compiled.intent, ctx);
  if (!drafted.ok) throw new Error("draft refused: " + drafted.reason);
  return drafted.proposal;
}

/** Full loop: compile -> draft -> approve -> apply. */
function runCommand(
  text: string,
  state: ReturnType<typeof emptyOwnerSiteState>,
  over: Partial<DraftContext> = {},
  capability: Parameters<typeof evaluateCapability>[2] = "owner.customize-approve",
): { proposal: OwnerProposal; state: ReturnType<typeof emptyOwnerSiteState> } {
  const ctx = draftCtx(over);
  const proposal = draftCommand(text, over);
  const approved = approveOwnerProposal(
    proposal,
    allowedVerdict(capability),
    nowT1,
  );
  if (!approved.ok) throw new Error("approve refused: " + approved.reason);
  const applied = applyOwnerProposal(state, {
    ...approved.proposal,
    status: "approved",
  });
  if (!applied.ok) throw new Error("apply refused: " + applied.reason);
  return {
    proposal: { ...approved.proposal, status: "applied" as const },
    state: applied.state,
  };
}

describe("compileOwnerCommand: the 9 commands", () => {
  const cases: Array<[string, string]> = [
    ["Put emergency service first.", "promote_first"],
    ["Hide the team section.", "hide_section"],
    ["Feature commercial work.", "feature_object"],
    ["Make the phone action more prominent.", "promote_action"],
    ["Show both locations.", "show_locations"],
    ["Don't show my street address.", "hide_fact"],
    ["Show my street address.", "show_fact"],
    ["Feature Alice.", "feature_object"],
    ["Remove this social link.", "remove_social_link"],
  ];
  it.each(cases)("'%s' compiles to %s", (text, kind) => {
    const out = compileOwnerCommand(text);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.intent.kind).toBe(kind);
  });

  it("is deterministic and honest on unsupported text", () => {
    const a = compileOwnerCommand("Paint the site blue.");
    const b = compileOwnerCommand("Paint the site blue.");
    expect(a.ok).toBe(false);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    if (!a.ok) expect(a.reason).toMatch(/do not support/);
  });
});

describe("draftOwnerProposal: the 9 proposal types", () => {
  it("1. Put emergency service first -> sitespec_patch reorder_section", () => {
    const p = draftCommand("Put emergency service first.");
    expect(p.kind).toBe("sitespec_patch");
    expect(p.siteIntent?.kind).toBe("reorder_section");
    expect(p.patchBody).toBeDefined();
    expect(p.preview.before.length).toBeGreaterThan(0);
    expect(p.preview.after.length).toBeGreaterThan(0);
    expect(p.proposalId).toMatch(/^op-[0-9a-f]{16}$/);
  });

  it("2. Hide the team section -> sitespec_patch toggle_section hidden", () => {
    const p = draftCommand("Hide the team section.");
    expect(p.kind).toBe("sitespec_patch");
    expect(p.siteIntent).toMatchObject({
      kind: "toggle_section",
      sectionId: "home:Team:3",
      hidden: true,
    });
  });

  it("3. Feature commercial work -> sitespec_patch set_featured", () => {
    const p = draftCommand("Feature commercial work.");
    expect(p.kind).toBe("sitespec_patch");
    expect(p.siteIntent).toMatchObject({
      kind: "set_featured",
      sectionId: "home:Services:1",
      objectIds: ["svc-commercial"],
    });
  });

  it("4. Make the phone action more prominent -> sitespec_patch promote_action", () => {
    const p = draftCommand("Make the phone action more prominent.");
    expect(p.kind).toBe("sitespec_patch");
    expect(p.siteIntent).toBeUndefined();
    expect(p.ownerSiteIntent).toMatchObject({
      kind: "promote_action",
      objectId: "biz-1",
      action: "phone",
    });
    expect(p.preview.after[0]).toMatch(/primary action/);
  });

  it("5. Show both locations -> visibility_change for the two location facts", () => {
    const p = draftCommand("Show both locations.");
    expect(p.kind).toBe("visibility_change");
    expect(p.visibilityChanges).toHaveLength(2);
    for (const c of p.visibilityChanges!) {
      expect(c.visibility).toBe("public");
      expect(c.factLabel).toMatch(/street_address/);
    }
    const labels = p.visibilityChanges!.map((c) => c.factLabel).join(" ");
    expect(labels).toMatch(/Downtown Shop/);
    expect(labels).toMatch(/North Branch/);
  });

  it("6. Don't show my street address -> visibility_change hidden", () => {
    // The street address defaults to hidden, so first show it: the command
    // then has something honest to change back.
    const base = draftCtx();
    const addr = base.facts.find(
      (f) => f.objectId === "biz-1" && f.field === "street_address",
    )!;
    const shown = setFactVisibility(
      base.facts,
      [],
      addr.factId,
      "public",
      demoProvenance(null, nowT0),
    );
    if (!shown.ok) throw new Error("unreachable");
    const p = draftCommand("Don't show my street address.", {
      decisions: shown.decisions,
    });
    expect(p.kind).toBe("visibility_change");
    expect(p.visibilityChanges).toHaveLength(1);
    expect(p.visibilityChanges![0].visibility).toBe("hidden");
    expect(p.visibilityChanges![0].factLabel).toMatch(/Acme Plumbing/);
  });

  it("7. Show my street address -> visibility_change public", () => {
    const p = draftCommand("Show my street address.");
    expect(p.kind).toBe("visibility_change");
    expect(p.visibilityChanges).toHaveLength(1);
    expect(p.visibilityChanges![0].visibility).toBe("public");
  });

  it("8. Feature Alice -> sitespec_patch set_featured", () => {
    const p = draftCommand("Feature Alice.");
    expect(p.kind).toBe("sitespec_patch");
    expect(p.siteIntent).toMatchObject({
      kind: "set_featured",
      sectionId: "home:Team:3",
      objectIds: ["person-alice"],
    });
  });

  it("9. Remove this social link -> fact_correction HIDE on the selected link", () => {
    const ctx = draftCtx();
    const fb = ctx.facts.find(
      (f) => f.objectId === "biz-1" && f.field === "facebook",
    )!;
    const p = draftCommand("Remove this social link.", {
      currentFactRef: { objectId: "biz-1", field: "facebook" },
    });
    expect(p.kind).toBe("fact_correction");
    expect(p.correction?.op).toBe("HIDE");
    expect(p.correction?.factRef).toMatchObject({
      objectId: "biz-1",
      field: "facebook",
      index: 0,
    });
    expect(fb.value).toBe("https://facebook.com/acmeplumbing");
  });

  it("9b. Remove this social link without context and 2 links is an honest refusal", () => {
    const ctx = draftCtx();
    const compiled = compileOwnerCommand("Remove this social link.");
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) throw new Error("unreachable");
    const drafted = draftOwnerProposal(
      "Remove this social link.",
      compiled.intent,
      ctx,
    );
    expect(drafted.ok).toBe(false);
    if (drafted.ok) throw new Error("unreachable");
    expect(drafted.reason).toMatch(/2 social links/);
  });

  it("drafting is deterministic: same command, same clock, same proposalId", () => {
    const a = draftCommand("Hide the team section.");
    const b = draftCommand("Hide the team section.");
    expect(a.proposalId).toBe(b.proposalId);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("an ambiguous field name with no owner fact is an honest refusal", () => {
    const base = draftCtx();
    const ctx: DraftContext = {
      ...base,
      spec: { ...base.spec, ownerObjectId: "svc-emergency" },
    };
    const out = draftOwnerProposal(
      "x",
      { kind: "hide_fact", target: "street address" },
      ctx,
    );
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error("unreachable");
    expect(out.reason).toMatch(/ambiguous/i);
  });

  it("refuses honestly when there is nothing to change", () => {
    const ctx = draftCtx();
    const compiled = compileOwnerCommand("Show my street address.");
    if (!compiled.ok) throw new Error("unreachable");
    // The street address defaults to hidden, so showing works; hiding the
    // business name is refused by the safety bound instead.
    const hideName = draftOwnerProposal(
      "x",
      { kind: "hide_fact", target: "name" },
      ctx,
    );
    expect(hideName.ok).toBe(false);
    if (hideName.ok) throw new Error("unreachable");
    expect(hideName.reason).toMatch(/cannot be hidden/);
  });
});

describe("approve -> apply", () => {
  it("approves with the right capability and applies the spec change", () => {
    const state = emptyOwnerSiteState(spec());
    const { state: next } = runCommand("Hide the team section.", state);
    const team = next.spec.pages[0].sections.find(
      (s) => s.id === "home:Team:3",
    )!;
    expect(team.presentation.hidden).toBe(true);
  });

  it("refuses approval on a denied verdict", () => {
    const proposal = draftCommand("Hide the team section.");
    const stranger = { id: "stranger", label: "Stranger" };
    const denied = evaluateCapability(
      stranger,
      resolveDemoRelationship(SITE, stranger),
      "owner.customize-approve",
    );
    expect(denied.allowed).toBe(false);
    const out = approveOwnerProposal(proposal, denied, nowT1);
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error("unreachable");
    expect(out.reason).toMatch(/denied/i);
  });

  it("refuses approval on the wrong capability", () => {
    const proposal = draftCommand("Show my street address.");
    const verdict = allowedVerdict("owner.customize-approve");
    const out = approveOwnerProposal(proposal, verdict, nowT1);
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error("unreachable");
    expect(out.reason).toMatch(/Wrong capability/);
  });

  it("refuses apply before approval", () => {
    const proposal = draftCommand("Hide the team section.");
    const out = applyOwnerProposal(emptyOwnerSiteState(spec()), proposal);
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error("unreachable");
    expect(out.reason).toMatch(/must be approved/);
  });

  it("apply is idempotent", () => {
    const state = emptyOwnerSiteState(spec());
    const first = runCommand("Hide the team section.", state);
    const again = applyOwnerProposal(first.state, {
      ...first.proposal,
      status: "approved" as const,
    });
    expect(again.ok).toBe(true);
    if (!again.ok) throw new Error("unreachable");
    expect(again.summary).toMatch(/already applied/);
    expect(ownerStateDigest(again.state)).toBe(
      ownerStateDigest(first.state),
    );
  });

  it("visibility and correction proposals apply to owner state", () => {
    let state = emptyOwnerSiteState(spec());
    const v = runCommand(
      "Show my street address.",
      state,
      {},
      "owner.edit-visibility",
    );
    expect(v.state.visibilityDecisions).toHaveLength(1);
    expect(v.state.visibilityDecisions[0].visibility).toBe("public");
    state = v.state;
    const c = runCommand(
      "Remove this social link.",
      state,
      { currentFactRef: { objectId: "biz-1", field: "facebook" } },
      "owner.correct-fact",
    );
    expect(c.state.assertions).toHaveLength(1);
    expect(c.state.assertions[0].op).toBe("HIDE");
    const p = runCommand("Make the phone action more prominent.", c.state);
    expect(p.state.actionProminence).toHaveLength(1);
    expect(p.state.actionProminence[0]).toMatchObject({
      objectId: "biz-1",
      action: "phone",
      rank: "primary",
    });
  });
});

describe("replay determinism", () => {
  function buildJournal(): {
    journal: OwnerProposal[];
    live: ReturnType<typeof emptyOwnerSiteState>;
  } {
    let state = emptyOwnerSiteState(spec());
    const journal: OwnerProposal[] = [];
    const steps: Array<
      [string, Partial<DraftContext>, Parameters<typeof evaluateCapability>[2]]
    > = [
      ["Hide the team section.", {}, "owner.customize-approve"],
      ["Show my street address.", {}, "owner.edit-visibility"],
      ["Feature Alice.", {}, "owner.customize-approve"],
      [
        "Remove this social link.",
        { currentFactRef: { objectId: "biz-1", field: "facebook" } },
        "owner.correct-fact",
      ],
    ];
    for (const [text, over, cap] of steps) {
      const r = runCommand(text, state, over, cap);
      state = r.state;
      journal.push(r.proposal);
    }
    return { journal, live: state };
  }

  it("replay over a fresh base reproduces the live state exactly", () => {
    const { journal, live } = buildJournal();
    const replayed = replayOwnerJournal(emptyOwnerSiteState(spec()), journal);
    expect(replayed.replayed).toBe(4);
    expect(replayed.skipped).toBe(0);
    expect(ownerStateDigest(replayed.state)).toBe(ownerStateDigest(live));
  });

  it("replay is deterministic across runs", () => {
    const { journal } = buildJournal();
    const a = replayOwnerJournal(emptyOwnerSiteState(spec()), journal);
    const b = replayOwnerJournal(emptyOwnerSiteState(spec()), journal);
    expect(ownerStateDigest(a.state)).toBe(ownerStateDigest(b.state));
  });

  it("skips non-approved entries without applying them", () => {
    const { journal, live } = buildJournal();
    const drafted = draftCommand("Feature commercial work.");
    const replayed = replayOwnerJournal(emptyOwnerSiteState(spec()), [
      ...journal,
      drafted,
    ]);
    expect(replayed.replayed).toBe(4);
    expect(replayed.skipped).toBe(1);
    expect(ownerStateDigest(replayed.state)).toBe(ownerStateDigest(live));
  });
});

describe("runOwnerCommand convenience loop", () => {
  it("compiles, drafts, approves, and applies in one call", () => {
    const state = emptyOwnerSiteState(spec());
    const out = runOwnerCommand(
      "Hide the team section.",
      state,
      draftCtx(),
      allowedVerdict("owner.customize-approve"),
      nowT1,
    );
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error("unreachable");
    const team = out.state.spec.pages[0].sections.find(
      (s) => s.id === "home:Team:3",
    )!;
    expect(team.presentation.hidden).toBe(true);
  });

  it("stops honestly on an unsupported command", () => {
    const out = runOwnerCommand(
      "Paint the site blue.",
      emptyOwnerSiteState(spec()),
      draftCtx(),
      allowedVerdict("owner.customize-approve"),
      nowT1,
    );
    expect(out.ok).toBe(false);
  });
});
