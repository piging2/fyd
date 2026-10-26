# FYD relay P0 characterization

This directory owns a byte-identical reference of the external relay and an isolated characterization harness. It does not install or replace a service, implement delivery v2, or change application behavior.

The reference must only execute through the test entry point. It otherwise loads real home credentials and sends real mail. Never execute reference/worker-20261025.mjs directly. The hash check intentionally prevents edits to that archived implementation.

## Provenance and scope

- FYD base: 548ce37fdb6882672c65028de315ad52c85c9da5.
- Archived source: /home/nolan/fyd-forms-closure-20261025/worker/worker.mjs, matching /home/nolan/fyd-relay-worker/worker.mjs at capture time.
- SHA-256: ef705ec76e609f6d72ac0707076c124cee5b46d03f3b5e4a5343025abdcadb46.
- reference/package.json and package-lock.json preserve the external worker dependency inventory: Blob 2.8.2 and Nodemailer 6.10.1. They are provenance, not an instruction to install or upgrade dependencies.
- reference/installed-service.txt is an archived release-unit copy, not a service installer or new unit. No service invocation is provided.
- The actual reference bytes execute in child processes. There is no candidate protocol implementation, CAS change, v2 schema, Kit ordering change, optimization, or production rollout in P0.

## Reproduce

Use an isolated checkout with the existing FYD lockfile and its matching dependencies. No dependency upgrade is required. The performed run used existing local dependencies without npm install or npm ci. Runtime was Node 22.23.2 (the external worker's observed on-disk runtime); FYD's Node 24.x release-runtime verification remains pending.

From the repository root:

    node scripts/fyd-relay/p0/discovery.mjs
    npm test -- --runInBand --no-cache --runTestsByPath src/fyd/owner-mode/__tests__/submission-mailer.test.ts src/fyd/owner-mode/__tests__/submission-outbox.test.ts src/fyd/owner-mode/__tests__/submission-capture-race.test.ts src/fyd/owner-mode/__tests__/relay-process.test.ts
    npm run test:relay:p0
    npm run test:relay:p0 -- --case crash-after-acceptance --repetitions 100
    npm run test:relay:p0 -- --repetitions 10

Optional FYD_RELAY_P0_ARTIFACT_DIR chooses an output directory. Otherwise evidence is retained in a fresh OS temporary directory. Each process invocation prints P0_RESULTS with the exact results.json path. discovery.mjs invokes the canonical npm test command with --listTests/--json, asserts no duplicate paths, and requires each of the four P0 suites exactly once. The canonical relay-process Jest suite runs every process scenario once; it does not launch tests against production.

Run with a sanitized environment; the recorded execution used env -i with only PATH and the artifact-directory setting. Test workers receive a separate explicit environment containing synthetic credentials only. No production env file is copied. The archived worker's two credential reads are intercepted by a denial shim without reading the filesystem; homedir resolves to the fixture directory.

## What the harness proves

- simultaneous-claims: both workers read pending before either delivery claim; A claims and reaches accepted-before-persist; B then receives its earlier pending snapshot, claims and delivers; A resumes and overwrites B's newer outcome. Two independent SMTP acceptances are expected.
- accepted-state-write-failure: SMTP accepts once, a deterministic injected error rejects persisting delivered, and the unchanged worker persists failed. A fresh worker after the retry due time accepts the same notification again.
- crash-after-acceptance: real Nodemailer resolves after final SMTP 250; an IPC barrier blocks before the archived caller can persist success. The controller SIGKILLs that process, confirms its signal exit, and starts a different PID against the same store and acceptance ledger after the stale-claim interval. Two acceptances with one recorded attempt are expected.
- crash-before-smtp: kill after claim but before connecting/sending; restart produces one acceptance.
- crash-after-durable-success: kill after a committed delivered record; restart skips it, leaving one acceptance.
- submission-capture-race.test.ts executes both real POST routes, identity helpers, acceptSubmission and persistToOutbox. Only the Blob SDK and secondary local-store calls are replaced. Barriers force both requests to miss replay checks; one durable record wins, yet both callers currently return different candidate receipts with replayed=false. This expected baseline defect is asserted, not fixed.

These are characterization assertions. PASS means the baseline behavior, including defects, was reproduced. It does not mean the relay is safe or that P1/P2 were implemented. Future fixes should add corrected-behavior tests separately and deliberately update route-characterization expectations; never rewrite the archived worker to make characterization pass.

## Isolation and durability model

The controller hosts two independently addressable loopback services which survive child-worker termination. The storage service writes JSON using fsync + rename and an independent operations ledger. The SMTP service writes and fsyncs its acceptance ledger before returning final 250 after complete DATA. It deliberately does not deduplicate Message-ID. A stable synthetic logical-submission fingerprint groups acceptance records; wire hashes and generated Message-IDs remain separately visible.

The worker loader replaces imports only from the hash-pinned reference module: @vercel/blob becomes an HTTP facade to the fixture store; Nodemailer becomes a wrapper around the existing real Nodemailer package and the loopback SMTP endpoint; fs/os become credential-denial/test-home shims. Other imports retain normal resolution. No source text or production module is patched.

The child preload freezes Date at a controlled per-process epoch and pauses only the archived polling timer, leaving SMTP/HTTP timers real. It keeps IPC alive so the child cannot exit merely from an unresolved top-level await. Clock jumps on fresh processes replace real 15-minute waits. Source ownership and expiry rules are unchanged.

Child socket, TLS, DNS and fetch guards admit only explicit fixture ports on numeric loopback addresses. Guard self-checks reject external/unknown destinations, DNS and external fetch before underlying calls. These are accidental-egress defenses for this trusted, pinned reference, not an OS sandbox against hostile code. Each result verifies preload activation, both intercepted credential reads, self-checks, and zero unexpected isolation violations.

The SMTP fixture uses plaintext loopback with ignoreTLS in the test transport wrapper. It exercises SMTP envelope/DATA/final response using real Nodemailer 6.10.1, but does not certify production DNS/TLS/authentication, Yahoo behavior, or inbox receipt. The Blob facade preserves the reference's unconditional overwrites and injected failures; neither the real Blob SDK nor production Blob is executed. These distinctions are recorded in results.json.

## Evidence

Each scenario retains initial/intermediate/final state JSON, state.json, storage-operations.jsonl, smtp-acceptance.jsonl, worker-A/B.json (PID, SIGKILL exit and IPC/security events), and a parent results.json with source/lock hashes and runtime versions. Controller filesystem persistence survives worker death; host power loss, provider durability/consistency, and exactly-once delivery are not certified. Failed development runs remain labeled fail; use the final reviewed successful runs for conclusions.

Only these fixtures start services. The installed external worker and production service files/processes/credentials/Blob state remain untouched. Stop after P0.
