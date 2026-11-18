import {
  MAX_ARCHIVE_QUERY_LENGTH,
  readBlogArchiveState,
  writeBlogArchiveSearch,
} from "../blog-archive-state";

const topics = ["architecture", "distributed-systems"];

describe("recoverable archive filters", () => {
  it("restores an applied search and a published topic", () => {
    expect(readBlogArchiveState("?q=Grid+Problem&topic=architecture", topics))
      .toEqual({ query: "Grid Problem", topic: "architecture" });
  });

  it("decodes Unicode and encoded delimiters without treating them as parameters", () => {
    const query = "Caf\u00e9 + A&B?";
    const search = writeBlogArchiveSearch("", { query, topic: "" }, topics);
    expect(readBlogArchiveState(search, topics)).toEqual({ query, topic: "" });
  });

  it("ignores unknown topics without losing the search", () => {
    expect(readBlogArchiveState("?q=memory&topic=private-topic", topics))
      .toEqual({ query: "memory", topic: "" });
  });

  it("bounds oversized searches without splitting a Unicode character", () => {
    const query = "\u{1f4da}".repeat(MAX_ARCHIVE_QUERY_LENGTH + 1);
    const restored = readBlogArchiveState("?q=" + encodeURIComponent(query), topics);
    expect(Array.from(restored.query)).toHaveLength(MAX_ARCHIVE_QUERY_LENGTH);
    expect(restored.query).toBe("\u{1f4da}".repeat(MAX_ARCHIVE_QUERY_LENGTH));
  });

  it("treats an empty or whitespace-only search as no search", () => {
    expect(readBlogArchiveState("?q=+++", topics)).toEqual({ query: "", topic: "" });
    expect(writeBlogArchiveSearch("?q=old", { query: " \n ", topic: "" }, topics)).toBe("");
  });

  it("preserves unrelated parameters when applying and clearing filters", () => {
    const applied = writeBlogArchiveSearch("?utm_source=reader&ref=a%2Bb", { query: "grid", topic: "architecture" }, topics);
    const params = new URLSearchParams(applied);
    expect(params.get("utm_source")).toBe("reader");
    expect(params.get("ref")).toBe("a+b");
    expect(params.get("q")).toBe("grid");
    expect(params.get("topic")).toBe("architecture");
    const cleared = new URLSearchParams(writeBlogArchiveSearch(applied, { query: "", topic: "" }, topics));
    expect([...cleared.keys()]).toEqual(["utm_source", "ref"]);
  });

  it("normalizes duplicate owned parameters on the next applied state", () => {
    expect(readBlogArchiveState("?q=first&q=second&topic=architecture", topics).query).toBe("first");
    const written = new URLSearchParams(writeBlogArchiveSearch("?q=first&q=second&topic=unknown", { query: "latest", topic: "distributed-systems" }, topics));
    expect(written.getAll("q")).toEqual(["latest"]);
    expect(written.getAll("topic")).toEqual(["distributed-systems"]);
  });

  it("does not serialize a topic outside the published set", () => {
    expect(writeBlogArchiveSearch("?topic=old", { query: " grid ", topic: "unknown" }, topics)).toBe("q=grid");
  });

  it("handles malformed escapes as ordinary search text", () => {
    expect(readBlogArchiveState("?q=%ZZ", topics)).toEqual({ query: "%ZZ", topic: "" });
  });
});
