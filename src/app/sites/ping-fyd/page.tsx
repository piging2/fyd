/** Existing software/automation dogfood business, through the same public
 * compiler and renderer. No new intake, tenant registry or source authority.
 *
 * PING brand identity (./brand.ts) is applied here, on this page only, over
 * the compiled spec's theme tokens: presentation tokens, never facts.
 * Other sites keep the default theme untouched. */
import { SiteClient } from '../_shared/site-client';
import { compilePublicSite } from '../_shared/spec-pipeline';
import { generateSiteMetadata, resolveSiteDisplayName } from '../_shared/site-metadata';
import { heroMediaFor } from '@/fyd/media/select';
import { applyPingBrand } from './brand';
import { composePingHome } from './compose';
const SITE_ID = 'ping-fyd';
export async function generateMetadata() { return generateSiteMetadata(SITE_ID); }
export default async function PingBusinessPage() {
  const {graph,spec,findings,renderable} = await compilePublicSite(SITE_ID);
  const brandedSpec = applyPingBrand(composePingHome(spec));
  return <main className="min-h-screen"><p className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-900">LOCAL DEMO · PING business record. This sample demonstrates business-provided information, not a verified customer intake.</p><SiteClient graph={graph} spec={brandedSpec} findings={findings} renderable={renderable} siteId={SITE_ID} siteName={resolveSiteDisplayName(graph)} heroMedia={heroMediaFor(SITE_ID,graph,spec.ownerObjectId)}/></main>;
}
