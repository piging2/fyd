# PING HOMEPAGE HARVEST

Date: 2026-09-17. Method: read-only study of current live homepages via page-text fetch (no live browser, no screenshots available to any harvester). Only mechanisms harvested. Nothing here copies any site's branding, artwork, copy, or visual identity.

## Tally

- Site reviews: 44 across 43 unique sites (Vercel reviewed in two groups)
  - Infra/deploy: Vercel, Railway, Fly.io, Render, Neon, PlanetScale, Modal, Koyeb, Deno (9)
  - AI platforms: Anthropic, OpenAI, Cursor, Together AI, Replicate, LangChain, Weights and Biases, Hugging Face, Daytona (9)
  - Developer tools: Linear, Stripe, Supabase, Resend, Clerk, Liveblocks, Sentry, PostHog, Vercel, Neo4j, Inngest (11)
  - Network/data: Cloudflare, Pinecone, Perplexity (live); ElevenLabs, Qdrant, Hume (search evidence); Phind excluded (shut down early 2026), Tailscale excluded (no mechanism evidence) (6)
  - Product-led: Notion, Framer, Raycast, Dia, Ramp, Mercury, Retool, Figma, Webflow (9)
- Ideas harvested: 184 (50 + 38 + 40 + 26 + 30)
- Priority split: 36 P0, 86 P1, 62 P2 (approximate; per-group counts summed)

## Working hypothesis confirmed

Every group independently converged on the same diagnosis: no reference site runs 14 sections at equal visual weight. Railway runs about 6 sections, Fly.io about 8, Modal about 8, Koyeb about 10, Deno about 10. PING's 14 sections are the outlier. The fix is hierarchy (hero, 3 to 5 signature moments, supporting sections, proof, close), not more content and not deletion.

## Top mechanisms by PING problem

### A. Hero: communicating complex infrastructure in five seconds

**A1. Living activity-feed hero (Linear, P0)**
- SOURCE: Linear. URL: https://linear.app
- WHAT IT DOES: The hero visual is a working issue card with an activity feed underneath showing relative timestamps ("moved from Todo to In Progress, just now") and provenance on every entry (actor, channel, beneficiary).
- WHY IT WORKS: Relative timestamps and named actors make the visitor believe the screen is alive. The product is caught mid-work, not illustrated.
- PING ADAPTATION: PING's hero visual should be an evidence card caught mid-work: an observation being recorded, a connection being made, an action being taken, each stamped with relative time and source. Provenance is PING's trust story and its hero visual at once.
- RISKS: Do not copy Linear's issue-card styling. Sample content must be PING's own, labeled illustrative unless it is real system output.
- MOBILE: UNKNOWN.

**A2. Scramble/decode rotating tagline with accessibility guards (Vercel, P0)**
- SOURCE: Vercel. URL: https://vercel.com/
- WHAT IT DOES: A tagline rotates through phrases with a character scramble that locks in like a decryption. The markup reserves maximum phrase width (no layout shift), carries a screen-reader-only full sentence, and disables under reduced-motion.
- WHY IT WORKS: The motion is thematically loaded (assembly, not decoration), and the accessibility pattern means the effect is progressive enhancement, never content loss.
- PING ADAPTATION: Rotate PING's verbs in the hero subline ("It observes." to "It remembers." to "It connects." to "It acts." to "It proves it.") under a fixed H1. Copy the accessibility pattern exactly: width reserve, sr-only sentence, reduced-motion fallback.
- RISKS: Keep it to one short line; scramble on long text becomes noise.
- MOBILE: UNKNOWN.

**A3. The homepage IS the applied demo (Perplexity, P0)**
- SOURCE: Perplexity. URL: https://perplexity.ai
- WHAT IT DOES: The root route serves a complete applied product story (a reseller workflow, audit to schedule), not a generic engine pitch. The abstract engine's power is inferred from one vivid application.
- WHY IT WORKS: Concrete beats abstract for the five-second test.
- PING ADAPTATION: Strongest structural validation of "PING builds the infrastructure. PING Social applies it." Resolve the PING hero (or first scroll) into one concrete applied beat, a single business whose missed calls became captured knowledge, so the abstract system is always anchored to one vivid application. Do not copy the reseller framing; use a real PING Social-shaped example when one exists.
- RISKS: Do not promise outcomes PING cannot prove.
- MOBILE: UNKNOWN.

**A4. Observe-to-act sentence (PostHog, P0)**
- SOURCE: PostHog. URL: https://posthog.com
- WHAT IT DOES: "Ready to turn 'tell me what happened' into 'here's what to fix next.'" The whole loop (capture everything, make it queryable, turn questions into actions) compressed into a before/after sentence.
- WHY IT WORKS: Twelve words carry the entire product story. Naming both humans and agents as consumers mirrors PING's world.
- PING ADAPTATION: PING's equivalent before/after, e.g. from "what did we know and when" to "what should we do next, and here is the evidence." Draft only; Nolan's wording governs.
- RISKS: Low. Sentence structure is generic.
- MOBILE: N/A (copy device).

**A5. Concept-carrying eyebrow (Cloudflare, P0)**
- SOURCE: Cloudflare. URL: http://cloudflare.com
- WHAT IT DOES: A tiny eyebrow label ("Region: Earth") collapses an entire infrastructure story into three syllables before the headline is even read. The headline then only names the era.
- WHY IT WORKS: The label does the conceptual heavy lifting; the headline stays short.
- PING ADAPTATION: A PING-native eyebrow in the same slot, e.g. "Scope: your whole business" or a continuity label ("Horizon: everything the business has ever done"). Keep the pattern, never the words. PING's hero visual should be a system, not a map.
- RISKS: Any planetary-scale label will read as derivative; the label must be PING's own concept (continuity/memory), not geography.
- MOBILE: UNKNOWN.

**A6. Dual CTA: human path plus agent path (Deno, P0)**
- SOURCE: Deno. URL: https://deno.com/
- WHAT IT DOES: The hero offers two onboarding paths side by side: the classic install command for humans, and a labeled agent path ("Or let your agent do it") with a paste-ready instruction naming specific agents.
- WHY IT WORKS: It treats "agent as user" as a first-class conversion path. Naming the agents removes ambiguity.
- PING ADAPTATION: PING's hero CTA block: the human path ("See how PING remembers") plus "Or let your agent query it" pointing at a PING agents.md or MCP endpoint when it exists. Do not ship the agent path before the endpoint exists; a dead agent CTA is worse than none.
- RISKS: Medium. The instruction must be real.
- MOBILE: UNKNOWN.

