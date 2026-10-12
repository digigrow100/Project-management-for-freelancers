const fs=require('node:fs');const vm=require('node:vm');const ts=require('typescript');const assert=require('node:assert/strict');
const source=fs.readFileSync('components/WhatsAppBridgeManager.tsx','utf8');const code=source.slice(source.indexOf('  async function peekSelectedChat'),source.indexOf('  useEffect(',source.indexOf('  async function peekSelectedChat')));
let release,merges=0,requests=0;
const box={livePeekRunning:{current:false},manualActionRunning:{current:false},currentSelectedChatId:{current:'a'},selectedDate:'2026-10-12',adminNotificationBaseline:{current:''},adminSeenInbound:{current:new Set()},window:{},createRequest:async()=>{requests++;return 'request';},waitForRequest:()=>new Promise(r=>release=r),mergeVisibleHistory:()=>merges++};
vm.runInNewContext(ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,box);
const result={status:'done',result:{messages:[]}};
(async()=>{
 box.manualActionRunning.current=true;await box.peekSelectedChat({id:'a'});assert.equal(requests,0);
 box.manualActionRunning.current=false;let run=box.peekSelectedChat({id:'a'});await new Promise(r=>setImmediate(r));box.manualActionRunning.current=true;release(result);await run;assert.equal(merges,0);
 box.manualActionRunning.current=false;run=box.peekSelectedChat({id:'a'});await new Promise(r=>setImmediate(r));box.currentSelectedChatId.current='b';release(result);await run;assert.equal(merges,0);
 box.currentSelectedChatId.current='a';run=box.peekSelectedChat({id:'a'});await new Promise(r=>setImmediate(r));release(result);await run;assert.equal(merges,1);assert.equal(box.livePeekRunning.current,false);
 console.log('Passed: manual actions pause peeks; stale responses cannot overwrite another chat; current responses still merge.');
})().catch(e=>{console.error(e);process.exitCode=1;});
