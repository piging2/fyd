"use client";

/**
 * /explore: the FYD product surface dogfoods the object experience.
 *
 * Functional dynamic margin objects. Each object proves the chain:
 * VISIBLE EDGE -> STABLE OBJECT ID -> TYPE -> EVIDENCE-BOUNDED STATE ->
 * RELATIONSHIPS -> VISIBILITY -> ALLOWED ACTIONS -> EXPANDED PROJECTION.
 *
 * Interaction grammar: PEEK -> TAP -> SHEET/PANEL -> RELATED OBJECT ->
 * ASK FYD -> WHY -> ACTION -> BACK -> EXACT PRIOR POSITION.
 *
 * These are concept objects about the FYD product itself (a product actor
 * and network surface). They are presentation of product concepts, not a
 * new object authority: no new semantics are invented here.
 *
 * Reuses the shared WhyThis interaction read-only for the WHY step.
 */

import * as React from "react";
import { Container, Section, SectionHeading } from "@/components/section";
import { ScrollReveal } from "@/components/scroll-reveal";
import { WhyThis, type EvidenceStep } from "@/fyd/ui/why-this";
import { FydCopyClassLabel, type FydCopyClass } from "./fyd-copy-class";
import { cn } from "@/lib/utils";

interface FydConceptAction {
  label: string;
  kind: "ask" | "proof" | "network";
  /** For "ask": the question sent to Ask FYD. For "proof": the href. */
  target: string;
}

interface FydConceptObject {
  id: string;
  type: string;
  name: string;
  blurb: string;
  state: string;
  stateClass: FydCopyClass;
  visibility: string;
  claim: string;
  lineage: EvidenceStep[];
  related: string[];
  actions: FydConceptAction[];
}

const OBJECTS: FydConceptObject[] = [
  {
    id: "fyd:concept/understanding",
    type: "Understanding",
    name: "What FYD understands",
    blurb: "Your business as connected things, not webpage text.",
    state:
      "Reads public sources and keeps a model of your services, locations, people, and offers.",
    stateClass: "live",
    visibility: "Public concept. Your own business data is private to you.",
    claim: "FYD knows your services as real things.",
    lineage: [
      { step: "What you see", detail: "Service: emergency plumbing" },
      { step: "Object field", detail: "service.offered" },
      { step: "Claim", detail: "read from the business's public website" },
      { step: "Evidence", detail: "page text, fetched and recorded" },
      { step: "Source", detail: "the business's public website" },
    ],
    related: ["fyd:concept/website", "fyd:concept/ask", "fyd:concept/why"],
    actions: [
      {
        label: "Ask FYD",
        kind: "ask",
        target: "How does FYD understand a business?",
      },
      { label: "Open the live proof", kind: "proof", target: "/sites/coppersmith-plumbing" },
    ],
  },
  {
    id: "fyd:concept/website",
    type: "Projection",
    name: "Website",
    blurb: "Your site, generated from the understanding.",
    state:
      "Built from what FYD knows, not hand-designed page by page. Change the understanding and the site follows.",
    stateClass: "live",
    visibility: "Public concept.",
    claim: "The demo sites are projections of a FYD understanding.",
    lineage: [
      { step: "What you see", detail: "a complete business website" },
      { step: "Projection", detail: "rendered from the business's object model" },
      { step: "Claim", detail: "generated, not hand-built" },
      { step: "Evidence", detail: "build record from the demo understanding" },
      { step: "Source", detail: "the FYD understanding of the demo business" },
    ],
    related: ["fyd:concept/understanding", "fyd:concept/automation"],
    actions: [
      { label: "Open the live proof", kind: "proof", target: "/sites/happy-place" },
    ],
  },
  {
    id: "fyd:concept/ask",
    type: "Interaction",
    name: "Ask FYD",
    blurb: "Answers customers using only evidence.",
    state:
      "Evidence-bounded: answers cite their sources, or FYD says it does not know. It never guesses about your business.",
    stateClass: "live",
    visibility: "Public concept.",
    claim: "Ask FYD refuses honestly when evidence is missing.",
    lineage: [
      { step: "What you see", detail: "I do not have evidence for that yet." },
      { step: "Behavior", detail: "refusal instead of invention" },
      { step: "Claim", detail: "the pipeline found no supporting evidence" },
      { step: "Evidence", detail: "empty result set from the business's evidence" },
      { step: "Source", detail: "the business's recorded evidence" },
    ],
    related: ["fyd:concept/why", "fyd:concept/understanding"],
    actions: [
      {
        label: "Ask FYD",
        kind: "ask",
        target: "What can Ask FYD answer about a business?",
      },
    ],
  },
  {
    id: "fyd:concept/marketing",
    type: "Opportunity",
    name: "Marketing",
    blurb: "Spotted openings, proposed as work.",
    state:
      "FYD can spot opportunities, like a service page that is missing, and propose the work to fill them. Proposals wait for your approval.",
    stateClass: "coming",
    visibility: "Public concept.",
    claim: "FYD will propose marketing work for owner approval.",
    lineage: [
      { step: "What you see", detail: "a proposed improvement, awaiting approval" },
      { step: "Object field", detail: "opportunity.status = proposed" },
      { step: "Claim", detail: "detected from gaps in the business's presence" },
      { step: "Evidence", detail: "presence audit against the understanding" },
      { step: "Source", detail: "the business's recorded evidence" },
    ],
    related: ["fyd:concept/automation", "fyd:concept/website"],
    actions: [{ label: "See the plan", kind: "network", target: "#how" }],
  },
  {
    id: "fyd:concept/why",
    type: "Evidence",
    name: "Why?",
    blurb: "Every claim can show its work.",
    state:
      "One tap drills from a visible claim back through the record to the source it came from.",
    stateClass: "live",
    visibility: "Public concept.",
    claim: "Every visible claim carries its lineage.",
    lineage: [
      { step: "What you see", detail: "this panel" },
      { step: "Lineage", detail: "claim, evidence, observation, source" },
      { step: "Claim", detail: "lineage is part of the product contract" },
      { step: "Evidence", detail: "this page's product specification" },
      { step: "Source", detail: "the FYD product directive, 2026-09-25" },
    ],
    related: ["fyd:concept/ask", "fyd:concept/understanding"],
    actions: [
      {
        label: "Ask FYD",
        kind: "ask",
        target: "Why should I trust what FYD says about my business?",
      },
    ],
  },
  {
    id: "fyd:concept/network",
    type: "Relationship",
    name: "Business network",
    blurb: "Permission-aware connections to others.",
    state:
      "The boundary rule is live today: private data never becomes network data. Public relationships between presences are next.",
    stateClass: "coming",
    visibility: "Public concept. Your private business data is never network data.",
    claim: "The network grows only from public or owner-authorized sharing.",
    lineage: [
      { step: "What you see", detail: "no public relationships yet" },
      { step: "Rule", detail: "nothing private crosses a business boundary" },
      { step: "Claim", detail: "tenant isolation is constitutional" },
      { step: "Evidence", detail: "the product's boundary contract" },
      { step: "Source", detail: "the FYD product directive, 2026-09-25" },
    ],
    related: ["fyd:concept/understanding", "fyd:concept/automation"],
    actions: [{ label: "See the plan", kind: "network", target: "#network" }],
  },
  {
    id: "fyd:concept/automation",
    type: "Authorized action",
    name: "Automation",
    blurb: "Routine work, only with your approval.",
    state:
      "Your intent is compiled into bounded work that runs only when you authorize it. Nothing acts on its own.",
    stateClass: "auth",
    visibility: "Public concept.",
    claim: "No FYD action runs without owner authorization.",
    lineage: [
      { step: "What you see", detail: "a proposed action, awaiting approval" },
      { step: "Gate", detail: "authorization check before any effect" },
      { step: "Claim", detail: "default posture is deny, grant explicitly" },
      { step: "Evidence", detail: "the product's authorization contract" },
      { step: "Source", detail: "the FYD product directive, 2026-09-25" },
    ],
    related: ["fyd:concept/marketing", "fyd:concept/website"],
    actions: [{ label: "See the plan", kind: "network", target: "#how" }],
  },
];

