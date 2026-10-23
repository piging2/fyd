"use client";

import dynamic from 'next/dynamic';
import { VisitorExperience } from '@/fyd/components/visitor-experience';
import type { DisplayMedia } from '@/fyd/media/select';
import type { FYDFinding, FYDSiteSpec, ObjectGraph } from '@/fyd/sitespec/types';

// The internal editor is only downloaded on an explicit owner surface.
const SiteEditorClient = dynamic(() => import('./site-editor-client').then(m => m.SiteEditorClient));
interface Props {
  spec: FYDSiteSpec; graph: ObjectGraph; findings: FYDFinding[]; renderable: boolean;
  siteId?: string; heroMedia?: DisplayMedia | null; galleryMedia?: DisplayMedia[] | null;
  siteName: string; ownerConsole?: boolean; projectionCheckpoint?: string;
}
export function SiteClient({ ownerConsole = false, ...props }: Props) {
  if (ownerConsole) return <SiteEditorClient {...props} ownerConsole />;
  if (!props.renderable) return <div className="mx-auto max-w-3xl px-6 py-16"><h1>{props.siteName}</h1><p>This page is temporarily unavailable. Please try again shortly.</p></div>;
  return <VisitorExperience ctx={{spec:props.spec, graph:props.graph, siteId:props.siteId, projectionCheckpoint:props.projectionCheckpoint,
    heroMedia:props.heroMedia, galleryMedia:props.galleryMedia, viewer:{viewerId:null,displayName:null}}}/>;
}

export { provenanceSentence } from "./site-provenance";
