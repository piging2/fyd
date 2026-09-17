---
title: "Building agent execution boundaries"
date: "2026-09-14"
excerpt: "How agents run commands across machine boundaries without corruption, and why capability separation matters more than clever prompting."
tags: ["agents", "infrastructure", "implementation"]
status: "published"
---

Agents act. Acting means crossing boundaries: between machines, between processes, between permission domains. Every crossing is a place where meaning can corrupt, authority can leak, or a clever prompt can substitute for a real guarantee. Execution boundaries are how PING keeps the acting safe.

This post describes two boundaries from real operational use: how commands cross from an agent into a machine, and how capabilities are separated from credentials.

## The quoting problem

An agent needs to run a command on another machine. The naive path: embed the command in an SSH invocation, which embeds it in a remote shell, which may embed it in another shell. Each layer reinterprets quoting, escaping, and special characters. A command that works in testing corrupts in production because one layer saw a dollar sign the author meant literally.

The failure mode is insidious because it is silent. The command runs. It just does not do what was intended. Debugging means reconstructing which layer mangled which character, and the answer changes with the command.

## The stdin boundary

PING's solution is deliberately boring: pass the command as script bytes on standard input, never embedded in another shell's command line.

```
agent -> ssh -> wsl.exe -u nolan -- bash -s < script.sh
```

The script travels as opaque bytes. No shell interprets it in transit. The receiving `bash -s` reads the bytes and executes them exactly once, in exactly one interpretation context. PowerShell never sees the content as a string to re-quote. SSH never parses it as arguments.

The general principle: **every boundary crossing should move data as opaquely as possible and interpret it as late as possible.** Each layer that reinterprets a command is a liability. Boring pipes beat clever quoting.

This pattern also composes with verification. Because the script is a discrete artifact (a file with bytes), it can be logged, reviewed, and replayed exactly. An agent's action becomes an auditable record rather than a transient shell invocation. That feeds directly into continuity: what the agent did is preserved, not just what it said it did.

## Capabilities, not credentials

The second boundary is about authority. The common failure mode: every agent gets its own API key, every deployment gets its own OAuth application, secrets multiply across machines, and eventually nobody can say which credential permits what. Each new secret is a new way to fail and a new thing to rotate during an incident.

PING inverts this. Agents receive **capabilities**, not credential piles:

- **Humans authenticate as themselves**, once, through the platform's native auth. There is one identity per human, not an identity zoo.
- **Agents get repository and deployment capabilities.** An agent that deploys through git plus the hosting platform's native integration (push to preview, verify, merge to production) never needs the platform's password or a personal API token.
- **One OAuth application per platform**, not one per deployment. Deployments are configuration, not new trust roots.
- **Secrets live in exactly one place**, resolved at runtime from the environment that owns them, never copied into worktrees, chat logs, or generated code.

The effect is that the agent's loop, change code, commit, push, verify preview, merge, requires no secret distribution at all. The platform's own audit trail covers the deployment. Fewer secrets, fewer ways to fail, and when something does fail, the blast radius is bounded by the capability, not by whatever the credential happened to unlock.

## Boundaries over prompts

The deeper point: none of this is enforced by asking the model nicely. A system prompt that says "be careful with credentials" is a suggestion. A boundary that never gives the agent the credential is a guarantee.

This is the PING posture toward agents generally. Capability boundaries, explicit permission scopes, reversible-by-default actions, human confirmation for the irreversible: these are structural properties of the system, not behaviors requested of the model. The model can be clever or confused, careful or rushed; the boundaries hold either way.

Intelligence without boundaries is a liability. Boundaries without intelligence are just bureaucracy. The goal is both: agents smart enough to be useful, bounded enough to be trusted.