const BY_ID = new Map(OBJECTS.map((o) => [o.id, o]));

function askFyd(question: string) {
  window.dispatchEvent(
    new CustomEvent<string>("fyd-ask-question", { detail: question })
  );
}

export function FydObjects() {
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [showWhy, setShowWhy] = React.useState(false);
  const chipRefs = React.useRef<Record<string, HTMLButtonElement | null>>({});
  const closeRef = React.useRef<HTMLButtonElement | null>(null);

  const open = openId ? BY_ID.get(openId) ?? null : null;

  const closeSheet = React.useCallback(() => {
    setOpenId(null);
    setShowWhy(false);
    if (openId) {
      const chip = chipRefs.current[openId];
      chip?.focus();
    }
  }, [openId ]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeSheet();
    };
    window.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closeSheet]);

  return (
    <div id="explore">
      <Section className="bg-surface-2">
        <Container className="max-w-6xl">
          <SectionHeading
            eyebrow="/explore"
            title="The margins are the graph"
            description="The center stays an excellent, normal business experience. The edges expose real objects. Tap one: it opens, shows its work, and lets you act. Every object proves the same chain, every time. This page is itself an FYD presence: explore the product through the product's own interaction grammar."
            align="center"
          />
          <div className="mt-6 flex justify-center">
            <FydCopyClassLabel kind="live" />
          </div>

          <ScrollReveal>
            <div
              className="mt-10 flex gap-3 overflow-x-auto pb-4"
              role="list"
              aria-label="FYD concept objects"
            >
              {OBJECTS.map((o) => (
                <button
                  key={o.id}
                  ref={(el) => {
                    chipRefs.current[o.id] = el;
                  }}
                  role="listitem"
                  onClick={() => {
                    setOpenId(o.id);
                    setShowWhy(false);
                  }}
                  aria-expanded={openId === o.id}
                  className={cn(
                    "min-w-[220px] shrink-0 rounded-xl border bg-surface p-5 text-left transition-shadow hover:shadow-md",
                    openId === o.id
                      ? "border-honey"
                      : "border-border-soft"
                  )}
                >
                  <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-honey">
                    {o.type}
                  </p>
                  <p className="mt-2 text-base font-bold text-text">{o.name}</p>
                  <p className="mt-1 text-sm text-text-muted">{o.blurb}</p>
                  <p className="mt-3 break-all font-mono text-[11px] text-text-subtle">
                    {o.id}
                  </p>
                  <p className="mt-3 text-xs font-semibold text-honey">
                    Tap to open
                  </p>
                </button>
              ))}
            </div>
          </ScrollReveal>

          <p className="mt-4 text-center text-sm text-text-subtle">
            Mobile grammar: peek, tap, sheet, related object, ask, why, action,
            back, exact prior position. Desktop: edge, click, expand, traverse,
            close.
          </p>
        </Container>
      </Section>

      {open && (
        <div
          className="fixed inset-0 z-[60] bg-black/40"
          onClick={closeSheet}
          role="dialog"
          aria-modal="true"
          aria-label={open.name}
        >
          <div
            className="absolute inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto rounded-t-2xl border border-border-soft bg-surface p-6 shadow-2xl sm:inset-x-auto sm:bottom-6 sm:right-6 sm:top-24 sm:w-[440px] sm:rounded-2xl sm:p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-honey">
                  {open.type} · expanded projection
                </p>
                <h3 className="mt-2 text-2xl font-bold text-text">{open.name}</h3>
              </div>
              <button
                ref={closeRef}
                onClick={closeSheet}
                className="rounded-full border border-border-soft px-4 py-2 text-sm font-semibold text-text-muted hover:bg-surface-2"
                aria-label="Back to the page"
              >
                Back
              </button>
            </div>

            <ol className="mt-6 space-y-4 text-sm">
              <li>
                <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-text-subtle">
                  1 · Visible edge
                </p>
                <p className="mt-1 text-text-muted">
                  The chip you tapped. Every object starts as something you can
                  see.
                </p>
              </li>
              <li>
                <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-text-subtle">
                  2 · Stable object id
                </p>
                <p className="mt-1 break-all font-mono text-[12px] text-text">
                  {open.id}
                </p>
              </li>
              <li>
                <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-text-subtle">
                  3 · Type
                </p>
                <p className="mt-1 text-text">{open.type}</p>
              </li>
              <li>
                <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-text-subtle">
                  4 · Evidence-bounded state
                </p>
                <p className="mt-1 text-text-muted">{open.state}</p>
                <div className="mt-2">
                  <FydCopyClassLabel kind={open.stateClass} />
                </div>
              </li>
              <li>
                <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-text-subtle">
                  5 · Relationships
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {open.related.map((rid) => {
                    const rel = BY_ID.get(rid);
                    if (!rel) return null;
                    return (
                      <button
                        key={rid}
                        onClick={() => {
                          setOpenId(rid);
                          setShowWhy(false);
                        }}
                        className="rounded-full border border-honey/50 bg-honey/10 px-3 py-1.5 text-xs font-semibold text-text hover:bg-honey/20"
                      >
                        {rel.name}
                      </button>
                    );
                  })}
                </div>
              </li>
              <li>
                <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-text-subtle">
                  6 · Visibility
                </p>
                <p className="mt-1 text-text-muted">{open.visibility}</p>
              </li>
              <li>
                <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-text-subtle">
                  7 · Allowed actions
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {open.actions.map((a) => (
                    <ActionButton key={a.label} action={a} onAsk={closeSheet} />
                  ))}
                </div>
              </li>
              <li>
                <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-text-subtle">
                  8 · Expanded projection
                </p>
                <p className="mt-1 text-text-muted">
                  This panel. The same object, shown larger, with everything
                  above attached.
                </p>
              </li>
            </ol>

            <div className="mt-6 border-t border-border-soft pt-4">
              <button
                onClick={() => setShowWhy((v) => !v)}
                className="text-sm font-semibold text-honey hover:underline"
                aria-expanded={showWhy}
              >
                {showWhy ? "Hide the lineage" : "Why this?"}
              </button>
              {showWhy && (
                <div className="mt-3">
                  <WhyThis claim={open.claim} steps={open.lineage} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ActionButton({
  action,
  onAsk,
}: {
  action: FydConceptAction;
  onAsk: () => void;
}) {
  if (action.kind === "ask") {
    return (
      <button
        onClick={() => {
          onAsk();
          askFyd(action.target);
          document
            .getElementById("fyd-ask")
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
        className="rounded-full bg-honey px-4 py-2 text-sm font-semibold text-honey-foreground hover:bg-honey-hover"
      >
        {action.label}
      </button>
    );
  }
  if (action.kind === "proof") {
    return (
      <a
        href={action.target}
        className="rounded-full border border-border px-4 py-2 text-sm font-semibold text-text hover:bg-surface-2"
      >
        {action.label}
      </a>
    );
  }
  return (
    <a
      href={action.target}
      className="rounded-full border border-border-soft px-4 py-2 text-sm font-semibold text-text-muted hover:bg-surface-2"
    >
      {action.label}
    </a>
  );
}
