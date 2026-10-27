const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),ts=require('typescript'),{randomUUID:id}=require('crypto');
function load(path,overrides={}){const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{module:m,exports:m.exports,require:n=>n in overrides?overrides[n]:require(n),process,Date,TextDecoder,atob,btoa});return m.exports;}
const schema=load('lib/hosting/operatorSchema.ts');
const p=load('lib/hosting/operatorProtocol.ts',{'./operatorSchema':schema});
const request={operation:'project.create',idempotency_key:id(),payload:{name:'Shop'},auth:{issued:1792600000,signature:'a'.repeat(86)+'=='}};
assert.equal(p.typedRequest.safeParse(request).success,true);
for(const patch of [{operation:'project.delete'},{role:'owner'},{payload:{name:'Shop',project:'c12345678'}},{auth:{...request.auth,private_key:'secret'}},{idempotency_key:'bad'}])assert.equal(p.typedRequest.safeParse({...request,...patch}).success,false);
for(const op of ['project.suspend','project.resume'])assert.equal(p.typedRequest.safeParse({...request,operation:op,payload:{project:'c12345678'}}).success,true);
assert.equal(p.typedRequest.safeParse({...request,operation:'deploy.request',payload:{project:'c12345678',scope:'preview',commit:'a'.repeat(40)}}).success,true);
assert.notEqual(p.credentialDigest('x'),p.digest('x'));
const body=load('lib/hosting/operatorBody.ts',{'./operatorSchema':schema});
(async()=>{
 assert.equal(await body.readOperatorBody(new Request('https://test.invalid',{method:'POST',body:'{}'})),'{}');
 await assert.rejects(body.readOperatorBody(new Request('https://test.invalid',{method:'POST',body:'x'.repeat(131073)})),/budget/);
 const op=load('lib/hosting/operator.ts',{'server-only':{},'@/lib/supabaseClient':{getSupabase:()=>({rpc:async()=>{throw new Error('must not call')}})},'./operatorProtocol':p,'./operatorTrustedContext':{trustedOperatorContext(){throw Error('not used')},verifyOperatorRequest(){throw Error('not used')}}});
 const previous=process.env.HOSTING_OPERATOR_TRANSPORT;delete process.env.HOSTING_OPERATOR_TRANSPORT;
 await assert.rejects(op.operatorExchange({server_id:id(),claim_id:id()},'Bearer '+'a'.repeat(43)),/disabled/);
 process.env.HOSTING_OPERATOR_TRANSPORT='approved';await assert.rejects(op.operatorExchange({},null),/denied/);
 if(previous===undefined)delete process.env.HOSTING_OPERATOR_TRANSPORT;else process.env.HOSTING_OPERATOR_TRANSPORT=previous;
 console.log('Operator protocol: typed requests, secret exclusion, body bounds, default-off and authentication PASS');
})().catch(e=>{console.error(e);process.exit(1)});

