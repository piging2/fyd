import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SourceDisclosure } from "@/fyd/components/visitor-experience";
import { GET as getObject } from "@/app/api/fyd/objects/[objectId]/route";
import { GET as getOwner, POST as postOwner } from "@/app/api/fyd/objects/[objectId]/overrides/route";
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getSiteBundle, invalidateSiteBundle } from '@/fyd/media/site-bundle';
import { handleAskRequest } from '@/app/api/fyd/ask/ask-pipeline';
import { NextRequest } from 'next/server';
import * as bundles from '@/fyd/media/site-bundle';
import { compilePublicSite } from '@/app/sites/_shared/spec-pipeline';
import { loadBundleWithOwnerOverlay } from '@/app/api/fyd/ask/ask-pipeline';
import { answerAskFyd } from '@/fyd/ask/visitor-answer';
import { loadObjectViewById } from '@/fyd/object/by-id';
import { applyOwnerCommand } from '@/fyd/object/owner-store';
import { readOverrides } from '@/fyd/object/owner-store';
import * as ownerContexts from '@/app/api/fyd/objects/[objectId]/overrides/owner-context';
import { COPPERSMITH_GRAPH } from '@/fyd/proceduralize/__fixtures__/coppersmith-graph';
import { startStubJournal, type StubJournal } from '@/app/api/fyd/ask/__tests__/stub-journal';
import { verifyPublicProjection } from '@/fyd/sitespec/public-projection';
import { fieldExplanation } from '@/fyd/sitespec/visitor-knowledge';
import { visitorField } from '@/fyd/sitespec/visitor-knowledge';