**A7. Plain-English hero, contrarian thesis (Railway P1, Fly.io P1)**
- SOURCE: Railway (https://railway.com/), Fly.io (https://fly.io/)
- WHAT IT DOES: Railway: five-word outcome H1, one concrete mechanism sentence, zero jargon. Fly.io: a four-word negation ("Sandboxes aren't enough.") that positions by refusal, then a two-sentence explanation.
- WHY IT WORKS: Zero jargon in the first viewport. A short negation teaches what the product is by naming what it refuses to be.
- PING ADAPTATION: PING's H1 under six words; one negation maximum, e.g. "Notes aren't memory." Pick one sharp refusal, answer it in two sentences.
- RISKS: The negation must be true and defensible, not just punchy.
- MOBILE: UNKNOWN.

### B. System visualization

**B1. "See your business" canvas (Railway, P0)**
- SOURCE: Railway. URL: https://railway.com/
- WHAT IT DOES: The first product section is a visual canvas of the user's entire stack at a glance, presented before networking, scaling, or observability. "Edit anything in context."
- WHY IT WORKS: It sells comprehension, not features. It answers the unspoken fear ("I won't understand my own system") before the feature tour.
- PING ADAPTATION: The BusinessGraph as PING's canvas moment: customers, jobs, workers, suppliers, money as one living graph. Strongest candidate for making the graph a signature beat rather than a diagram.
- RISKS: A canvas must be genuinely readable, not decorative node-soup. Labels and hierarchy do the work.
- MOBILE: UNKNOWN.

**B2. Every signature section gets looping motion of the real system (Modal, P0)**
- SOURCE: Modal. URL: https://modal.com/
- WHAT IT DOES: Each major capability section embeds a short silent looping visual of the actual product in motion (runtime starting, graph moving). No section relies on a static diagram for its signature moment.
- WHY IT WORKS: Real product footage is the hardest thing to fake, so it reads as the strongest proof. Looping keeps it ambient.
- PING ADAPTATION: Each PING signature moment gets a looping "system in motion" visual: the event plane receiving events, the loop compounding, replay scrubbing history, the authority boundary granting and logging. If real footage is not ready, a faithful schematic animation is acceptable only if labeled illustrative. Never loop a fake dashboard and imply it is live. Plan poster frames and tap-to-play for mobile; do not assume autoplay.
- RISKS: High if done badly; each visual must show a real PING process, captioned with what the viewer is seeing.
- MOBILE: UNKNOWN (autoplay is a known minefield).

**B3. Progressive topology diagrams (PlanetScale, P0)**
- SOURCE: PlanetScale. URL: https://planetscale.com/
- WHAT IT DOES: The same architecture shown three times at increasing scale (2 shards, 3 shards, wider with replicas), each followed by a one-line explanation of what changed. Scrolling teaches growth by structural repetition.
- WHY IT WORKS: Repetition with variation is the oldest teaching trick. The reader's eye does the learning.
- PING ADAPTATION: The signature visual for "one authority, many runtimes": show the PING authority once with one worker, then the same diagram with three workers, then the full fleet. Same frame, more lanes. Label each stage. Use PING's own minimal line style, not the ASCII look.
- RISKS: Widening diagrams need a mobile plan (vertical stacking or swipe); do not shrink to illegibility.
- MOBILE: UNKNOWN.

**B4. Convergence diagram (Retool, P0)**
- SOURCE: Retool. URL: https://www.retool.com
- WHAT IT DOES: A diagram showing heterogeneous sources converging through one governed pipeline (query to transform to response steps), with "governed by your existing permissions" tying convergence to authority in one line.
- WHY IT WORKS: The convergence is the product: left side is diversity, right side is order.
- PING ADAPTATION: PING's convergence grammar: runtimes/sources on the left (only those with real status), the event/evidence/authority plane in the middle, projections/actions on the right. One honest status label per runtime. On mobile it collapses to a vertical sources to plane to outcomes flow.
- RISKS: High copy risk on runtime claims; status labels must be evidence-backed. Do not copy Retool's visual style.
- MOBILE: UNKNOWN.

### C. Scroll story

**C1. The lifecycle as the page spine (LangChain, P0)**
- SOURCE: LangChain. URL: https://www.langchain.com
- WHAT IT DOES: Six consecutive sections, each a single verb headline with an identical template (verb, one-line description, three bullets). The product surface becomes a narrative with a beginning, middle, and end.
- WHY IT WORKS: A lifecycle is a story structure the reader already knows. Every capability gets a place, which is exactly what PING's 14 sections lack.
- PING ADAPTATION: PING's knowledge loop as the page spine with the same verb-headline template. Compress to 5 or 6 beats (LangChain's count works because each stage is one screen). Do not mirror LangChain's exact verbs.
- RISKS: Six same-template sections risk monotony; vary the visual per stage while keeping the text template constant.
- MOBILE: UNKNOWN.

**C2. Progressive complexity ladder (Replicate, P0)**
- SOURCE: Replicate. URL: https://replicate.com
- WHAT IT DOES: A three-rung ladder (one line of code, to fine-tune, to custom deploy), each rung showing the actual code, framed by an honest sentence about the tradeoff ("as you do more complex things...").
- WHY IT WORKS: It respects both audiences simultaneously. The framing sentence is honest about the tradeoff, which paradoxically increases trust.
- PING ADAPTATION: Structure PING's page as rungs, not a list: rung 1 = ask PING a question (one interaction); rung 2 = inspect the evidence behind the answer (a trace); rung 3 = run agents with authority boundaries (the full system). Existing sections slot into rungs.
- RISKS: Each rung's example must be real.
- MOBILE: UNKNOWN.

**C3. Tabbed full-stack section (Together AI, P0)**
- SOURCE: Together AI. URL: https://www.together.ai
- WHAT IT DOES: One section with tab navigation (Inference / Compute / Model Shaping); each tab reveals sub-products with one-line descriptions. The section never grows longer; the user chooses the facet.
- WHY IT WORKS: Tabs convert "14 sections of equal weight" into "1 section with facets." Complexity is available but not imposed.
- PING ADAPTATION: Candidate tabbed compressions: the knowledge-loop stages as tabs within one system section; runtime types as tabs within one execution section. Tabs must be keyboard-accessible with proper tablist semantics. On mobile, tabs become accordions or horizontal chip scrollers.
- RISKS: Tab switching must feel instant with no layout shift.
- MOBILE: UNKNOWN.

