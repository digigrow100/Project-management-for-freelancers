const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('node:assert/strict'),{createHmac}=require('node:crypto');
const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/hosting/registrar/api.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:m,exports:m.exports,require:n=>n==='server-only'?{}:n==='./schema'?{}:require(n),process,URL,AbortSignal,fetch,setTimeout});
(async()=>{
const env={...process.env};try{
const {providerRequest}=m.exports,c={key:'synthetic-key',secret:'provider-secret-never-relayed',mode:'production'};
process.env.DYNADOT_RELAY_ENABLED='approved';process.env.HOSTING_SERVICES_ORIGIN='https://server.example.com';process.env.HOSTING_SERVICES_PORTAL_KEY='synthetic-relay-key'.repeat(3);
const calls=[];const transport=async(url,options)=>{calls.push({url:String(url),options});return new Response('{"code":200}',{headers:{'X-HMS-Dynadot-Forwarded':'1'}})};
const id='11111111-1111-4111-8111-111111111111';await providerRequest(c,'PUT','/restful/v2/domains/example.com/domain_lock','{"lock":true}',id,transport);
assert.equal(calls.length,1);assert.equal(calls[0].url,'https://server.example.com/v1/dynadot-relay');
const packet=JSON.parse(calls[0].options.body);assert.equal(packet.request_id,id);assert.equal(packet.body,'{"lock":true}');assert.equal(packet.key,c.key);assert.ok(!calls[0].options.body.includes(c.secret));assert.ok(!('Authorization' in calls[0].options.headers));
assert.equal(calls[0].options.headers['X-HMS-Dynadot-Signature'],createHmac('sha256',process.env.HOSTING_SERVICES_PORTAL_KEY).update('hms:dynadot-relay:v1:'+calls[0].options.body).digest('hex'));
assert.equal(packet.signature,createHmac('sha256',c.secret).update([c.key,packet.path,id,packet.body].join('\n')).digest('base64'));
let count=0;await assert.rejects(providerRequest(c,'GET','/restful/v2/domains/example.com','',id,async()=>{count++;throw Error('lost reply')}));assert.equal(count,1,'no direct fallback/retry');
await assert.rejects(providerRequest(c,'GET','/restful/v2/domains/example.com','',id,async()=>new Response('{}',{status:403})),/relay_unavailable/);
process.env.HOSTING_SERVICES_ORIGIN='http://insecure.example.com';await assert.rejects(providerRequest(c,'GET','/restful/v2/domains/example.com','',id,transport),/relay_configuration/);assert.equal(calls.length,1);
process.env.DYNADOT_RELAY_ENABLED='true';await assert.rejects(providerRequest(c,'GET','/restful/v2/domains/example.com','',id,transport),/relay_configuration/);
console.log('PASS: signed fixed-origin relay, no provider signing secret, no fallback/retry, strict configuration.');
}finally{for(const k of Object.keys(process.env))if(!(k in env))delete process.env[k];Object.assign(process.env,env);}
})().catch(e=>{console.error(e);process.exit(1)});
