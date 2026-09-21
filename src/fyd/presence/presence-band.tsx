/**
 * H3 lane: the shared, data-driven identity band for FYD demo sites.
 *
 * ONE component for every site. It branches ONLY on the derived Presence:
 * a site with hero-role media gets a photographic hero, a site without one
 * gets a typographic brand band. Same code, different data, different look.
 *
 * All imagery is FYD-served (/fyd-media/<digest>/... derivatives produced
 * by the ingest pipeline). No hotlinks: the sourceUrl is provenance, never
 * a link target. Inline styles only, so the band renders identically inside
 * the Next.js page and in static proof captures.
 */

import type { Presence, PresenceImage } from "./derive-presence";

function LogoMark({ logo, businessName }: { logo: PresenceImage; businessName: string }) {
  return (
    <img
      src={logo.url}
      alt={logo.alt}
      width={logo.width}
      height={logo.height}
      style={{
        height: 44,
        width: "auto",
        objectFit: "contain",
        background: "rgba(255,255,255,0.92)",
        borderRadius: 8,
        padding: "4px 10px",
      }}
    />
  );
}

function GalleryStrip({ gallery, accent }: { gallery: PresenceImage[]; accent: string }) {
  if (gallery.length === 0) return null;
  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        overflowX: "auto",
        padding: "14px 0 4px",
        maxWidth: 1100,
        margin: "0 auto",
      }}
    >
      {gallery.map((g) => (
        <img
          key={g.digest}
          src={g.url}
          alt={g.alt}
          loading="lazy"
          decoding="async"
          width={g.width}
          height={g.height}
          style={{
            height: 96,
            width: "auto",
            objectFit: "cover",
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.25)",
            flexShrink: 0,
          }}
        />
      ))}
    </div>
  );
}

export function PresenceBand({ presence }: { presence: Presence }) {
  const t = presence.themeTokens;
  const radiusPx = t.radius === "full" ? 9999 : 8;

  if (presence.hero) {
    const hero = presence.hero;
    return (
      <section
        aria-label={"Identity band for " + presence.businessName}
        style={{ position: "relative", overflow: "hidden", background: "#14121c" }}
      >
        {hero.blurUrl ? (
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage: "url(" + hero.blurUrl + ")",
              backgroundSize: "cover",
              backgroundPosition: "center",
              filter: "blur(18px)",
              transform: "scale(1.1)",
            }}
          />
        ) : null}
        <img
          src={hero.url}
          alt={hero.alt}
          width={hero.width}
          height={hero.height}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
        <div
          style={{
            position: "relative",
            background: "linear-gradient(180deg, rgba(10,8,16,0.72) 0%, rgba(10,8,16,0.55) 55%, rgba(10,8,16,0.85) 100%)",
            padding: "56px 24px 40px",
          }}
        >
          <div style={{ maxWidth: 1100, margin: "0 auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              {presence.logo ? (
                <LogoMark logo={presence.logo} businessName={presence.businessName} />
              ) : null}
              <span
                style={{
                  fontSize: 12,
                  letterSpacing: 2,
                  textTransform: "uppercase",
                  color: t.accent,
                  fontWeight: 700,
                }}
              >
                FYD generated site
              </span>
            </div>
            <h1
              style={{
                margin: "18px 0 0",
                fontFamily: t.fontDisplay,
                fontSize: 52,
                lineHeight: 1.05,
                color: "#FAF8F4",
                fontWeight: 700,
              }}
            >
              {presence.businessName}
            </h1>
            {presence.tagline ? (
              <p style={{ margin: "14px 0 0", fontSize: 18, color: "rgba(250,248,244,0.82)", maxWidth: 640 }}>
                {presence.tagline}
              </p>
            ) : null}
            <div
              style={{
                marginTop: 22,
                height: 4,
                width: 96,
                background: t.accent,
                borderRadius: radiusPx,
              }}
            />
            <GalleryStrip gallery={presence.gallery} accent={t.accent} />
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label={"Identity band for " + presence.businessName}
      style={{ background: "#14121c", padding: "40px 24px 32px" }}
    >
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {presence.logo ? (
            <LogoMark logo={presence.logo} businessName={presence.businessName} />
          ) : null}
          <div>
            <div
              style={{
                fontSize: 12,
                letterSpacing: 2,
                textTransform: "uppercase",
                color: t.accent,
                fontWeight: 700,
              }}
            >
              FYD generated site
            </div>
            <h1
              style={{
                margin: "6px 0 0",
                fontFamily: t.fontDisplay,
                fontSize: 40,
                lineHeight: 1.1,
                color: "#FAF8F4",
                fontWeight: 700,
              }}
            >
              {presence.businessName}
            </h1>
          </div>
        </div>
        {presence.tagline ? (
          <p style={{ margin: "14px 0 0", fontSize: 17, color: "rgba(250,248,244,0.78)", maxWidth: 640 }}>
            {presence.tagline}
          </p>
        ) : null}
        <div
          style={{
            marginTop: 18,
            height: 4,
            width: 96,
            background: t.accent,
            borderRadius: radiusPx,
          }}
        />
      </div>
    </section>
  );
}
