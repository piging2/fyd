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

describe("executeFollow", () => {
  it("posts follow and returns the server-confirmed state", async () => {
    const fetchMock = mockFetchJson({ ok: true, following: true });
    await expect(executeFollow("happy-place", false)).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/fyd/follow",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ objectId: "happy-place", action: "follow" }),
      }),
    );
  });

  it("posts unfollow when already following", async () => {
    const fetchMock = mockFetchJson({ ok: true, following: false });
    await expect(executeFollow("happy-place", true)).resolves.toBe(false);
    expect(fetchMock.mock.calls[0][1].body).toContain('"action":"unfollow"');
  });

  it("returns the previous state when the server says not-ok", async () => {
    mockFetchJson({ ok: false });
    await expect(executeFollow("happy-place", true)).resolves.toBe(true);
    await expect(executeFollow("happy-place", false)).resolves.toBe(false);
  });

  it("returns the previous state when the network fails", async () => {
    mockFetchReject();
    await expect(executeFollow("happy-place", true)).resolves.toBe(true);
    await expect(executeFollow("happy-place", false)).resolves.toBe(false);
  });
});

describe("executeLike", () => {
  it("posts like and returns the server-confirmed state", async () => {
    const fetchMock = mockFetchJson({ ok: true, liked: true });
    await expect(executeLike("happy-place", false)).resolves.toBe(true);
    expect(fetchMock.mock.calls[0][1].body).toContain('"action":"like"');
  });

  it("posts unlike when already liked, fail-closed otherwise", async () => {
    const fetchMock = mockFetchJson({ ok: true, liked: false });
    await expect(executeLike("happy-place", true)).resolves.toBe(false);
    expect(fetchMock.mock.calls[0][1].body).toContain('"action":"unlike"');

    mockFetchJson({ ok: false });
    await expect(executeLike("happy-place", true)).resolves.toBe(true);

    mockFetchReject();
    await expect(executeLike("happy-place", false)).resolves.toBe(false);
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
