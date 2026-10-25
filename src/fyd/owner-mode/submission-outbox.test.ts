/**
 * Submission outbox tests (FYD-PIG-RELAY-20261025).
 *
 * The production defect being closed: capture depended on in-request
 * email delivery from Vercel, whose SMTP egress to Yahoo is refused,
 * so durable submissions were lost behind HTTP 500s. These tests
 * prove, at the outbox level, that:
 *   - a submission persists as a durable record BEFORE any delivery,
 *     with persistence and delivery as separate states;
 *   - a duplicate idempotency key replays the stored receipt and can
 *     never create a second record (hence never a second email);
 *   - records are tenant- and environment-scoped by pathname;
 *   - acceptSubmission prefers the outbox when configured and does
 *     NOT attempt in-request SMTP for an outboxed record, while the
 *     legacy store/email policy is unchanged without the outbox.
 */

import {
  acceptSubmission,
  type SubmissionMail,
} from "./submission-mailer";
import {
  findOutboxRecord,
  newsletterOutboxKey,
  outboxPathname,
  persistToOutbox,
  PING_FYD_TENANT_ID,
  type OutboxBlobClient,
  type OutboxRecord,
} from "./submission-outbox";

function memoryClient() {
  const blobs = new Map<string, OutboxRecord>();
  const client: OutboxBlobClient = {
    async head(pathname: string): Promise<boolean> {
      return blobs.has(pathname);
    },
    async getJson(pathname: string): Promise<OutboxRecord | null> {
      return blobs.get(pathname) ?? null;
    },
    async putJson(
      pathname: string,
      record: OutboxRecord,
      opts: { allowOverwrite: boolean },
    ): Promise<void> {
      if (blobs.has(pathname) && !opts.allowOverwrite) {
        throw new Error("blob already exists (simulated)");
      }
      blobs.set(pathname, record);
    },
  };
  return { blobs, client };
}

const RECEIPT = {
  receiptId: "nm-0123456789abcdef0123456789abcdef",
  refId: "nom-0123456789abcdef0123456789abcdef",
  businessName: "Coppersmith Plumbing",
  receivedAt: "2026-10-25T22:30:00.000Z",
};

const MAIL: SubmissionMail = {
  from: "nolan.geske@yahoo.com",
  to: "nolangesk@gmail.com",
  subject: "[PING FYD] New Nomination: Coppersmith Plumbing",
  text: "New Nomination from the PING FYD website.\n",
  replyTo: "customer@example.com",
};

const PROD_ENV = { VERCEL_ENV: "production", BLOB_READ_WRITE_TOKEN: "x" };

describe("outboxPathname", () => {
  it("scopes by environment, tenant, kind and key", () => {
    expect(
      outboxPathname(PING_FYD_TENANT_ID, "nomination", "abc123", PROD_ENV),
    ).toBe("outbox/v1/production/ping-fyd/nomination/abc123.json");
  });

  it("keeps preview records out of the production segment", () => {
    expect(
      outboxPathname(PING_FYD_TENANT_ID, "nomination", "abc123", {
        VERCEL_ENV: "preview",
      }),
    ).toBe("outbox/v1/preview/ping-fyd/nomination/abc123.json");
  });
});

describe("persistToOutbox", () => {
  it("persists a record with delivery pending and persistence separate", async () => {
    const { blobs, client } = memoryClient();
    const result = await persistToOutbox({
      tenantId: PING_FYD_TENANT_ID,
      kind: "nomination",
      key: "dedupe-1",
      receipt: RECEIPT,
      payload: { businessName: "Coppersmith Plumbing" },
      mail: MAIL,
      env: PROD_ENV,
      client,
    });
    expect(result.configured).toBe(true);
    expect(result.persisted).toBe(true);
    expect(result.replayed).toBe(false);
    expect(blobs.size).toBe(1);
    const record = [...blobs.values()][0];
    expect(record.persistence.state).toBe("persisted");
    expect(record.delivery.state).toBe("pending");
    expect(record.delivery.attempts).toBe(0);
    expect(record.delivery.messageId).toBeNull();
    expect(record.mail?.to).toBe("nolangesk@gmail.com");
    expect(record.receipt.receiptId).toBe(RECEIPT.receiptId);
  });

  it("replays a duplicate key: one record, the stored receipt, no overwrite", async () => {
    const { blobs, client } = memoryClient();
    const args = {
      tenantId: PING_FYD_TENANT_ID,
      kind: "nomination" as const,
      key: "dedupe-1",
      receipt: RECEIPT,
      payload: { businessName: "Coppersmith Plumbing" },
      mail: MAIL,
      env: PROD_ENV,
      client,
    };
    await persistToOutbox(args);
    const second = await persistToOutbox({
      ...args,
      receipt: { ...RECEIPT, receiptId: "nm-second-attempt" },
    });
    expect(second.persisted).toBe(true);
    expect(second.replayed).toBe(true);
    expect(second.existing?.receipt.receiptId).toBe(RECEIPT.receiptId);
    expect(blobs.size).toBe(1);
  });

  it("reports unconfigured without a blob token and writes nothing", async () => {
    const result = await persistToOutbox({
      tenantId: PING_FYD_TENANT_ID,
      kind: "nomination",
      key: "dedupe-1",
      receipt: RECEIPT,
      payload: {},
      mail: MAIL,
      env: {},
    });
    expect(result.configured).toBe(false);
    expect(result.persisted).toBe(false);
  });

  it("surfaces a persist failure honestly instead of faking success", async () => {
    const failing: OutboxBlobClient = {
      async head() {
        return false;
      },
      async getJson() {
        return null;
      },
      async putJson() {
        throw new Error("store suspended (simulated)");
      },
    };
    const result = await persistToOutbox({
      tenantId: PING_FYD_TENANT_ID,
      kind: "nomination",
      key: "dedupe-1",
      receipt: RECEIPT,
      payload: {},
      mail: MAIL,
      env: PROD_ENV,
      client: failing,
    });
    expect(result.persisted).toBe(false);
    expect(result.error).toContain("store suspended");
  });
});

