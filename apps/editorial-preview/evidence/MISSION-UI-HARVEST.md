# Mission UI Harvest: Verified Sources & Design Basis

Authoritative inventory of donor and runtime sources referenced by the PING operating environment study (`TenantOS`, `ORCA`, `Mission Control`).

## Verified Commit Baselines

- **Website Repository Revision**: `ed3ff708b87df904068d785c6dee35646daf1b15`
- **Core Runtime Revision**: `546b62d76881bf6b9ddd425aeac40ac7b47ccafe`
- **Candidate Sprint Base**: `9c8c21939eff073a5b87817e4ef1674d9aabebc5`
- **Candidate Head**: `76248bda` on branch `codex/ping-parallel-review`

## Key Runtime Branches Inspected

1. **`feature/orca-autonomy`** (`a2b2e9f1e9d5e8194f321356dbe22b345ee08c09`)
   - ORCA control loop structure: Observe → Plan → Delegate → Verify → Learn.
   - Separation of coordination from dispatch authority and truth assertion.
2. **`orca-finish/state`** (`30a750fadbfc041ee0c4a83ec8f721c134f4f22d`)
   - Verification that worker completion reports are not self-authenticating evidence.
   - Divergence detection and hold semantics when outcomes contradict observed state.
3. **`tenanos-wave-gateway/mc-honesty-082-087`** (`24b915d736b897c19038997ec51ca793589ce38e`)
   - Removal of synthetic readiness, confidence, or fake uptime scores.
   - Legibility of unverified claims and distinction between proposal, approval, and execution.
4. **`feature/approval-effect-identity`**
   - Proof that external effects must track cryptographic idempotency keys.
   - Disconnected worker / timeout handling: holds for human reconciliation, preventing duplicate dispatch.

## Public UI Components & Donors Harvested

1. **`src/app/mission-control/page.tsx` & `src/app/api/mc/_lib/mc-dispatch.ts`**
   - Eight claim states (`unverified`, `pending_approval`, `authorized`, `dispatched`, `in_progress`, `verified_effect`, `reconciliation_hold`, `rejected`).
   - Reverse and forward trace: Reason (observation) → Authority (capability grant) → Execution (work order attempt) → Evidence (witness receipt) → Outcome (recorded state change).
2. **`src/components/architecture/tenant-model.tsx` & `src/app/technology/tenantos/page.tsx`**
   - Tenant boundary isolation: Identity, Knowledge, Permissions, Work, History.
   - Namespace entitlement verification and tenant context binding.
3. **`src/components/architecture/agent-authority.tsx`**
   - Staged SVG path tracing, node elevation, high-contrast accessible states, and reduced-motion fallback.
4. **`CascadeProjects/infra/ui-next/src/components/TimeMachine.tsx` & `KnowledgeGalaxy.tsx`**
   - Bounded timeline scrubbing and step-by-step playback with clean stopping conditions at sequence ends.

## Architectural Boundaries Enforced in Candidate

- **Presentation Purity**: The candidate interface study is purely declarative local presentation (`EditorialWorkspace`). It renders no mock dispatch triggers, no fake live web sockets, no imaginary approvals, and no simulated active missions.
- **Safe Failure Semantics**: Unknown external outcomes explicitly switch to a `Reconciliation Hold` branch rather than implying automatic retry or silent recovery.
- **Authority Distinction**: Selecting a step or scrubbing a tour modifies only view and explanation state, never runtime state.