const siteId = 'coppersmith-plumbing';
const service = COPPERSMITH_GRAPH.objects.find(o => o.title === 'Heating & Cooling')!;
const sourceValue = service.fields.description as string;
const correctedValue = 'We maintain furnaces and heat pumps. Ask us about cooling repairs.';
const refreshedValue = 'We maintain furnaces, cooling units and mini split systems.';
let journal: StubJournal;
const originalOwnerDir = process.env.FYD_OWNER_DIR;
const originalDemoMode = process.env.NEXT_PUBLIC_FYD_DEMO_OWNER_MODE;
beforeEach(async () => {
  process.env.FYD_OWNER_DIR = mkdtempSync(join(tmpdir(), 'fyd-state-'));
  invalidateSiteBundle(siteId);
  process.env.NEXT_PUBLIC_FYD_DEMO_OWNER_MODE = "1";
  journal = await startStubJournal([]);
});
afterEach(async () => { await journal.close();
  if (originalOwnerDir === undefined) delete process.env.FYD_OWNER_DIR; else process.env.FYD_OWNER_DIR = originalOwnerDir;
  if (originalDemoMode === undefined) delete process.env.NEXT_PUBLIC_FYD_DEMO_OWNER_MODE; else process.env.NEXT_PUBLIC_FYD_DEMO_OWNER_MODE = originalDemoMode;
  jest.restoreAllMocks();
});
async function surfaces(expected: string) {
  const page = await compilePublicSite(siteId);
  const bundle = await loadBundleWithOwnerOverlay(siteId);
  expect(bundle).not.toBeNull();
  const object = page.graph.objects.find(o => o.id === service.id)!;
  expect(visitorField(page.graph, object, 'description')).toBe(expected);
  const answer = answerAskFyd({siteId, question:'Can they help with heating?', mode:'visitor'}, {loadBundle:()=>bundle});
  expect(answer.ok).toBe(true);
  if (answer.ok) {
    expect(answer.answer).toContain(expected);
    const citation = answer.citations.find(c => c.id === `${service.id}#description`);
    expect(citation).toBeDefined();
    expect(citation?.source).toBe(expected === correctedValue ? "Owner correction" : "The business website (https://www.coppersmithplumbing.com/)");
  }
  const view = loadObjectViewById(page.projection, siteId, service.id, bundle!.readOwner);
  expect(view?.summary).toBe(expected);
  expect(bundle!.graph.objects.find(o=>o.id===service.id)?.fields.description).toBe(expected);
  const ownerResponse = await getObject(new NextRequest(`http://localhost/api/fyd/objects/${service.id}`),{params:Promise.resolve({objectId:service.id})});
  expect(ownerResponse.status).toBe(200);
  const owner = await ownerResponse.json();
  expect(owner.view.summary).toBe(expected);
  expect(owner.contract.checkpoint).toBe(page.projection.provenance.checkpoint);
  const ownerResponse2 = await getOwner(new NextRequest(`http://localhost/api/fyd/objects/${siteId}/overrides`), {params:Promise.resolve({objectId:siteId})});
  expect(ownerResponse2.status).toBe(200);
  expect((await ownerResponse2.json()).checkpoint).toBe(page.projection.provenance.checkpoint);
  expect(loadObjectViewById(bundle!.ownerProjection!, siteId, service.id, bundle!.readOwner)?.summary).toBe(expected);
  return { page, bundle:bundle!, answer, view };
}
async function approvedOwnerChange(text: string) {
  const call = (body: unknown) => postOwner(new NextRequest(`http://localhost/api/fyd/objects/${siteId}/overrides`, {method:"POST",headers:{"content-type":"application/json",host:"localhost:3106"},body:JSON.stringify(body)}), {params:Promise.resolve({objectId:siteId})});
  const proposalResponse = await call({stage:"propose",text});
  expect(proposalResponse.status).toBe(200);
  const proposal = await proposalResponse.json();
  const approved = await call({stage:"approve",command:proposal.proposal.command,...proposal.digests});
  expect(approved.status).toBe(200);
}
test('owner permission revoked while an approval waits records no correction', async () => {
  const call = (body: unknown) => postOwner(new NextRequest(`http://localhost/api/fyd/objects/${siteId}/overrides`, {method:"POST",headers:{"content-type":"application/json",host:"localhost:3106"},body:JSON.stringify(body)}), {params:Promise.resolve({objectId:siteId})});
  const proposed = await (await call({stage:"propose",text:`Correct description of Heating & Cooling to ${correctedValue}`})).json();
  const originalFactory = ownerContexts.createOwnerContext;
  jest.spyOn(ownerContexts,"createOwnerContext").mockImplementation(async id => {
    const ctx = await originalFactory(id);
    const evaluate = ctx.evaluateCapability.bind(ctx);
    ctx.evaluateCapability = async (...args) => {
      const result = await evaluate(...args);
      process.env.NEXT_PUBLIC_FYD_DEMO_OWNER_MODE = "0";
      return result;
    };
    return ctx;
  });
  const denied = await call({stage:"approve",command:proposed.proposal.command,...proposed.digests});
  expect(denied.status).toBe(403);
  expect(readOverrides(siteId).history).toEqual([]);
});
test('a recorded correction with an unavailable refreshed view returns its receipt honestly', async () => {
  const call = (body: unknown) => postOwner(new NextRequest(`http://localhost/api/fyd/objects/${siteId}/overrides`, {method:"POST",headers:{"content-type":"application/json",host:"localhost:3106"},body:JSON.stringify(body)}), {params:Promise.resolve({objectId:siteId})});
  const proposed = await (await call({stage:"propose",text:`Correct description of Heating & Cooling to ${correctedValue}`})).json();
  const current = await getSiteBundle(siteId);
  jest.spyOn(bundles,"getSiteBundle").mockResolvedValueOnce(current).mockRejectedValueOnce(new Error("journal unavailable after write"));
  const response = await call({stage:"approve",command:proposed.proposal.command,...proposed.digests});
  expect(response.status).toBe(503);
  const result = await response.json();
  expect(result.recorded).toBe(true);
  expect(result.code).toBe("recorded_view_unavailable");
  expect(result.approval.eventId).toBeTruthy();
  expect(readOverrides(siteId).history).toHaveLength(1);
});
test('Coppersmith correction, source refresh and revert agree across page, Ask and owner view', async () => {
  await surfaces(sourceValue);
  await approvedOwnerChange(`Correct description of Heating & Cooling to ${correctedValue}`);
  const corrected = await surfaces(correctedValue);
  expect(corrected.view?.fieldCorrections[0]?.sourceValue).toBe(sourceValue);
  await journal.close();
  journal = await startStubJournal([{id:'state-refresh-1',ts:'2026-10-07T12:00:00Z',siteId,ops:[{op:'set_field',objectId:service.id,field:'description',value:refreshedValue}]}]);
  invalidateSiteBundle(siteId);
  const drifted = await surfaces(correctedValue);
  const explained = fieldExplanation(drifted.page.graph.objects.find(o=>o.id===service.id)!, 'description');
  const why = renderToStaticMarkup(createElement(SourceDisclosure,{object:drifted.page.graph.objects.find(o=>o.id===service.id)!,checkpoint:drifted.page.projection.provenance.checkpoint}));
  expect(why).toContain('FYD uses your correction');
  expect(why).toContain(sourceValue);
  expect(why).toContain(refreshedValue);
  expect(why).not.toContain('From the business website;');
  expect(why).toContain(drifted.page.projection.provenance.checkpoint);
  expect(explained).toMatchObject({origin:'owner',effectiveValue:correctedValue,originalObservation:sourceValue,currentObservation:refreshedValue,sourceDrifted:true});
  if (drifted.answer.ok) expect(drifted.answer.citations.find(c=>c.id===`${service.id}#description`)?.provenance).toEqual(explained);
  expect(drifted.view?.fieldCorrections[0]?.sourceDrifted).toBe(true);
  await approvedOwnerChange("Revert description of Heating & Cooling correction");
  await surfaces(refreshedValue);
});