**C4. Alternating proof-type rhythm (Pinecone, P0)**
- SOURCE: Pinecone. URL: https://www.pinecone.io/
- WHAT IT DOES: Homepage alternates proof types down the page: action (install) to money (cost estimator) to visibility (console) to mechanism (architecture) to concept (Nexus) to trust (enterprise) to action (CTA). No two adjacent sections ask for the same kind of attention.
- WHY IT WORKS: The rhythm prevents the "fourteen equal blocks" problem. Each section has a distinct job and a distinct interaction texture.
- PING ADAPTATION: Map PING's sections onto distinct jobs: living hero (see), continuity problem (feel), knowledge loop (understand), graph (explore), authority (decide), evidence (trust), multi-runtime (grasp scale), applied layer (believe), CTA (act). The lesson is the rhythm, not the specific sections.
- RISKS: Low.
- MOBILE: UNKNOWN.

**C5. Weight discipline (Resend, P0)**
- SOURCE: Resend. URL: https://resend.com
- WHAT IT DOES: Roughly twelve sections, but nearly every one is a short headline, one or two lines of copy, and one small visual. Each section is a glance, not a chapter.
- WHY IT WORKS: Short sections create scroll rhythm. Breadth without fatigue.
- PING ADAPTATION: Keep PING's breadth but stratify weight: 3 to 5 unforgettable moments get full visual weight; the rest become one-liners with a small visual. Decide per section: is this a moment or a mention.
- RISKS: Low.
- MOBILE: UNKNOWN.

**C6. Four-pillar compression (Mercury, P1)**
- SOURCE: Mercury. URL: https://mercury.com
- WHAT IT DOES: Four pillars, each a two-word label plus one concrete mechanism sentence. Four is holdable in memory; the mechanisms prevent empty slogans.
- WHY IT WORKS: Compression layer above the section inventory.
- PING ADAPTATION: A four-pillar table of contents for PING (e.g. Observe / Remember / Act / Prove, validated against the real architecture), each with one mechanism sentence.
- RISKS: Pillars must map to real capabilities.
- MOBILE: Pillars typically become 2x2 grid or vertical stack.

**C7. Verb-led capability pairs (Notion, P1)**
- SOURCE: Notion. URL: https://notion.com/
- WHAT IT DOES: Capability blocks as verb phrase plus outcome headline ("Capture knowledge" to "Bring everything into one system of record"). Identical structure repeated; the reader learns the rhythm and reads faster.
- WHY IT WORKS: Repetition of structure (not content) reduces cognitive load.
- PING ADAPTATION: PING-native verb pairs: "Observe" to outcome, "Remember" to outcome, "Connect" to outcome, "Act" to outcome, "Prove" to outcome.
- RISKS: Outcomes must be honest.
- MOBILE: Stacks naturally.

**C8. Thesis-led sections (Retool, P1)**
- SOURCE: Retool. URL: https://www.retool.com
- WHAT IT DOES: Sections as thesis headlines plus exactly two sentences, no bullets. Each section lands one repeatable idea.
- WHY IT WORKS: The two-sentence constraint forces editorial discipline.
- PING ADAPTATION: Convert the authority section and multi-runtime section into thesis-led blocks: one arguable headline, two sentences, one visual each.
- RISKS: Low.
- MOBILE: Short text blocks are mobile-safe.

### D. Section transitions

**D1. Contrast couplets (Mercury, P1)**
- SOURCE: Mercury. URL: https://mercury.com
- WHAT IT DOES: Each major beat opens with a two-sentence contrast ("Banking's been a headache. Now, it's a head start."). The first sentence names the old world, the second names the new.
- WHY IT WORKS: The reader crosses the bridge in one breath.
- PING ADAPTATION: PING-native couplets for the 3 or 4 real transitions (problem to system, system to authority, infrastructure to applied layer), drawn from business pain. Keep them plain; couplets tip into sloganeering if overwritten.
- RISKS: Medium.
- MOBILE: Short lines are mobile-safe.

**D2. Terminal-slash section labels (Koyeb, P1)**
- SOURCE: Koyeb. URL: https://www.koyeb.com/
- WHAT IT DOES: Section eyebrows prefixed with a terminal slash ("/start building", "/Changelog"). One character of consistent punctuation creates a complete CLI voice.
- WHY IT WORKS: The reader feels inside a terminal session; sections feel executable, which suits infrastructure.
- PING ADAPTATION: PING's eyebrows as commands: "/observe", "/remember", "/connect", "/act", "/replay", "/prove". Cheap, high-identity, unifies page voice.
- RISKS: None. PING's verbs, PING's voice.
- MOBILE: UNKNOWN.

**D3. Claim to proof interleaving (Webflow, P1)**
- SOURCE: Webflow. URL: https://webflow.com/
- WHAT IT DOES: Feature rows alternate with big-number proof cards from named customers. No feature travels without evidence.
- WHY IT WORKS: The rhythm prevents feature fatigue; each proof card is a visual breather and a credibility deposit.
- PING ADAPTATION: Pair each PING capability section with one evidence card: a real build-journal entry, a replay trace excerpt, or an honest status label where no evidence exists yet ("In active development"). Empty cells are not hidden; they show status.
- RISKS: Every number must be real and dated.
- MOBILE: Cards stack full-width.

### E. Live/operational feel

**E1. Live terminal trace as the signature visual (Framer, P0)**
- SOURCE: Framer. URL: https://framer.com/
- WHAT IT DOES: A rendered terminal session showing an external agent working: commands, intermediate results, completion ("Import complete, 47 blog entries published"). A "copy install prompt" control beside it.
- WHY IT WORKS: A trace is proof of agency; the reader watches the machine think and finish. Timestamps and counts make it feel real.
- PING ADAPTATION: A PING run trace: an event arriving to worker pickup to evidence recorded to projection updated to replay available, rendered as a scrolling terminal/log with real (or honestly labeled sample) entries. Signature "living system" visual candidate. Label sample traces as samples; prefer real anonymized traces.
- RISKS: High if fabricated.
- MOBILE: Terminal becomes a simplified scrolling log.

**E2. Continuous-tense microcopy (Pinecone, P1)**
- SOURCE: Pinecone. URL: https://www.pinecone.io/
- WHAT IT DOES: Pipeline stages carry present-tense operational microcopy ("vector throughput, streaming in", "index continuously rebalancing"). The copy describes the system as currently running.
- WHY IT WORKS: Infrastructure buyers want to feel the machine is alive and self-maintaining. Continuous tense delivers that in words alone, no animation required.
- PING ADAPTATION: "Events streaming in," "knowledge compounding," "evidence accumulating." Cheap, honest (describes the design, not fake live data). Never attach fake numbers to it.
- RISKS: Low.
- MOBILE: N/A.

