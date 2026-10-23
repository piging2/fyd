import { createServer, type Server } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { POST } from '@/app/api/fyd/customize/route';
import { newRequestId } from '../write-boundary';
jest.mock('@/fyd/projection/regen-trigger',()=>({regenerateSiteProjection:jest.fn(async()=>({ok:true,verified:true,latencyMs:0}))}));
const saved = {...process.env};
let server: Server;
let posts: number;
let revoke: boolean;
beforeEach(async () => {
  posts=0; revoke=false;
  process.env.NEXT_PUBLIC_FYD_DEMO_OWNER_MODE='1';
  process.env.FYD_WRITE_BOUNDARY_STORE=mkdtempSync(join(tmpdir(),'fyd-permission-'));
  server=createServer((req,res)=>{
    if(req.method==='GET') {
      if(revoke) process.env.NEXT_PUBLIC_FYD_DEMO_OWNER_MODE='0';
      res.setHeader('content-type','application/json');res.end(JSON.stringify({journal:'fyd-demo-journal@permission-test'}));
    } else { posts++;res.setHeader('content-type','application/json');res.end(JSON.stringify({event_id:'permission-test-event'})); }
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  process.env.FYD_CUSTOMIZE_GATEWAY_URL=`http://127.0.0.1:${(server.address() as AddressInfo).port}/events`;
});
afterEach(async () => {
  await new Promise<void>(resolve=>server.close(()=>resolve()));
  for(const key of ['NEXT_PUBLIC_FYD_DEMO_OWNER_MODE','FYD_WRITE_BOUNDARY_STORE','FYD_CUSTOMIZE_GATEWAY_URL']) {
    if(saved[key]===undefined) delete process.env[key]; else process.env[key]=saved[key];
  }
});
function request() {return new Request('http://localhost/api/fyd/customize',{method:'POST',headers:{host:'localhost','content-type':'application/json'},body:JSON.stringify({action:'clear',siteId:'coppersmith-plumbing',intentId:'permission-test',request_id:newRequestId()})});}
test('real FYD route: authorize, queue, revoke, dispatch -> zero external mutations',async()=>{
  revoke=true;
  const response=await POST(request());
  expect(response.status).toBe(403);
  expect(posts).toBe(0);
});
test('real FYD route: current authorization stays valid -> one external mutation',async()=>{
  const response=await POST(request());
  expect(response.status).toBe(200);
  expect(posts).toBe(1);
});
