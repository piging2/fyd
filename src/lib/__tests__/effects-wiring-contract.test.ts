/**
 * Effects wiring contract (Ecosystem Harvest priority 2).
 *
 * The defect this guards: EffectsProvider existed, complete, but nothing
 * mounted it, so the System/Reduced/Off preference contract was inoperative
 * for visitors and the shipped gate CSS in globals.css was inert. These
 * assertions fail if the mount or either consumer wiring is removed.
 */
import { readFileSync } from "fs";
import { join } from "path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("effects preference wiring", () => {
  it("root layout mounts EffectsProvider around MotionProvider", () => {
    const layout = read("src/app/layout.tsx");
    expect(layout).toContain(
      'import { EffectsProvider } from "@/components/effects-provider"',
    );
    const mount = layout.indexOf("<EffectsProvider>");
    const motion = layout.indexOf("<MotionProvider>");
    const motionEnd = layout.indexOf("</MotionProvider>");
    const end = layout.indexOf("</EffectsProvider>");
    expect(mount).toBeGreaterThan(-1);
    expect(mount).toBeLessThan(motion);
    expect(motionEnd).toBeLessThan(end);
  });

  it("MotionProvider derives reduced motion from the resolved preference", () => {
    const src = read("src/components/motion-provider.tsx");
    expect(src).toContain("useVisualEffects()");
    expect(src).toContain('resolved !== "full"');
  });

  it("LenisProvider initializes smooth scroll only at full preference", () => {
    const src = read("src/components/lenis-provider.tsx");
    expect(src).toContain("useVisualEffects()");
    expect(src).toContain('if (resolved !== "full") return;');
    expect(src).toContain("}, [pathname, resolved, preference]);");
  });

  it("root layout applies the stored effects preference before paint", () => {
    const layout = read("src/app/layout.tsx");
    expect(layout).toContain("localStorage.getItem('ping-effects')");
    expect(layout).toContain("effects-' + resolved");
  });

  it("effects toggle cycles through a system stop", () => {
    const src = read("src/components/effects-toggle.tsx");
    expect(src).toContain('"system"');
    expect(src).toContain("EffectsPreference");
  });

  it("site header offers the effects toggle beside the theme toggle", () => {
    const src = read("src/components/site-header.tsx");
    expect(src).toContain(
      'import { EffectsToggle } from "@/components/effects-toggle"',
    );
    expect(src.match(/<EffectsToggle \/>/g)?.length).toBe(2);
  });
});