**E3. Terminal status line (Neon, P1)**
- SOURCE: Neon. URL: https://neon.com/
- WHAT IT DOES: A mono-font system status readout ("SYSTEM: NEON DATABASE PLATFORM [ STATUS: ONLINE ] [ CONNECTION: STABLE ]") as ambient proof the system is alive. One line, pays back on every scroll.
- WHY IT WORKS: Bracketed status fields are instantly parseable by technical readers.
- PING ADAPTATION: "PING EVENT PLANE [ RECORDING ] [ WITNESS: ACTIVE ]" or per-section states. If backed by the real system it can reflect true state; if static, label it illustrative, never live telemetry.
- RISKS: High if PING fakes live state.
- MOBILE: UNKNOWN.

**E4. Homepage changelog strip (Koyeb, P1)**
- SOURCE: Koyeb. URL: https://www.koyeb.com/
- WHAT IT DOES: A changelog section on the homepage itself showing the latest team updates. The page admits it is a living product with a recent history.
- WHY IT WORKS: Recency is checkable. Returning visitors get a reason to come back.
- PING ADAPTATION: PING's "Follow the build" as a dated one-line strip with the latest real update. A stale changelog is worse than none; if nothing shipped recently, the slot stays empty.
- RISKS: None if real.
- MOBILE: UNKNOWN.

### F. Business graph

