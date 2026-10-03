/** Client-safe display identity. No graph, viewer, ownership or evidence writes. */
export interface PresentationImage {
  src: string;
  alt?: string;
  width?: number;
  height?: number;
}

export interface PresentationMark extends PresentationImage {
  digest: string;
  basis: string;
  /** Density descriptors for crisp rendering on high-dpi displays. */
  srcSet?: string;
  /** Asset provenance only. This does not establish a claimed business or viewer ownership. */
  ownerSupplied?: boolean;
}

export interface ObjectIdentityInput {
  id: string;
  name: string;
  media?: readonly (PresentationImage & { role: string; digest?: string; rightsBasis?: string })[];
  logo?: PresentationMark | null;
  image?: PresentationImage | null;
}

export interface ObjectPresentationIdentity {
  mark: PresentationMark | null;
  image: PresentationImage | null;
  fallback: string;
  shapeMode: "cutout" | "logo" | "image" | "initials";
  displayName: string;
  accessibilityLabel: string;
}

/**
 * Existing owner-supplied presentation asset, shared by the public slug and
 * exact business object id. Never match descendants or infer identity from a
 * business name: a service/person remains its own object. This replaces the
 * preview pipeline's former private override, not canonical business media.
 */
const OWNER_MARKS: readonly { objectIds: readonly string[]; mark: PresentationMark }[] = [
  {
    objectIds: ["happy-place", "website-business-6fa5ebd99d72c4cb"],
    mark: {
      src: "/marks/happy-place-tape-measure.webp",
      srcSet: "/marks/happy-place-tape-measure.webp 1x, /marks/happy-place-tape-measure@2x.webp 2x, /marks/happy-place-tape-measure@3x.webp 3x",
      width: 193,
      height: 135,
      digest: "",
      basis: "Owner-supplied logo asset",
      ownerSupplied: true,
    },
  },
];

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? "?") + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase();
}

export function resolveObjectPresentationIdentity(input: ObjectIdentityInput): ObjectPresentationIdentity {
  const configured = OWNER_MARKS.find((entry) => entry.objectIds.includes(input.id))?.mark;
  const mediaLogo = input.media?.find((media) => media.role === "logo");
  const mark = configured ?? input.logo ?? (mediaLogo ? {
    src: mediaLogo.src,
    srcSet: (mediaLogo as { srcSet?: string }).srcSet,
    alt: mediaLogo.alt,
    width: mediaLogo.width,
    height: mediaLogo.height,
    digest: mediaLogo.digest ?? "",
    basis: mediaLogo.rightsBasis ?? "Object logo media",
  } : null);
  const image = input.image ?? input.media?.find((media) => media.role === "hero" || media.role === "gallery") ?? null;
  return {
    mark: mark ? { ...mark } : null,
    image: image ? { ...image } : null,
    fallback: initials(input.name),
    shapeMode: mark?.ownerSupplied ? "cutout" : mark ? "logo" : image ? "image" : "initials",
    displayName: input.name,
    accessibilityLabel: input.name,
  };
}
