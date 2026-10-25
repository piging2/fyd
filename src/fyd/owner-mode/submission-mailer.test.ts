/**
 * Submission mailer tests (FYD-FORMS-FIX-PREP-20261023).
 *
 * The production defect being closed: on Vercel every form 500'd
 * because the file store write threw. These tests prove, at
 * transport level, that a submission produces a deliverable email
 * payload addressed to nolangesk@gmail.com even when the store
 * throws, and that the acceptance policy never lets a store failure
 * fail a submission the email path carried (or vice versa).
 */

import {
  acceptSubmission,
  buildSubmissionMail,
  submissionMailConfig,
  type SubmissionMail,
} from "./submission-mailer";

const CONFIGURED_ENV = {
  FYD_SMTP_USER: "nolan.geske@yahoo.com",
  FYD_SMTP_PASS: "test-app-password-not-a-real-secret",
};

function captureTransport(sent: SubmissionMail[], fail = false) {
  return async (mail: SubmissionMail) => {
    if (fail) throw new Error("smtp connection refused (test)");
    sent.push(mail);
    return { id: "test-message-id" };
  };
}

const NOMINATION = {
  kind: "nomination" as const,
  headline: "Coppersmith Plumbing",
  fields: [
    ["Business name", "Coppersmith Plumbing"],
    ["Category", "skilled"],
    ["City or service area", "Grand Junction"],
    ["What makes them exceptional", "They answer the phone and show up."],
    ["Nominator name", "A Happy Customer"],
    ["Nominator contact", "customer@example.com"],
    ["Follow-up permission", "yes"],
  ] as ReadonlyArray<readonly [string, string]>,
  receiptId: "nm-0123456789abcdef0123456789abcdef",
  receivedAt: "2026-10-23T22:30:00.000Z",
  replyTo: "customer@example.com",
};

describe("submissionMailConfig", () => {
  it("is unconfigured without a sending credential", () => {
    expect(submissionMailConfig({})).toBeNull();
    expect(submissionMailConfig({ FYD_SMTP_USER: "a@b.c" })).toBeNull();
    expect(submissionMailConfig({ FYD_SMTP_PASS: "x" })).toBeNull();
  });

  it("defaults to Yahoo SMTP and the Gmail retrieval inbox", () => {
    const cfg = submissionMailConfig(CONFIGURED_ENV);
    expect(cfg).not.toBeNull();
    expect(cfg!.host).toBe("smtp.mail.yahoo.com");
    expect(cfg!.port).toBe(465);
    expect(cfg!.from).toBe("nolan.geske@yahoo.com");
    expect(cfg!.to).toBe("nolangesk@gmail.com");
  });

  it("honors explicit env overrides", () => {
    const cfg = submissionMailConfig({
      ...CONFIGURED_ENV,
      FYD_SMTP_HOST: "smtp.example.com",
      FYD_SMTP_PORT: "587",
      FYD_SUBMISSION_EMAIL_TO: "other@example.com",
    });
    expect(cfg!.host).toBe("smtp.example.com");
    expect(cfg!.port).toBe(587);
    expect(cfg!.to).toBe("other@example.com");
  });
});

describe("buildSubmissionMail", () => {
  it("addresses the payload to nolangesk@gmail.com with all fields", () => {
    const cfg = submissionMailConfig(CONFIGURED_ENV)!;
    const mail = buildSubmissionMail(NOMINATION, cfg);
    expect(mail.to).toBe("nolangesk@gmail.com");
    expect(mail.subject).toContain("Nomination");
    expect(mail.subject).toContain("Coppersmith Plumbing");
    expect(mail.text).toContain("Business name: Coppersmith Plumbing");
    expect(mail.text).toContain("customer@example.com");
    expect(mail.text).toContain("Receipt: " + NOMINATION.receiptId);
    expect(mail.replyTo).toBe("customer@example.com");
  });

  it("omits empty fields", () => {
    const cfg = submissionMailConfig(CONFIGURED_ENV)!;
    const mail = buildSubmissionMail(
      { ...NOMINATION, fields: [["A", "1"], ["B", "  "], ["C", ""]] },
      cfg,
    );
    expect(mail.text).toContain("A: 1");
    expect(mail.text).not.toContain("B:");
    expect(mail.text).not.toContain("C:");
  });
});

describe("acceptSubmission", () => {
  it("delivers by email when the file store throws (the Vercel defect)", async () => {
    const sent: SubmissionMail[] = [];
    const outcome = await acceptSubmission({
      ...NOMINATION,
      store: () => {
        throw new Error("EROFS: read-only file system (simulated Vercel)");
      },
      env: CONFIGURED_ENV,
      transport: captureTransport(sent),
      log: () => {},
    });
    expect(outcome.accepted).toBe(true);
    expect(outcome.stored).toBe(false);
    expect(outcome.emailed).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("nolangesk@gmail.com");
  });

  it("accepts via the store when mail is unconfigured (legacy Pig plane)", async () => {
    const outcome = await acceptSubmission({
      ...NOMINATION,
      store: () => {},
      env: {},
      log: () => {},
    });
    expect(outcome).toEqual({
      accepted: true,
      stored: true,
      emailed: false,
      mailConfigured: false,
    });
  });

  it("fails only when BOTH the store and email fail", async () => {
    const sent: SubmissionMail[] = [];
    const outcome = await acceptSubmission({
      ...NOMINATION,
      store: () => {
        throw new Error("EROFS (simulated)");
      },
      env: CONFIGURED_ENV,
      transport: captureTransport(sent, true),
      log: () => {},
    });
    expect(outcome.accepted).toBe(false);
    expect(outcome.emailed).toBe(false);
  });

  it("a mail failure never fails a stored submission", async () => {
    const sent: SubmissionMail[] = [];
    const outcome = await acceptSubmission({
      ...NOMINATION,
      store: () => {},
      env: CONFIGURED_ENV,
      transport: captureTransport(sent, true),
      log: () => {},
    });
    expect(outcome.accepted).toBe(true);
    expect(outcome.stored).toBe(true);
    expect(outcome.emailed).toBe(false);
  });

  it("a store-less form (contact) is accepted on email alone", async () => {
    const sent: SubmissionMail[] = [];
    const outcome = await acceptSubmission({
      kind: "contact",
      headline: "Jane Doe",
      fields: [["Name", "Jane Doe"], ["Message", "Hello there."]],
      receiptId: "ct-0123456789abcdef0123456789abcdef",
      receivedAt: "2026-10-23T22:30:00.000Z",
      env: CONFIGURED_ENV,
      transport: captureTransport(sent),
      log: () => {},
    });
    expect(outcome.accepted).toBe(true);
    expect(sent[0].subject).toContain("Contact message");
  });
});
