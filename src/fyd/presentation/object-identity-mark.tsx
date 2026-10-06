import * as React from "react";
import { resolveObjectPresentationIdentity, type ObjectIdentityInput, type ObjectPresentationIdentity } from "./identity";

/** The mark keeps its own silhouette. Size changes density, never identity. */
export function ObjectIdentityMark({ object, identity: supplied, size = 40, decorative = false, className = "", style }: {
  object?: ObjectIdentityInput;
  identity?: ObjectPresentationIdentity;
  size?: number;
  decorative?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const identity = supplied ?? (object ? resolveObjectPresentationIdentity(object) : null);
  if (!identity) return null;
  const media = identity.mark ?? identity.image;
  if (media) {
    const mark = identity.mark !== null;
    const srcSet = (media as { srcSet?: string }).srcSet;
    return <img src={media.src} srcSet={srcSet} alt={decorative ? "" : identity.accessibilityLabel}
      aria-hidden={decorative || undefined} width={media.width ?? size} height={media.height ?? size}
      loading="lazy" decoding="async" draggable={false}
      data-fyd-identity-shape={identity.shapeMode}
      className={`shrink-0 ${mark ? "object-contain" : "rounded-lg object-cover"} ${className}`}
      style={{ ...style, width: size, height: size, ...(mark ? { background: "transparent", border: "none", borderRadius: 0, padding: 0, objectFit: "contain", clipPath: "none" } : {}) }} />;
  }
  return <span aria-hidden={decorative || undefined} aria-label={decorative ? undefined : identity.accessibilityLabel}
    role={decorative ? undefined : "img"} data-fyd-identity-shape="initials"
    className={`inline-flex shrink-0 items-center justify-center rounded-lg bg-amber-100 font-bold text-amber-900 ${className}`}
    style={{ width: size, height: size, fontSize: Math.round(size * .32), ...style }}>{identity.fallback}</span>;
}
