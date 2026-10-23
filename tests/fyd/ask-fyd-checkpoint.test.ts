/** Real browser lifecycle: deferred fetches, scope changes and preserved input. */
import { chromium, type Browser, type Page } from 'playwright';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
let browser: Browser;
let page: Page;
beforeAll(async () => { browser = await chromium.launch({headless:true}); },30000);
afterAll(async () => { await browser?.close(); });
beforeEach(async () => {
  page = await browser.newPage();
  await page.route('http://fyd.test/',route=>route.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));
  await page.goto('http://fyd.test/');
  await page.addScriptTag({path:require.resolve('react/package.json').replace('package.json','umd/react.development.js')});
  await page.addScriptTag({path:require.resolve('react-dom/package.json').replace('package.json','umd/react-dom.development.js')});
  const compiled = ts.transpileModule(readFileSync('src/fyd/components/ask-fyd-widget.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2020}}).outputText;
  await page.addScriptTag({content:`(() => { const exports = {}; const require = () => window.React; ${compiled}; window.Widget = exports.AskFydWidget; })();`});
  await page.evaluate(() => {
    const w = window as any;
    w.pending = [];
    w.fetch = (_url: string, init: any) => new Promise(resolve => w.pending.push({body:JSON.parse(init.body),resolve}));
    w.root = w.ReactDOM.createRoot(document.getElementById('root'));
    w.render = (checkpoint: string) => w.root.render(w.React.createElement(w.Widget,{siteId:'coppersmith-plumbing',pageCheckpoint:checkpoint,theme:{accent:'#fff',accentForeground:'#000'}}));
    w.render('N');
  });
  await page.locator('input').waitFor();
});
afterEach(async () => { await page?.close(); });
async function respond(index: number, data: Record<string,unknown>) {
  await page.evaluate(({index,data}) => (window as any).pending[index].resolve({ok:data.ok,json:async()=>data}),{index,data});
}
test('stale response preserves the question and offers a refresh', async () => {
  await page.locator('input').fill('Can they help with heating?');
  await page.getByRole('button',{name:'Ask FYD',exact:true}).click();
  expect(await page.evaluate(() => (window as any).pending[0].body.pageCheckpoint)).toBe('N');
  await respond(0,{ok:false,kind:'stale_view',answerCheckpoint:'N+1',error:'Business information changed. Refresh this view.'});
  await page.getByRole('alert').waitFor();
  expect(await page.locator('input').inputValue()).toBe('Can they help with heating?');
  expect(await page.getByRole('button',{name:'Refresh this view'}).count()).toBe(1);
  // Observe the actual refresh button's storage write, then simulate the
  // refreshed document's mount with the next checkpoint.
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) { original.call(this,key,value); throw new Error('test pauses navigation after the storage write'); };
  });
  await page.getByRole('button',{name:'Refresh this view'}).click();
  expect(await page.evaluate(() => sessionStorage.getItem('fyd-refresh-question:coppersmith-plumbing'))).toBe('Can they help with heating?');
  await page.evaluate(() => {
    const w = window as any;
    w.root.unmount(); w.root=w.ReactDOM.createRoot(document.getElementById('root')); w.render('N+1');
  });
  await page.waitForFunction(() => (document.querySelector('input') as HTMLInputElement)?.value === 'Can they help with heating?');
  await page.getByRole('button',{name:'Ask FYD',exact:true}).click();
  await respond(1,{ok:true,answer:'Fresh business information',answerCheckpoint:'N+1'});
  await page.getByText('Fresh business information',{exact:true}).waitFor();
});
test('an older in-flight answer cannot overwrite a newer answer after a checkpoint change', async () => {
  await page.locator('input').fill('First question');
  await page.getByRole('button',{name:'Ask FYD',exact:true}).click();
  await page.evaluate(() => (window as any).render('N+1'));
  await page.waitForFunction(() => !(document.querySelector('button[type="submit"]') as HTMLButtonElement)?.disabled);
  expect(await page.locator('input').inputValue()).toBe('First question');
  await page.locator('input').fill('Second question');
  await page.getByRole('button',{name:'Ask FYD',exact:true}).click();
  await respond(1,{ok:true,answer:'New answer',answerCheckpoint:'N+1'});
  await page.getByText('New answer',{exact:true}).waitFor();
  await respond(0,{ok:true,answer:'Old answer',answerCheckpoint:'N'});
  expect(await page.getByText('Old answer',{exact:true}).count()).toBe(0);
  expect(await page.getByText('New answer',{exact:true}).count()).toBe(1);
},15000);
