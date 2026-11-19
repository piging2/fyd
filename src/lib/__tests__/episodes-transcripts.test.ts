/**
 * W-02: the EP4 and EP5 transcript files were placed under
 * src/content/transcripts in 2026-11 on the strength of the loader
 * contract alone; getEpisodeTranscript had no test. This suite pins the
 * contract the placement relied on: the placed files resolve by slug,
 * an unknown slug returns null, and the episode registry still carries
 * no EP4 or EP5 page (a page is built on a published film, so the
 * transcripts render only when those pages exist).
 */
import { getEpisodePage, getEpisodeTranscript } from "../episodes";

describe("episode transcripts (W-02)", () => {
  it("returns the placed EP4 transcript for its slug", () => {
    const t = getEpisodeTranscript("silence-is-not-an-answer");
    expect(t).not.toBeNull();
    expect(t as string).toContain("silence is not an answer");
    expect((t as string).length).toBeGreaterThan(5000);
  });

  it("returns the placed EP5 transcript for its slug", () => {
    const t = getEpisodeTranscript("who-manufactures-now");
    expect(t).not.toBeNull();
    expect(t as string).toContain("Simple question to open the show");
    expect((t as string).length).toBeGreaterThan(5000);
  });

  it("returns null for an unknown slug", () => {
    expect(getEpisodeTranscript("no-such-episode")).toBeNull();
  });

  it("pins the registry contract: transcripts exist for episodes with no page yet", () => {
    expect(getEpisodePage("silence-is-not-an-answer")).toBeNull();
    expect(getEpisodePage("who-manufactures-now")).toBeNull();
  });
});