function askRequest(checkpoint?: string) {
  return new NextRequest(`http://localhost/api/fyd/ask/${siteId}`, {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({question:'Can they help with heating?',mode:'visitor',pageCheckpoint:checkpoint})});
}
test('a failed required conflict read is unavailable, never a zero-conflict projection', async () => {
  const available = await getSiteBundle(siteId, {readConflicts:async()=>[]});
  expect(available?.conflictState).toBe('available');
  const spy = jest.spyOn(bundles,'getSiteBundle').mockImplementation(id => id === siteId
    ? Promise.reject(new Error('conflict read unavailable'))
    : Promise.resolve(null));
  try {
    await expect(compilePublicSite(siteId)).rejects.toThrow('conflict read unavailable');
    const response = await handleAskRequest(siteId, askRequest());
    expect(response.status).toBe(503);
    expect((await response.json()).answer).toBeUndefined();
    const owner = await getOwner(new NextRequest(`http://localhost/api/fyd/objects/${siteId}/overrides`), {params:Promise.resolve({objectId:siteId})});
    expect(owner.status).toBe(503);
  } finally { spy.mockRestore(); }
  await expect(getSiteBundle(siteId,{readConflicts:async()=>{throw new Error('conflict read unavailable');}})).rejects.toThrow();
});
test('an unreadable correction log serves no public value', async () => {
  writeFileSync(join(process.env.FYD_OWNER_DIR!,siteId+'.json'),'{broken');
  invalidateSiteBundle(siteId);
  await expect(compilePublicSite(siteId)).rejects.toThrow();
  const response = await handleAskRequest(siteId,askRequest());
  expect(response.status).toBe(503);
  expect((await response.json()).answer).toBeUndefined();
  const owner = await getOwner(new NextRequest(`http://localhost/api/fyd/objects/${siteId}/overrides`), {params:Promise.resolve({objectId:siteId})});
  expect(owner.status).toBe(503);
});
test('a stale page checkpoint refuses an answer and a refreshed checkpoint agrees', async () => {
  const before = await compilePublicSite(siteId);
  applyOwnerCommand(siteId,{type:'set-service-description',serviceId:service.id,value:correctedValue},[service.id],new Map([[service.id,service.title]]),{sourceValue});
  const response = await handleAskRequest(siteId,askRequest(before.projection.provenance.checkpoint));
  expect(response.status).toBe(409);
  const stale = await response.json();
  expect(stale.error).toBe('Business information changed. Refresh this view.');
  expect(stale.answer).toBeUndefined();
  const after = await compilePublicSite(siteId);
  expect(stale.answerCheckpoint).toBe(after.projection.provenance.checkpoint);
  const fresh = await handleAskRequest(siteId,askRequest(after.projection.provenance.checkpoint));
  expect(fresh.status).toBe(200);
  expect((await fresh.json()).answerCheckpoint).toBe(after.projection.provenance.checkpoint);
});

test('a hidden corrected field and its original observations cannot escape the public projection', async () => {
  applyOwnerCommand(siteId,{type:'set-service-description',serviceId:service.id,value:correctedValue},[service.id],new Map([[service.id,service.title]]),{sourceValue});
  const bundle = (await getSiteBundle(siteId))!;
  const decisions = [{objectId:service.id,field:'description',policy:'hide' as const,decidedBy:'owner' as const,decidedAt:'2026-10-07',source:'owner_override' as const,version:1}];
  const publicView = verifyPublicProjection(bundle.graph,decisions,'anonymous');
  const ownerView = verifyPublicProjection(bundle.graph,decisions,'owner');
  expect(JSON.stringify(publicView.graph)).not.toContain(correctedValue);
  expect(JSON.stringify(publicView.graph.objects.find(o=>o.id===service.id))).not.toContain(sourceValue);
  expect(fieldExplanation(publicView.graph.objects.find(o=>o.id===service.id)!,'description')).toBeNull();
  expect(loadObjectViewById(ownerView,siteId,service.id,bundle.readOwner)?.summary).toBe(correctedValue);
  expect(loadObjectViewById(publicView,siteId,service.id,bundle.readOwner)?.summary).toBe('');
});
test('a disputed description is withheld and conflict changes alter the checkpoint', async () => {
  const conflicts = [{objectId:service.id,field:'description',status:'unresolved' as const,observations:[{value:sourceValue,provenanceKind:'website-ingestion',provenanceRef:'website-ingestion:https://example.com'},{value:'different description',provenanceKind:'website-ingestion',provenanceRef:'website-ingestion:https://example.org'}]}];
  const a = (await getSiteBundle(siteId,{readConflicts:async()=>conflicts}))!;
  const b = (await getSiteBundle(siteId,{readConflicts:async()=>[{...conflicts[0],observations:[...conflicts[0].observations,{value:'third observation',provenanceKind:'website-ingestion',provenanceRef:'https://example.net'}]}]}))!;
  expect(a.graph.objects.find(o=>o.id===service.id)?.description).toBe('');
  expect(a.graph.objects.find(o=>o.id===service.id)?.fields.description).toBeUndefined();
  expect(a.projection?.provenance.checkpoint).not.toBe(b.projection?.provenance.checkpoint);
  expect(a.projection?.graph).toEqual(a.graph);
});
