const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log('PASS', name); }
const gateSource = fs.readFileSync('chrome-extension/request-gate.js', 'utf8');
function fixture(saved = {}) {
  const data = structuredClone(saved);
  let time = 1000000;
  const storage = { async get() { return structuredClone(data); }, async set(v) { Object.assign(data, structuredClone(v)); } };
  const ctx = vm.createContext({ Response, Date, Math });
  vm.runInContext(gateSource, ctx);
  const gate = new ctx.FhqRequestGate(storage, () => time, () => 0);
  return { gate, data, storage, ctx, now: () => time, advance: ms => { time += ms; } };
}
const reply = (status, headers) => new Response('{}', { status, headers });
(async () => {
await test('402 waits fifteen minutes and retains pairing/queues', async () => {
  const f = fixture({ deviceToken: 'test-token', activityQueue: [{ id: 1 }], promptQueue: [{ id: 2 }] });
  let calls = 0;
  await f.gate.run(async () => { calls++; return reply(402); });
  for (let i = 0; i < 100; i++) assert.equal((await f.gate.run(async () => { calls++; return reply(200); })).status, 503);
  assert.equal(calls, 1);
  assert.equal(f.data.extensionRetryState.until - f.now(), 900000);
  assert.equal(f.data.deviceToken, 'test-token');
  assert.equal(f.data.activityQueue.length, 1); assert.equal(f.data.promptQueue.length, 1);
});
await test('cooldown survives a new worker context', async () => {
  const f = fixture(); await f.gate.run(async () => reply(503));
  const next = new f.ctx.FhqRequestGate(f.storage, f.now, () => 0);
  assert.equal((await next.run(() => { throw Error('must not fetch'); })).status, 503);
});
await test('network and legacy 400 failures back off exponentially with cap', async () => {
  const f = fixture();
  await f.gate.run(() => { throw Error('offline'); });
  assert.equal(f.data.extensionRetryState.until - f.now(), 60000);
  for (const delay of [120000, 240000, 480000, 900000, 900000]) {
    f.advance(3600000); await f.gate.run(async () => reply(400));
    assert.equal(f.data.extensionRetryState.until - f.now(), delay);
  }
});
await test('Retry-After seconds and dates honored with a one-hour cap', async () => {
  for (const value of ['300', new Date(1300000).toUTCString(), '999999']) {
    const f = fixture(); await f.gate.run(async () => reply(429, { 'retry-after': value }));
    assert.equal(f.data.extensionRetryState.until - f.now(), value === '999999' ? 3600000 : 300000);
  }
});
await test('success after cooldown resets failure state', async () => {
  const f = fixture(); await f.gate.run(async () => reply(503)); f.advance(60000);
  assert.equal((await f.gate.run(async () => reply(200))).status, 200);
  assert.equal(f.data.extensionRetryState, null);
});
await test('401 remains a real authentication failure', async () => {
  const f = fixture(); assert.equal((await f.gate.run(async () => reply(401))).status, 401);
  assert.equal(f.data.extensionRetryState, null);
});
await test('overlapping uploads issue one network request', async () => {
  const f = fixture(); let release; let calls = 0;
  const first = f.gate.run(() => { calls++; return new Promise(r => { release = r; }); });
  await new Promise(setImmediate);
  assert.equal((await f.gate.run(async () => { calls++; return reply(200); })).status, 503);
  release(reply(200)); await first; assert.equal(calls, 1);
});
await test('screen signaling queues concurrent ICE instead of dropping it', async () => {
  const f = fixture(); let release; const sent = [];
  const first = f.gate.run(() => { sent.push('offer'); return new Promise(r => { release = r; }); }, true);
  await new Promise(setImmediate);
  const second = f.gate.run(async () => { sent.push('ice'); return reply(200); }, true);
  release(reply(200)); await Promise.all([first, second]); assert.deepEqual(sent, ['offer', 'ice']);
});
await test('jitter only extends the minimum delay', async () => {
  const f = fixture(); const gate = new f.ctx.FhqRequestGate(f.storage, f.now, () => 0.5);
  await gate.run(async () => reply(503)); assert.equal(f.data.extensionRetryState.until - f.now(), 63000);
});
await test('real worker retains failed batches, resumes once and clears only confirmed 401 pairing', async () => {
  const f = fixture(); const event = { addListener() {} }; let status = 503; let calls = 0;
  const chrome = {
    storage: { local: { ...f.storage, async setAccessLevel() {} } },
    idle: { setDetectionInterval() {}, onStateChanged: event },
    runtime: { onInstalled: event, onStartup: event, onMessage: event },
    alarms: { onAlarm: event }, tabs: { onActivated: event, onUpdated: event }, windows: { onFocusChanged: event },
  };
  const ctx = vm.createContext({ chrome, Headers, Response, AbortSignal, crypto: require('node:crypto').webcrypto,
    Date, Math, fetch: async (_url, options) => { calls++; assert.ok(options.signal); return reply(status); } });
  ctx.importScripts = () => vm.runInContext(gateSource, ctx);
  vm.runInContext(fs.readFileSync('chrome-extension/service-worker.js', 'utf8'), ctx);
  await new Promise(setImmediate);
  Object.assign(f.data, { deviceToken: 'test-token-long', deviceId: 'd', extensionInstallId: 'i', appOrigin: 'https://example.test', activityQueue: [{ id: 1 }], promptQueue: [{ id: 2 }] });
  await vm.runInContext('flushQueues()', ctx);
  assert.equal(calls, 1); assert.equal(f.data.activityQueue.length, 1); assert.equal(f.data.promptQueue.length, 1);
  assert.equal(f.data.deviceToken, 'test-token-long');
  f.data.extensionRetryState.until = 0; status = 200;
  await vm.runInContext('flushQueues()', ctx);
  assert.equal(calls, 3); assert.equal(f.data.activityQueue.length, 0); assert.equal(f.data.promptQueue.length, 0);
  status = 401; f.data.activityQueue = [{ id: 3 }];
  await vm.runInContext('flushQueues()', ctx);
  assert.equal(f.data.deviceToken, null); assert.equal(f.data.activityQueue.length, 1);
});
await test('real screen API sends identity headers and respects shared cooldown', async () => {
  const f = fixture({ appOrigin: 'https://example.test', deviceToken: 'test', extensionInstallId: 'install', deviceId: 'device' });
  const elements = new Proxy({}, { get: () => ({ addEventListener() {}, disabled: false }) }); let calls = 0;
  const ctx = vm.createContext({ chrome: { storage: { local: f.storage } }, Headers, Response, AbortSignal, Date, Math,
    document: { getElementById: id => elements[id] }, window: { addEventListener() {} },
    fetch: async (_url, options) => { calls++; assert.equal(options.headers.get('x-device-id'), 'device'); assert.equal(options.headers.get('x-extension-install-id'), 'install'); return reply(503); },
  });
  vm.runInContext(gateSource, ctx); vm.runInContext(fs.readFileSync('chrome-extension/share.js', 'utf8'), ctx);
  await vm.runInContext('api("/api/extension/screen-share/signal")', ctx);
  await vm.runInContext('api("/api/extension/screen-share/signal")', ctx); assert.equal(calls, 1);
});
await test('server circuit fails closed and expires without caching identity', async () => {
  const helper = await import(pathToFileURL(path.resolve('lib/extensionAvailability.ts')).href);
  const original = Date.now; let now = original(); Date.now = () => now;
  try {
    helper.assertExtensionServiceAvailable();
    assert.throws(() => helper.noteExtensionServiceFailure(402), helper.ExtensionServiceUnavailable);
    assert.throws(() => helper.assertExtensionServiceAvailable(), helper.ExtensionServiceUnavailable);
    now += 60001; helper.assertExtensionServiceAvailable();
    helper.noteExtensionServiceFailure(401); helper.assertExtensionServiceAvailable();
  } finally { Date.now = original; }
});
console.log(`${passed} recovery/backoff checks passed.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
