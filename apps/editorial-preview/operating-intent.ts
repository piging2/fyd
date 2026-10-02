import type { EditorialIntent } from "@/fyd/sitespec/types";

/** Proposed presentation, grounded in the source inventory in evidence/MISSION-UI-HARVEST.md.
 * These steps explain the design. They are not mission records or proof of a running tenant.
 */
export const operatingIntent: NonNullable<EditorialIntent["workspace"]> = {
  label: "The operating environment",
  disclosure:
    "Proposed interface · Explore the documented model. These screens show no live missions, approvals, or tenant data.",
  views: [
    {
      id: "tenant",
      label: "TenantOS",
      purpose: "A place for the business",
      accent: "purple",
      title: "One business.\nIts own context.",
      description:
        "An environment for the people, knowledge, and permissions that belong together.",
      source:
        "Design basis: src/components/architecture/tenant-model.tsx; src/app/technology/tenantos/page.tsx; trusted tenant-context and namespace-entitlement implementations. TenantOS is presented as a proposed experience, not a completed product.",
      steps: [
        {
          label: "Identity",
          title: "Know whose business this is.",
          detail:
            "Keep the business, its people, and the agents working for it distinct. Being identified is not the same as being allowed to act.",
          requirement: "Trusted identity must establish the tenant context.",
        },
        {
          label: "Knowledge",
          title: "Context with a source.",
          detail:
            "Bring evidence, relationships, and owner corrections into the business’s understanding. Keep the history behind what is shown.",
          requirement:
            "A projection can display knowledge; it cannot become its authority.",
        },
        {
          label: "Permissions",
          title: "Make the boundary visible.",
          detail:
            "Show what a person or agent may do, for which business, and within what scope. An instruction cannot silently expand that scope.",
          requirement:
            "A capability is explicit, bounded, and subject to revocation.",
        },
        {
          label: "Work",
          title: "Turn intent into bounded work.",
          detail:
            "Connect a business objective to a proposal, its required capabilities, and the evidence needed to judge the result.",
          requirement:
            "Useful work still follows the existing authorization path.",
        },
        {
          label: "History",
          title: "Keep the thread intact.",
          detail:
            "Let the next person understand what changed, why it changed, and which records support the current view.",
          requirement:
            "History is reconstructed from its sources, never invented by this interface.",
        },
      ],
      exception: {
        label: "Scope Revocation",
        title: "Permission revoked during active work.",
        detail:
          "If a tenant admin revokes capability while a work order is in progress, any pending external dispatch is immediately invalidated. Completed steps retain their provenance without granting future rights.",
        requirement:
          "Revocation invalidates subsequent capability checks immediately.",
      },
    },
    {
      id: "coordination",
      label: "ORCA",
      purpose: "Coordinate the work",
      accent: "purple",
      title: "The next step.\nFor a reason.",
      description:
        "A view of how observations can become useful work within existing boundaries.",
      source:
        "Design basis: orca/ORCA-ROLE.md; orca/control-loop/orca_control_loop.js; feature/orca-autonomy a2b2e9f1; orca-finish/state 30a750fa. Coordination is separate from truth, authorization, and execution.",
      steps: [
        {
          label: "Observe",
          title: "Start with what happened.",
          detail:
            "Read the available state and evidence. An observed gap is a reason to investigate, not permission to make a change.",
          requirement:
            "Observation remains separate from the proposed response.",
        },
        {
          label: "Plan",
          title: "Make the work inspectable.",
          detail:
            "Break an objective into bounded tasks, dependencies, and expected evidence. A plan should say what would count as a useful outcome.",
          requirement:
            "Proposed tasks have not yet been authorized or executed.",
        },
        {
          label: "Delegate",
          title: "Use the authority already granted.",
          detail:
            "Request work through existing capability and WorkOrder boundaries. ORCA coordinates the assignment; a worker carries it out.",
          requirement:
            "Selecting a worker never grants the worker new permission.",
        },
        {
          label: "Verify",
          title: "Ask for more than “done.”",
          detail:
            "Keep a worker’s reported result separate from the evidence that supports it. Make missing or contradictory evidence visible.",
          requirement:
            "An unknown external outcome stays on hold until reconciled.",
        },
        {
          label: "Learn",
          title: "Let the outcome inform the next step.",
          detail:
            "Use recorded outcomes to revisit the plan. Close, investigate, or propose the next useful task without manufacturing activity.",
          requirement:
            "Follow-up work goes through the same boundaries as the original work.",
        },
      ],
      exception: {
        label: "Divergence Hold",
        title: "Evidence contradiction halts the loop.",
        detail:
          "When reported worker completion contradicts observed business evidence, ORCA halts further task delegation. The discrepancy is isolated for human inspection rather than manufacturing follow-up activity.",
        requirement:
          "Contradictory evidence stops automatic planning until reconciled.",
      },
    },
    {
      id: "control",
      label: "Mission Control",
      purpose: "Understand what happened",
      accent: "gold",
      title: "Every action.\nAn explanation.",
      description:
        "A proposed inspection surface for the reason, authority, and evidence behind work.",
      source:
        "Design basis: src/app/mission-control/page.tsx; src/app/api/mc/_lib/mc-dispatch.ts; src/app/api/mc/missions/route.ts; Claim8 states; mission/run/attempt/effect/reconciliation fields. UI claims must never exceed backend proof.",
      steps: [
        {
          label: "Reason",
          title: "Why is this work here?",
          detail:
            "Begin with the objective and the observation that prompted it. Keep the proposal attached to its context.",
          requirement:
            "No live objective or observation is loaded in this interface study.",
        },
        {
          label: "Authority",
          title: "Who allowed this exact action?",
          detail:
            "Show the principal, capability, scope, and approval that apply to the proposed change. An altered proposal needs its own authority check.",
          requirement:
            "This preview cannot approve, dispatch, publish, or change a business.",
        },
        {
          label: "Execution",
          title: "An attempt is not an outcome.",
          detail:
            "Keep mission, run, and attempt distinct. A worker disappearing or a lease expiring does not prove that an external effect failed to happen.",
          requirement: "No automatic retry follows an unknown external effect.",
        },
        {
          label: "Evidence",
          title: "Show what supports the claim.",
          detail:
            "Distinguish a reported result from an observed, derived, or proven result. Keep unknown, stale, and conflicting evidence legible.",
          requirement:
            "A green badge cannot substitute for an execution receipt or verification.",
        },
        {
          label: "Outcome",
          title: "Close the loop honestly.",
          detail:
            "Show what changed, what was independently checked, and what still needs reconciliation. Preserve the chain for later inspection.",
          requirement:
            "No completed mission or verified outcome is implied by this walkthrough.",
        },
      ],
      exception: {
        label: "Reconciliation Hold",
        title: "Unknown outcome → hold for reconciliation.",
        detail:
          "A disconnected worker, network partition, or lease expiration does not prove the external action didn't take place. The system enters a persistent hold state, disabling automatic retry until an explicit reconciliation check verifies real-world effect.",
        requirement:
          "Unknown external effect enters reconciliation hold; automatic retry is forbidden.",
      },
    },
  ],
};
