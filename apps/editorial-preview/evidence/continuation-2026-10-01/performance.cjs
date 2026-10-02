const {chromium}=require('\\\\wsl.localhost\\Ubuntu\\home\\nolan\\projects\\fyd-editorial-template\\node_modules\\playwright');
const fs=require('fs'),path=require('path');
(async()=>{const browser=await chromium.launch({executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});const results=[];
 for(const [site,url] of [['current','http://100.79.154.43:3100'],['candidate','http://127.0.0.1:3214']])for(const width of [390,1440]){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'}),page=await context.newPage();
  await page.addInitScript(()=>{window.lab={lcp:0,cls:0};new PerformanceObserver(l=>{for(const e of l.getEntries())window.lab.lcp=e.startTime}).observe({type:'largest-contentful-paint',buffered:true});new PerformanceObserver(l=>{for(const e of l.getEntries())if(!e.hadRecentInput)window.lab.cls+=e.value}).observe({type:'layout-shift',buffered:true})});
  const response=await page.goto(url,{waitUntil:'networkidle',timeout:60000});await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(1500);
  const metrics=await page.evaluate(()=>({lcpMs:window.lab.lcp,cls:window.lab.cls,resourceTransferBytes:performance.getEntriesByType('resource').reduce((sum,e)=>sum+e.transferSize,0),resourceCount:performance.getEntriesByType('resource').length,documentTransferBytes:performance.getEntriesByType('navigation')[0].transferSize}));
  await page.screenshot({path:path.join(__dirname,`comparison-${site}-${width}.png`)});results.push({site,width,status:response.status(),...metrics});await context.close();
 }
 fs.writeFileSync(path.join(__dirname,'performance-lab.json'),JSON.stringify({method:'Single fresh browser context per viewport/site. Installed Windows Chrome, local/private network, no CPU or network throttling, reduced motion. One lab sample, not field Core Web Vitals; original and candidate use different local server paths.',results},null,2));console.log(JSON.stringify(results,null,2));await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
