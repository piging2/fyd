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
  /** Presentation geometry is independent of how the asset was acquired. */
  cutout?: boolean;
  /** Official alternate artwork for dark surfaces; never a CSS recoloring. */
  onDark?: PresentationImage & { srcSet?: string; digest: string; basis: string };
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
 * Reviewed presentation assets, shared by the public slug and
 * exact business object id. Never match descendants or infer identity from a
 * business name: a service/person remains its own object. This replaces the
 * preview pipeline's former private override, not canonical business media.
 */
const PRESENTATION_MARKS: readonly { objectIds: readonly string[]; mark: PresentationMark }[] = [
  {
    objectIds: ["ping-fyd", "ping-fyd-business", "web:business:ping-social"],
    mark: {
      src: "/marks/ping-social-cutout.webp",
      srcSet: "/marks/ping-social-cutout.webp 1x, /marks/ping-social-cutout@2x.webp 2x, /marks/ping-social-cutout@3x.webp 3x",
      width: 96,
      height: 62,
      digest: "bbd0a20fe68015ec5540cc77764ea0043b665ae14cdcc13d2ce30b90065d97b3",
      basis: "Background-extracted existing PING Social logo; receipt /marks/ping-social-cutout.json",
      ownerSupplied: false,
      cutout: true,
    },
  },
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
      cutout: true,
    },
  },
  {
    objectIds: ["coppersmith-plumbing", "website-business-2f1327c09d622175"],
    mark: {
      src: "/marks/coppersmith-logo-on-light.webp",
      srcSet: "/marks/coppersmith-logo-on-light.webp 1x, /marks/coppersmith-logo-on-light@2x.webp 2x, /marks/coppersmith-logo-on-light@3x.webp 3x",
      width: 96,
      height: 63,
      digest: "1815313db84b1de1599a5e16a273284f4f1fcde54815585dce832fcc84ca5477",
      basis: "Authorized harvest of the original Coppersmith site logo; native transparency preserved. Receipt: /marks/coppersmith-logo.harvest.json",
      ownerSupplied: false,
      cutout: true,
      onDark: {
        src: "/marks/coppersmith-logo-on-dark.webp",
        srcSet: "/marks/coppersmith-logo-on-dark.webp 1x, /marks/coppersmith-logo-on-dark@2x.webp 2x, /marks/coppersmith-logo-on-dark@3x.webp 3x",
        digest: "916a3f7b62b1c72761453e666ed7d89c503e6061e5231d67d3ddff4c14a58e13",
        basis: "Authorized harvest of Coppersmith's official white-and-copper logo for dark surfaces. Receipt: /marks/coppersmith-logo.harvest.json",
      },
    },
  },
];

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? "?") + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase();
}

export function resolveObjectPresentationIdentity(input: ObjectIdentityInput, surface: "light" | "dark" = "light"): ObjectPresentationIdentity {
  const configured = PRESENTATION_MARKS.find((entry) => entry.objectIds.includes(input.id))?.mark;
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
    mark: mark ? { ...mark, ...(surface === "dark" ? mark.onDark : {}) } : null,
    image: image ? { ...image } : null,
    fallback: initials(input.name),
    shapeMode: (mark?.cutout ?? mark?.ownerSupplied) ? "cutout" : mark ? "logo" : image ? "image" : "initials",
    displayName: input.name,
    accessibilityLabel: input.name,
  };
}
