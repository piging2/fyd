import { register, syncBuiltinESMExports } from 'node:module';
import net from 'node:net';
import tls from 'node:tls';
import dns from 'node:dns';

if (process.env.FYD_P0_CHILD !== '1' || !process.send) {
  throw new Error('P0 preload requires an isolated IPC child');
}
register('./loader.mjs', import.meta.url);
// A frozen poll promise alone is not an event-loop handle. Keep IPC alive so
// the controller, rather than Node's unsettled-top-level-await exit, kills it.
process.on('message', () => {});

const allowedPorts = new Set([
  Number(process.env.FYD_P0_STORAGE_PORT), Number(process.env.FYD_P0_SMTP_PORT),
]);
let probing = false;
function reject(message) {
  if (!probing) process.send({ kind: 'isolation-block', message });
  throw new Error(message);
}
function checkNetwork(args) {
  let value = args[0];
  if (Array.isArray(value)) value = value[0];
  const options = typeof value === 'object' && value !== null
    ? value : { port: value, host: typeof args[1] === 'string' ? args[1] : 'localhost' };
  if (options.path || !['127.0.0.1', '::1'].includes(options.host) || !allowedPorts.has(Number(options.port))) {
    reject('P0 denies non-fixture socket destination');
  }
}
const socketConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  checkNetwork(args);
  return socketConnect.apply(this, args);
};
const tlsConnect = tls.connect;
tls.connect = function (...args) {
  checkNetwork(args);
  return tlsConnect.apply(this, args);
};
for (const method of ['lookup', 'resolve', 'resolve4', 'resolve6']) {
  dns[method] = () => reject('P0 denies DNS resolution');
}
const realFetch = globalThis.fetch;
globalThis.fetch = (input, options) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || Number(url.port) !== Number(process.env.FYD_P0_STORAGE_PORT)) {
    reject('P0 denies non-fixture fetch destination');
  }
  return realFetch(input, options);
};
syncBuiltinESMExports();

// Negative checks execute the guard, never the underlying network call.
probing = true;
let rejectedDestinations = 0;
for (const options of [
  { host: 'smtp.mail.yahoo.com', port: [...allowedPorts][0] },
  { host: '127.0.0.1', port: 0 },
  { path: '/not-a-fixture.sock' },
]) {
  try { checkNetwork([options]); } catch { rejectedDestinations++; }
}
let rejectedDns = false, rejectedFetch = false;
try { dns.lookup('not-a-fixture.invalid'); } catch { rejectedDns = true; }
try { globalThis.fetch('https://not-a-fixture.invalid'); } catch { rejectedFetch = true; }
probing = false;
if (rejectedDestinations !== 3 || !rejectedDns || !rejectedFetch) throw new Error('P0 isolation self-check failed');
process.send({ kind: 'isolation-self-check', rejectedDestinations, rejectedDns, rejectedFetch });

const RealDate = Date;
const now = Date.UTC(2026, 0, 1) + Number(process.env.FYD_P0_TIME_MS || 0);
globalThis.Date = class extends RealDate {
  constructor(...args) { super(...(args.length ? args : [now])); }
  static now() { return now; }
};

// Freeze only the reference's poll loop. SMTP and HTTP retain real timers.
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = function (callback, delay, ...args) {
  const stack = new Error().stack ?? '';
  if (delay === 1000 && stack.includes('worker-20261025.mjs')) {
    process.send({ kind: 'idle', now });
    return { ref() {}, unref() {} };
  }
  return realSetTimeout(callback, delay, ...args);
};

process.send({ kind: 'isolation-ready', now, envKeys: Object.keys(process.env).sort() });
