/**
 * SSR markup tests: what the server (and no-JS visitors) see.
 * Run: npx jest --config src/fyd/motion/jest.config.cjs
 */
import * as React from "react";
import { renderToString } from "react-dom/server";
import { Reveal } from "../reveal";
import { BeforeAfter } from "../before-after";
import { CountUp } from "../count-up";

describe("Reveal SSR markup", () => {
  test("renders children with reveal attributes and pending state", () => {
    const html = renderToString(
      <Reveal index={2} variant="clip">
        <p>Gallery image</p>
      </Reveal>
    );
    expect(html).toContain("Gallery image");
    expect(html).toContain("data-fyd-reveal");
    expect(html).toContain('data-fyd-reveal-variant="clip"');
    expect(html).toContain('data-visible="false"');
    // Stagger ladder: index 2 -> 160ms, inline so it works pre-hydration.
    expect(html).toContain("--fyd-reveal-delay:160ms");
  });
  test("index 9 delay is capped at 480ms in SSR markup", () => {
    const html = renderToString(
      <Reveal index={9}>
        <p>Capped</p>
      </Reveal>
    );
    expect(html).toContain("--fyd-reveal-delay:480ms");
  });
});

describe("BeforeAfter SSR markup", () => {
  test("handle carries the full slider ARIA contract", () => {
    const html = renderToString(
      <BeforeAfter
        before={{ src: "b.jpg", alt: "Kitchen before renovation" }}
        after={{ src: "a.jpg", alt: "Kitchen after renovation" }}
      />
    );
    expect(html).toContain('role="slider"');
    expect(html).toContain('aria-valuemin="0"');
    expect(html).toContain('aria-valuemax="100"');
    expect(html).toContain('aria-valuenow="50"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain("Kitchen before renovation");
    expect(html).toContain("Kitchen after renovation");
    expect(html).toContain("Before");
    expect(html).toContain("After");
  });
  test("initialPosition flows into aria-valuenow", () => {
    const html = renderToString(
      <BeforeAfter
        before={{ src: "b.jpg", alt: "b" }}
        after={{ src: "a.jpg", alt: "a" }}
        initialPosition={30}
      />
    );
    expect(html).toContain('aria-valuenow="30"');
  });
});

describe("CountUp SSR markup", () => {
  test("final value is in the DOM as text, even unverified", () => {
    const html = renderToString(<CountUp value={1250} verified label="Projects completed" />);
    expect(html).toContain("1,250");
    expect(html).toContain('aria-label="Projects completed: 1,250"');
    expect(html).toContain('data-verified="true"');
  });
  test("unverified numbers render final text but carry data-verified=false", () => {
    const html = renderToString(<CountUp value={9999} verified={false} />);
    expect(html).toContain("9,999");
    expect(html).toContain('data-verified="false"');
  });
  test("decimals render in the final text", () => {
    const html = renderToString(<CountUp value={4.9} decimals={1} verified />);
    expect(html).toContain("4.9");
  });
});
