#!/usr/bin/env node
/**
 * Local contact delivery regression, with the real production API and mailer.
 *
 * node scripts/test-contact-delivery.cjs --source-root /absolute/built-archive \
 *   --output-dir /absolute/evidence
 *
 * Starts its own Next production server with a minimal environment and dummy
 * SMTP credentials, and a TCP sink bound only to 127.0.0.1. Browser requests
 * never reach a public site. This proves the local delivery/recovery contract,
 * not production SMTP egress, mailbox arrival, capture restoration or Kit.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const { createRequire } = require('node:module');

const args = process.argv.slice(2);
function option(name) {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}
const sourceArg = option('--source-root');
const outputArg = option('--output-dir');
assert.ok(sourceArg && path.isAbsolute(sourceArg), '--source-root must be absolute');
assert.ok(outputArg && path.isAbsolute(outputArg), '--output-dir must be absolute');
const source = fs.realpathSync(sourceArg);
const output = path.resolve(outputArg);
assert.ok(fs.existsSync(path.join(source, '.next', 'BUILD_ID')), 'Source root must have a production build');
for (const name of ['.env', '.env.local', '.env.production', '.env.production.local']) {
  assert.ok(!fs.existsSync(path.join(source, name)), `Refusing a source root with ${name}; no environment files are read`);
}
fs.mkdirSync(output, { recursive: true });
const fromSource = createRequire(path.join(source, 'package.json'));
const { chromium } = fromSource('playwright');
const nextBin = fromSource.resolve('next/dist/bin/next');
const hash = value => createHash('sha256').update(value).digest('hex');
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

const SMTP = {
  user: 'fixture-user', pass: 'fixture-password-not-a-credential',
  from: 'fixture-sender@example.test', to: 'fixture-receiver@example.test',
};
const report = {
  startedAt: new Date().toISOString(), sourceRoot: source,
  scope: 'Local Chromium -> real Next Contact API -> real nodemailer -> controlled loopback SMTP. First SMTP DATA is rejected with 451, retry is accepted and bound to its actual API receipt. No external mail, real subscriber, session, production delivery or worker-health claim.',
  node: { executable: process.execPath, version: process.version },
  nextVersion: fromSource('next/package.json').version,
  buildId: fs.readFileSync(path.join(source, '.next', 'BUILD_ID'), 'utf8').trim(),
  sourceFiles: ['src/app/contact/contact-form.tsx', 'src/app/api/fyd/contact/route.ts', 'src/fyd/owner-mode/submission-mailer.ts'].map(name => ({ path: name, sha256: hash(fs.readFileSync(path.join(source, name))) })),
  checks: [], cases: [], smtp: { authSuccesses: 0, attempts: [] },
  declinedDemoSessions: [], blockedExternalRequests: [], blockedOtherWrites: [],
  expectedNetworkDiagnostics: [], errors: [], failures: [],
};
function check(name, condition) {
  assert.ok(condition, name);
  report.checks.push(name);
}

let sink, nextProcess, browser, nextExit, cleanupPromise, nextClosedPromise;
let serverLog = '', serverStdout = '', serverStderr = '';
let nextClosed = false;
let cleanupStarted = false;
const sockets = new Set();

function decodedBody(raw) {
  const split = raw.indexOf('\r\n\r\n');
  assert.ok(split >= 0, 'SMTP message has a MIME header/body boundary');
  const headers = raw.slice(0, split);
  let body = raw.slice(split + 4);
  if (/^Content-Transfer-Encoding:\s*base64\s*$/im.test(headers)) {
    body = Buffer.from(body.replace(/\s/g, ''), 'base64').toString('utf8');
  } else if (/^Content-Transfer-Encoding:\s*quoted-printable\s*$/im.test(headers)) {
    body = body.replace(/=\r?\n/g, '').replace(/=([a-f0-9]{2})/gi, (_, pair) => String.fromCharCode(parseInt(pair, 16)));
  }
  return body.replace(/\r\n/g, '\n');
}

async function startSink() {
  let rejectNext = true;
  sink = net.createServer(socket => {
    sockets.add(socket);
    socket.setEncoding('utf8');
    let buffer = '', authenticated = false, authPending = false, data = null;
    let sender = null, recipients = [];
    const reply = text => socket.write(text + '\r\n');
    const problem = message => {
      report.errors.push({ kind: 'smtp-fixture', message });
      reply('550 5.7.1 Fixture refused unexpected input');
    };
    const authenticate = token => {
      const parts = Buffer.from(token, 'base64').toString('utf8').split('\0');
      if (parts.length !== 3 || parts[1] !== SMTP.user || parts[2] !== SMTP.pass) {
        return problem('AUTH PLAIN did not use the fixed dummy credentials');
      }
      authenticated = true; report.smtp.authSuccesses++; reply('235 2.7.0 Fixture authenticated');
    };
    reply('220 loopback.example.test ESMTP controlled test sink');
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', error => {
      if (!cleanupStarted) report.errors.push({ kind: 'smtp-socket', message: error.message });
    });
    socket.on('data', chunk => {
      buffer += chunk;
      if (buffer.length > 131072) {
        problem('SMTP input exceeded the synthetic fixture bound'); socket.destroy(); return;
      }
      let index;
      while ((index = buffer.indexOf('\r\n')) >= 0) {
        const line = buffer.slice(0, index); buffer = buffer.slice(index + 2);
        if (data !== null) {
          if (line !== '.') {
            data.push(line.startsWith('..') ? line.slice(1) : line);
            if (data.join('\r\n').length > 65536) {
              problem('SMTP DATA exceeded 64 KiB'); socket.destroy(); return;
            }
            continue;
          }
          const raw = data.join('\r\n') + '\r\n'; data = null;
          const attempt = { sender, recipients: [...recipients], raw, rawSha256: hash(raw), accepted: !rejectNext, reply: rejectNext ? 451 : 250 };
          report.smtp.attempts.push(attempt);
          sender = null; recipients = [];
          if (rejectNext) { rejectNext = false; reply('451 4.3.0 Controlled temporary fixture failure; retry later'); }
          else reply('250 2.0.0 Controlled loopback sink accepted');
          continue;
        }
        if (authPending) { authPending = false; authenticate(line); continue; }
        if (/^(EHLO|HELO)\s/i.test(line)) {
          socket.write('250-loopback.example.test\r\n250-AUTH PLAIN\r\n250 SIZE 65536\r\n');
        } else if (/^AUTH PLAIN(?:\s|$)/i.test(line)) {
          const token = line.slice('AUTH PLAIN'.length).trim();
          if (token) authenticate(token); else { authPending = true; reply('334 '); }
        } else if (/^MAIL FROM:/i.test(line)) {
          const address = /^MAIL FROM:<([^>]+)>/i.exec(line)?.[1];
          if (!authenticated || address !== SMTP.from) problem('SMTP sender was not the authenticated fixture sender');
          else { sender = address; recipients = []; reply('250 2.1.0 Fixture sender accepted'); }
        } else if (/^RCPT TO:/i.test(line)) {
          const address = /^RCPT TO:<([^>]+)>/i.exec(line)?.[1];
          if (!sender || address !== SMTP.to || !address.endsWith('@example.test')) problem('SMTP recipient was outside the exact fixture sink');
          else { recipients.push(address); reply('250 2.1.5 Fixture recipient accepted'); }
        } else if (/^DATA$/i.test(line)) {
          if (!sender || recipients.length !== 1) problem('SMTP DATA lacked the one permitted fixture recipient');
          else { data = []; reply('354 End fixture data with <CRLF>.<CRLF>'); }
        } else if (/^RSET$/i.test(line)) { sender = null; recipients = []; reply('250 2.0.0 Reset'); }
        else if (/^NOOP$/i.test(line)) reply('250 2.0.0 OK');
        else if (/^QUIT$/i.test(line)) { reply('221 2.0.0 Bye'); socket.end(); }
        else problem('Unexpected SMTP command; only the fixture protocol is permitted');
      }
    });
  });
  sink.on('error', error => report.errors.push({ kind: 'smtp-server', message: error.message }));
  await new Promise((resolve, reject) => { sink.once('error', reject); sink.listen(0, '127.0.0.1', resolve); });
  const address = sink.address();
  assert.ok(address && typeof address !== 'string' && address.address === '127.0.0.1');
  report.smtp.host = address.address; report.smtp.port = address.port;
  return address.port;
}

async function unusedPort() {
  const reservation = net.createServer();
  await new Promise((resolve, reject) => { reservation.once('error', reject); reservation.listen(0, '127.0.0.1', resolve); });
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  return port;
}

async function waitForServer(base) {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    if (nextExit) throw new Error(`Own Next server exited before readiness: ${JSON.stringify(nextExit)}`);
    const status = await new Promise(resolve => {
      const request = http.get(base + '/contact', response => { response.resume(); resolve(response.statusCode); });
      request.setTimeout(2000, () => request.destroy());
      request.on('error', () => resolve(null));
    });
    if (status === 200) return;
    await pause(200);
  }
  throw new Error('Own loopback Next server did not serve /contact within 90 seconds');
}

async function focusedVisible(page, selector, label) {
  await page.waitForFunction(selector => document.activeElement?.matches(selector), selector, { timeout: 12000 });
  const target = page.locator(selector).first();
  let previous, stable = 0, observed;
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    observed = await target.evaluate(element => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, header: document.querySelector('header')?.getBoundingClientRect().bottom ?? 0, height: innerHeight };
    });
    if (observed.top >= observed.header - 4 && observed.bottom <= observed.height + 2 && previous && Math.abs(observed.top - previous.top) < 2) stable++; else stable = 0;
    if (stable >= 3) { check(label, true); return observed; }
    previous = observed; await pause(100);
  }
  throw new Error(`${label}: focus target did not settle in view: ${JSON.stringify(observed)}`);
}

async function runCase(width, firstFailure) {
  const context = await browser.newContext({ viewport: { width, height: 960 }, reducedMotion: 'reduce' });
  const row = { width, posts: [], responses: [] };
  const fields = { name: 'Loopback Contact Fixture', email: 'visitor@example.test', business: 'Loopback Test Business', message: `Controlled local contact delivery proof at width ${width}.` };
  const ids = { name: 'ct-name', email: 'ct-email', business: 'ct-business', message: 'ct-message' };
  const contactUrl = report.baseUrl + '/api/fyd/contact';
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== report.baseUrl) {
      report.blockedExternalRequests.push({ method: request.method(), url: url.href });
      return route.abort('blockedbyclient');
    }
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method())) return route.continue();
    if (request.method() === 'POST' && url.pathname === '/api/fyd/relationship-session') {
      report.declinedDemoSessions.push({ width, delivered: false });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: false, code: 'TEST_READ_ONLY', error: 'This local contact fixture creates no demo session.', retryable: false, scope: null }) });
    }
    if (request.method() === 'POST' && request.url() === contactUrl) {
      const body = request.postDataJSON();
      assert.deepEqual(body, fields, 'Only the exact synthetic contact fields may reach the real local API');
      row.posts.push({ method: request.method(), url: request.url(), body, deliveredToRealLocalApi: true });
      return route.continue();
    }
    report.blockedOtherWrites.push({ width, method: request.method(), url: request.url() });
    return route.abort('blockedbyclient');
  });
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push({ width, kind: 'page', message: error.message }));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const item = { width, kind: 'console', message: message.text(), url: message.location().url };
    if (firstFailure && item.url === contactUrl && /Failed to load resource.*500/.test(item.message)) report.expectedNetworkDiagnostics.push(item);
    else report.errors.push(item);
  });
  try {
    const response = await page.goto(report.baseUrl + '/contact', { waitUntil: 'domcontentloaded', timeout: 60000 });
    check(`${width}: own production contact page serves 200`, response.status() === 200);
    await page.locator('#ct-name').waitFor({ state: 'visible' });
    await page.locator('button[aria-label^="Visual effects:"]').first().waitFor({ state: 'attached', timeout: 90000 });
    for (const [key, id] of Object.entries(ids)) await page.locator('#' + id).fill(fields[key]);
    async function submit() {
      const pending = page.waitForResponse(response => response.url() === contactUrl && response.request().method() === 'POST', { timeout: 30000 });
      await page.locator('form button[type="submit"]').focus();
      await page.keyboard.press('Enter');
      const delivered = await pending;
      const body = await delivered.json();
      row.responses.push({ status: delivered.status(), body });
      return { status: delivered.status(), body };
    }
    if (firstFailure) {
      const failed = await submit();
      check(`${width}: real API refuses the SMTP 451 attempt`, failed.status === 500 && failed.body.ok === false && failed.body.code === 'admission_failed');
      check(`${width}: SMTP failure returns no success receipt`, !failed.body.receipt);
      row.failurePosition = await focusedVisible(page, 'form [tabindex="-1"]', `${width}: delivery failure focuses a visible error summary`);
      check(`${width}: failure has no success heading`, await page.getByRole('heading', { name: 'Thank you. Your message is in.', exact: true }).count() === 0);
      for (const [key, id] of Object.entries(ids)) check(`${width}: failed delivery retains ${key}`, await page.locator('#' + id).inputValue() === fields[key]);
      check(`${width}: failed delivery keeps the alternate contact link`, await page.locator('form [tabindex="-1"] a[href^="https://www.facebook.com/"]').count() === 1);
      check(`${width}: first SMTP message was rejected rather than accepted`, report.smtp.attempts.length === 1 && report.smtp.attempts[0].reply === 451 && !report.smtp.attempts[0].accepted);
      await page.screenshot({ path: path.join(output, `contact-${width}-smtp-failure.png`), animations: 'disabled' });
    }
    const succeeded = await submit();
    check(`${width}: retry or initial positive request receives a real local API receipt`, succeeded.status === 200 && succeeded.body.ok === true && /^ct-[a-f0-9]{32}$/.test(succeeded.body.receipt?.receiptId ?? ''));
    const receipt = succeeded.body.receipt;
    check(`${width}: receipt has an actual timestamp`, Number.isFinite(Date.parse(receipt.receivedAt)));
    row.receiptPosition = await focusedVisible(page, 'h2[tabindex="-1"]', `${width}: actual API receipt focuses a visible confirmation heading`);
    check(`${width}: browser displays the actual API receipt`, await page.locator('[role="status"] code').innerText() === receipt.receiptId);
    const matching = report.smtp.attempts.filter(attempt => attempt.accepted && decodedBody(attempt.raw).includes('Receipt: ' + receipt.receiptId + '\n'));
    check(`${width}: exactly one accepted SMTP message binds to the browser receipt`, matching.length === 1);
    const message = matching[0], body = decodedBody(message.raw);
    check(`${width}: SMTP sender and sole recipient remain in the controlled sink`, message.sender === SMTP.from && message.recipients.length === 1 && message.recipients[0] === SMTP.to);
    check(`${width}: SMTP message has the same receipt timestamp`, body.includes('Received: ' + receipt.receivedAt + '\n'));
    for (const [key, label] of [['name', 'Name'], ['email', 'Email'], ['business', 'Business'], ['message', 'Message']]) check(`${width}: SMTP payload retains synthetic ${key}`, body.includes(label + ': ' + fields[key] + '\n'));
    row.receipt = receipt; row.smtpMessageSha256 = message.rawSha256;
    check(`${width}: exact real-local API attempt count`, row.posts.length === (firstFailure ? 2 : 1));
    await page.screenshot({ path: path.join(output, `contact-${width}-receipt.png`), animations: 'disabled' });
  } finally {
    report.cases.push(row);
    await context.close();
  }
}

async function cleanup() {
  if (cleanupPromise) return cleanupPromise;
  cleanupPromise = (async () => {
    cleanupStarted = true;
    if (browser) await browser.close().catch(error => report.errors.push({ kind: 'browser-cleanup', message: error.message }));
    if (nextProcess && !nextExit) {
      const exited = new Promise(resolve => nextProcess.once('exit', resolve));
      nextProcess.kill('SIGTERM');
      await Promise.race([exited, pause(5000)]);
      if (!nextExit) { nextProcess.kill('SIGKILL'); await Promise.race([exited, pause(5000)]); }
      if (!nextExit) report.errors.push({ kind: 'server-cleanup', message: 'Own Next server did not exit after cleanup signals' });
    }
    // A process exit may precede the last stdout/stderr data. Classify only
    // after close, which also establishes that both pipes have drained.
    if (nextClosedPromise) {
      await Promise.race([nextClosedPromise, pause(3000)]);
      if (!nextClosed) report.errors.push({ kind: 'server-cleanup', message: 'Own Next output pipes did not close before diagnostic classification' });
    }
    for (const socket of sockets) socket.destroy();
    if (sink?.listening) await new Promise(resolve => sink.close(resolve));
  })();
  return cleanupPromise;
}

function classifyServerDiagnostics() {
  if (report.serverDiagnostics) return;
  const rejected = report.smtp.attempts.filter(attempt => attempt.reply === 451 && !attempt.accepted);
  let rejectedReceipt;
  if (rejected.length === 1) {
    try { rejectedReceipt = /^Receipt: (ct-[a-f0-9]{32})$/m.exec(decodedBody(rejected[0].raw))?.[1]; }
    catch (error) { report.errors.push({ kind: 'server-diagnostic-binding', message: error.message }); }
  }
  const expectedFailure = rejectedReceipt
    ? `[submission-mailer] email delivery failed for contact receipt ${rejectedReceipt}: Message failed: 451 4.3.0 Controlled temporary fixture failure; retry later`
    : undefined;
  const diagnostics = {
    classifiedAfterProcessAndPipesClosed: nextClosed,
    rejectedSmtpReceiptId: rejectedReceipt ?? null,
    expectedStderr: [], startupStdout: [], unexpectedStderr: [], unexpectedStdout: [],
  };
  for (const raw of serverStderr.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (expectedFailure && line === expectedFailure) diagnostics.expectedStderr.push({ line, boundToRejectedSmtpReceipt: true });
    else diagnostics.unexpectedStderr.push({ line });
  }
  // These are the five structural lines emitted by this exact production
  // startup. Do not treat arbitrary warnings, stack traces or route errors
  // as startup chatter. All nonblank lines outside this list fail the gate.
  for (const raw of serverStdout.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    let category;
    if (line === `▲ Next.js ${report.nextVersion}`) category = 'version';
    else if (line.startsWith('- Local:') && line.slice('- Local:'.length).trim() === report.baseUrl) category = 'local-address';
    else if (line.startsWith('- Network:') && line.slice('- Network:'.length).trim() === report.baseUrl) category = 'network-address';
    else if (line === '✓ Starting...') category = 'starting';
    else if (/^✓ Ready in [0-9]+(?:\.[0-9]+)?(?:ms|s)$/.test(line)) category = 'ready';
    if (category) diagnostics.startupStdout.push({ category, line });
    else diagnostics.unexpectedStdout.push({ line });
  }
  for (const item of diagnostics.unexpectedStderr) report.errors.push({ kind: 'server-stderr', message: item.line });
  for (const item of diagnostics.unexpectedStdout) report.errors.push({ kind: 'server-stdout', message: item.line });
  report.serverDiagnostics = diagnostics;
  const checks = [
    ['Exactly one expected server SMTP 451 diagnostic is bound to the rejected fixture receipt', !!rejectedReceipt && diagnostics.expectedStderr.length === 1],
    ['Server stdout contains exactly the five known startup lines', diagnostics.startupStdout.length === 5 && new Set(diagnostics.startupStdout.map(item => item.category)).size === 5],
    ['No unexpected server stdout or stderr diagnostics after pipes close', nextClosed && diagnostics.unexpectedStderr.length === 0 && diagnostics.unexpectedStdout.length === 0],
  ];
  for (const [name, passed] of checks) {
    if (passed) report.checks.push(name);
    else report.failures.push({ scope: 'server-diagnostics', message: name });
  }
}

function saveReport() {
  classifyServerDiagnostics();
  report.finishedAt = new Date().toISOString();
  report.passed = report.failures.length === 0 && report.errors.length === 0;
  report.nextExit = nextExit;
  fs.writeFileSync(path.join(output, 'next-loopback.log'), serverLog);
  fs.writeFileSync(path.join(output, 'next-stdout.log'), serverStdout);
  fs.writeFileSync(path.join(output, 'next-stderr.log'), serverStderr);
  fs.writeFileSync(path.join(output, 'contact-delivery.json'), JSON.stringify(report, null, 2) + '\n');
  process.stdout.write(JSON.stringify({ passed: report.passed, checks: report.checks.length, smtpAttempts: report.smtp.attempts.length, acceptedByControlledSink: report.smtp.attempts.filter(attempt => attempt.accepted).length, failures: report.failures, unexpectedErrors: report.errors, productionDeliveryProved: false }, null, 2) + '\n');
}

for (const [signal, exitCode] of [['SIGINT', 130], ['SIGTERM', 143]]) {
  process.once(signal, () => {
    report.failures.push({ message: `Fixture interrupted by ${signal}` });
    cleanup().then(() => { saveReport(); process.exit(exitCode); }).catch(error => {
      process.stderr.write(`Fixture cleanup failed: ${error.message}\n`); process.exit(exitCode);
    });
  });
}

(async () => {
  try {
    const smtpPort = await startSink();
    const port = await unusedPort(); report.baseUrl = `http://127.0.0.1:${port}`;
    // Deliberately do not spread process.env. Next receives only this test
    // environment and dummy local transport values, never host credentials.
    const env = {
      NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', PATH: path.dirname(process.execPath),
      FYD_SMTP_HOST: '127.0.0.1', FYD_SMTP_PORT: String(smtpPort),
      FYD_SMTP_USER: SMTP.user, FYD_SMTP_PASS: SMTP.pass,
      FYD_SMTP_FROM: SMTP.from, FYD_SUBMISSION_EMAIL_TO: SMTP.to,
    };
    nextProcess = spawn(process.execPath, [nextBin, 'start', '--hostname', '127.0.0.1', '--port', String(port)], { cwd: source, env, stdio: ['ignore', 'pipe', 'pipe'] });
    report.nextProcessId = nextProcess.pid;
    const captureLog = (stream, data) => {
      if (serverLog.length + data.length > 1048576) {
        if (!report.errors.some(error => error.kind === 'server-log-bound')) report.errors.push({ kind: 'server-log-bound', message: 'Own server log exceeded the 1 MiB fixture bound' });
        return;
      }
      serverLog += data.toString();
      if (stream === 'stdout') serverStdout += data.toString();
      else serverStderr += data.toString();
    };
    nextProcess.stdout.on('data', data => captureLog('stdout', data));
    nextProcess.stderr.on('data', data => captureLog('stderr', data));
    nextClosedPromise = new Promise(resolve => nextProcess.once('close', () => { nextClosed = true; resolve(); }));
    nextProcess.on('error', error => report.errors.push({ kind: 'server-process', message: error.message }));
    nextProcess.on('exit', (code, signal) => {
      nextExit = { code, signal };
      if (!cleanupStarted) report.errors.push({ kind: 'server-process', message: 'Own Next server exited before cleanup', code, signal });
    });
    await waitForServer(report.baseUrl);
    browser = await chromium.launch({ headless: true, env: { PATH: path.dirname(process.execPath) }, args: ['--disable-background-networking', '--disable-component-update', '--disable-sync'] });
    report.browser = browser.version();
    await runCase(390, true);
    await runCase(1440, false);
    check('Exactly one SMTP 451 failure and two accepted synthetic messages', report.smtp.attempts.length === 3 && report.smtp.attempts.filter(attempt => attempt.reply === 451).length === 1 && report.smtp.attempts.filter(attempt => attempt.accepted).length === 2);
    check('Every SMTP connection authenticates with the dummy fixture identity', report.smtp.authSuccesses === 3);
    check('No public-site requests or other backend writes were attempted', report.blockedExternalRequests.length === 0 && report.blockedOtherWrites.length === 0);
    check('No unexpected hydration, console, process or fixture errors', report.errors.length === 0);
  } catch (error) {
    report.failures.push({ message: error.message, stack: error.stack });
  } finally {
    await cleanup(); saveReport();
    if (!report.passed) process.exitCode = 1;
  }
})().catch(async error => {
  report.failures.push({ message: error.message, stack: error.stack });
  await cleanup(); saveReport(); process.exitCode = 1;
});
