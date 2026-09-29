"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { PingWordmark } from "@/components/ping-wordmark";
import { heroStagger, heroStaggerItem, heroCtaReveal } from "@/motion/hero";
import { useMotion } from "@/components/motion-provider";
import { useVisualEffects } from "@/components/effects-provider";

/**
 * HeroIntro — the homepage hero's left column.
 *
 * Choreographs the first viewport with the existing hero motion vocabulary
 * (src/motion/hero.ts): wordmark → tagline → headline → subhead → CTAs →
 * footnote stagger in, instead of one monolithic block reveal.
 * Copy is verbatim from the previous hero; motion only, no visual changes.
 */
export function HeroIntro({ tagline }: { tagline: string }) {
  const { prefersReducedMotion } = useMotion();
  const { resolved } = useVisualEffects();
  const calm = prefersReducedMotion || resolved === "off";

  return (
    <motion.div
      variants={heroStagger}
      initial="hidden"
      animate={calm ? "reducedMotion" : "visible"}
    >
      <motion.div variants={heroStaggerItem} className="mb-6">
        <PingWordmark className="scale-125 origin-left" />
      </motion.div>
      <motion.p
        variants={heroStaggerItem}
        className="text-lg font-medium text-honey"
      >
        {tagline}
      </motion.p>
      <motion.h1
        variants={heroStaggerItem}
        className="mt-4 text-4xl font-bold text-text-on-dark sm:text-5xl lg:text-6xl"
        style={{
          lineHeight: "var(--leading-display)",
          letterSpacing: "var(--tracking-display)",
        }}
      >
        Systems that remember,
        <br />
        agents you can trust
      </motion.h1>
      <motion.p
        variants={heroStaggerItem}
        className="mt-6 max-w-xl text-lg text-text-on-dark/90"
        style={{ lineHeight: "var(--leading-body)" }}
      >
        PING turns information into reliable understanding, understanding into
        useful action, and action into evidence that can be trusted and replayed.
      </motion.p>
      <motion.div
        variants={heroCtaReveal}
        className="mt-8 flex flex-wrap gap-3"
      >
        <Link
          href="#architecture"
          className="inline-flex h-12 items-center justify-center rounded-full bg-honey px-8 font-semibold text-honey-foreground transition-colors hover:bg-honey-hover"
        >
          Explore the architecture
        </Link>
        <Link
          href="#ping-social"
          className="inline-flex h-12 items-center justify-center rounded-full border border-text-on-dark/30 px-8 font-semibold text-text-on-dark transition-colors hover:bg-text-on-dark/10"
        >
          PING Social
        </Link>
      </motion.div>
      <motion.p
        variants={heroStaggerItem}
        className="mt-6 text-sm text-text-on-dark/60"
      >
        This site is a live TenantOS tenant. The runtime behind it is under
        active construction. Maturity labels on this page say what is real.
      </motion.p>
    </motion.div>
  );
}
