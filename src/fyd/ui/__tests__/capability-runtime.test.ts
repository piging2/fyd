/**
 * CapabilityRuntime tests: detection plus fail-closed executors.
 *
 * The executors are pure HTTP against relative API paths; fetch is mocked
 * here. The dev-server round-trip (Lane A step 4) proves the real wire.
 */
import {
  executeFollow,
  executeLike,
  hasCapability,
  openWebsite,
  submitAsk,
  type CapabilityKind,
} from "@/fyd/capabilities/runtime";
import { setObjectRelationship } from "@/fyd/capabilities/relationship-client";
jest.mock("@/fyd/capabilities/relationship-client", () => ({ setObjectRelationship: jest.fn() }));
import type { PortalProjection } from "@/fyd/preview/types";

function portalWith(kinds: CapabilityKind[]): PortalProjection {
  return {
    circle: { capabilities: kinds.map((kind) => ({ kind })) },
  } as unknown as PortalProjection;
}

function mockFetchJson(payload: unknown): jest.Mock {
  const m = jest.fn().mockResolvedValue({ json: async () => payload });
  (global as { fetch?: unknown }).fetch = m;
  return m;
}

function mockFetchReject(): jest.Mock {
  const m = jest.fn().mockRejectedValue(new Error("network down"));
  (global as { fetch?: unknown }).fetch = m;
  return m;
}

describe("hasCapability", () => {
  it("detects present and absent capabilities", () => {
    const portal = portalWith(["follow", "like"]);
    expect(hasCapability(portal, "follow")).toBe(true);
    expect(hasCapability(portal, "like")).toBe(true);
    expect(hasCapability(portal, "ask")).toBe(false);
    expect(hasCapability(portal, "website")).toBe(false);
  });
});

describe("legacy social executor compatibility", () => {
  test.each([
    ["follow", executeFollow], ["like", executeLike],
  ] as const)("%s delegates explicit state to the private-session transport", async (kind, execute) => {
    const write = jest.mocked(setObjectRelationship);
    write.mockResolvedValue({ ok: true, state: true, scope: "demo-session", createdAt: null, updatedAt: null });
    expect(await execute("happy-place", false)).toBe(true);
    expect(write).toHaveBeenLastCalledWith("happy-place", kind, true);
    write.mockResolvedValue({ ok: true, state: false, scope: "demo-session", createdAt: null, updatedAt: null });
    expect(await execute("happy-place", true)).toBe(false);
    expect(write).toHaveBeenLastCalledWith("happy-place", kind, false);
  });
  test.each([executeFollow, executeLike])("unconfirmed writes keep the previous state", async execute => {
    jest.mocked(setObjectRelationship).mockResolvedValue({ ok: false, code: "NETWORK_UNAVAILABLE", message: "Retry", retryable: true, scope: null });
    expect(await execute("happy-place", true)).toBe(true);
    expect(await execute("happy-place", false)).toBe(false);
  });
});

describe("submitAsk", () => {
  it("posts siteId, question, and visitor mode, returning the answer", async () => {
    const fetchMock = mockFetchJson({ ok: true, answer: "Nine to five.", refusal: false });
    const result = await submitAsk("happy-place", "What are the hours?");
    expect(result).toEqual({ ok: true, answer: "Nine to five.", refusal: false });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/fyd/ask",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          siteId: "happy-place",
          question: "What are the hours?",
          mode: "visitor",
        }),
      }),
    );
  });

  it("surfaces a refusal as ok with refusal true", async () => {
    mockFetchJson({ ok: true, answer: "", refusal: true });
    await expect(submitAsk("happy-place", "Secrets?")).resolves.toEqual({
      ok: true,
      answer: "",
      refusal: true,
    });
  });

  it("returns ok false on transport failure or server not-ok", async () => {
    mockFetchReject();
    await expect(submitAsk("happy-place", "Hi?")).resolves.toEqual({ ok: false });
    mockFetchJson({ ok: false });
    await expect(submitAsk("happy-place", "Hi?")).resolves.toEqual({ ok: false });
  });
});

describe("openWebsite", () => {
  const realWindow = (globalThis as { window?: unknown }).window;

  beforeEach(() => {
    (globalThis as { window?: unknown }).window = { open: jest.fn() };
  });

  afterEach(() => {
    (globalThis as { window?: unknown }).window = realWindow;
  });

  it("opens a safe https href _blank noopener", () => {
    openWebsite("https://example.com/menu");
    expect(
      ((globalThis as { window: { open: jest.Mock } }).window.open as jest.Mock),
    ).toHaveBeenCalledWith("https://example.com/menu", "_blank", "noopener,noreferrer");
  });

  it("refuses javascript:, http:, and data: hrefs", () => {
    openWebsite("javascript:alert(1)");
    openWebsite("http://example.com/");
    openWebsite("data:text/html,hi");
    expect(
      ((globalThis as { window: { open: jest.Mock } }).window.open as jest.Mock),
    ).not.toHaveBeenCalled();
  });
});
