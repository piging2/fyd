#!/usr/bin/env npx tsx
/**
 * Diagnostic probe: ONE real federated round trip against a public
 * ActivityPub test instance (default: activitypub.academy, the instance
 * Fedify's own docs designate for protocol debugging).
 *
 * What it does:
 *  1. WebFinger-resolves a public acct: URI on the test instance (read-only).
 *  2. Builds a Follow activity from a synthetic FYD follow intent.
 *  3. Signs the inbox POST with a THROWAWAY in-memory keypair via Fedify.
 *     The key is never persisted and never logged; only digests are logged.
 *  4. POSTs to the remote inbox and logs the typed outcome.
 *
 * The signing actor lives on probe.invalid (RFC 2606, guaranteed
 * unresolvable), so the remote cannot verify the signature and no follow
 * relationship is created, no account is touched, and no human is notified.
 * The expected outcome is a typed rejection; the evidence is the precise
 * cause, which feeds the sprint's ATProto-first pivot consideration.
 *
 * Usage:
 *   AP_PROBE_ACCT=crepels@activitypub.academy \
 *   AP_PROBE_ACTOR=https://probe.invalid/ap/actor/fyd-roundtrip-1 \
 *   npx tsx src/fyd/adapters/activitypub/probe-roundtrip.ts
 */

import { buildFollowActivity } from "./follow";
import { resolveAcct } from "./webfinger";
import { generateThrowawayKey, signActivityRequest } from "./signing";
import { postToInbox } from "./endpoints";
import { ActivityPubAdapterError } from "./types";

const PROBE_ACCT = process.env.AP_PROBE_ACCT ?? "crepels@activitypub.academy";
const PROBE_ACTOR =
  process.env.AP_PROBE_ACTOR ?? "https://probe.invalid/ap/actor/fyd-roundtrip-1";

interface EvidenceStep {
  step: string;
  ok: boolean;
  ms: number;
  detail?: Record<string, unknown>;
}

const evidence: { probe: string; target: string; steps: EvidenceStep[] } = {
  probe: "activitypub-follow-roundtrip",
  target: PROBE_ACCT,
  steps: [],
};

async function step<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    evidence.steps.push({ step: name, ok: true, ms: Date.now() - start });
    return result;
  } catch (error) {
    const err = error as ActivityPubAdapterError;
    evidence.steps.push({
      step: name,
      ok: false,
      ms: Date.now() - start,
      detail: {
        kind: err instanceof ActivityPubAdapterError ? err.kind : "unknown",
        message: err instanceof Error ? err.message : String(error),
        status: err instanceof ActivityPubAdapterError ? err.status : undefined,
        bodyExcerpt:
          err instanceof ActivityPubAdapterError ? err.detail?.slice(0, 300) : undefined,
      },
    });
    throw error;
  }
}

async function main(): Promise<void> {
  const remote = await step("webfinger+actor", () => resolveAcct(`acct:${PROBE_ACCT}`));
  const last = evidence.steps[evidence.steps.length - 1];
  if (last) {
    last.detail = { actorUri: remote.actorUri, inboxUri: remote.inboxUri };
  }

  const activity = buildFollowActivity({
    intent: { kind: "follow", target: { kind: "identity", identityId: "fyd:probe-target" } },
    localActorUri: PROBE_ACTOR,
    remote,
  });
  evidence.steps.push({
    step: "build-follow",
    ok: true,
    ms: 0,
    detail: { id: activity.id, type: activity.type, actor: activity.actor, object: activity.object },
  });

  const key = await step("keygen", () => generateThrowawayKey(`${PROBE_ACTOR}#main-key`));

  const signed = await step("sign", () =>
    signActivityRequest({ url: remote.inboxUri, activity, key }),
  );
  const signedStep = evidence.steps[evidence.steps.length - 1];
  if (signedStep) {
    // Header NAMES only; values (the signature itself) are never logged.
    signedStep.detail = {
      method: signed.method,
      urlHost: new URL(signed.url).host,
      headerNames: [...signed.headers.keys()].sort(),
    };
  }

  await step("post-inbox", () =>
    postToInbox({ inboxUrl: remote.inboxUri, activity, key }),
  );
}

main()
  .then(() => {
    console.log(JSON.stringify(evidence, null, 2));
  })
  .catch((error) => {
    console.log(JSON.stringify(evidence, null, 2));
    const err = error as ActivityPubAdapterError;
    console.error(
      `PROBE RESULT: ${err instanceof ActivityPubAdapterError ? err.kind : "unknown"}: ` +
        (err instanceof Error ? err.message : String(error)),
    );
    process.exit(2);
  });
