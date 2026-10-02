const {chromium}=require('\\\\wsl.localhost\\Ubuntu\\home\\nolan\\projects\\fyd-editorial-template\\node_modules\\playwright');
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:3214/',{waitUntil:'networkidle'});
 const w=page.locator('.ed-workspace'); await w.scrollIntoViewIfNeeded();
 for(const tab of await w.getByRole('tab').all()){
  await tab.click(); assert.equal(await tab.getAttribute('aria-selected'),'true');
  for(const button of await w.locator('.ed-workspace-navigation > button').all()){
   await button.click(); assert.equal(await button.getAttribute('aria-pressed'),'true');
  }
  await w.locator('details summary').click(); assert(await w.locator('details').evaluate(e=>e.open));
  await w.locator('details summary').click();
 }
 await w.getByRole('tab').first().focus();await page.keyboard.press('End');assert.equal(await w.getByRole('tab').last().getAttribute('aria-selected'),'true');
 await page.keyboard.press('Home');assert.equal(await w.getByRole('tab').first().getAttribute('aria-selected'),'true');
 await page.keyboard.press('ArrowRight');assert.equal(await w.getByRole('tab').nth(1).getAttribute('aria-selected'),'true');
 await w.locator('.ed-workspace-navigation > button').nth(3).click();
 await w.locator('.ed-workspace-playback').click();await page.waitForTimeout(3100);
 assert.equal(await w.getAttribute('data-playing'),'false');assert.equal(await w.locator('.ed-workspace-navigation > button').nth(4).getAttribute('aria-pressed'),'true');
 await w.locator('.ed-workspace-playback').click();await page.waitForTimeout(400);await w.locator('.ed-workspace-playback').click();
 const paused=await w.locator('.ed-workspace-inspector h4').innerText();await page.waitForTimeout(2900);assert.equal(await w.locator('.ed-workspace-inspector h4').innerText(),paused);
 await w.locator('.ed-workspace-playback').click();await page.locator('#contact').scrollIntoViewIfNeeded();await page.waitForTimeout(150);assert.equal(await w.getAttribute('data-playing'),'false');
 await w.getByRole('tab',{name:/Mission Control/}).click();
 await w.locator('.ed-workspace-bottom .ed-workspace-exception-toggle').click();
 assert.equal(await w.getAttribute('data-unknown'),'true');assert.match(await w.innerText(),/reconcil/i);assert.match(await w.innerText(),/retry|repeat/i);
 await w.locator('.ed-workspace-bottom .ed-workspace-exception-toggle').click();assert.equal(await w.getAttribute('data-unknown'),'false');
 await w.locator('.ed-workspace-playback').click();await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(150);assert.equal(await w.getAttribute('data-playing'),'false');assert.equal(await w.locator('.ed-workspace-playback').count(),0);
 assert.equal(await page.getByRole('link',{name:'Explore with Ask',exact:true}).getAttribute('href'),'http://100.79.154.43:3100/fyd');
 for(const width of [390,1440]){
  await page.setViewportSize({width,height:1000});await page.goto('http://127.0.0.1:3214/',{waitUntil:'networkidle'});
  await page.evaluate(()=>document.activeElement?.blur());
  for(const id of ['operating','journal','problem','fyd','architecture']){
   await page.locator('#'+id).scrollIntoViewIfNeeded();await page.evaluate(()=>document.activeElement?.blur());
   await page.locator('#'+id).screenshot({path:path.join(__dirname,`review-${width}-${id}.png`)});
  }
 }
 fs.writeFileSync(path.join(__dirname,'workspace-validation.json'),JSON.stringify({allTabsAndSteps:true,keyboard:true,boundedPlayback:true,pause:true,offscreenPause:true,unknownOutcome:true,reducedMotion:true,fydAction:true,errors},null,2));
 console.log('Workspace interactions passed',errors);await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
