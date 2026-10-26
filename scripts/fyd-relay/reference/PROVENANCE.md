# Immutable external worker reference

Source captured on 2026-10-26 from the retained 2026-10-25 release copy at /home/nolan/fyd-forms-closure-20261025/worker/worker.mjs. Its bytes matched the external on-disk worker at /home/nolan/fyd-relay-worker/worker.mjs.

Expected SHA-256 of worker-20261025.mjs:

    ef705ec76e609f6d72ac0707076c124cee5b46d03f3b5e4a5343025abdcadb46

The P0 entry verifies this hash before executing any reference child. Preserve this file unchanged. Do not run it directly: it contains the original real-credential loading and mail-sending entry point. Use only ../p0/run.mjs, which enforces synthetic dependency substitution and loopback fixtures.

The reference package manifest and lockfile were copied from the external worker at capture time. Locked versions: @vercel/blob 2.8.2 (Apache-2.0), nodemailer 6.10.1 (MIT-0). The FYD root lock remains unchanged at Blob 2.8.0 and Nodemailer 6.10.1. The P0 runtime executes real Nodemailer from FYD's existing dependencies, and substitutes the Blob API with a durable local facade; this is not a real-provider or transitive-SDK test.

installed-service.txt is a release archive of the service definition, not a runnable installation instruction. Neither it nor the reference's dependency files are copied into an installed service or used to perform npm installation by P0.

FYD base commit: 548ce37fdb6882672c65028de315ad52c85c9da5.

Related design: fyd-outbox-smtp-relay-improvement-spec-v1.0, dated 2026-10-26. P0 deliberately reproduces current defects and does not implement the proposed state protocol.
