import { NextRequest } from "next/server";
import { POST } from "../route";
import { startStubJournal, type StubJournal } from "./stub-journal";

let journal: StubJournal;
beforeAll(async () => {
  journal = await startStubJournal();
});
afterAll(async () => {
  await journal.close();
});

async function post(body: unknown): Promise<{ status: number; json: any }> {
  const req = new NextRequest("http://localhost/api/fyd/ask", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const res = await POST(req);
  return { status: res.status, json: await res.json() };
}

describe("POST /api/fyd/ask", () => {
  test("unknown site -> 404", async () => {
    const r = await post({ siteId: "nope", question: "hi", mode: "visitor" });
    expect(r.status).toBe(404);
    expect(r.json.ok).toBe(false);
  });
  test("empty question -> 400", async () => {
    const r = await post({ siteId: "happy-place", question: "  ", mode: "visitor" });
    expect(r.status).toBe(400);
  });
  test("bad mode -> 400", async () => {
    const r = await post({ siteId: "happy-place", question: "hi", mode: "admin" });
    expect(r.status).toBe(400);
  });
  test("known question -> 200 with contract shape", async () => {
    const r = await post({
      siteId: "happy-place",
      question: "What is the phone number?",
      mode: "visitor",
    });
    expect(r.status).toBe(200);
    expect(r.json.ok).toBe(true);
    expect(r.json.contractVersion).toBe("fyd.ask-response@1");
    expect(typeof r.json.answer).toBe("string");
    expect(r.json.refusal).toBe(false);
    expect(Array.isArray(r.json.citations)).toBe(true);
    expect(r.json.citations[0].source).toContain("happy-place-platform.vercel.app");
  });
  test("unknown question -> 200 with refusal", async () => {
    const r = await post({
      siteId: "happy-place",
      question: "Does this business offer financing?",
    });
    expect(r.status).toBe(200);
    expect(r.json.ok).toBe(true);
    expect(r.json.refusal).toBe(true);
    expect(r.json.citations).toEqual([]);
  });
});
