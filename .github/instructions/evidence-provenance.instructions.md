---
applyTo: "src/fyd/object/**,src/fyd/media/**,src/fyd/acquisition/**,src/fyd/harvest/**,src/lib/ping/**,src/fyd/refresh/**"
---

# Evidence and provenance instructions

These paths own Layer 1 truth: objects, relationships, evidence, media
provenance, and source refresh. Everything downstream (SiteSpec, render,
Ask FYD) is only as honest as this layer.

## Rules

- Media policy: download + digest + derivative is the architecture; hotlink
  is fallback only. Never make a remote URL the permanent asset identity.
- Every media record preserves: source URL, observation/evidence, when it
  was observed, content digest, dimensions/type, and the bytes used to make
  each derivative. Downloaded bytes are not canonical business truth.
- Rights: use only authorized demo businesses/sources. Record rightsSource
  on every asset. Do not interpret publicly visible media as universally
  authorized for republication.
- Object identity is stable across refresh. Source change flows as
  SOURCE T2 -> OBJECT DIFF -> DEPENDENCY IMPACT -> GENERATED BASE UPDATE ->
  REAPPLY OWNER OVERRIDES -> VALIDATE -> RENDER. Owner corrections are
  first-class evidence, not patches to be overwritten.
- Conflicts and freshness: stale or conflicting evidence is surfaced
  honestly (UNKNOWN or explicit conflict), never silently resolved toward
  the convenient answer.
- Harvest before writing: check src/fyd/harvest/ and existing acquisition
  machinery before adding a new fetcher, parser, or digest path.

## Agent output contract

Return: QUESTION / EVIDENCE / FILES INSPECTED / CODE/HISTORY HARVESTED /
EXTERNAL MATERIAL REVIEWED / ASSUMPTIONS FALSIFIED / RECOMMENDATION /
ADOPT / ADAPT / REJECT / TEST COMMAND / RISKS / NEXT HIGHEST-LEVERAGE
ACTION. No architecture essays without evidence.
