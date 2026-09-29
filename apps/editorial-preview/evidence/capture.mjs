import {chromium} from '/home/nolan/projects/fyd-editorial-template/node_modules/@playwright/test/index.mjs';
import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true});
const sizes=[320,375,390,768,1024,1280,1440,1920];
const report=[];
for(const [name,url] of [['candidate','http://127.0.0.1:3213/'],['current','http://100.79.154.43:3100/'],['donor','http://127.0.0.1:3211/']]){
 for(const width of name==='donor'?[390,1440]:sizes){
  const page=await browser.newPage({viewport:{width,height:width<768?844:1050},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{window.__cls=0;window.__lcp=0;new PerformanceObserver(l=>{for(const x of l.getEntries())if(!x.hadRecentInput)window.__cls+=x.value}).observe({type:'layout-shift',buffered:true});new PerformanceObserver(l=>{for(const x of l.getEntries())window.__lcp=x.startTime}).observe({type:'largest-contentful-paint',buffered:true})});
  try{await page.goto(url,{waitUntil:'networkidle',timeout:45000});await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:`evidence/${name}-${width}.png`,fullPage:true});if([390,1440].includes(width))await page.screenshot({path:`evidence/${name}-${width}-first.png`});
  report.push({name,width,errors,...await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,title:document.title,h1:[...document.querySelectorAll('h1')].map(e=>e.textContent),height:document.body.scrollHeight,cls:window.__cls,lcp:window.__lcp,brokenImages:[...document.images].filter(i=>!i.complete||i.naturalWidth===0).map(i=>i.src),resources:performance.getEntriesByType('resource').map(e=>({name:e.name,bytes:e.transferSize,duration:e.duration}))}))});}catch(e){report.push({name,width,error:e.message})};await page.close();
 }
}
await fs.writeFile('evidence/comparison.json',JSON.stringify(report,null,2));console.log(report.map(({resources,...x})=>x));await browser.close();
