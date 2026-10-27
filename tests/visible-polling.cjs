const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');

function fixture(){
 let now=1000000,serial=0;const timers=new Map(),listeners=new Set();
 const state={calls:0,received:[],response:()=>Promise.resolve(Response.json({value:1}))};
 const document={visibilityState:'visible',addEventListener:(_,fn)=>listeners.add(fn),removeEventListener:(_,fn)=>listeners.delete(fn)};
 const FakeDate=class extends Date{static now(){return now;}};
 const output={exports:{}};
 const source=ts.transpileModule(fs.readFileSync('lib/visiblePolling.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText;
 const setTimeout=(fn,delay)=>{const id=++serial;timers.set(id,{at:now+delay,fn});return id;};
 const clearTimeout=id=>timers.delete(id);
 vm.runInNewContext(source,{module:output,exports:output.exports,Date:FakeDate,document,AbortController,setTimeout,clearTimeout,fetch:(_,options)=>{state.calls++;return state.response(options.signal);}});
 const flush=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};
 async function advance(ms){const end=now+ms;while(true){const next=[...timers.entries()].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;now=next[1].at;timers.delete(next[0]);next[1].fn();await flush();}now=end;await flush();}
 async function visible(value){document.visibilityState=value?'visible':'hidden';for(const fn of [...listeners])fn();await flush();}
 const stop=output.exports.startVisiblePolling('/synthetic-summary',data=>state.received.push(data));
 return {state,advance,visible,stop,listeners};
}
test('polls once per minute, sleeps while hidden and resumes without overlapping timers',async()=>{
 const f=fixture();await f.advance(59000);assert.equal(f.state.calls,0);await f.advance(1000);assert.equal(f.state.calls,1);
 await f.visible(false);await f.advance(3600000);assert.equal(f.state.calls,1);await f.visible(true);assert.equal(f.state.calls,2);
 await f.visible(false);await f.visible(true);assert.equal(f.state.calls,2);
 f.stop();await f.advance(3600000);assert.equal(f.state.calls,2);assert.equal(f.listeners.size,0);
});
test('Retry-After survives visibility changes and unauthorized response stops polling',async()=>{
 const f=fixture();f.state.response=async()=>new Response('{}',{status:429,headers:{'Retry-After':'300'}});
 await f.advance(60000);assert.equal(f.state.calls,1);await f.visible(false);await f.visible(true);assert.equal(f.state.calls,1);
 await f.advance(299999);assert.equal(f.state.calls,1);f.state.response=async()=>Response.json({value:2});await f.advance(1);assert.equal(f.state.calls,2);
 f.state.response=async()=>new Response('{}',{status:401});await f.advance(60000);assert.equal(f.state.calls,3);await f.advance(3600000);assert.equal(f.state.calls,3);assert.equal(f.listeners.size,0);
});
test('unmount cancels in-flight work and discards a late successful result',async()=>{
 const f=fixture();let resolve;
 f.state.response=()=>new Promise(done=>resolve=done);
 await f.advance(60000);assert.equal(f.state.calls,1);f.stop();resolve(Response.json({value:'stale'}));await f.advance(0);assert.equal(f.state.received.length,0);
 await f.advance(60000);assert.equal(f.state.calls,1);
});
test('timed-out fetch backs off and quota response waits fifteen minutes',async()=>{
 const f=fixture();f.state.response=signal=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted'))));
 await f.advance(80000);assert.equal(f.state.calls,1);
 f.state.response=async()=>new Response('{}',{status:402});await f.advance(119999);assert.equal(f.state.calls,1);await f.advance(1);assert.equal(f.state.calls,2);
 await f.advance(899999);assert.equal(f.state.calls,2);f.stop();
});
test('minute polling does not falsely mark a fresh checkpoint offline or estimate over ninety seconds',()=>{
 const output={exports:{}};
 const source=ts.transpileModule(fs.readFileSync('components/AdminMyWorkTime.tsx','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 vm.runInNewContext(source,{module:output,exports:output.exports,Date,Intl,require:name=>name.startsWith('@/')?{}:require(name)});
 const start=1700000000000,summary={status:'active',deviceCount:1,lastSeenAt:new Date(start).toISOString()};
 const f=output.exports.workTimeDisplay;
 assert.equal(f(summary,start+105000).status,'active');assert.equal(f(summary,start+105000).liveSeconds,90);
 assert.equal(f(summary,start+149000).liveSeconds,90);assert.equal(f(summary,start+151000).status,'offline');assert.equal(f(summary,start+151000).liveSeconds,0);
 assert.equal(f({...summary,status:'idle'},start+60000).liveSeconds,0);assert.equal(f(null,start).status,'offline');
});
