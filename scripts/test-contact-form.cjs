#!/usr/bin/env node
/**
 * Browser regression for the existing public ContactForm recovery journey.
 *
 * node scripts/test-contact-form.cjs --base-url http://127.0.0.1:3000 \
 *   --output-dir /absolute/evidence
 *
 * Every contact POST is fulfilled or aborted inside Playwright. No request is
 * delivered to the real endpoint, and no real receipt, lead or inbox is proved.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { createRequire } = require('node:module');

const args = process.argv.slice(2);
function option(name) {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}
const root = path.resolve(__dirname, '..');
const base = option('--base-url')?.replace(/\/$/, '');
const output = option('--output-dir');
assert.ok(base && ['http:', 'https:'].includes(new URL(base).protocol), '--base-url is required');
assert.ok(output && path.isAbsolute(output), '--output-dir must be absolute');
const dependencies = option('--dependency-root') || path.join(root, 'node_modules');
const fromDependencies = createRequire(path.resolve(dependencies, '..', 'package.json'));
const { chromium } = fromDependencies('playwright');
fs.mkdirSync(output, { recursive: true });

const report = {
  startedAt: new Date().toISOString(), baseUrl: base, localSourceRoot: root,
  scope: 'Chromium public ContactForm interaction; native keyboard validation and locally intercepted synthetic responses. No real contact delivery, inbox receipt, authorization or backend-health claim. Local hashes do not identify the served deployment.',
  localSourceFiles: ['src/app/contact/contact-form.tsx', 'src/components/public-form-error.tsx', 'scripts/test-contact-form.cjs'].map(name => ({
    path: name, sha256: createHash('sha256').update(fs.readFileSync(path.join(root, name))).digest('hex'),
  })),
  checks: [], cases: [], positions: [], errors: [], expectedNetworkDiagnostics: [], failures: [],
};
const fixture = {
  name: 'Browser Fixture', email: 'fixture@example.test',
  business: 'Synthetic Test Business', message: 'Synthetic browser test message. Do not deliver.',
};
const fields = [['ct-name', 'name'], ['ct-email', 'email'], ['ct-business', 'business'], ['ct-message', 'message']];
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
function check(name, condition) { assert.ok(condition, name); report.checks.push(name); }
function summary(page) { return page.locator('form [tabindex="-1"]').first(); }

async function ready(page) {
  await page.locator('#ct-name').waitFor({ state: 'visible', timeout: 90000 });
  // Its mounted label is the existing hydration signal, including when the
  // mobile control is inside a closed menu. No product instrumentation.
  await page.locator('button[aria-label^="Visual effects:"]').first().waitFor({ state: 'attached', timeout: 90000 });
}
async function summaryFocused(page, label) {
  try {
    await page.waitForFunction(() => document.activeElement?.matches('form [tabindex="-1"]'), {}, { timeout: 12000 });
  } catch (error) {
    const observed = await page.evaluate(() => ({ tag: document.activeElement?.tagName, id: document.activeElement?.id, text: document.activeElement?.textContent }));
    throw new Error(`${label}: error summary did not receive focus; observed ${JSON.stringify(observed)}; ${error.message}`);
  }
  check(label, true);
  report.positions.push({ label, ...await visibleTarget(page, summary(page)) });
  check(`${label}: summary is visible below sticky chrome`, true);
}
async function visibleTarget(page, target) {
  let previous, stable = 0, observed;
  const deadline = Date.now() + 12000;
  do {
    observed = await target.evaluate(element => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, header: document.querySelector('header')?.getBoundingClientRect().bottom ?? 0, height: innerHeight };
    });
    if (observed.top >= observed.header - 4 && observed.bottom <= observed.height + 2 && previous && Math.abs(observed.top - previous.top) < 2) stable++; else stable = 0;
    if (stable >= 3) return observed;
    previous = observed; await pause(100);
  } while (Date.now() < deadline);
  throw new Error(`Focused recovery target did not settle in view: ${JSON.stringify(observed)}`);
}
async function tabTo(page, href, direction) {
  for (let index = 0; index < 18; index++) {
    await page.keyboard.press(direction);
    if (await page.evaluate(href => document.activeElement?.getAttribute('href') === href, href)) return;
  }
  throw new Error(`Keyboard could not reach ${href} using ${direction}`);
}
async function fieldVisible(page, id) {
  let previous, stable = 0, observed;
  const deadline = Date.now() + 12000;
  do {
    observed = await page.locator('#' + id).evaluate(element => {
      const rect = element.getBoundingClientRect(), header = document.querySelector('header')?.getBoundingClientRect();
      const style = getComputedStyle(element);
      return { top: rect.top, bottom: rect.bottom, header: header?.bottom ?? 0, height: innerHeight, focused: document.activeElement === element, focusVisible: element.matches(':focus-visible'), outlineWidth: style.outlineWidth, boxShadow: style.boxShadow };
    });
    const positioned = observed.top >= observed.header - 4 && observed.bottom <= observed.height + 2;
    if (positioned && previous && Math.abs(observed.top - previous.top) < 2) stable++; else stable = 0;
    if (stable >= 3) return observed;
    previous = observed; await pause(100);
  } while (Date.now() < deadline);
  throw new Error(`Invalid field ${id} did not settle in view: ${JSON.stringify(observed)}`);
}
async function retained(page, label) {
  for (const [id, key] of fields) check(`${label}: ${key} retained`, await page.locator('#' + id).inputValue() === fixture[key]);
}
async function sendByKeyboard(page) {
  await page.locator('form button[type="submit"]').focus();
  await page.keyboard.press('Enter');
}

async function runCase(browser, width, reducedMotion, theme) {
  const context = await browser.newContext({ viewport: { width, height: 960 }, reducedMotion });
  const row = { width, reducedMotion, theme, attempts: [], blockedOtherWrites: [], fields: [] };
  const control = { scenario: 'invalid', release: null, pendingReleases: [], aborts: 0 };
  const contactUrl = new URL('/api/fyd/contact', base).href;
  await context.addInitScript(theme => { localStorage.setItem('ping-theme', theme); }, theme);
  await context.route('**/*', async route => {
    const request = route.request();
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method())) return route.continue();
    if (request.method() !== 'POST' || request.url() !== contactUrl) {
      row.blockedOtherWrites.push({ method: request.method(), url: request.url() });
      return route.abort();
    }
    const scenario = control.scenario;
    row.attempts.push({ scenario, method: request.method(), url: request.url(), body: request.postDataJSON(), delivered: false });
    const json = (status, data) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
    if (scenario === 'field_error') return json(400, { ok: false, field: 'email', reason: 'Use a reply address for this synthetic test.' });
    if (scenario === 'service_error') return json(503, { ok: false, reason: 'Synthetic service unavailable. Your entries are still here.' });
    if (scenario === 'network_error') { control.aborts++; return route.abort('failed'); }
    if (scenario === 'invalid_json') return route.fulfill({ status: 200, contentType: 'application/json', body: '{not valid JSON' });
    if (scenario === 'missing_receipt') return json(200, { ok: true });
    if (scenario === 'delayed_error') {
      await new Promise(resolve => { control.release = resolve; control.pendingReleases.push(resolve); });
      return json(503, { ok: false, reason: 'Synthetic delayed failure. Please try again.' });
    }
    if (scenario === 'success') return json(200, { ok: true, receipt: { receiptId: 'synthetic-contact-receipt', receivedAt: '2026-11-18T00:00:00.000Z' } });
    return json(500, { ok: false, reason: 'Unexpected contact request intercepted; nothing delivered.' });
  });
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push({ width, kind: 'page', message: error.message }));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const item = { width, kind: 'console', message: message.text(), url: message.location().url };
    // HTTP error/abort diagnostics are part of the explicitly intercepted
    // failure scenarios. Retain them as evidence; do not hide page errors.
    if (item.url === contactUrl && /Failed to load resource/.test(item.message) && ['field_error', 'service_error', 'network_error', 'delayed_error'].includes(control.scenario)) report.expectedNetworkDiagnostics.push(item);
    else report.errors.push(item);
  });
  try {
    const response = await page.goto(base + '/contact?utm_source=browser-fixture', { waitUntil: 'domcontentloaded', timeout: 60000 });
    check(`${width}: contact HTTP 200`, response.status() === 200); await ready(page);
    await sendByKeyboard(page); await summaryFocused(page, `${width}: invalid submit focuses error summary`);
    check(`${width}: invalid client input does not POST`, row.attempts.length === 0);
    check(`${width}: all four errors have navigable links`, await summary(page).locator('a[href^="#ct-"]').count() === 4);
    for (let index = 0; index < fields.length; index++) {
      const id = fields[index][0]; await tabTo(page, '#' + id, index === 0 ? 'Tab' : 'Shift+Tab');
      await page.keyboard.press('Enter');
      const observed = await fieldVisible(page, id); row.fields.push({ id, ...observed });
      check(`${width}: ${id} link focuses its field`, observed.focused);
      check(`${width}: ${id} has keyboard focus indication`, observed.focusVisible && (parseFloat(observed.outlineWidth) > 0 || observed.boxShadow !== 'none'));
    }
    check(`${width}: error links preserve unrelated URL context`, new URL(page.url()).searchParams.get('utm_source') === 'browser-fixture');
    for (const [id, key] of fields) await page.locator('#' + id).fill(fixture[key]);
    for (const scenario of ['field_error', 'service_error', 'network_error', 'invalid_json', 'missing_receipt']) {
      control.scenario = scenario; const count = row.attempts.length;
      await sendByKeyboard(page); await summaryFocused(page, `${width}: ${scenario} focuses recoverable summary`);
      check(`${width}: ${scenario} has one intercepted request`, row.attempts.length === count + 1);
      check(`${width}: ${scenario} never renders success`, await page.getByRole('heading', { name: 'Thank you. Your message is in.', exact: true }).count() === 0);
      await retained(page, `${width}: ${scenario}`);
      check(`${width}: ${scenario} keeps Facebook fallback`, await summary(page).locator('a[href^="https://www.facebook.com/"]').count() === 1);
      if (scenario === 'field_error') check(`${width}: server field error is navigable`, await summary(page).locator('a[href="#ct-email"]').count() === 1);
    }
    control.scenario = 'delayed_error'; const beforeBusy = row.attempts.length;
    await sendByKeyboard(page);
    const deadline = Date.now() + 12000;
    while (!control.release && Date.now() < deadline) await pause(20);
    check(`${width}: delayed request reached interceptor`, Boolean(control.release));
    check(`${width}: pending submit is disabled`, await page.locator('form button[type="submit"]').isDisabled());
    check(`${width}: pending state is exposed`, await page.locator('form[aria-busy="true"],form [aria-busy="true"]').count() > 0 && /Sending|Submitting/i.test(await page.locator('form [role="status"]').innerText()));
    // Exercise the actual handler's busy guard, beyond the disabled button.
    await page.locator('form').evaluate(form => { form.requestSubmit(); form.requestSubmit(); }); await pause(150);
    check(`${width}: busy handler prevents duplicate requests`, row.attempts.length === beforeBusy + 1);
    control.release(); control.release = null;
    await summaryFocused(page, `${width}: delayed failure restores summary focus`); await retained(page, `${width}: delayed failure`);
    if (width === 390) {
      await page.setViewportSize({ width: 320, height: 960 });
      check('320: error recovery has no horizontal overflow', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: path.join(output, 'contact-error-320.png'), animations: 'disabled' });
      await page.setViewportSize({ width, height: 960 });
    }
    await page.screenshot({ path: path.join(output, `contact-error-${width}.png`), animations: 'disabled' });
    control.scenario = 'success'; const beforeSuccess = row.attempts.length;
    await sendByKeyboard(page);
    const heading = page.getByRole('heading', { name: 'Thank you. Your message is in.', exact: true }); await heading.waitFor();
    await page.waitForFunction(() => document.activeElement?.matches('h2[tabindex="-1"]'));
    await page.waitForFunction(() => document.activeElement?.matches('h2[tabindex="-1"]'));
    check(`${width}: synthetic receipt focuses confirmation`, await heading.evaluate(element => document.activeElement === element));
    report.positions.push({ label: `${width}: receipt`, ...await visibleTarget(page, heading) });
    check(`${width}: receipt heading is visible below sticky chrome`, true);
    check(`${width}: success still requires receipt`, await page.getByText('synthetic-contact-receipt', { exact: true }).count() === 1 && row.attempts.length === beforeSuccess + 1);
    check(`${width}: success replaces the form`, await page.locator('form').count() === 0);
    check(`${width}: success has no overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(output, `contact-success-${width}.png`), animations: 'disabled' });
    // Continue the success journey using the actual public return link.
    await page.keyboard.press('Tab');
    check(`${width}: confirmation return link is keyboard reachable`, await page.evaluate(() => document.activeElement?.getAttribute('href') === '/'));
    await page.keyboard.press('Enter'); await page.waitForURL(url => url.pathname === '/');
    check(`${width}: confirmation returns to homepage`, new URL(page.url()).pathname === '/');
    check(`${width}: all contact requests stayed synthetic`, row.attempts.every(request => request.delivered === false && Object.keys(request.body).length === fields.length && fields.every(([, key]) => request.body[key] === fixture[key])));
  } finally {
    for (const release of control.pendingReleases) release();
    report.cases.push(row); await context.close();
  }
}

async function runNoJs(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 960 }, javaScriptEnabled: false });
  try {
    await context.route('**/*', route => ['GET', 'HEAD', 'OPTIONS'].includes(route.request().method()) ? route.continue() : route.abort());
    const page = await context.newPage(); const response = await page.goto(base + '/contact', { waitUntil: 'domcontentloaded' });
    check('No-JS contact HTTP 200', response.status() === 200);
    const notice = page.locator('form noscript p');
    check('No-JS explains JavaScript requirement', await notice.isVisible() && /JavaScript/i.test(await notice.innerText()));
    check('No-JS exposes direct Facebook alternative', await notice.locator('a[href^="https://www.facebook.com/"]').count() === 1);
    await page.screenshot({ path: path.join(output, 'contact-no-js.png'), animations: 'disabled' });
  } finally { await context.close(); }
}

(async () => {
  const browser = await chromium.launch({ headless: true }); report.browser = browser.version();
  try {
    for (const [width, motion, theme] of [[390, 'reduce', 'light'], [768, 'reduce', 'dark'], [1440, 'no-preference', 'dark']]) {
      try { await runCase(browser, width, motion, theme); } catch (error) { report.failures.push({ width, message: error.message }); break; }
    }
    if (!report.failures.length) await runNoJs(browser);
    check('No unexpected hydration, console or page errors', report.errors.length === 0);
  } catch (error) { report.failures.push({ scope: 'runner', message: error.message }); }
  finally {
    await browser.close(); report.finishedAt = new Date().toISOString(); report.passed = report.failures.length === 0;
    fs.writeFileSync(path.join(output, 'contact-browser.json'), JSON.stringify(report, null, 2) + '\n');
    process.stdout.write(JSON.stringify({ passed: report.passed, checks: report.checks.length, failures: report.failures, unexpectedErrors: report.errors, expectedNetworkDiagnostics: report.expectedNetworkDiagnostics.length }, null, 2) + '\n');
    if (!report.passed) process.exitCode = 1;
  }
})().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
