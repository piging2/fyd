import {
  syncEstimateSubscriber,
  syncNewsletterSubscriber,
} from "../kit";

describe("Kit synchronization boundary", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.KIT_API_KEY = "test-key";
    process.env.KIT_WEBSITE_SUBSCRIBER_TAG_ID = "101";
    process.env.KIT_HOMEPAGE_SIGNUP_TAG_ID = "102";
    process.env.KIT_ESTIMATE_REQUEST_TAG_ID = "103";
    process.env.KIT_WELCOME_SEQUENCE_ID = "201";
    global.fetch = jest.fn();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  function response(body: unknown, status: number): Response {
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 201 ? "Created" : "OK",
      json: async () => body,
    } as Response;
  }

  it("uses Kit upsert plus idempotent tag and sequence operations", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(response({ subscriber: { id: 7, email_address: "a@example.com", state: "active" } }, 201))
      .mockResolvedValueOnce(response({ subscriber: { id: 7 } }, 201))
      .mockResolvedValueOnce(response({ subscriber: { id: 7 } }, 201))
      .mockResolvedValueOnce(response({ subscriber: { id: 7 } }, 201));

    const result = await syncNewsletterSubscriber({
      email: " A@EXAMPLE.COM ",
      firstName: "A",
      source: "homepage",
    });

    expect(result).toMatchObject({
      success: true,
      created: true,
      tagsApplied: [101, 102],
      sequenceEnrolled: true,
      suppressed: false,
    });
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain("/v4/subscribers");
    expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)).toMatchObject({
      email_address: "a@example.com",
      first_name: "A",
    });
  });

  it("does not tag or enroll a suppressed subscriber", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      response({ subscriber: { id: 8, email_address: "a@example.com", state: "cancelled" } }, 200),
    );

    const result = await syncEstimateSubscriber({ email: "a@example.com" });

    expect(result).toMatchObject({
      success: false,
      suppressed: true,
      failure: "suppressed",
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("fails before creating a subscriber when required Kit configuration is absent", async () => {
    delete process.env.KIT_ESTIMATE_REQUEST_TAG_ID;

    const result = await syncEstimateSubscriber({ email: "a@example.com" });

    expect(result).toMatchObject({
      success: false,
      failure: "validation",
      failedOperation: "tag",
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});