import type { Metadata } from "next";
import Link from "next/link";
import { Container, Section, SectionHeading } from "@/components/section";
import { CTASection } from "@/components/cta-section";
import { ScrollReveal } from "@/components/scroll-reveal";
import { NewsletterSignup } from "@/components/newsletter-signup";
import { PingWordmark } from "@/components/ping-wordmark";
import { BlueprintGrid } from "@/components/blueprint-grid";
import { MaturityLabel, type Maturity } from "@/components/maturity-label";
import { buildPortalProjection, HOMEPAGE_CIRCLE_SITE_IDS } from "@/fyd/preview/pipeline";
import { PortalHost } from "@/fyd/ui/portal-host";
import {
  KnowledgeLoop,
  BusinessGraph,
  AgentAuthority,
  ReplayEvidence,
  MultiRuntime,
  TenantModel,
  HeroEvidenceCard,
} from "@/components/architecture";
import { getTenant } from "@/lib/tenant-config";

export const metadata: Metadata = {
  title: "PING: Continuity infrastructure for AI agents",
  description: "PING is an evolving intelligence system: continuity, agent infrastructure, evidence and provenance, for AI agents and the businesses they serve.",
  alternates: { canonical: "/" },
};

/* Eyebrow taxonomy, picked once and used relentlessly:
   /live /truth /observe /remember /connect /act /prove /govern /run /applied /status /follow */

interface LoopBeat {
  eyebrow: string;
  verb: string;
  line: string;
  bullets: string[];
  labels: Maturity[];
}

const LOOP_BEATS: LoopBeat[] = [
  {
    eyebrow: "/observe",
    verb: "OBSERVE",
    line: "Something happened.",
    bullets: [
      "Raw input: a call, an email, a form, an API.",
      "Recorded with timestamp, source, and version.",
      "Nothing silently dropped at the door.",
    ],
    labels: ["Built"],
  },
  {
    eyebrow: "/remember",
    verb: "REMEMBER",
    line: "Recorded, immutable.",
    bullets: [
      "Canonical events with envelope validation.",
      "Append-only store, now DB-enforced: the trigger rejects UPDATE and DELETE. TRUNCATE is not covered.",
      "Reads and writes require authentication, enforced live.",
    ],
    labels: ["Live"],
  },
  {
    eyebrow: "/connect",
    verb: "CONNECT",
    line: "Relationships, not just documents.",
    bullets: [
      "A customer called. That created a lead, which became a project.",
      "Generic knowledge graph built and exported.",
      "Business-domain graph is direction. Neo4j adapter is experimental.",
    ],
    labels: ["Built", "Experimental", "Direction"],
  },
  {
    eyebrow: "/act",
    verb: "ACT",
    line: "Agents act inside capability grants.",
    bullets: [
      "Missions run live on Oracle: LEAD_FOLLOWUP completed end to end through the patched event door, plus real Python and agent work orders (captured 2026-09-16/17).",
      "Worker runtime built. 150 executions in the captured 2026-07-28 run. Retry/dead-letter path verified live: 12/12 assertions.",
      "IntelligenceWorker registered dormant. Off until needed.",
    ],
    labels: ["Live", "Experimental"],
  },
  {
    eyebrow: "/prove",
    verb: "PROVE",
    line: "Every answer shows its work.",
    bullets: [
      "Evidence chain: event, mission, agent, action, result, witness, lineage.",
      "Witness records attest who acted under what authority.",
      "Deterministic replay machinery exists. No replay run captured yet.",
    ],
    labels: ["Built", "Experimental"],
  },
];

const AUTHORITY_LAYERS = [
  {
    n: "01",
    title: "DEFAULT DENY",
    detail: "Nothing is permitted unless granted. The gateway answers 401 without credentials, on reads as well as writes.",
    status: "Live" as Maturity,
  },
  {
    n: "02",
    title: "SCOPED GRANTS",
    detail: "Capabilities are explicit: which agent may do what, under which mission. A fail-closed CapabilityAuthority has enforced this on the live gateway since 2026-09-15, and the delegation issuance decision was implemented and tested 18/18 (captured 2026-09-17). Explicit grants, not vibes.",
    status: "Live" as Maturity,
  },
  {
    n: "03",
    title: "AUDIT AND REPLAY",
    detail: "Every grant and action leaves evidence. Important behavior can be re-executed and compared.",
    status: "Experimental" as Maturity,
  },
];

