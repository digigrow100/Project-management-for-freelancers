const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,mocks={},env={}){const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2020}}).outputText,{module:m,exports:m.exports,require:n=>n==='server-only'?{}:n in mocks?mocks[n]:require(n),process:{env},Buffer,Date,URL,FormData});return m.exports;}
let enrolled=false,aal='aal1',active=true,dbError=false,userMismatch=false,validated=true,calls=0;
const user={id:'11111111-1111-4111-8111-111111111111'};
const sessionId='22222222-2222-4222-8222-222222222222';
const auth={auth:{getUser:async()=>({data:{user:validated?{...user,factors:enrolled?[{status:'verified'}]:[]}:null},error:null}),getSession:async()=>({data:{session:{user:{id:userMismatch?'other':user.id},access_token:'header.'+Buffer.from(JSON.stringify({session_id:sessionId})).toString('base64url')+'.signature'}},error:null}),mfa:{getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:aal},error:null})}}};
const redirect=url=>{const e=new Error(url);e.redirect=url;throw e};
const gate=load('lib/security/mfa.ts',{'next/navigation':{redirect},'@/lib/supabase/server':{createAuthClient:()=>auth},'@/lib/supabaseClient':{getSupabase:()=>({rpc:async(name,args)=>{calls++;assert.equal(args.p_user,user.id);assert.equal(args.p_session,sessionId);return {data:active,error:dbError?{}:null}}})}});
(async()=>{
await gate.requireHostingSession();await assert.rejects(gate.requireHostingSession(true),e=>e.redirect==='/login/security');
enrolled=true;await assert.rejects(gate.requireHostingSession(),e=>e.redirect==='/login/security');await assert.rejects(gate.requireEnrolledMfa());
aal='aal2';await gate.requireHostingSession(true);await gate.requireEnrolledMfa();
active=false;await assert.rejects(gate.requireHostingSession(),e=>e.redirect.includes('expired'));active=true;dbError=true;await assert.rejects(gate.requireHostingSession());dbError=false;
userMismatch=true;const prior=calls;await assert.rejects(gate.requireHostingSession());assert.equal(calls,prior);userMismatch=false;
validated=false;await assert.rejects(gate.requireHostingSession(),e=>e.redirect==='/login');validated=true;
aal='aal1';await gate.requireHostingSession(false,true); // verification route may verify MFA, but must have a live session
active=false;await assert.rejects(gate.requireHostingSession(false,true));active=true;
const cookie=load('lib/security/cookies.ts',{}, {NODE_ENV:'production'}).secureAuthCookie({httpOnly:false,secure:false,sameSite:'none'});assert.equal(cookie.httpOnly,true);assert.equal(cookie.secure,true);assert.equal(cookie.sameSite,'lax');
let allowed=true,unavailable=false,rateArgs;
const limiter=load('lib/security/rateLimit.ts',{'next/headers':{headers:()=>({get:()=>null})},'@/lib/supabaseClient':{getSupabase:()=>({rpc:async(name,args)=>{rateArgs=args;return {data:allowed,error:unavailable?{}:null}}})}}, {SUPABASE_SERVICE_ROLE_KEY:'test-only-not-real'});
await limiter.limitSignIn('login','Private@Example.test');assert.match(rateArgs.p_key,/^[a-f0-9]{64}$/);assert(!rateArgs.p_key.includes('Private'));allowed=false;await assert.rejects(limiter.rateLimit('login','id',10,60),/Too many/);allowed=true;unavailable=true;await assert.rejects(limiter.rateLimit('login','id',10,60),/unavailable/);
// A backend outage must not be mislabeled as bad credentials or bypass the limiter.
const login=load('app/login/actions.ts',{'@/lib/security/rateLimit':limiter,'@/lib/security/mfa':{},'next/headers':{cookies:()=>({})},'@/lib/memberView':{},'next/navigation':{redirect},'@/lib/supabase/server':{createAuthClient:()=>{throw Error('must not attempt authentication')}},'@/lib/site':{getSiteOrigin:()=>"https://example.test"}});
const form=new FormData();form.set('email','test@example.test');form.set('password','test-password');
await assert.rejects(login.loginAction(form),e=>decodeURIComponent(e.redirect||'').includes('Sign-in is temporarily unavailable'));
unavailable=false;allowed=false;
await assert.rejects(login.loginAction(form),e=>decodeURIComponent(e.redirect||'').includes('Too many sign-in attempts'));
allowed=true;
// Team auth never infers an administrator from a missing table or empty profile set.
let missing=true;const team=load('lib/auth.ts',{'./security/mfa':{requireEnrolledMfa:async()=>{}},'./supabase/server':{createAuthClient:()=>auth},'./store':{getProfile:async()=>{if(missing)throw Error('missing table');return null},createProfile:async x=>x},'next/headers':{cookies:()=>({get:()=>undefined})},'next/navigation':{redirect},'./hosting/identity':{hostingIdentity:async()=>null},'./memberView':{}});
await assert.rejects(team.getAuthenticatedProfile(),/missing table/);missing=false;assert.equal((await team.getAuthenticatedProfile()).role,'member');
console.log('PASS: live-session/user binding, revocation and backend failures deny access; admin MFA enrollment and AAL2 required; verification has no session bypass; cookies hardened; rate limits hash identities and fail closed; missing tables never grant admin.');
})().catch(e=>{console.error(e);process.exit(1)});
