import { NextRequest } from "next/server";
import { POST } from "../route";
import { POST as postNested } from "../[siteId]/route";
import { startStubJournal, type StubJournal } from "./stub-journal";

/**
 * Q-P0-06 Mission M: the legacy flat POST /api/fyd/ask no longer adopts a
 * body siteId as the subject tenant ("body is identity" is closed). A
 * request carrying a body siteId 308-redirects to the trusted-path route
 * (nothing is served here); a request with no usable body siteId is
 * refused with a typed 400. Serving behavior is covered through the
 * trusted-path route below.
 */
let journal: StubJournal;
beforeAll(async () => {
  journal = await startStubJournal();
});
afterAll(async () => {
  await journal.close();
});

function postFlat(body: unknown, url = "http://localhost/api/fyd/ask"): Promise<Response> {
  const req = new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return POST(req);
}

function postTrusted(siteId: string, body: unknown): Promise<Response> {
  const req = new NextRequest("http://localhost/api/fyd/ask/" + siteId, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return postNested(req, { params: Promise.resolve({ siteId }) });
}

describe("POST /api/fyd/ask (legacy flat route)", () => {
  test("body siteId is not adopted: 308 redirect to the trusted path, zero objects served", async () => {
    const res = await postFlat({ siteId: "tenant-b-synth", question: "hi", mode: "visitor" });
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("/api/fyd/ask/tenant-b-synth");
    // The redirect carries no body: no answer, no objects, no citations.
    expect(await res.text()).toBe("");
  });

  test("query-string siteId is ignored: no body siteId -> typed 400, no redirect", async () => {
    const res = await postFlat(
      { question: "hi", mode: "visitor" },
      "http://localhost/api/fyd/ask?siteId=happy-place",
    );
    expect(res.status).toBe(400);
    expect(res.headers.get("location")).toBeNull();
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(false);
    expect(body.code).toBe("flat_route_deprecated");
    expect(String(body.trustedRoute)).toContain("/api/fyd/ask/");
  });

  test("missing siteId -> typed 400 flat_route_deprecated", async () => {
    const res = await postFlat({ question: "hi", mode: "visitor" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(false);
    expect(body.code).toBe("flat_route_deprecated");
  });

  test("malformed siteId slug -> 400 invalid_tenant", async () => {
    const res = await postFlat({ siteId: "../../etc", question: "hi" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.code).toBe("invalid_tenant");
  });
});

describe("POST /api/fyd/ask/[siteId] (trusted-path route, unchanged)", () => {
  test("known question -> 200 with contract shape", async () => {
    const res = await postTrusted("happy-place", {
      siteId: "happy-place",
      question: "What is the phone number?",
      mode: "visitor",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.contractVersion).toBe("fyd.ask-response@2");
    expect(typeof body.answer).toBe("string");
    expect(body.refusal).toBe(false);
    expect(body.responseClass).toBe("ANSWER");
    expect(Array.isArray(body.citations)).toBe(true);
    expect(
      (body.citations as { source: string }[])[0].source,
    ).toContain("happy-place-platform.vercel.app");
  });

  test("unknown question -> 200 with refusal", async () => {
    const res = await postTrusted("happy-place", {
      question: "Does this business offer financing?",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.refusal).toBe(true);
    expect(body.responseClass).toBe("DENIAL");
    expect(body.citations).toEqual([]);
  });

  test("body siteId disagreeing with the path tenant -> 400 tenant_mismatch", async () => {
    const res = await postTrusted("happy-place", {
      siteId: "tenant-b-synth",
      question: "hi",
      mode: "visitor",
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.code).toBe("tenant_mismatch");
  });
});
