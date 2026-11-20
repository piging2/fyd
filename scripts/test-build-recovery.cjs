#!/usr/bin/env node
/**
 * Browser acceptance for existing Build My FYD failure recovery.
 * Every build POST and synthetic report GET is fulfilled inside Playwright.
 * Other writes are blocked; optional demo-session bootstrap is declined locally.
 *
 * node test-build-recovery.cjs --base-url URL --output-dir /absolute/evidence \
 *   --dependency-root /absolute/node_modules --source-root /absolute/checkout
 *
 * --expect-baseline marks a RED capture; it does not alter assertions or make
 * failures pass. The same checks must pass without that flag after a repair.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { createRequire } = require('node:module');

const args = process.argv.slice(2);
function option(name) { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; }
const base = option('--base-url')?.replace(/\/$/, '');
const output = option('--output-dir');
const root = path.resolve(__dirname, '..');
const sourceRoot = option('--source-root') || root;
const dependencyRoot = option('--dependency-root') || path.join(root, 'node_modules');
assert.ok(base && ['http:', 'https:'].includes(new URL(base).protocol), '--base-url required');
assert.ok(output && path.isAbsolute(output), '--output-dir must be absolute');
assert.ok(sourceRoot && path.isAbsolute(sourceRoot), '--source-root must be absolute');
assert.ok(dependencyRoot && path.isAbsolute(dependencyRoot), '--dependency-root must be absolute');
const { chromium } = createRequire(path.join(dependencyRoot, '..', 'package.json'))('playwright');
fs.mkdirSync(output, { recursive: true });

const fixture = {
  url: 'https://example.test/controlled-build-fixture',
  socials: ['https://social.example.test/first', 'https://social.example.test/second'],
  documentNames: ['Project brief.pdf', 'Details Δ.txt'],
  error: 'Synthetic build failure. No real build request was delivered.',
  jobId: 'synthetic-browser-recovery-report',
};
const stages = [
  ['discover', 'Located the synthetic business website supplied for this browser test.'],
  ['acquire', 'Read the synthetic public website fixture; no real pages were acquired.'],
  ['understand', 'Parsed synthetic business fields into the controlled fixture.'],
  ['resolve', 'Checked the synthetic facts against their fixture evidence.'],
  ['generate', 'Prepared the synthetic business preview fixture for review.'],
  ['media', 'Media was skipped in this browser fixture; no assets were fetched.'],
].map(([stage, detail], index) => ({ type: 'stage', stage: { stage, status: stage === 'media' ? 'skipped' : 'ok', detail, ms: 40 + index } }));
const sse = events => events.map(event => 'data: ' + JSON.stringify(event) + '\n\n').join('');
const report = {
  startedAt: new Date().toISOString(), baseUrl: base, sourceRoot,
  baselineExpected: args.includes('--expect-baseline'),
  scope: 'Chromium existing public Build My FYD keyboard failure/retry journey, locally fulfilled HTTP/SSE/build-report fixtures. No real build, acquisition, submission, persisted report, demo session, destination delivery or authorization acceptance.',
  localSourceFiles: ['src/app/build-my-fyd/build-my-fyd-client.tsx', 'src/app/api/fyd/build/route.ts'].map(name => ({ path: name, sha256: createHash('sha256').update(fs.readFileSync(path.join(sourceRoot, name))).digest('hex') })),
  harnessSha256: createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),
  checks: [], cases: [], observations: [], errors: [], expectedNetworkDiagnostics: [], failures: [],
};
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function check(name, passed, detail) {
  report.checks.push({ name, passed: Boolean(passed), ...(detail === undefined ? {} : { detail }) });
  if (!passed) report.failures.push({ name, ...(detail === undefined ? {} : { detail }) });
}
function failureRegion(page) { return page.getByText('Build failed', { exact: true }).locator('..'); }
async function sendByKeyboard(page) {
  await page.getByRole('button', { name: 'Build a FYD site', exact: true }).focus();
  await page.keyboard.press('Enter');
}
async function observeFailure(page, label) {
  const target = failureRegion(page);
  await target.waitFor({ state: 'visible', timeout: 12000 });
  await page.waitForFunction(() => !document.querySelector('form button[type="submit"]')?.disabled);
  // Allow focus/scroll effects to settle; capture current geometry even in RED.
  const deadline = Date.now() + 6000;
  let observed, previous, stable = 0;
  do {
    observed = await target.evaluate(element => {
      const box = element.getBoundingClientRect();
      const active = document.activeElement;
      const style = getComputedStyle(element);
      return {
        focused: active === element,
        activeTag: active?.tagName, activeId: active?.id,
        activeText: active?.textContent?.trim().slice(0, 160),
        top: box.top, bottom: box.bottom, height: innerHeight,
        headerBottom: document.querySelector('header')?.getBoundingClientRect().bottom ?? 0,
        focusVisible: element.matches(':focus-visible'), outlineWidth: style.outlineWidth, boxShadow: style.boxShadow,
        scrollY,
      };
    });
    const visible = observed.top >= observed.headerBottom - 4 && observed.bottom <= observed.height + 2;
    if (visible && previous && Math.abs(observed.top - previous.top) < 2) stable++; else stable = 0;
    if (stable >= 3 && observed.focused) break;
    previous = observed;
    await pause(100);
  } while (Date.now() < deadline);
  report.observations.push({ label, ...observed });
  check(`${label}: error region receives focus`, observed.focused, observed);
  check(`${label}: error settles below sticky header in viewport`, stable >= 3, observed);
  check(`${label}: keyboard focus is visible`, observed.focusVisible && (parseFloat(observed.outlineWidth) > 0 || observed.boxShadow !== 'none'), observed);
}
async function retained(page, label) {
  check(`${label}: website retained`, await page.locator('#fyd-url').inputValue() === fixture.url);
  check(`${label}: socials retained`, await page.locator('#fyd-socials').inputValue() === fixture.socials.join('\n'));
  const names = await page.getByRole('list', { name: 'Selected filenames' }).locator('li span').allTextContents();
  check(`${label}: selected filenames retained`, JSON.stringify(names) === JSON.stringify(fixture.documentNames), names);
  check(`${label}: URL field enabled for correction`, await page.locator('#fyd-url').isEnabled());
  check(`${label}: retry button enabled`, await page.getByRole('button', { name: 'Build a FYD site', exact: true }).isEnabled());
  check(`${label}: no horizontal overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
}
async function recoverByKeyboard(page, label) {
  const beforeUrl = page.url();
  await page.keyboard.press('Tab');
  const linkReached = await page.evaluate(() => document.activeElement?.getAttribute('href') === '#fyd-url' && document.activeElement?.textContent?.trim() === 'Review details and try again');
  check(`${label}: Tab reaches the recovery link`, linkReached);
  if (!linkReached) return;
  await page.keyboard.press('Enter');
  let previous, stable = 0, observed;
  const deadline = Date.now() + 6000;
  do {
    observed = await page.locator('#fyd-url').evaluate(element => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return { focused: document.activeElement === element, top: box.top, bottom: box.bottom, height: innerHeight, headerBottom: document.querySelector('header')?.getBoundingClientRect().bottom ?? 0, focusVisible: element.matches(':focus-visible'), outlineWidth: style.outlineWidth, boxShadow: style.boxShadow };
    });
    const visible = observed.top >= observed.headerBottom - 4 && observed.bottom <= observed.height + 2;
    if (visible && previous && Math.abs(observed.top - previous.top) < 2) stable++; else stable = 0;
    if (observed.focused && stable >= 3) break;
    previous = observed;
    await pause(100);
  } while (Date.now() < deadline);
  report.observations.push({ label: `${label}: recovery URL field`, ...observed });
  check(`${label}: recovery Enter focuses website field`, observed.focused, observed);
  check(`${label}: recovery field settles below sticky header`, stable >= 3, observed);
  check(`${label}: recovery field has visible keyboard focus`, observed.focusVisible && (parseFloat(observed.outlineWidth) > 0 || observed.boxShadow !== 'none'), observed);
  check(`${label}: recovery preserves URL and query context`, page.url() === beforeUrl);
  await retained(page, `${label}: after keyboard recovery`);
}

async function runCase(browser, width, reducedMotion, theme) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion, serviceWorkers: 'block' });
  const row = { width, reducedMotion, theme, attempts: [], declinedDemoSessions: [], blockedOtherWrites: [], syntheticReportReads: [] };
  const buildUrl = new URL('/api/fyd/build', base).href;
  const sessionUrl = new URL('/api/fyd/relationship-session', base).href;
  const jobPath = '/build-my-fyd/' + fixture.jobId;
  const control = { scenario: 'stage_error', release: null, pendingReleases: [] };
  await context.addInitScript(themeValue => { localStorage.setItem('ping-theme', themeValue); }, theme);
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (['GET', 'HEAD'].includes(request.method()) && url.origin === new URL(base).origin && url.pathname === jobPath) {
      row.syntheticReportReads.push({ method: request.method(), url: request.url(), delivered: false });
      return route.fulfill({ status: 200, contentType: 'text/html', headers: { 'cache-control': 'no-store' }, body: '<!doctype html><html lang="en"><head><title>Synthetic build report</title></head><body><main><h1>Synthetic build report reached</h1><p>No persisted report or backend delivery is asserted.</p></main></body></html>' });
    }
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method())) return route.continue();
    if (request.method() === 'POST' && request.url() === sessionUrl) {
      row.declinedDemoSessions.push({ method: request.method(), url: request.url(), delivered: false });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: false, code: 'TEST_READ_ONLY', error: 'This browser verification does not create a demo session.', retryable: false, scope: null }) });
    }
    if (request.method() !== 'POST' || request.url() !== buildUrl) {
      row.blockedOtherWrites.push({ method: request.method(), url: request.url(), delivered: false });
      return route.abort();
    }
    const scenario = control.scenario;
    row.attempts.push({ scenario, method: request.method(), url: request.url(), body: request.postDataJSON(), delivered: false });
    if (scenario === 'delayed_error') await new Promise(resolve => { control.release = resolve; control.pendingReleases.push(resolve); });
    if (scenario === 'http_error') return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: fixture.error }) });
    const events = scenario === 'success'
      ? [...stages, { type: 'done', jobId: fixture.jobId, ok: true, report: { error: null } }]
      : scenario === 'incomplete_stream' ? stages
        : [...stages, { type: 'error', message: fixture.error }];
    return route.fulfill({ status: 200, contentType: 'text/event-stream', headers: { 'cache-control': 'no-store' }, body: sse(events) });
  });
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push({ width, kind: 'page', message: error.message }));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const item = { width, kind: 'console', message: message.text(), url: message.location().url };
    if (item.url === buildUrl && /Failed to load resource/.test(item.message) && control.scenario === 'http_error') report.expectedNetworkDiagnostics.push(item);
    else report.errors.push(item);
  });
  try {
    const response = await page.goto(base + '/build-my-fyd?utm_source=browser-recovery-fixture', { waitUntil: 'domcontentloaded', timeout: 60000 });
    assert.equal(response.status(), 200, 'Build My FYD HTTP200 prerequisite');
    check(`${width}: Build My FYD HTTP 200`, true);
    await page.locator('#fyd-url').waitFor({ state: 'visible', timeout: 60000 });
    await page.locator('button[aria-label^="Visual effects:"]').first().waitFor({ state: 'attached', timeout: 60000 });
    await page.locator('#fyd-url').fill(fixture.url);
    await page.locator('#fyd-socials').fill(fixture.socials.join('\n'));
    await page.locator('#fyd-documents').setInputFiles(fixture.documentNames.map(name => ({ name, mimeType: 'text/plain', buffer: Buffer.from('Synthetic browser fixture only.') })));
    await retained(page, `${width}: initial fixture`);
    for (const scenario of ['stage_error', 'stage_error', 'http_error', 'incomplete_stream']) {
      control.scenario = scenario;
      const count = row.attempts.length;
      await sendByKeyboard(page);
      await observeFailure(page, `${width}: ${scenario} attempt ${count + 1}`);
      check(`${width}: ${scenario} makes one intercepted request`, row.attempts.length === count + 1);
      check(`${width}: ${scenario} stays on intake`, new URL(page.url()).pathname === '/build-my-fyd');
      check(`${width}: ${scenario} preserves query context`, new URL(page.url()).searchParams.get('utm_source') === 'browser-recovery-fixture');
      if (scenario !== 'http_error') check(`${width}: ${scenario} preserves six real stage names`, await page.getByRole('heading', { name: 'Build progress', exact: true }).locator('..').locator('li').count() === stages.length);
      await retained(page, `${width}: ${scenario}`);
      if (scenario === 'stage_error' && count === 0) await page.screenshot({ path: path.join(output, `build-error-${width}.png`), animations: 'disabled' });
      await recoverByKeyboard(page, `${width}: ${scenario} attempt ${count + 1}`);
    }
    control.scenario = 'delayed_error';
    const beforeBusy = row.attempts.length;
    await sendByKeyboard(page);
    const deadline = Date.now() + 10000;
    while (!control.release && Date.now() < deadline) await pause(20);
    assert.ok(control.release, 'Delayed build fixture reached interceptor');
    check(`${width}: pending build disables submit`, await page.getByRole('button', { name: 'Build a FYD site', exact: true }).isDisabled());
    check(`${width}: pending build disables editable fields`, await page.locator('#fyd-url').isDisabled() && await page.locator('#fyd-socials').isDisabled() && await page.locator('#fyd-documents').isDisabled());
    await page.locator('form').evaluate(form => { form.requestSubmit(); form.requestSubmit(); });
    await pause(100);
    check(`${width}: busy guard prevents duplicate build requests`, row.attempts.length === beforeBusy + 1);
    control.release(); control.release = null;
    await observeFailure(page, `${width}: delayed error`);
    await retained(page, `${width}: delayed error`);
    await recoverByKeyboard(page, `${width}: delayed error`);
    control.scenario = 'success';
    const beforeSuccess = row.attempts.length;
    await sendByKeyboard(page);
    await page.waitForURL(url => url.pathname === jobPath, { timeout: 20000 });
    await page.getByRole('heading', { name: 'Synthetic build report reached', exact: true }).waitFor();
    check(`${width}: successful done event opens intended report path`, new URL(page.url()).pathname === jobPath && row.attempts.length === beforeSuccess + 1);
    check(`${width}: report readback stayed synthetic`, row.syntheticReportReads.length > 0 && row.syntheticReportReads.every(request => request.delivered === false));
    check(`${width}: all build payloads preserve original inputs`, row.attempts.every(request => request.delivered === false && JSON.stringify(request.body) === JSON.stringify({ url: fixture.url, socials: fixture.socials, documentNames: fixture.documentNames })));
    await page.screenshot({ path: path.join(output, `build-synthetic-report-${width}.png`), animations: 'disabled' });
  } finally {
    for (const release of control.pendingReleases) release();
    report.cases.push(row);
    await context.close();
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  report.browser = browser.version();
  try {
    for (const [width, motion, theme] of [[390, 'reduce', 'light'], [768, 'reduce', 'dark'], [1440, 'no-preference', 'dark']]) {
      try { await runCase(browser, width, motion, theme); }
      catch (error) { report.failures.push({ width, scope: 'case prerequisite or progression', message: error.message }); }
    }
    check('No unexpected hydration, console or page errors', report.errors.length === 0, report.errors);
    check('No real build requests or session writes delivered', report.cases.every(row => row.attempts.every(request => request.delivered === false) && row.declinedDemoSessions.every(request => request.delivered === false)));
  } finally {
    await browser.close();
    report.finishedAt = new Date().toISOString();
    report.passed = report.failures.length === 0;
    fs.writeFileSync(path.join(output, 'build-recovery-browser.json'), JSON.stringify(report, null, 2) + '\n');
    process.stdout.write(JSON.stringify({ passed: report.passed, checks: report.checks.length, failures: report.failures.map(({ name, scope, width, message }) => ({ name, scope, width, message })), unexpectedErrors: report.errors, realBuildRequestsDelivered: 0, expectedNetworkDiagnostics: report.expectedNetworkDiagnostics.length }, null, 2) + '\n');
    if (!report.passed) process.exitCode = 1;
  }
})().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