**F1. Knowledge-layer triad (Neo4j, P0)**
- SOURCE: Neo4j. URL: https://neo4j.com
- WHAT IT DOES: "A knowledge layer provides the context, memory, and map of your data." Three concrete nouns naming three distinct jobs the layer does.
- WHY IT WORKS: "Layer" is an architecture word engineers trust; the triad makes the abstract concrete. "Map" gives the graph a job the visitor can picture.
- PING ADAPTATION: PING's own triad for the business graph, same structure, PING's words (PING connects the business's events, knowledge, and decisions to the people and agents that need them). This is the closest existing articulation of PING's graph and authority moments.
- RISKS: Medium. Write PING's own triad and sentences; do not mirror the words.
- MOBILE: UNKNOWN.

**F2. Honest gap: no explanatory graph visual found**
- Across all five groups, no site presented an interactive node/edge graph that teaches. The graph harvest is naming (F1) and the canvas treatment (B1), not a visual to copy. PING's graph visual remains an unsolved design problem: it must be invented, not harvested.

### G. Knowledge loop

**G1. The closed loop in three verbs (LangChain, P0)**
- SOURCE: LangChain. URL: https://www.langchain.com
- WHAT IT DOES: "Detect, find, feed (back)" compresses compounding into three verbs where the third closes the circle. "Feed every fix back into your eval loop" is the whole thesis in eight words.
- WHY IT WORKS: Three verbs are memorable; the loop-closing third verb is the insight.
- PING ADAPTATION: PING's own closed loop in three or four verbs, repeated everywhere: hero, section, journal. The critical property: the last verb must feed back into the first. PING's current eight-stage loop description is too long for anyone to remember.
- RISKS: Do not reuse "Detect/Find/Feed" verbatim.
- MOBILE: N/A.

**G2. The "Nexus sentence" (Pinecone, P0)**
- SOURCE: Pinecone. URL: https://www.pinecone.io/
- WHAT IT DOES: "Compiles enterprise data into governed knowledge once, then serves it through a single query." One sentence names what compounding produces. The word "once" does enormous work.
- WHY IT WORKS: It gives the visitor a noun for the outcome instead of asking them to assemble it from pipeline stages.
- PING ADAPTATION: PING's loop needs its own one-breath sentence describing the real pipeline (observation to evidence to event to knowledge), e.g. "Every observation becomes evidence; every piece of evidence becomes knowledge; knowledge is compiled once and serves every future decision." Keep it to one breath.
- RISKS: The sentence must describe the real pipeline, not invent stages.
- MOBILE: N/A.

**G3. "So every X builds on what came before" (Perplexity, P0)**
- SOURCE: Perplexity. URL: https://perplexity.ai
- WHAT IT DOES: A capability card whose payoff clause states the loop in plain language ("remember your brands, sizing, pricing strategy, and past sales across sessions, so every audit builds on what came before").
- WHY IT WORKS: It answers "why is this better than doing it once?" with the memory mechanism. "Across sessions" does the conceptual work of persistence.
- PING ADAPTATION: PING's core sentence shape: "PING remembers every job, every promise, every outcome, so every future decision starts from what actually happened." Arguably PING's core sentence.
- RISKS: Memory claims must match real capability.
- MOBILE: UNKNOWN.

**G4. Named loop parts (Neon, P1)**
- SOURCE: Neon. URL: https://neon.com/
- WHAT IT DOES: A complex feature decomposed into three named sub-mechanisms, each with a one-line definition. Named parts imply a designed system.
- WHY IT WORKS: One-line definitions respect the reader. Each name is a handle.
- PING ADAPTATION: PING's replay/lineage as named parts (Witness, Lineage, Replay: three nouns, one line each). Same discipline for the knowledge loop stages.
- RISKS: Low. PING already owns these nouns.
- MOBILE: UNKNOWN.

**G5. The loop as one fusing sentence (Inngest, P1)**
- SOURCE: Inngest. URL: https://www.inngest.com
- WHAT IT DOES: "The data that makes code durable is the same used to make it better." One sentence fuses reliability and improvement into a single compounding mechanism.
- WHY IT WORKS: The loop is the differentiator, stated once.
- PING ADAPTATION: "The evidence that makes answers trustworthy is the same evidence that makes the next answer better."
- RISKS: Low.
- MOBILE: N/A.

### H. Intelligence versus authority

**H1. Numbered three-layer authority (Deno, P0)**
- SOURCE: Deno. URL: https://deno.com/
- WHAT IT DOES: Permission architecture as three numbered layers, each with a concrete mechanism: default deny, scoped grants, audits. Numbering implies order and completeness.
- WHY IT WORKS: Numbered layers read as a designed system, not a feature pile. Concrete syntax is unfakeable-feeling.
- PING ADAPTATION: PING's authority moment as three numbered layers: 1. Default deny (workers start with no authority), 2. Scoped grants (capability-based, expiring, least-privilege), 3. Audit and replay (every grant and action in the evidence log, replayable). Strongest candidate for the "intelligence vs authority" signature moment.
- RISKS: Low. PING's mechanism in PING's words.
- MOBILE: UNKNOWN.

**H2. Governance as visible toggles with an honest OFF (Dia, P0)**
- SOURCE: Dia. URL: https://www.diabrowser.com
- WHAT IT DOES: A settings panel rendered in marketing: "Block trackers On / Personalize new chats Off / Memory On / Share content data Off." The OFF states are shown honestly.
- WHY IT WORKS: Toggles are the native UI of control. Showing an OFF builds credibility that no paragraph about "taking privacy seriously" can.
- PING ADAPTATION: A PING authority panel: explicit allow/deny rows (Observe business inbox: ON / Act without approval: OFF / ...), each row naming the real authority mechanism. Show at least one honest OFF. Signature-moment candidate: "Intelligence is not authority."
- RISKS: Every toggle must reflect the real implementation; an ON that is not true is a lie.
- MOBILE: Rows stack naturally.

**H3. "The token never lands on the worker" (Fly.io, P0)**
- SOURCE: Fly.io. URL: https://fly.io/
- WHAT IT DOES: Connectors framed entirely as an authority story: the gateway holds the credential; the worker never sees it. Granular permission levels prove the model is real.
- WHY IT WORKS: A verifiable architectural claim. "The token never lands on the Sprite" teaches the boundary in one line.
- PING ADAPTATION: "Agents are clever. Your keys shouldn't be." The authority boundary visual: credentials live in one place, workers receive scoped expiring grants, every grant is logged as evidence. Pairs with H1.
- RISKS: Low.
- MOBILE: UNKNOWN.

**H4. The autonomy slider (Cursor via Karpathy, P0)**
- SOURCE: Cursor. URL: https://cursor.com/home
- WHAT IT DOES: Authority as a user-controlled gradient: targeted edits on one end, full autonomy on the other. A slider, not a slogan.
- WHY IT WORKS: It names the exact anxiety (how much independence do I give this thing?) and answers with a mechanism.
- PING ADAPTATION: PING's authority gradient: observe-only to suggest to act-with-approval to act-autonomously, the business owner holding the slider. Interactive if genuinely operable and keyboard-accessible; a static stepped diagram is the safe fallback. Use PING's own wording ("authority gradient"), not Karpathy's phrase, on the page.
- RISKS: Medium. An interactive slider must work or it becomes decoration.
- MOBILE: Needs a tap-friendly treatment (stepped buttons, not a drag handle).

**H5. Plain "source of truth" language (Clerk, P0)**
- SOURCE: Clerk. URL: https://clerk.com
- WHAT IT DOES: "The source of truth for your user data." The authority claim in the plainest possible words, with integrations positioned downstream of the authority.
- WHY IT WORKS: Plain authority language is credible because it is checkable.
- PING ADAPTATION: "The source of truth for what your business knows." Then show tools and agents consuming it downstream. Do not let the authority claim hide behind abstract nouns.
- RISKS: Pair with PING's own object; do not copy the sentence.
- MOBILE: N/A.

**H6. Show the gate, not the claim (Daytona, P0)**
- SOURCE: Daytona. URL: https://www.daytona.io
- WHAT IT DOES: Masked secret strings rendered visibly as the design element; the mechanism (substitution at network egress) stated in one line. Redaction itself is the visual proof of a boundary.
- WHY IT WORKS: It makes an invisible boundary visible without exposing anything.
- PING ADAPTATION: A held action awaiting approval, with the approver, the evidence cited, and the grant/deny control visible. "Show the gate, not the claim."
- RISKS: Must be readable and must not resemble real secrets.
- MOBILE: UNKNOWN.

**H7. "Without breaking autonomy" (Daytona, P1)**
- SOURCE: Daytona. URL: https://www.daytona.io
- WHAT IT DOES: Names the oversight-vs-autonomy tension and resolves it with mechanisms (SSH, VS Code, terminal), not reassurance.
- WHY IT WORKS: Acknowledges the fear, then answers it with tools the reader already trusts.
- PING ADAPTATION: "Full visibility into every agent action, without breaking autonomy." PING's mechanisms: replay any decision, inspect its evidence, see who approved it.
- RISKS: Low, rewritten in PING's terms.
- MOBILE: UNKNOWN.

**H8. Publish the constitution (Anthropic, P1)**
- SOURCE: Anthropic. URL: https://www.anthropic.com
- WHAT IT DOES: The governing documents (constitution, scaling policy) surfaced as first-class homepage objects, not buried legal pages.
- WHY IT WORKS: Falsifiable. A published constitution can be checked against behavior; a "trust" slogan cannot.
- PING ADAPTATION: Publish PING's actual authority rules (what agents may/may not do, what requires approval) as a readable, versioned document linked from the authority section. The strongest possible version of "intelligence vs authority": show the rulebook.
- RISKS: PING must write its own constitution; the mechanism is "publish the constraints."
- MOBILE: UNKNOWN.

### I. Evidence, replay, lineage

**I1. Citations as the signature UI (Perplexity, P0)**
- SOURCE: Perplexity. URL: https://www.perplexity.ai
- WHAT IT DOES: Every answer carries in-text citations; hovering previews the source; clicking goes to the source. Verifiability is an interaction, not a claim.
- WHY IT WORKS: It operationalizes honesty. Each citation is a small checkable promise; the accumulation of kept promises is what builds trust.
- PING ADAPTATION: PING's evidence section shows citations-as-UI: an answer with inline evidence markers that expand to source events, timestamps, and lineage. PING's version is stronger (deterministic replay, witness, provenance chain), but the interaction shape (inline markers to preview to full lineage) ports directly. Signature-moment candidate. PING's markers need their own visual identity, and tap-to-expand for touch, not hover-dependent.
- RISKS: Low.
- MOBILE: UNKNOWN (design tap, not hover).

**I2. The annotated event record (Hume, P0)**
- SOURCE: Hume. URL: https://hume.ai/empathic-voice-interface
- WHAT IT DOES: Transcripts where each sentence carries its metadata (timestamp, measured expression). The history is inspectable, not just readable.
- WHY IT WORKS: Annotation is the difference between a log file and institutional memory.
- PING ADAPTATION: A single event rendered as an annotated record: timestamp, source, actor, evidence links, resulting knowledge. The concrete UI pattern for "what happened, why, who initiated it, what evidence exists." Use a realistic illustrative event, labeled as such.
- RISKS: Low.
- MOBILE: Needs stacked or horizontally-scrolling treatment, designed, not shrunk.

**I3. Evidence drilldown as the narrative (Sentry, P1)**
- SOURCE: Sentry. URL: https://www.sentry.io
- WHAT IT DOES: The page story is a drilldown: incident to connected context (logs, commits, traces) to fix. Each layer of context is one more reason to believe.
- WHY IT WORKS: Drilldown mirrors the user's own debugging motion; the product feels inevitable.
- PING ADAPTATION: One PING section structured as an evidence drilldown: a business question, the connected observations behind it, the lineage of each, the action taken, the preserved record. Let the visitor drill from answer to evidence in the visual.
- RISKS: Low.
- MOBILE: UNKNOWN.

**I4. No claim without an adjacent receipt (Webflow/Vercel/PlanetScale, P1)**
- SOURCE: Webflow (https://webflow.com/), Vercel (https://vercel.com/), PlanetScale (https://planetscale.com/)
- WHAT IT DOES: Every claim H2 is immediately followed by proof: a customer metric card, a named proof line, or a quote naming the mechanism. Proof rides shotgun with every claim.
- WHY IT WORKS: Adjacency. Proof arrives while the claim is still in working memory.
- PING ADAPTATION: Make this a layout rule for the whole PING homepage: every capability block gets an adjacent evidence cell (real metric, journal entry, or honest status label). PING cannot invent customer metrics; pair claims with system receipts instead (a replay specimen, a counted metric, a dated journal entry).
- RISKS: High if PING invents metrics. Proof lines must be true and checkable.
- MOBILE: UNKNOWN.

**I5. Hashes and identifiers visible (Replicate/Linear, P2)**
- SOURCE: Replicate (https://replicate.com), Linear (https://linear.app)
- WHAT IT DOES: Full version hashes in marketing code; real-looking operational identifiers (issue IDs, cycle markers, dates) throughout. Hashes are honesty made visible.
- WHY IT WORKS: Concrete identifiers resist the generic-marketing read. Technical audiences read hashes as care.
- PING ADAPTATION: Show real PING identifiers: event IDs, content hashes, replay cursors, truncated with copy affordance. Never fabricate identifiers that imply real records; use real ones or clearly illustrative samples.
- RISKS: Critical if fabricated.
- MOBILE: UNKNOWN.

### J. One authority, many runtimes

**J1. "Your cloud. Our control plane." (Daytona, P0)**
- SOURCE: Daytona. URL: https://www.daytona.io
- WHAT IT DOES: Three short sentences: where execution happens (your cloud), what the vendor provides (the control plane), what that guarantees (no shared compute, no cross-tenant risk).
- WHY IT WORKS: The purest commercial articulation of "one authority, many runtimes." Each sentence answers one question: where, what, so-what.
- PING ADAPTATION: PING's version: "Workers run where your work runs. PING provides the authority plane: every action evidenced, every decision replayable." Same three-beat structure. The "so-what" sentence must be provable, not aspirational.
- RISKS: Medium. Only claim runtimes and guarantees that are real.
- MOBILE: UNKNOWN.

**J2. Substrate sentence plus control sentence (Cloudflare, P0)**
- SOURCE: Cloudflare. URL: http://cloudflare.com
- WHAT IT DOES: Two interlocking claims: architectural ("every service runs on every server in every location") and operational ("managed from one dashboard, billed as one platform"). Separates the where/how from the control.
- WHY IT WORKS: It answers the two questions a heterogeneous-infrastructure buyer always has: "will it run everywhere I need?" and "do I have to manage N things?"
- PING ADAPTATION: PING-native version: "Every capability runs under one authority" plus "One event stream. One evidence record. One replay." Do not copy "one dashboard" language; PING's unity is the authority/event record, not a dashboard. The visual metaphor should be constitutional (gates/checks), not cartographic.
- RISKS: High if runtime claims outrun reality. Each named runtime needs a status label.
- MOBILE: UNKNOWN.

**J3. Two-runtime one-liner (Fly.io, P0)**
- SOURCE: Fly.io. URL: https://fly.io/
- WHAT IT DOES: "Sprites: where your agent runs. Machines: where you run what it builds." Identical sentence frames defining each runtime by its job. Two runtimes feel like one system with two modes.
- WHY IT WORKS: The frame forces the writer to define each runtime by its job, not its specs. Contrast does the teaching.
- PING ADAPTATION: The exact grammar for PING's two hardest distinctions. Multi-runtime: "Workers: where tasks run. The event plane: where truth lands." Applied layer: "PING: where knowledge lives. PING Social: where it works."
- RISKS: Low. The frame is a technique; the nouns are PING's.
- MOBILE: Two-column splits typically stack; verify.

**J4. Same event, N handlers (Weights and Biases, P1)**
- SOURCE: Weights and Biases. URL: https://wandb.ai/site/
- WHAT IT DOES: The same integration pattern shown working across eight frameworks. The repetition is the argument: one platform, every stack.
- WHY IT WORKS: Multi-runtime claims are usually told ("works everywhere"). Showing the same lines working in eight frameworks proves it without adjectives.
- PING ADAPTATION: One canonical event rendered as handled by each PING runtime (JS worker, Python worker, local, cloud). Same event, four handlers. Stronger than any topology diagram for this claim. Only show runtimes that genuinely exist; label the rest as direction.
- RISKS: Medium. Four parallel panels need a clean desktop side-by-side and a deliberate stacked/tabbed mobile treatment.
- MOBILE: UNKNOWN.

**J5. Heterogeneity as architecture (Cursor, P1)**
- SOURCE: Cursor. URL: https://cursor.com/home
- WHAT IT DOES: "Use the best model for every task" reframes many-models from complexity into the selling point: the platform is the stable layer, the models are interchangeable.
- WHY IT WORKS: It reframes a potential weakness as architecture.
- PING ADAPTATION: "Use the best runtime for every job": one authority plane, many runtimes. The reframe is the harvest.
- RISKS: Only name runtimes that exist or are genuinely in development; label the rest as direction.
- MOBILE: UNKNOWN.

### K. Honest development statuses

**K1. Maturity labels on every capability (Supabase, P0)**
- SOURCE: Supabase. URL: https://supabase.com/features
- WHAT IT DOES: Every feature carries a maturity label (GA, Beta, Public Alpha) and a product-family tag. Honesty is structural, not a disclaimer page.
- WHY IT WORKS: Labeling the unfinished parts makes the finished parts more believable.
- PING ADAPTATION: Tag each PING capability with its real maturity (BUILT / ACTIVE DEVELOPMENT / EXPERIMENTAL / DIRECTION). Statuses are PENDING VERIFICATION against the real repo audit; never assert built status without evidence.
- RISKS: Low. Maturity labels are industry convention.
- MOBILE: UNKNOWN.

**K2. Inline beta labels (Fly.io, P2)**
- SOURCE: Fly.io. URL: https://fly.io/
- WHAT IT DOES: Experimental pieces labeled inside the section they belong to ("currently in private beta"), instead of a separate roadmap ghetto.
- WHY IT WORKS: Short sections earn their place by saying one true thing.
- PING ADAPTATION: "Replay is in active development" inside the evidence section, not quarantined. Statuses pending audit verification.
- RISKS: None.
- MOBILE: UNKNOWN.

**K3. Methodology footnotes (Deno, P1)**
- SOURCE: Deno. URL: https://deno.com/
- WHAT IT DOES: Every benchmark carries its method on the page (machine, OS, tool, runs, versions, caveat "results vary by workload").
- WHY IT WORKS: Specificity about method implies confidence in result. The caveat is a trust signal.
- PING ADAPTATION: House rule: any number on the page carries its method on the page (what was counted, over what window, on what system). Small, mono, complete.
- RISKS: None.
- MOBILE: UNKNOWN.

**K4. Dated stat sourcing (Figma, P2)**
- SOURCE: Figma. URL: https://www.figma.com
- WHAT IT DOES: "95% of the Fortune 500 uses Figma. Based on data from March 2025." Four words of provenance convert a marketing number into a citable fact.
- WHY IT WORKS: It signals the company expects to be checked.
- PING ADAPTATION: Every stat carries its as-of date. No undated numbers.
- RISKS: Low.
- MOBILE: UNKNOWN.

**K5. "What is real" cards (Koyeb, P1)**
- SOURCE: Koyeb. URL: https://www.koyeb.com/
- WHAT IT DOES: Exact per-second prices as cards with exact terms. Precision is the credibility.
- WHY IT WORKS: Exact numbers with exact terms leave nothing to be suspicious about.
- PING ADAPTATION: Runtime cards that each carry an exact, checkable status label with one line of evidence. Same card format, same refusal to be vague. Only works if PING labels unfinished work as unfinished.
- RISKS: None if labels are true.
- MOBILE: UNKNOWN.

**K6. Scope at the CTA (Dia, P2)**
- SOURCE: Dia. URL: https://www.diabrowser.com
- WHAT IT DOES: The closing CTA is followed immediately by a scope note ("Currently available on Apple macOS 14+ with M1 chips or later").
- WHY IT WORKS: Scoping at the moment of highest intent prevents disappointment and signals confidence.
- PING ADAPTATION: Every PING CTA carries its honest scope ("Private build, currently onboarding Western Colorado home-service businesses" style). No open-ended "Get started" that leads nowhere.
- RISKS: Low.
- MOBILE: UNKNOWN.

### L. Typography hierarchy

**L1. Three-tier weight system with fixed jobs (Linear, P1)**
- SOURCE: Linear design spec via https://github.com/galyarder-labs/galyarder-framework
- WHAT IT DOES: Three weights with assigned jobs (reading, emphasis/UI, strong emphasis), aggressive negative display tracking, no maximum-bold shouting. Restraint is legible.
- WHY IT WORKS: When the middle weight is the loudest voice most of the time, the top weight actually means something.
- PING ADAPTATION: Assign PING's type weights fixed jobs: one weight for unforgettable moments, one for supporting sections, one for reading text. Never promote a supporting section to moment weight. The type system enforces the editorial hierarchy. Use PING's own typeface; borrow the discipline, not the values.
- RISKS: None.
- MOBILE: Display steps down across breakpoints with tracking adjusted proportionally.

**L2. Luminance ramp, rationed color (Linear, P2)**
- SOURCE: Linear design spec via https://github.com/galyarder-labs/galyarder-framework
- WHAT IT DOES: Four text tiers on near-black by luminance; brand color reserved for CTAs and interactive accents only; explicit rule against decorative brand color.
- WHY IT WORKS: Color rationed to action and status makes interactive elements findable and content calm.
- PING ADAPTATION: Strict luminance ramp for text tiers; PING's accent reserved for CTAs and live-status indicators. Supporting sections drop to muted tiers; moments get full luminance. This is the visual implementation of the weight discipline.
- RISKS: Low if PING keeps its own palette.
- MOBILE: UNKNOWN.

**L3. Monospace in three rationed roles (Pinecone, P1)**
- SOURCE: Pinecone. URL: https://www.pinecone.io/
- WHAT IT DOES: Monospace assigned three jobs and never mixed: action (terminal command), structure (pipeline numbering), evidence (measured values).
- WHY IT WORKS: Restraint. The reader learns the visual grammar: mono means do this, this is the sequence, this is measured.
- PING ADAPTATION: Same three-role rationing: the one real invocation, the loop/authority sequence numbering, measured values only. Everything else stays in display/body faces.
- RISKS: None.
- MOBILE: Monospace blocks need horizontal-scroll or wrap treatment.

**L4. Claim plus mechanism as the standard block (Cursor, P1)**
- SOURCE: Cursor. URL: https://cursor.com/home
- WHAT IT DOES: Each block is a bold claim (3 to 6 words) immediately grounded by a one-sentence mechanism with concrete nouns. Parallel structure makes three ideas feel like one system with three facets.
- WHY IT WORKS: The claim creates the appetite; the mechanism sentence prevents it from floating into marketing.
- PING ADAPTATION: Adopt as PING's standard unit for supporting sections. Never a claim without its mechanism sentence. Pair with LangChain's bold-verb plus italic-mechanism bullets (two reading speeds in one list).
- RISKS: Each PING claim must be true; the mechanism sentence must name real PING concepts.
- MOBILE: UNKNOWN.

**L5. Purpose clause on every section (LangSmith, P1)**
- SOURCE: LangChain. URL: https://www.langchain.com/blog/langsmith-homepage-redesign-and-resource-tags
- WHAT IT DOES: Every area carries a parenthetical purpose clause ("Observability (to identify issues quickly...)"). Every section answers "what is this FOR?" in the same breath as naming itself.
- WHY IT WORKS: It eliminates the most common homepage failure: named sections whose purpose the visitor must infer.
- PING ADAPTATION: Every PING section carries a purpose clause in or under its heading ("Evidence (so every answer can show its work)"). Cheap, high-leverage, and it directly fixes "too many ideas at similar weight" by forcing each section to justify its existence in one clause.
- RISKS: Low.
- MOBILE: UNKNOWN.

**L6. Persistent category eyebrows (Together AI, P2)**
- SOURCE: Together AI. URL: https://www.together.ai
- WHAT IT DOES: Small category labels on every card, consistently styled, creating a taxonomy the reader learns within one screen.
- WHY IT WORKS: Taxonomy reduces cognitive load; the reader places every card within a known frame.
- PING ADAPTATION: 4 to 6 canonical PING eyebrows (Observe, Remember, Connect, Act, Prove, Govern, or Event, Evidence, Replay, Authority), used relentlessly across sections, diagrams, and the journal. Pick PING's terms once, then never deviate.
- RISKS: Low.
- MOBILE: UNKNOWN.

### M. Deliberately transformed mobile compositions

**M1. Separate mobile assets, not scaled crops (Together AI, Koyeb, P1)**
- SOURCE: Together AI (https://www.together.ai), Koyeb (https://www.koyeb.com/)
- WHAT IT DOES: Both ship distinctly named mobile hero/illustration assets. The mobile composition is designed separately from the desktop one.
- WHY IT WORKS: Complex desktop visuals (topology, 3D scenes) rarely survive shrinking. A separate asset lets each composition be designed for its canvas. This is the only concrete evidence found of the exact mechanism the brief asks for.
- PING ADAPTATION: Standing rule: every PING signature visual gets a purpose-built mobile composition. The business graph becomes a tappable node list plus detail cards; the convergence diagram becomes a vertical sources to plane to outcomes flow; the authority toggles become a settings list; the trace becomes a condensed log. Budget mobile compositions as separate design work, not a responsive afterthought. Signature moments only; supporting sections reflow.
- RISKS: Doubles visual production work per diagram; prioritize which diagrams earn a mobile variant.
- MOBILE: This IS the mobile evidence.

**M2. Simplify, do not shrink (Linear spec, P2)**
- SOURCE: Linear design spec via https://github.com/galyarder-labs/galyarder-framework
- WHAT IT DOES: Documented collapsing strategy: hero visuals simplify on mobile (fewer floating UI elements), display type steps down, section spacing drops, cards go 3 to 2 to 1 column.
- WHY IT WORKS: A dense living-system hero becomes noise on a phone. Removing elements preserves the idea while respecting the viewport.
- PING ADAPTATION: Design PING's mobile hero as a simplified version of the desktop living-system visual: one evidence card instead of a feed, one timestamp instead of five. Decide per section what gets removed on mobile, not just resized.
- RISKS: None.
- MOBILE: Documented in a third-party spec; exact live behavior UNKNOWN.

## Convergent cross-site patterns

These appeared independently across multiple groups. Convergence means load-bearing, not stylistic.

1. **Demonstrate first, explain second.** Every live site puts the product's core action (install command, applied demo, interactive estimator, trace) at or near the top. PING's 14 sections currently explain; the harvest says demonstrate first.
2. **No claim without an adjacent receipt.** Claim-proof pairing is the single most repeated trust device (Vercel proof lines, PlanetScale quote rhythm, Fly.io qualified stats, Deno footnotes, Webflow proof cards). Make it a layout rule.
3. **Authority is shown, not said.** Fly.io's gateway-held credentials, Deno's three layers, Dia's toggles, Daytona's redaction, Clerk's plain language, Qdrant's levers: all explain the mechanism instead of asserting "secure."
4. **Motion means system activity.** Vercel's grid, Modal's looping product visuals, Neon's fleet timeline: motion always depicts the system doing something. Decorative animation is absent from the best pages.
5. **Honesty is a visual system, not a disclaimer.** Percentiles, tildes, trade-off matrices, named rosters, maturity labels, dated stats: the credible sites distribute honesty into typography and components.
6. **Parallel structure is the infrastructure copy device.** "Run everywhere / anywhere / at massive scale," "01 WRITE / 02 INDEX / 03 QUERY," "Computer can...": same skeleton, distinct content, one idea per beat.
7. **Progressive disclosure over long pages.** Tabs (Together), ladders (Replicate), lifecycles (LangChain): the page gets shorter by giving the visitor controls, not by deleting content.
8. **Compression beats coverage.** Verb pairs (Notion), four pillars (Mercury), thesis blocks (Retool), persona tabs (Webflow), sentence lists (Raycast): every site says less than PING's current 14 sections.
9. **Checkable over assertive.** Research feeds, version hashes, star counts, real identifiers: the strongest trust signal everywhere was something the visitor could verify.
10. **Two audiences, one hero.** Neon ("apps and agents"), Deno (human install plus agent block), Modal, Cursor: PING serves owners and agents; the hero should address both without splitting the page.

## What PING should borrow conceptually

- The living-system hero (activity feed or trace, caught mid-work)
- The verb-spine page architecture (loop as narrative, identical template per beat)
- The closed-loop three-verb formulation (last verb feeds the first)
- The authority stack (three numbered layers, honest OFF toggles, show the gate)
- The convergence visual grammar (many to one through a governed plane)
- The "your cloud, our control plane" three-beat (where, what, so-what)
- Claim-proof adjacency as a layout rule
- Maturity labels as a structural honesty system
- The purpose clause on every section
- Monospace rationed to action, sequence, evidence
- Weight discipline: moments versus mentions, enforced by the type system
- Deliberate mobile compositions for signature visuals only

## What PING must not copy

- Any site's branding, artwork, illustration style, or visual identity (Deno's anime, Retool's arcs, Neo4j's node-link aesthetic, Linear's issue-card styling, Perplexity's citation brackets)
- Vercel's "where X" campaign frame verbatim; Cloudflare's "Region: Earth" phrasing; Raycast's emotional wording; Mercury's finance couplets; Perplexity's reseller framing
- Testimonials, quotes, logos, or metrics PING has not earned (no logo walls, no invented customer stories, no fabricated numbers)
- Fake live data: no fake tickers, no fake terminal commands, no mock dashboards presented as real, no invented percentiles or hashes
- The giant-stat hero without a real falsifiable number
- Hover-dependent interactions as the only path (design tap equivalents)
- Decorative animation that does not depict system activity

## Honest unknowns

- Exact animation feel, easing, durations, and scroll-trigger behavior: UNKNOWN for all sites (text fetch cannot reveal them).
- Exact responsive behavior and breakpoints: UNKNOWN except Together AI and Koyeb (separate mobile assets confirmed) and the third-party Linear spec (flagged as unverified on the live page).
- No screenshots were captured by any harvest group. All visual descriptions are from page text and structural cues, precise but not pixel-level.
- Several mechanisms rest on indexed or third-party sources rather than direct fetch (Neon, Vercel hero details, Render); provenance is noted per idea in the group files.
- PING-side statuses (BUILT / ACTIVE DEVELOPMENT / EXPERIMENTAL / DIRECTION) are PENDING VERIFICATION against the real /home/nolan/ping repo audit. Nothing in this document asserts a PING capability is built.
