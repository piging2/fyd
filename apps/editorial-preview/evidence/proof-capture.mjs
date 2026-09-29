import {chromium} from '/home/nolan/projects/fyd-editorial-template/node_modules/@playwright/test/index.mjs';
import fs from 'node:fs/promises';
const b=await chromium.launch();const results=[];
for(const [name,url] of [['happy-place','http://100.79.154.43:3100/sites/happy-place'],['coppersmith','http://100.79.154.43:3100/sites/coppersmith-plumbing'],['donor','http://127.0.0.1:3211/']]){
 for(const width of [390,1440]){const p=await b.newPage({viewport:{width,height:900},reducedMotion:'reduce'});try{const r=await p.goto(url,{waitUntil:'networkidle',timeout:45000});await p.screenshot({path:`evidence/${name}-${width}-first.png`});results.push({name,width,status:r.status(),title:await p.title(),text:(await p.locator('body').innerText()).slice(0,500)});}catch(e){results.push({name,error:e.message})};await p.close();}
}
console.log(results);await fs.writeFile('evidence/proof-captures.json',JSON.stringify(results,null,2));await b.close();
