const fs=require('fs'),path=require('path'),vm=require('vm'),ts=require('typescript'),assert=require('node:assert/strict'),{randomUUID}=require('crypto');
let denied=false,calls=[],rpcResult,lookups=0,revalidate=[];
const fixtures={};
function load(file){if(fixtures[file])return fixtures[file];const m={exports:{}};const req=n=>{
 if(n==='server-only')return {};
 if(n==='@/lib/hosting/auth')return {requireHostingAdmin:async()=>{if(denied)throw Error('denied');return {id:'owner'};}};
 if(n==='@/lib/supabaseClient')return {getSupabase:()=>({rpc:async(name,args)=>{calls.push({name,args});return rpcResult;}})};
 if(n==='@/lib/security/rateLimit')return {rateLimit:async()=>{}};
 if(n==='next/cache')return {revalidatePath:p=>revalidate.push(p)};
 if(n.startsWith('@/')||n.startsWith('.')){const base=n.startsWith('@/')?n.slice(2):path.join(path.dirname(file),n);return load(['.ts','.tsx'].map(e=>base+e).find(fs.existsSync));}return require(n);
 };vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:m,exports:m.exports,require:req,process,console,FormData,URL,Buffer});fixtures[file]=m.exports;return m.exports;}
(async()=>{
 const {observeEmailDns}=load('lib/hosting/email/dns.ts'),schema=load('lib/hosting/email/schema.ts');
 const token='a'.repeat(64),missing=()=>Object.assign(Error(),{code:'ENODATA'});
 let txt={['_housemysite-verification.example.test']:[['housemysite-verification=',token]],['example.test']:[['v=spf1 mx -all']],['_dmarc.example.test']:[['v=DMARC1; p=none']]},mx=[{exchange:'MAIL.EXAMPLE.TEST.',priority:10}];
 const resolver={resolveTxt:async n=>{lookups++;if(!txt[n])throw missing();return txt[n];},resolveMx:async()=>{lookups++;return mx;}};
 assert.equal((await observeEmailDns('example.test',token,'mail.example.test',resolver)).ownership,'matched');assert.equal((await observeEmailDns('example.test',token,'mail.example.test',resolver)).mx,'matched');
 mx.push({exchange:'old.other.test',priority:20});assert.equal((await observeEmailDns('example.test',token,'mail.example.test',resolver)).mx,'different','old mail routing cannot be labelled matched');
 txt['example.test'].push(['v=spf1 include:other.test ~all']);assert.equal((await observeEmailDns('example.test',token,'',resolver)).spf,'multiple');assert.equal((await observeEmailDns('example.test',token,'',resolver)).mx,'not_configured');
 txt={};const no=await observeEmailDns('example.test',token,'mail.example.test',resolver);assert.equal(no.ownership,'missing');assert.equal(no.spf,'missing');
 const fail={resolveTxt:async()=>{throw Object.assign(Error(),{code:'ETIMEOUT'});},resolveMx:async()=>{throw Error();}};const unavailable=await observeEmailDns('example.test',token,'mail.example.test',fail);assert.equal(unavailable.ownership,'unavailable');assert.equal(unavailable.mx,'unavailable');
 const before=lookups;await assert.rejects(observeEmailDns('https://example.test',token,'',resolver));await assert.rejects(observeEmailDns('example.test','bad','',resolver));assert.equal(lookups,before);
 for(const value of ['https://user:pass@webmail.test','http://webmail.test','https://127.0.0.1','https://mail.example.test/?token=secret'])assert.equal(schema.emailSettings.safeParse({...schema.emptyEmailSettings,webmail_url:value}).success,false);
 const actions=load('lib/hosting/email/actions.ts');denied=true;await assert.rejects(actions.emailWorkspace(),/denied/);const form=new FormData();form.set('action','add');form.set('hostname','example.test');await assert.rejects(actions.emailAction(form),/denied/);assert.equal(calls.length,0);denied=false;
 rpcResult={data:{id:randomUUID(),hostname:'example.test'},error:null};let r=await actions.emailAction(form);assert.equal(r.ok,true);assert.equal(calls[0].args.p_hostname,'example.test');assert.match(calls[0].args.p_token,/^[a-f0-9]{64}$/);assert.ok(!JSON.stringify(calls).includes('password'));
 const n=calls.length;form.set('hostname','bad/path');r=await actions.emailAction(form);assert.equal(r.ok,false);assert.equal(calls.length,n,'invalid hostname never reaches storage');
 rpcResult={data:null,error:{message:'PRIVATE_SENTINEL'}};form.set('hostname','example.test');r=await actions.emailAction(form);assert.equal(r.ok,false);assert.ok(!r.error.includes('PRIVATE_SENTINEL'));
 console.log('PASS email server: exact TXT proof, DNS timeouts, mixed MX, multiple SPF, input rejection, no arbitrary fetch, owner guards, random challenges and safe errors.');
})().catch(e=>{console.error(e);process.exitCode=1});