const STATUS_STRIP: { label: string; detail: string; status: Maturity }[] = [
  { label: "Event plane", detail: "Gateway healthy, authentication enforced on reads and writes. POST /events bypass closed live; scheduler resumes after restart.", status: "Live" },
  { label: "Canonical events", detail: "Envelope validation, append-only store. Trigger rejects UPDATE/DELETE (captured 2026-09-16/17). TRUNCATE not covered.", status: "Live" },
  { label: "Tenant registry", detail: "Postgres-backed registration. Multi-tenant isolation not evidenced live.", status: "Built" },
  { label: "Knowledge graph", detail: "Generic graph built and exported.", status: "Built" },
  { label: "Neo4j adapter", detail: "Thin REST adapter, priority 7. Not connected live.", status: "Experimental" },
  { label: "Agents", detail: "Worker runtime built. IntelligenceWorker registered dormant. First scoped Hermes WorkOrder executed 2026-09-17 (exit 0, independently verified).", status: "Experimental" },
  { label: "Evidence and witness", detail: "Evidence authority and witness modules built.", status: "Built" },
  { label: "Deterministic replay", detail: "Kernel replay machinery exists. No replay run captured yet.", status: "Experimental" },
  { label: "Multi-runtime convergence", detail: "Captured 2026-09-16/17: the JS mission runtime plus a Python executor plus a scoped Hermes WorkOrder, one authority, shared evidence. Not a fleet yet.", status: "Built" },
  { label: "Business graph", detail: "No business-domain graph subsystem yet.", status: "Direction" },
  { label: "Oracle execution", detail: "Live on Oracle (ping-core-01, native arm64). Backup set created on-box 2026-09-17: pg_dump, Qdrant snapshot, clean source tarball. Same host only, no automation yet.", status: "Experimental" },
  { label: "Cloud execution", detail: "No deployment target yet.", status: "Direction" },
  { label: "Playbooks and institutional memory", detail: "Captured 2026-09-16/17: proposal to approval to activation to execution to outcome to a revision gated on Nolan, then replay and witness, all in test namespace. Three wiring gaps documented.", status: "Built" },
];

const CHANGELOG = [
  { date: "2026-09-16", hash: "c5f7808", note: "history rewrite preparation complete" },
  { date: "2026-09-16", hash: "81336402", note: "Git LFS preparation complete" },
  { date: "2026-09-16", hash: "15d0a9b8", note: "publication transport blocked" },
];

