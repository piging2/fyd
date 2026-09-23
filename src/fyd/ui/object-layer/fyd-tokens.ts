/**
 * FYD ROYAL MIRROR design tokens (Nolan, 2026-09-22, BINDING).
 *
 * FYD has ONE frozen shape system: CIRCLES + OVALS. This token layer is the
 * single source for the FYD product/intelligence layer's visual grammar:
 * royal purple field, gold edge/detail, mirror/glass depth.
 *
 * Harvested, not invented:
 * - PING brand hues from src/app/globals.css: --color-ping-violet #7C5CD6,
 *   --color-ping-gold #C9A227, --color-ping-ink #1A1729.
 * - The ornate expand frame's gold/purple gradients (already live in the
 *   object layer) are gathered here so no purple/gold hex lives scattered
 *   in components.
 * - Motion durations reference src/motion/motionTokens (normal 0.3s,
 *   fast 0.2s).
 *
 * BUILDER RULE: ROYAL MIRROR is the FYD layer ONLY. Customer-generated
 * sites keep their own brand/typography/tokens. Whenever FYD itself
 * appears (Circle, Ask FYD, concierge, object interaction, proposal,
 * provenance, FYD controls), the circle/oval grammar returns.
 *
 * Shape constitution:
 * - Circle = OBJECT/IDENTITY/POINT (identity, avatar, FYD mark, object
 *   origin, relationship nodes, presence indicators).
 * - Oval = INTERACTION/EXPANSION/CONNECTION (popups, hover surfaces,
 *   Ask FYD, object previews, action groups, CTAs, small information
 *   containers).
 * - Gold = emphasis/edge/highlight/state/detail, NEVER whole solid-gold
 *   surfaces. Purple = the royal field. Mirror/glass = depth.
 *
 * The ten required tokens are scalar, directly usable values:
 * fyd.color.royal, fyd.color.gold, fyd.surface.mirror, fyd.surface.depth,
 * fyd.border.gold, fyd.radius.circle, fyd.radius.oval, fyd.shadow.mirror,
 * fyd.motion.expand, fyd.motion.collapse.
 * Derived tints (royalBright, royalDeep, goldBright, goldSoft) and the
 * ornate-frame gradients live beside them, still centralized here.
 */
export const fyd = {
    color: {
        /** Royal purple field. The FYD brand purple. */
        royal: "#7C5CD6",
        /** Royal purple, brightened for hover/focus emphasis. */
        royalBright: "#8B5CF6",
        /** Royal purple, deepened for the ornate frame edge. */
        royalDeep: "#4C1D95",
        /** Shiny gold. Edge, detail, highlight, emphasis, and state only. */
        gold: "#C9A227",
        /** Gold brightened for sheen and glow accents. */
        goldBright: "#F3C96B",
        /** Quiet gold edge for dark-surface chips and dividers. */
        goldSoft: "rgba(201,162,39,0.4)",
    },
    gradient: {
        /** Shiny gold band (ornate frame). */
        goldBand: "linear-gradient(135deg,#fff3c4,#f3c96b 25%,#b97f1f 50%,#f3c96b 75%,#fff3c4)",
        /** Royal-purple inlay channel (ornate frame). */
        purpleChannel: "linear-gradient(135deg,#a78bfa 0%,#7c3aed 55%,#4c1d95 100%)",
        /** Diamond gem gradient (frame nodes). */
        gem: "linear-gradient(135deg,#e9d5ff 0%,#8b5cf6 55%,#4c1d95 100%)",
        /** Identity fallback (initial avatar field). */
        identity: "linear-gradient(135deg,#312e81,#6d28d9)",
        /** Slow mirror sheen sweeping the rest circle. */
        sheen: "linear-gradient(105deg, transparent 42%, rgba(255,243,196,0.16) 50%, transparent 58%)"
    },
    surface: {
        /** The dark royal depth field FYD surfaces rest on. */
        depth: "#0c0a09",
        /**
         * Mirror wash: a reflective royal/gold gradient laid OVER depth
         * (use as a second background layer above surface.depth).
         */
        mirror: "linear-gradient(135deg, rgba(167,139,250,0.22) 0%, rgba(12,10,9,0) 42%, rgba(243,201,107,0.13) 100%)"
    },
    border: {
        /** Gold edge for expanded/emphasized FYD surfaces. */
        gold: "1px solid rgba(243,201,107,0.55)",
        /** Quiet gold edge for previews. */
        goldSoft: "1px solid rgba(243,201,107,0.28)"
    },
    radius: {
        /** Circles: identity, origin, presence. */
        circle: "50%",
        /** Ovals/capsules: popups, previews, actions, inputs. */
        oval: "999px",
        /**
         * Vertically capable capsule: the brand silhouette for long content
         * (rich card). The internal content region grows responsibly inside
         * it with its own scroll; never clip text into an ellipse.
         */
        capsule: 40
    },
    shadow: {
        /** Mirror depth shadow for floating FYD surfaces. */
        mirror: "0 18px 50px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.14)",
        /** Gold edge glow for the bright hover state. */
        goldBright: "0 0 0 2px rgba(243,201,107,0.9), 0 8px 24px rgba(0,0,0,0.45), 0 0 26px rgba(124,58,237,0.55)",
        /** Quiet identity ring at rest. */
        restRing: "0 0 0 1px rgba(255,255,255,0.20), 0 8px 24px rgba(0,0,0,0.45), 0 0 0 rgba(124,58,237,0)"
    },
    motion: {
        /** Circle -> oval expansion (motionTokens duration.normal). */
        expand: {
            duration: 0.3,
            ease: "easeOut"
        },
        /** Oval -> circle collapse (motionTokens duration.fast). */
        collapse: {
            duration: 0.2,
            ease: "easeIn"
        },
        /** Ornate frame fade-in on expand. */
        ringFade: {
            duration: 0.28,
            ease: "easeOut"
        },
        /** The rest circle's slow mirror sheen: subtle, shifting, not loud. */
        sheen: {
            duration: 5.5,
            repeat: Infinity,
            ease: "easeInOut",
            repeatDelay: 2.5
        }
    }
} as const;
/**
 * FYD mirror card background: the mirror wash laid over the depth field.
 * One background shorthand so components never scatter the layering.
 */
export const fydMirrorCard = "".concat(fyd.surface.mirror, ", ").concat(fyd.surface.depth);
