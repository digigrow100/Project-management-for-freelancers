const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const crypto = require('node:crypto').webcrypto;
async function run() {
  const module = { exports: {} };
  const compiled = ts.transpileModule(fs.readFileSync('lib/activityPagination.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(compiled, { exports: module.exports, module });
  const rows = Array.from({length: 1601}, (_, id) => ({id, seconds: 10}));
  const result = await module.exports.readAllActivityRows(async (from,to) => ({data: rows.slice(from,to+1),error: null}));
  assert.equal(result.data.length,1601);
  assert.equal(result.data.reduce((s,r)=>s+r.seconds,0),16010);
  const failed = await module.exports.readAllActivityRows(async from => ({data: from ? null : rows.slice(0,500),error: from ? 'failure' : null}));
  assert.equal(failed.error,'failure');
  assert.equal(failed.data.length,0);

  const noop = {addListener(){}};
  const storage = { appOrigin: 'https://example.com',deviceToken:'test',deviceId:'test',extensionInstallId:'test',activityQueue:[],promptQueue:[],workStarted:true,sessionId:crypto.randomUUID() };
  let releaseUpload, uploadStarted;
  let uploads = 0;
  const uploadReady = new Promise(resolve => uploadStarted = resolve);
  const context = {crypto,Headers,Date,console,navigator:{},chrome:{
    storage:{local:{get: async keys => Object.fromEntries(keys.map(k=>[k,structuredClone(storage[k])])),set:async data=>Object.assign(storage,structuredClone(data)),setAccessLevel:async()=>{}}},
    idle:{setDetectionInterval(){},queryState:async()=> 'active',onStateChanged:noop},
    windows:{getLastFocused:async()=>({id:1,focused:true}),onFocusChanged:noop},
    tabs:{query:async()=>[{url:'https://example.com',title:'Work'}],onActivated:noop,onUpdated:noop},
    alarms:{create(){},clear:async()=>{},onAlarm:noop},runtime:{onInstalled:noop,onStartup:noop,onMessage:noop}},
    fetch:async url=> {if(url.endsWith('/health'))return {ok:false}; uploads++;uploadStarted();await new Promise(r=>releaseUpload=r);return {ok:true};}
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('chrome-extension/service-worker.js','utf8'),context);
  storage.currentInterval={activityType:'active',startedAt:new Date(Date.now()-10000).toISOString()};
  await vm.runInContext('Promise.all([track(() => closeCurrentInterval(Date.now(), "pause")),track(() => closeCurrentInterval(Date.now(), "pause"))])',context);
  assert.equal(storage.activityQueue.length,1,'Concurrent pauses must only save one interval');
  const upload = vm.runInContext('flushQueues()',context);
  await uploadReady;
  const duplicateFlush = vm.runInContext('flushQueues()',context);
  await vm.runInContext('queueEvent({activityType:"active",durationSeconds:5})',context);
  releaseUpload();await Promise.all([upload,duplicateFlush]);
  assert.equal(uploads,1,'Only one upload may run at once');
  assert.equal(storage.activityQueue.length,1,'New activity during upload must survive');
  assert.equal(storage.activityQueue[0].durationSeconds,5);
  storage.currentInterval={activityType:'active',startedAt:new Date(Date.now()-8593000).toISOString()};
  await vm.runInContext('track(() => closeCurrentInterval(Date.now(), "heartbeat_checkpoint"))',context);
  assert.equal(storage.activityQueue.at(-1).durationSeconds,90,'A long unobserved gap must not become hours of work');
  console.log('Passed: pagination, partial failure, concurrent pause, concurrent upload, preservation of queued work.');
}
run().catch(e=>{console.error(e);process.exitCode=1;});