export default function HomePage() {
  const tenant = getTenant();
  const portalProjections = HOMEPAGE_CIRCLE_SITE_IDS.flatMap((id) => { const pr = buildPortalProjection(id); return pr ? [pr] : []; });
  return (
    <>
      {/* 01 HERO: the living system moment */}
      <Section className="bg-deep relative overflow-hidden">
        <BlueprintGrid />
        <Container className="relative">
          <p className="mb-6 font-mono text-xs font-bold uppercase tracking-widest text-honey">/live</p>
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <ScrollReveal>
              <div className="mb-6">
                <PingWordmark className="scale-125 origin-left" />
              </div>
              <p className="text-lg font-medium text-honey">{tenant.tagline}</p>
              <h1 className="mt-4 text-4xl font-bold text-text-on-dark sm:text-5xl lg:text-6xl" style={{ lineHeight: 'var(--leading-display)', letterSpacing: 'var(--tracking-display)' }}>
                Systems that remember,<br />agents you can trust
              </h1>
              <p className="mt-6 max-w-xl text-lg text-text-on-dark/90" style={{ lineHeight: 'var(--leading-body)' }}>
                PING turns information into reliable understanding, understanding into useful action,
                and action into evidence that can be trusted and replayed.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="#architecture"
                  className="inline-flex h-12 items-center justify-center rounded-full bg-honey px-8 font-semibold text-honey-foreground transition-colors hover:bg-honey-hover"
                >
                  Explore the architecture
                </Link>
                <Link
                  href="#ping-social"
                  className="inline-flex h-12 items-center justify-center rounded-full border border-text-on-dark/30 px-8 font-semibold text-text-on-dark transition-colors hover:bg-text-on-dark/10"
                >
                  PING Social
                </Link>
              </div>
              <p className="mt-6 text-sm text-text-on-dark/60">
                This site is a live TenantOS tenant. The runtime behind it is under active construction.
                Maturity labels on this page say what is real.
              </p>
            </ScrollReveal>
            <ScrollReveal delay={0.15}>
              <HeroEvidenceCard />
            </ScrollReveal>
          </div>
        </Container>
      </Section>

      {/* Portal margin: PING circles inhabit unused peripheral space only. Geometry, not breakpoints, decides whether a slot is honest. */}
      <PortalHost portals={portalProjections} />

      {/* 02 THE CONTINUITY PROBLEM, compressed */}
      <div id="problem"><Section size="minor">
        <Container className="max-w-4xl">
          <p className="font-mono text-xs font-bold uppercase tracking-widest text-honey">/truth</p>
          <h2 className="mt-4 text-3xl font-bold text-text sm:text-4xl" style={{ lineHeight: 'var(--leading-display)', letterSpacing: 'var(--tracking-display)' }}>
            Most AI starts from zero every session. PING starts from everything that happened before.
          </h2>
          <p className="mt-6 max-w-3xl text-lg text-text-muted" style={{ lineHeight: 'var(--leading-body)' }}>
            A technician answers the same customer question three times because nothing was written down.
            The business knows things, but the knowledge lives in heads, inboxes, and scattered tools.
            It does not compound. PING is infrastructure for turning activity into durable organizational intelligence.
          </p>
        </Container>
      </Section></div>

      {/* 03 THE CLOSED COMPOUNDING LOOP */}
      <div id="architecture">
      <Section className="bg-surface-2">
        <Container className="max-w-5xl">
          <SectionHeading
            eyebrow="/observe /remember /connect /act /prove"
            title="The closed compounding loop"
            description="(so knowledge compounds instead of evaporating) Information enters as raw input and moves through a loop that makes it increasingly useful. Every cycle produces new evidence, which feeds the next cycle."
            align="center"
          />
          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {LOOP_BEATS.map((beat) => (
              <ScrollReveal key={beat.verb}>
                <div className="flex h-full flex-col rounded-lg border border-border-soft bg-surface p-6">
                  <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-honey">{beat.eyebrow}</p>
                  <h3 className="mt-2 text-lg font-bold uppercase tracking-wide text-text">{beat.verb}</h3>
                  <p className="mt-1 text-sm font-semibold text-text">{beat.line}</p>
                  <ul className="mt-3 flex-1 space-y-2">
                    {beat.bullets.map((b) => (
                      <li key={b} className="text-sm text-text-muted">· {b}</li>
                    ))}
                  </ul>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {beat.labels.map((l) => (
                      <MaturityLabel key={l} status={l} />
                    ))}
                  </div>
                </div>
              </ScrollReveal>
            ))}
            <ScrollReveal>
              <div className="flex h-full flex-col justify-center rounded-lg border border-dashed border-honey/40 bg-honey/5 p-6">
                <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-honey">/prove → /observe</p>
                <h3 className="mt-2 text-lg font-bold uppercase tracking-wide text-text">THE LOOP CLOSES</h3>
                <p className="mt-1 text-sm font-semibold text-text">New evidence feeds the next cycle.</p>
                <p className="mt-3 text-sm text-text-muted">
                  Observation → Evidence → Event → Knowledge → Action → New evidence.
                  Playbooks ran end to end in test scope on 2026-09-17: proposal, approval, activation, execution, outcome, then a revision that waits on Nolan, then replay and witness. Three wiring gaps are documented in the matrix.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <MaturityLabel status="Built" />
                </div>
              </div>
            </ScrollReveal>
          </div>
          <div className="mt-12">
            <KnowledgeLoop />
          </div>
          <div className="mt-12 rounded-xl border border-border-soft bg-surface p-6 sm:p-10">
            <div className="mb-6 text-center">
              <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-honey">/connect, rendered</p>
              <h3 className="mt-2 text-2xl font-bold text-text">See your business</h3>
              <p className="mx-auto mt-2 max-w-2xl text-text-muted">
                The Connect beat as a canvas. A customer called. That created an event, which created a lead,
                which became a project. Every node knows its neighbors.
              </p>
            </div>
            <BusinessGraph />
          </div>
        </Container>
      </Section>
      </div>

      {/* 04 INTELLIGENCE IS NOT AUTHORITY */}
      <div id="authority">
      <Section>
        <Container className="max-w-5xl">
          <SectionHeading
            eyebrow="/govern"
            title="Intelligence is not authority"
            description="(so agents can act without acting on vibes) Software that acts on your behalf needs boundaries more than it needs intelligence. Every agent operates under explicit capability grants. Humans remain the decision authority where it matters."
            align="center"
          />
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {AUTHORITY_LAYERS.map((layer) => (
              <ScrollReveal key={layer.n}>
                <div className="h-full rounded-lg border border-border-soft bg-surface p-6">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-honey">{layer.n}</span>
                    <MaturityLabel status={layer.status} />
                  </div>
                  <h3 className="mt-3 text-base font-bold uppercase tracking-wide text-text">{layer.title}</h3>
                  <p className="mt-2 text-sm text-text-muted">{layer.detail}</p>
                </div>
              </ScrollReveal>
            ))}
          </div>

          <div className="mx-auto mt-8 max-w-3xl rounded-lg border border-violet-500/30 bg-violet-500/5 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-violet-700">The honest OFF</p>
              <MaturityLabel status="Experimental" />
            </div>
            <p className="mt-3 text-sm text-text">
              <span className="font-bold">IntelligenceWorker: OFF.</span> It is registered in the worker
              registry with an empty event set and is never constructed. It stays off until a real
              mission needs it. Default posture: deny first, grant explicitly.
            </p>
          </div>

          <div className="mt-12">
            <AgentAuthority />
          </div>

          <div className="mt-12 rounded-lg border border-border-soft bg-surface-2 p-6 sm:p-8">
            <p className="text-center font-mono text-[11px] font-bold uppercase tracking-widest text-honey">/govern · the tenancy frame</p>
            <h3 className="mt-2 text-center text-xl font-bold text-text">One authority per tenant</h3>
            <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-text-muted">
              The tenant namespace is the authority boundary&apos;s primitive: identity, knowledge, and
              operations separated into pillars, unified by the PING continuity layer. Each tenant is
              configuration plus content. Never a fork.
            </p>
            <div className="mt-8">
              <TenantModel />
            </div>
            <div className="mt-6 text-center">
              <MaturityLabel status="Built" />
              <span className="ml-3">
                <Link href="/technology/tenantos" className="inline-block min-h-[44px] py-2 font-medium text-honey hover:underline">
                  Read the TenantOS architecture →
                </Link>
              </span>
            </div>
          </div>
          <div className="mt-8 text-center">
            <Link href="/technology/agents" className="inline-block min-h-[44px] py-2 font-medium text-honey hover:underline">
              Read the agent infrastructure →
            </Link>
          </div>
        </Container>
      </Section>
      </div>

      {/* 05 EVERY ANSWER COMES WITH RECEIPTS */}
      <div id="evidence">
      <Section className="bg-surface-2">
        <Container className="max-w-5xl">
          <SectionHeading
            eyebrow="/prove"
            title="Every answer comes with receipts"
            description="(so every answer can show its work) An annotated record from a real captured run. Tap through the lineage: the observation, the event, the mission it caused, the workers that ran."
            align="center"
          />
          <div className="mx-auto mt-12 max-w-3xl rounded-lg border border-border-soft bg-deep p-6 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-text-on-dark/60">
                Annotated event record
              </p>
              <div className="flex items-center gap-2">
                <MaturityLabel status="Built" />
                <span className="rounded border border-text-on-dark/20 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide text-text-on-dark/60">
                  Captured 2026-07-28
                </span>
              </div>
            </div>
            <dl className="mt-6 space-y-4">
              {[
                ["event_type", "LEAD_CREATED", "What happened, in the canonical vocabulary."],
                ["event_id", "e9591d7277246b27eb090abb2acece5864c58d8dcaf94701286c6f40ccd33153", "The permanent identifier. Quote it and the record can be found."],
                ["recorded", "2026-07-28T02:10:54Z", "When it landed. Timestamps are part of the evidence."],
                ["source", "PING commissioning run, 14 scenarios, 770 events", "Where it came from. Provenance is not optional."],
                ["caused", "mission 51009ceae9ef316a · LEAD_FOLLOWUP · priority 3", "What it triggered. Every event links to its consequences."],
                ["executed", "150 worker executions completed in the run", "What the system did with it. Results attach to the same lineage."],
              ].map(([k, v, note]) => (
                <div key={k} className="rounded-lg border border-text-on-dark/10 bg-deep-2/60 p-4">
                  <dt className="font-mono text-[11px] font-bold uppercase tracking-widest text-honey">{k}</dt>
                  <dd className="mt-1 break-all font-mono text-sm text-text-on-dark">{v}</dd>
                  <dd className="mt-1 text-sm text-text-on-dark/60">{note}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-xs text-text-on-dark/50">
              A captured record from PING&apos;s own commissioning run. Not live activity.
            </p>
          </div>
          {/* Convergence sprint receipts, captured 2026-09-16/17 */}
          <div className="mx-auto mt-6 max-w-3xl rounded-lg border border-border-soft bg-deep p-6 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-text-on-dark/60">
                Execution receipts · one authority, two runtimes plus an exterior agent
              </p>
              <span className="rounded border border-text-on-dark/20 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide text-text-on-dark/60">
                Captured 2026-09-16/17
              </span>
            </div>
            <dl className="mt-6 space-y-4">
              <div className="rounded-lg border border-text-on-dark/10 bg-deep-2/60 p-4">
                <dt className="font-mono text-[11px] font-bold uppercase tracking-widest text-honey">python capability</dt>
                <dd className="mt-1 break-all font-mono text-sm text-text-on-dark">mission bfe815990337e45d · PYTHON_CAPABILITY_RUN · event 27482dbdabfb57b7190dd9f4ae530bee98ff381c8cc0eebec27349dd04b502a1 · task e694f5787ad45764 · evidence 49a96bff42cb1bdf5bc19dd56901a1955a0fb962a24d498dc36a21d0bd7e180e · result sha 1945b844ac504c8fbd631b668b4ede93291b432c573f7263f631e7f63ae521ab</dd>
                <dd className="mt-1 text-sm text-text-on-dark/60">A real Python capability executed a PING task against live Oracle Postgres: 44/44 assertions, zero Python-emitted events. Not a fleet yet.</dd>
              </div>
              <div className="rounded-lg border border-text-on-dark/10 bg-deep-2/60 p-4">
                <dt className="font-mono text-[11px] font-bold uppercase tracking-widest text-honey">exterior agent</dt>
                <dd className="mt-1 break-all font-mono text-sm text-text-on-dark">Hermes WorkOrder 0d598aef352b9a8a · text.transform · exit 0, independently verified · result sha f0b021848c2ddc7d6e07b8f8e186c78259454a935153804c7b4c574ec5bb1eed · PING events f326ea70d7cf16ce85c4cc56a23bc147ce0273984023c123b8b5467ea6d507de / e91681bfd300389e9c8f10c7c3ad2f9cea352342bfe6aa71f962d14c764bb587 / daaa75fc5b298c5b7fedab679e8bbf8a792099afc779877dd3d8acc7def1bf92</dd>
                <dd className="mt-1 text-sm text-text-on-dark/60">One scoped execution, not a fleet. Codex was quota-blocked; OpenCode has no headless CLI. Adapter code is uncommitted worktree code, not a live worker runtime.</dd>
              </div>
            </dl>
            <p className="mt-4 text-xs text-text-on-dark/50">
              Captured receipts from the convergence sprint. Not live activity.
            </p>
          </div>
          <div className="mt-12">
            <ReplayEvidence />
          </div>
          <div className="mt-8 text-center">
            <Link href="/technology/replay" className="inline-block min-h-[44px] py-2 font-medium text-honey hover:underline">
              Read about replay →
            </Link>
          </div>
        </Container>
      </Section>
      </div>

      {/* 06 ONE AUTHORITY, MANY RUNTIMES */}
      <div id="runtimes">
      <Section>
        <Container className="max-w-5xl">
          <SectionHeading
            eyebrow="/run"
            title="One authority, many runtimes"
            description="(so execution can spread without truth splitting) Workers: where tasks run. The event plane: where truth lands. Authority: what decides. What PING provides: canonical events, capability grants, evidence. What that guarantees: execution can move without truth splitting."
            align="center"
          />
          <div className="mt-12">
            <MultiRuntime />
          </div>
        </Container>
      </Section>
      </div>

      {/* 07 BUILT ON PING: the applied layer, moved up from section 10 */}
      <div id="ping-social">
      <Section className="bg-deep">
        <Container className="max-w-5xl">
          <SectionHeading
            eyebrow={<span className="text-honey">/applied · {tenant.operator.business}</span>}
            title={<span className="text-text-on-dark">Built on PING</span>}
            description={<span className="text-text-on-dark/80">(so the infrastructure meets a real business) PING builds the infrastructure. PING Social applies it. Nolan Geske works directly with home service businesses to put AI to practical use on real operational problems.</span>}
            align="center"
            descriptionColor="text-text-on-dark/80"
          />
          <div className="mt-10 rounded-lg border border-text-on-dark/10 bg-deep-2/60 p-6 sm:p-8">
            <p className="text-center font-mono text-sm uppercase tracking-widest text-text-on-dark/60">The stack</p>
            <div className="mt-4 flex flex-col items-center gap-2 text-center">
              <span className="font-mono text-sm font-bold uppercase tracking-wide text-honey">PING Infrastructure</span>
              <span className="text-text-on-dark/40" aria-hidden="true">↓</span>
              <span className="font-mono text-sm font-bold uppercase tracking-wide text-text-on-dark/85">TenantOS</span>
              <span className="text-text-on-dark/40" aria-hidden="true">↓</span>
              <span className="font-mono text-sm font-bold uppercase tracking-wide text-text-on-dark/85">PING Social</span>
              <span className="text-text-on-dark/40" aria-hidden="true">↓</span>
              <span className="font-mono text-sm font-bold uppercase tracking-wide text-text-on-dark/85">Real Business</span>
            </div>
          </div>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            <div className="rounded-lg border border-text-on-dark/10 bg-deep-2/60 p-6">
              <h3 className="font-bold text-text-on-dark">Fewer missed opportunities</h3>
              <p className="mt-2 text-sm text-text-on-dark/70">Missed calls, slow follow-up, scheduling friction. Automation plugs the revenue leaks.</p>
            </div>
            <div className="rounded-lg border border-text-on-dark/10 bg-deep-2/60 p-6">
              <h3 className="font-bold text-text-on-dark">Less busywork</h3>
              <p className="mt-2 text-sm text-text-on-dark/70">Repetitive communication and follow-up handled reliably. People focus on customers and jobs.</p>
            </div>
            <div className="rounded-lg border border-text-on-dark/10 bg-deep-2/60 p-6">
              <h3 className="font-bold text-text-on-dark">Humans in control</h3>
              <p className="mt-2 text-sm text-text-on-dark/70">Automation supports owners and skilled workers. It does not replace their judgment.</p>
            </div>
          </div>
          <div className="mt-8 text-center">
            <Link
              href="/contact"
              className="inline-flex h-12 items-center justify-center rounded-full bg-honey px-8 font-semibold text-honey-foreground transition-colors hover:bg-honey-hover"
            >
              Start a conversation
            </Link>
            <p className="mt-3 text-sm text-text-on-dark/60">
              Currently onboarding Western Colorado home-service businesses.
            </p>
          </div>

          {/* Build journal: the living proof feed, adjacent to the applied layer */}
          <div className="mt-16">
            <p className="text-center font-mono text-xs font-bold uppercase tracking-widest text-honey">/follow · building in public</p>
            <h3 className="mt-3 text-center text-2xl font-bold text-text-on-dark sm:text-3xl">From the build</h3>
            <p className="mx-auto mt-3 max-w-2xl text-center text-text-on-dark/70">
              The latest real entries from the PING repo, plus the longer-form build notes.
              A stale journal is worse than none, so this feed shows real recent entries.
            </p>
            <div className="mx-auto mt-8 max-w-3xl rounded-lg border border-text-on-dark/10 bg-deep-2/60 p-6">
              <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-text-on-dark/50">Changelog · real commits</p>
              <ul className="mt-3 space-y-2">
                {CHANGELOG.map((c) => (
                  <li key={c.hash} className="flex flex-wrap items-baseline gap-x-3 font-mono text-sm">
                    <span className="text-text-on-dark/50">{c.date}</span>
                    <span className="text-honey">{c.hash}</span>
                    <span className="text-text-on-dark/80">{c.note}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-8 grid gap-6 md:grid-cols-3">
              <Link href="/blog" className="group">
                <article className="h-full rounded-lg border border-text-on-dark/10 bg-deep-2/60 p-6 transition-shadow group-hover:shadow-md">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-honey">TenantOS</p>
                  <h3 className="mt-2 text-lg font-bold text-text-on-dark group-hover:text-honey">From HPP to PING</h3>
                  <p className="mt-2 text-sm text-text-on-dark/70">This site was rebuilt from a trades-company website into the first TenantOS tenant. The transformation is the proof of concept.</p>
                </article>
              </Link>
              <Link href="/blog" className="group">
                <article className="h-full rounded-lg border border-text-on-dark/10 bg-deep-2/60 p-6 transition-shadow group-hover:shadow-md">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-honey">Agents</p>
                  <h3 className="mt-2 text-lg font-bold text-text-on-dark group-hover:text-honey">Execution boundaries for agents</h3>
                  <p className="mt-2 text-sm text-text-on-dark/70">How agents run commands across machine boundaries without corrupting them, and why capability separation beats clever prompting.</p>
                </article>
              </Link>
              <Link href="/blog" className="group">
                <article className="h-full rounded-lg border border-text-on-dark/10 bg-deep-2/60 p-6 transition-shadow group-hover:shadow-md">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-honey">Evidence</p>
                  <h3 className="mt-2 text-lg font-bold text-text-on-dark group-hover:text-honey">Evidence before eloquence</h3>
                  <p className="mt-2 text-sm text-text-on-dark/70">Autonomous systems should prefer a correct, well-supported answer over an impressive one. What that costs in practice.</p>
                </article>
              </Link>
            </div>
            <div className="mt-8 text-center">
              <Link href="/blog" className="inline-block min-h-[44px] py-2 font-medium text-honey hover:underline">
                Read the build log →
              </Link>
            </div>
          </div>
        </Container>
      </Section>
      </div>

      {/* 08 WHAT IS REAL: the honesty strip, roadmap folded in */}
      <div id="status">
      <Section className="bg-surface-2" size="minor">
        <Container className="max-w-5xl">
          <SectionHeading
            eyebrow="/status"
            title="What is real"
            description="(so ambition never outruns evidence) Every capability on this page carries its maturity. Stages, not dates. Captured evidence is labeled captured; every number carries its as-of date."
            align="center"
          />
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            {STATUS_STRIP.map((row) => (
              <ScrollReveal key={row.label}>
                <div className="flex h-full items-start justify-between gap-4 rounded-lg border border-border-soft bg-surface p-5">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-bold uppercase tracking-wide text-text">{row.label}</h3>
                    <p className="mt-1 text-sm text-text-muted">{row.detail}</p>
                  </div>
                  <MaturityLabel status={row.status} className="shrink-0" />
                </div>
              </ScrollReveal>
            ))}
          </div>
        </Container>
      </Section>
      </div>

      {/* 09 FOLLOW THE BUILD */}
      <Section className="bg-deep" size="minor">
        <Container className="max-w-2xl text-center">
          <p className="font-mono text-xs font-bold uppercase tracking-widest text-honey">/follow · newsletter</p>
          <h2 className="mt-3 text-2xl font-bold text-text-on-dark sm:text-3xl">Follow the build</h2>
          <p className="mt-3 text-text-on-dark/80">
            Notes on continuity, agents, and building PING. One email when there is something worth saying.
          </p>
          <div className="mt-6 text-left">
            <NewsletterSignup />
          </div>
          <Link href="/newsletter" className="mt-6 inline-block font-medium text-honey hover:underline">
            Browse the archive →
          </Link>
        </Container>
      </Section>

      {/* 10 CONTACT, with scope note */}
      <CTASection
        title="Talk to us about your business."
        subtitle="PING Social helps real businesses put AI to practical use: fewer missed opportunities, less busywork, systems that remember. Currently onboarding Western Colorado home-service businesses."
      />
    </>
  );
}