describe("findOutboxRecord + newsletter key", () => {
  it("finds the stored record by key and misses cleanly otherwise", async () => {
    const { client } = memoryClient();
    await persistToOutbox({
      tenantId: PING_FYD_TENANT_ID,
      kind: "newsletter-signup",
      key: newsletterOutboxKey("Person@Example.com"),
      receipt: {
        receiptId: "nl-1",
        refId: null,
        businessName: null,
        receivedAt: RECEIPT.receivedAt,
      },
      payload: { email: "person@example.com" },
      mail: MAIL,
      env: PROD_ENV,
      client,
      kitSync: {
        state: "not_configured",
        at: null,
        note: "preserved",
      },
    });
    const found = await findOutboxRecord(
      PING_FYD_TENANT_ID,
      "newsletter-signup",
      newsletterOutboxKey("person@example.com"),
      PROD_ENV,
      client,
    );
    expect(found?.receipt.receiptId).toBe("nl-1");
    expect(found?.kitSync?.state).toBe("not_configured");
    const missing = await findOutboxRecord(
      PING_FYD_TENANT_ID,
      "newsletter-signup",
      newsletterOutboxKey("other@example.com"),
      PROD_ENV,
      client,
    );
    expect(missing).toBeNull();
  });

  it("derives a stable, case-insensitive newsletter key", () => {
    expect(newsletterOutboxKey("A@B.com")).toBe(
      newsletterOutboxKey("a@b.com"),
    );
    expect(newsletterOutboxKey("a@b.com")).not.toBe(
      newsletterOutboxKey("c@b.com"),
    );
  });
});

describe("acceptSubmission relay policy", () => {
  const FIELDS = {
    kind: "nomination" as const,
    headline: "Coppersmith Plumbing",
    fields: [["Business name", "Coppersmith Plumbing"]] as ReadonlyArray<
      readonly [string, string]
    >,
    receiptId: RECEIPT.receiptId,
    receivedAt: RECEIPT.receivedAt,
  };

  it("accepts via the outbox and never attempts in-request SMTP", async () => {
    const sent: SubmissionMail[] = [];
    const outcome = await acceptSubmission({
      ...FIELDS,
      env: {
        FYD_SMTP_USER: "nolan.geske@yahoo.com",
        FYD_SMTP_PASS: "test-app-password-not-a-real-secret",
      },
      transport: async (mail) => {
        sent.push(mail);
        return { id: "should-not-be-used" };
      },
      outbox: async (mail) => {
        expect(mail?.to).toBe("nolangesk@gmail.com");
        expect(mail?.from).toBe("nolan.geske@yahoo.com");
        return { configured: true, persisted: true };
      },
      store: () => {
        throw new Error("EROFS (simulated)");
      },
      log: () => {},
    });
    expect(outcome.accepted).toBe(true);
    expect(outcome.outboxed).toBe(true);
    expect(outcome.emailed).toBe(false);
    expect(sent).toHaveLength(0);
  });

  it("falls back to the legacy email path when the outbox is unconfigured", async () => {
    const sent: SubmissionMail[] = [];
    const outcome = await acceptSubmission({
      ...FIELDS,
      env: {
        FYD_SMTP_USER: "nolan.geske@yahoo.com",
        FYD_SMTP_PASS: "test-app-password-not-a-real-secret",
      },
      transport: async (mail) => {
        sent.push(mail);
        return { id: "test-message-id" };
      },
      outbox: async () => ({ configured: false, persisted: false }),
      log: () => {},
    });
    expect(outcome.accepted).toBe(true);
    expect(outcome.outboxed).toBe(false);
    expect(outcome.emailed).toBe(true);
    expect(sent).toHaveLength(1);
  });

  it("still fails honestly when outbox, store and email all fail", async () => {
    const outcome = await acceptSubmission({
      ...FIELDS,
      env: {
        FYD_SMTP_USER: "nolan.geske@yahoo.com",
        FYD_SMTP_PASS: "test-app-password-not-a-real-secret",
      },
      transport: async () => {
        throw new Error("smtp refused (simulated)");
      },
      outbox: async () => ({ configured: true, persisted: false }),
      store: () => {
        throw new Error("EROFS (simulated)");
      },
      log: () => {},
    });
    expect(outcome.accepted).toBe(false);
    expect(outcome.outboxed).toBe(false);
    expect(outcome.emailed).toBe(false);
  });
});
