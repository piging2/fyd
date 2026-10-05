import { readFileSync } from "node:fs";
import { buildPortalProjection } from "../pipeline";

jest.mock("node:fs", () => ({ readFileSync: jest.fn() }));
jest.mock("../../object/view", () => ({
  loadCircleProjection: jest.fn(() => ({ id: "test-business", capabilities: [] })),
  listObjectIds: jest.fn(() => ["test-business"]),
}));
jest.mock("../../data/ping-object-source", () => ({
  getVerifiedPublicProjectionSync: jest.fn(() => ({})),
}));
jest.mock("../../presentation/identity", () => ({
  resolveObjectPresentationIdentity: jest.fn(() => ({ mark: null })),
}));

type Variant = { name: string; url: string; bytes: number; width?: number };

function resolve(variants: Variant[]) {
  jest.mocked(readFileSync).mockImplementation((path) => {
    if (String(path).includes("/preview/manifests/")) throw new Error("No preview");
    return JSON.stringify({ media: [{ id: "logo", roles: ["logo"], digest: "original-digest", variants }] });
  });
  return buildPortalProjection("test-business")?.logo;
}

describe("ingested logo display selection", () => {
  test("never selects the Coppersmith 10px blur over its 400px logo", () => {
    const result = resolve([
      { name: "thumbnail", url: "/thumbnail-400w.webp", width: 400, bytes: 16220 },
      { name: "blur", url: "/blur-10w.webp", width: 10, bytes: 174 },
    ]);
    expect(result?.src).toBe("/thumbnail-400w.webp");
    expect(result?.digest).toBe("original-digest");
  });

  test("a blur-only manifest has no usable display logo", () => {
    expect(resolve([{ name: "blur", url: "/blur-10w.webp", width: 10, bytes: 174 }])).toBeNull();
  });

  test("picks the smallest width sufficient for a 72px mark at 3x density", () => {
    expect(resolve([
      { name: "small", url: "/72.webp", width: 72, bytes: 80 },
      { name: "large", url: "/480.webp", width: 480, bytes: 100 },
      { name: "medium", url: "/216.webp", width: 216, bytes: 200 },
    ])?.src).toBe("/216.webp");
  });

  test("uses the largest available width if all variants are below target", () => {
    expect(resolve([
      { name: "small", url: "/72.webp", width: 72, bytes: 200 },
      { name: "large", url: "/180.webp", width: 180, bytes: 100 },
      { name: "unknown", url: "/unknown.webp", bytes: 999 },
    ])?.src).toBe("/180.webp");
  });

  test("equal widths prefer fewer bytes and stable URL ordering", () => {
    const variants = [
      { name: "thumbnail", url: "/z.webp", width: 216, bytes: 200 },
      { name: "thumbnail", url: "/b.webp", width: 216, bytes: 100 },
      { name: "thumbnail", url: "/a.webp", width: 216, bytes: 100 },
    ];
    expect(resolve(variants)?.src).toBe("/a.webp");
    expect(resolve([...variants].reverse())?.src).toBe("/a.webp");
  });

  test("legacy dimensions use a deterministic size fallback without placeholders", () => {
    expect(resolve([
      { name: "thumbnail", url: "/small.webp", bytes: 100 },
      { name: "thumbnail", url: "/large.webp", bytes: 200 },
      { name: "blur", url: "/blur.webp", bytes: 500 },
    ])?.src).toBe("/large.webp");
    expect(resolve([])).toBeNull();
  });
});
