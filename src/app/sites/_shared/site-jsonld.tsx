import { localBusinessJsonLd, renderJsonLdScript } from "@/fyd/proceduralize/render-jsonld";
import type { VerifiedPublicProjection } from "@/fyd/sitespec/public-projection";

export function SiteJsonLd({ projection }: { projection: VerifiedPublicProjection }) {
  const result = localBusinessJsonLd(projection);
  if (!result) return null;
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: renderJsonLdScript(result) }}
    />
  );
}
