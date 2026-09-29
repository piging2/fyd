---
applyTo: "src/fyd/tenant/**,src/fyd/owner-mode/**,src/fyd/capabilities/**,src/fyd/identity/**,src/fyd/boundary/**,src/app/api/**"
---

# Security-sensitive paths instructions

These paths are security boundaries: tenant isolation, owner identity,
capabilities, and every API route. A mistake here is a trust failure, not
a cosmetic bug.

## Rules

- TenantContext (src/fyd/tenant/tenant-context.ts) is the trust root for
  tenant identity. URLs and request bodies cannot override it. Every
  tenant-owned read/write requires it. Cross-tenant reads or writes fail
  closed and are tested adversarially, including confused-deputy shapes.
- Owner mutations require OwnerContext plus proposal/transition semantics
  with full digest binding: tenant + actor + base digest + patch digest +
  approval + result digest. A changed base yields STALE PROPOSAL, never a
  silent rebase.
- DEMO OWNER MODE is explicitly labeled and tenant-scoped to the two demo
  tenants. One ViewerContext/OwnerContext boundary. No scattered
  demo-owner conditionals anywhere in these paths.
- Secrets: never commit credentials, provider tokens, private keys, or
  customer-private evidence. Scan before every commit. Browser profiles,
  raw authenticated social data, and machine-local artifacts never enter
  the repo.
- Hostile input: treat all user, owner, and third-party content as
  untrusted at the render boundary (XSS). Validate and constrain outbound
  URLs (SSRF). Fail closed: UNKNOWN or an honest error, never a plausible
  fabrication.
- PostgreSQL RLS is DESIGNED/PORTABLE CONTRACT, NOT IMPLEMENTED. Do not
  write code or comments that claim it enforces anything today.

## Agent output contract

Return: QUESTION / EVIDENCE / FILES INSPECTED / CODE/HISTORY HARVESTED /
EXTERNAL MATERIAL REVIEWED / ASSUMPTIONS FALSIFIED / RECOMMENDATION /
ADOPT / ADAPT / REJECT / TEST COMMAND / RISKS / NEXT HIGHEST-LEVERAGE
ACTION. No architecture essays without evidence.
