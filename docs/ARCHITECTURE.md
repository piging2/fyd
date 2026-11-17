# PING and FYD published site: root architecture

Status of this document: INTENDED as the canonical root document for the
published site, filed in the website lane's records 2026-11-14. Its promotion
into the repository rides the execution window. Every claim inside carries
its state in the standard's vocabulary. Owner: the Website lane, under
Factory Main A.

## Why this system exists

One Next.js application serves both public brands, PingFyd (the product)
and the FYD tenant surfaces, from one repository (piging2/fyd) and one
Vercel project (fyd-product), at the canonical URL pingfyd.com. It exists
so that the product's public claims, the tenant pages, the episode library,
and the signup and contact flows all ship from one tree, one deploy, and
one verification pass. State: DEPLOYED.

## What must always be true

1. Every claim on every page is true and evidenced, including prices
   (the locked tier book), test counts (dated, from a measured run), and
   schema fields (only what the verified media inventory supports).
2. Tenant isolation: a tenant page carries that tenant's facts only.
   Tenant structured data carries no prices, no ratings or review claims,
   and no PING commercial claims (desk scope ruling, 2026-11-13).
   Field-verified on all three tenant pages, 2026-11-14.
3. Capture before acknowledgement: a form submission is acknowledged only
   after it persists (the Blob outbox), and delivery is a separate,
   recorded step. A persist failure is a failure, never a success-shaped
   empty result.
4. One canonical deploy path: the Pig bundler plus the coordinator replay
   script, with the remote tree SHA asserted equal to the source tree SHA.
   No second deploy system.
5. Credentials stay in their property: PingFyd and HPP credentials, stores,
   and accounts are never mixed, in either direction.
6. Brand and character invariants: the brand spelling is PingFyd; the
   mascot is PIGI, exact design unchanged, new settings only.

## Single sources of truth, one per concern

- Media inventory: src/config/media.v1.json, loaded by
  src/lib/authority-loader.ts. The episode library's facts (durations,
  thumbnails, upload dates) live in src/lib/longping-media.ts and are
  published only from there.
- Projects: src/config/projects.v1.json.
- Tenant configuration: src/config/tenant.ping.v1.json with the fallback
  in src/lib/tenant-config.ts; the tenant graph fixture is digest-pinned
  and fails closed on mismatch.
- Products and pricing presentation: src/config/products.ping.v1.json
  through src/lib/products.ts; the amounts themselves are the owner's
  locked book, which this document does not restate.
- Open build record: src/lib/open-data.ts, dated entries only.
- FAQ content: src/config/faq.v1.json through src/lib/faq.ts; the /faq
  page's FAQPage schema is serialized from the same source as the visible
  entries (verified 8 of 8 agreement, 2026-11-14).

## Inputs and outputs

Inputs: the repository tree (the only code input), environment variables
set in the Vercel project (names only are recorded in lane records, never
values), form submissions on the public routes, and the Kit account's
state through its API. Outputs: the deployed site, persisted submission
records in the Blob outbox, Kit subscriber records, and this lane's
receipts (production head, change in plain terms, live verification).

## How it fails, and how it recovers

- Capture plane: the outbox persist is the acknowledged failure point;
  its failure returns capture_failed and no record exists. Root cause of
  the current incident is measured (the production Blob write path fails
  while the token is present); recovery is the owner's store repair,
  after which the charged end-to-end proof settles the claim. State:
  TESTED (failure reproduced live), recovery HELD at the owner act.
- Kit sync: a recorded step after capture; it can fail without failing
  capture. Its welcome-sequence guard defect (an unset value arriving as
  NaN and failing validation the design intended to be optional) is fixed
  in the staged branch commit, state IMPLEMENTED, not yet DEPLOYED.
- Deploy: the replay asserts tree equality and refuses a stale base;
  a failed assertion stops the deploy before Vercel builds.
- Rendering: conditionally rendered content is proven by runtime smoke
  and live reads after deploy, never by build success alone.

## Why it is structured this way

One tree and one deploy because the brands share the tenant machinery,
the media authorities, and the claim discipline; two trees would fork
every invariant above. Config authorities are files, not a database,
because the site's facts change at deploy cadence and must be reviewable
as diffs. The outbox exists because a signup is a promise: it must
survive the request that carried it.

## How we prove it works

The gate set on every change (typecheck, production build, full jest,
em-dash scan, runtime smoke where rendering is conditional), deployment
through the canonical pair with the tree assertion, and live verification
after deploy against pre-registered expectations (the 77-URL perfection
census, last re-verified clean 2026-11-14; per-change destination reads).
A claim without its destination evidence is not made.

## Known divergences from this architecture

Recorded in the lane's first-principles receipt of 2026-11-14: the
effects preference system (stylesheet shipped, provider unmounted), the
capture plane's production state, and the episode schema's completeness
against the platform of record (fix committed, not deployed). Each
carries its state and its settling test there.
