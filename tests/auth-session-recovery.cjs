const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {build}=require('esbuild');
const {NextRequest}=require('next/server');
global.React=require('react');
const USER='11111111-1111-4111-8111-111111111111';
const SESSION='22222222-2222-4222-8222-222222222222';
const FACTOR='33333333-3333-4333-8333-333333333333';
const state={};
global.__authRecoveryFixture=state;
const initialCookies=[
 ['sb-fixture-auth-token.0','not-a-real-session'],
 ['sb-fixture-auth-token.1','not-a-real-session'],
 ['sb-fixture-auth-token-code-verifier','not-a-real-legacy-verifier'],
 ['sb-fixture-auth-token-flows-code-verifier.0','not-a-real-index-part-one'],
 ['sb-fixture-auth-token-flows-code-verifier.1','not-a-real-index-part-two'],
 ['sb-fixture-auth-token-flow-flow_1234-code-verifier','not-a-real-slot-verifier'],
 ['sb-fixture-auth-token-flow-flow_5678-code-verifier.0','not-a-real-slot-part-one'],
 ['sb-fixture-auth-token-flow-flow_5678-code-verifier.1','not-a-real-slot-part-two'],
 ['sb-other-auth-token','another-project-session'],
 ['sb-other-auth-token-code-verifier','another-project-verifier'],
 ['sb-other-auth-token-flows-code-verifier','another-project-index'],
 ['sb-other-auth-token-flow-flow_1234-code-verifier','another-project-slot'],
 ['sb-fixture-auth-token-code-verifier-backup','unrelated-cookie'],
 ['sb-fixture-auth-token-flow-short-code-verifier','not-a-valid-slot'],
 ['preference','unrelated-preference']
];
const providerRemovedNames=initialCookies.slice(0,8).map(([name])=>name);
function reset(){Object.assign(state,{signedIn:true,active:true,dbError:false,authError:null,aal:'aal2',network:true,factors:true,updated:null,signouts:[],signoutError:false,writes:[],deleted:[],password:'old-fixture-password',confirmError:null,confirmCalls:[],cookieJar:new Map(initialCookies),providerRemovedNames});}
const fixture=`const s=globalThis.__authRecoveryFixture;
export const headers=()=>new Headers({host:'web.housemysite.com'});
export const cookies=()=>({
 getAll:()=>Array.from(s.cookieJar,([name,value])=>({name,value})),
 set:(name,value,options)=>{s.writes.push({name,value,options});if(options?.maxAge===0)s.cookieJar.delete(name);else s.cookieJar.set(name,value)},
 delete:name=>{s.deleted.push(name);s.cookieJar.delete(name)}
});
export const redirect=url=>{throw Error('redirect:'+url)};
export const unstable_rethrow=error=>{if(error instanceof Error&&error.message.startsWith('redirect:'))throw error;};
export const requireAdminNetworkForUser=async()=>{if(!s.network)redirect('/login/network-restricted')};
export const assertAdminNetworkForUser=requireAdminNetworkForUser;
export class AdminNetworkDenied extends Error{};
export const MEMBER_VIEW_COOKIE='fixture-member-view';
export const rateLimit=async()=>{};
export const limitSignIn=async()=>{};
export class SecurityCheckUnavailable extends Error{};
export const getSiteOrigin=()=> 'https://web.housemysite.com';
export const getSupabase=()=>({rpc:async()=>({data:s.active,error:s.dbError?{message:'database unavailable'}:null})});
export const createAuthClient=()=>({auth:{
 getUser:async()=>({data:{user:s.signedIn?{id:'${USER}',factors:s.factors?[{id:'${FACTOR}',status:'verified',factor_type:'totp'}]:[]}:null},error:s.authError}),
 getSession:async()=>({data:{session:s.signedIn?{user:{id:'${USER}'},access_token:'x.'+Buffer.from(JSON.stringify({session_id:'${SESSION}'})).toString('base64url')+'.x'}:null},error:null}),
 signOut:async(options)=>{s.signouts.push(options);if(s.signoutError)throw Error('provider unavailable');s.signedIn=false;for(const name of s.providerRemovedNames)cookies().set(name,'',{maxAge:0,httpOnly:true,path:'/',sameSite:'lax',secure:true});return {error:null}},
 signInWithPassword:async({password})=>{if(password!==s.password)return {data:{user:null},error:{code:'invalid_credentials'}};s.signedIn=true;s.active=true;s.aal='aal1';return {data:{user:{id:'${USER}'}},error:null}},
 updateUser:async(body)=>{if(s.factors&&s.aal!=='aal2')return {error:{code:'insufficient_aal',status:401}};s.updated=body;s.password=body.password;return {error:null}},
 exchangeCodeForSession:async(code)=>{s.confirmCalls.push({kind:'pkce'});return {error:s.confirmError}},
 verifyOtp:async()=>{s.confirmCalls.push({kind:'otp'});return {error:s.confirmError}},
 mfa:{getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:s.aal},error:null}),
 listFactors:async()=>({data:{all:[{id:'${FACTOR}',factor_type:'totp',status:'verified'}],totp:[{id:'${FACTOR}',status:'verified'}]},error:null}),
 challengeAndVerify:async({factorId,code})=>{if(factorId!=='${FACTOR}'||code!=='123456')return {error:{code:'mfa_verification_failed'}};s.aal='aal2';return {error:null}}}
}});`;
async function load(file){
 const result=await build({entryPoints:[path.join(__dirname,'..',file)],bundle:true,platform:'node',format:'cjs',write:false,packages:'external',tsconfig:path.join(__dirname,'../tsconfig.json'),plugins:[{name:'auth-recovery-fixture',setup(b){
  b.onResolve({filter:/^server-only$/},()=>({path:'empty',namespace:'empty'}));
  b.onLoad({filter:/.*/,namespace:'empty'},()=>({contents:'',loader:'js'}));
  b.onResolve({filter:/^(next\/headers|next\/navigation|@\/lib\/supabaseClient|@\/lib\/supabase\/server|@\/lib\/security\/adminNetwork|\.\/adminNetwork|@\/lib\/memberView|@\/lib\/security\/rateLimit|@\/lib\/site)$/},()=>({path:'fixture',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:fixture,loader:'ts'}));
  b.onResolve({filter:/\.css$/},()=>({path:'empty',namespace:'empty'}));
 }}]});
 const m={exports:{}};new Function('require','module','exports',result.outputFiles[0].text)(require,m,m.exports);return m.exports;
}
const req=(path)=>new NextRequest('https://web.housemysite.com'+path);
function passwordForm(password){const f=new FormData();f.set('password',password);f.set('confirmPassword',password);return f;}
function verification(next){const f=new FormData();f.set('action','verify');f.set('factor_id',FACTOR);f.set('code','123456');if(next!=null)f.set('next',next);return f;}

test('app-expired sessions clear only this browser and can sign in again with the same password',async()=>{
 reset();process.env.SUPABASE_URL='https://fixture.supabase.co';
 const gate=await load('lib/security/mfa.ts');
 const expiry=await load('app/auth/session-expired/route.ts');
 const actions=await load('app/login/actions.ts');
 state.active=false;
 await assert.rejects(gate.requireHostingSession(true),{message:'redirect:/auth/session-expired'});
 const response=await expiry.GET(req('/auth/session-expired?next=https://untrusted.invalid'));
 assert.equal(response.status,303);
 assert.equal(response.headers.get('location'),'https://web.housemysite.com/login?expired=1');
 assert.match(response.headers.get('cache-control'),/no-store/);
 assert.deepEqual(state.signouts,[{scope:'local'}]);
 assert.deepEqual(state.writes.filter(c=>c.options.maxAge===0).map(c=>c.name),providerRemovedNames);
 assert(state.writes.filter(c=>c.options.maxAge===0).every(c=>c.value===''&&c.options.httpOnly));
 assert.equal(state.cookieJar.has('sb-fixture-auth-token.0'),false);
 assert.equal(state.cookieJar.has('sb-fixture-auth-token.1'),false);
 assert.deepEqual(state.deleted,['fixture-member-view','fhq_hosting_client_view']);
 assert.equal(state.signedIn,false);
 const login=new FormData();login.set('email','owner@example.invalid');login.set('password','old-fixture-password');
 await assert.rejects(actions.loginAction(login),{message:'redirect:/'});
 await assert.rejects(gate.requireHostingSession(true),{message:'redirect:/login/security'});
 const security=await load('app/login/security/actions.ts');
 await assert.rejects(security.securityAction({},verification()),{message:'redirect:/'});
 assert.equal((await gate.requireHostingSession(true)).id,USER);
});

test('stale expiry links, database/Auth outages and disallowed networks cannot log out a live session',async()=>{
 reset();process.env.SUPABASE_URL='https://fixture.supabase.co';
 const expiry=await load('app/auth/session-expired/route.ts');
 const response=await expiry.GET(req('/auth/session-expired'));
 assert.equal(response.headers.get('location'),'https://web.housemysite.com/');
 assert.deepEqual(state.signouts,[]);
 state.dbError=true;
 assert.equal((await expiry.GET(req('/auth/session-expired'))).status,503);
 assert.deepEqual(state.signouts,[]);assert.deepEqual(state.writes,[]);
 state.dbError=false;state.authError={status:504,name:'AuthRetryableFetchError'};
 assert.equal((await expiry.GET(req('/auth/session-expired'))).status,503);
 assert.deepEqual(state.signouts,[]);
 state.authError=null;state.network=false;
 await assert.rejects(expiry.GET(req('/auth/session-expired')),{message:'redirect:/login/network-restricted'});
 assert.deepEqual(state.signouts,[]);
});

test('expired browser cookies are cleared even if the provider cannot complete local sign-out',async()=>{
 reset();process.env.SUPABASE_URL='https://fixture.supabase.co';state.active=false;state.signoutError=true;
 const expiry=await load('app/auth/session-expired/route.ts');
 const response=await expiry.GET(req('/auth/session-expired'));
 assert.equal(response.headers.get('location'),'https://web.housemysite.com/login?expired=1');
 assert.deepEqual(state.signouts,[{scope:'local'}]);
 assert.deepEqual(state.writes.map(c=>c.name),['sb-fixture-auth-token.0','sb-fixture-auth-token.1']);
});

test('SDK local teardown retains this project PKCE legacy/index/slots and chunks without touching other cookies',async()=>{
 reset();process.env.SUPABASE_URL='https://fixture.supabase.co';state.active=false;
 const previousEnvironment=process.env.NODE_ENV;process.env.NODE_ENV='production';
 try {
  const expiry=await load('app/auth/session-expired/route.ts');
  await expiry.GET(req('/auth/session-expired'));
  const pending=initialCookies.slice(2,8);
  for(const [name,value] of pending)assert.equal(state.cookieJar.get(name),value,name);
  const restored=state.writes.filter(c=>c.options.maxAge>0);
  assert.deepEqual(restored.map(c=>c.name),pending.map(([name])=>name));
  assert(restored.every(c=>c.options.httpOnly&&c.options.secure&&c.options.sameSite==='lax'&&c.options.path==='/'&&c.options.maxAge===3600));
  for(const [name,value] of initialCookies.slice(8)){
   assert.equal(state.cookieJar.get(name),value,name);
   assert.equal(state.writes.some(c=>c.name===name),false,name+' must not be rewritten');
  }
 } finally {
  if(previousEnvironment===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previousEnvironment;
 }
});

test('an expired POST switches to a GET login redirect without replaying its body',async()=>{
 reset();process.env.SUPABASE_URL='https://fixture.supabase.co';state.active=false;
 const expiry=await load('app/auth/session-expired/route.ts');
 const response=await expiry.POST(new NextRequest('https://web.housemysite.com/auth/session-expired',{method:'POST',body:'fixture-body'}));
 assert.equal(response.status,303);
 assert.equal(response.headers.get('location'),'https://web.housemysite.com/login?expired=1');
 assert.deepEqual(state.signouts,[{scope:'local'}]);
});

test('recovery requires MFA before the password form/update, then returns to save and accepts the new password',async()=>{
 reset();state.aal='aal1';
 const page=(await load('app/login/reset-password/page.tsx')).default;
 const actions=await load('app/login/actions.ts');
 const security=await load('app/login/security/actions.ts');
 const expected={message:'redirect:/login/security?next=%2Flogin%2Freset-password'};
 await assert.rejects(page({searchParams:Promise.resolve({})}),expected);
 await assert.rejects(actions.updatePasswordAction(passwordForm('new-fixture-password')),expected);
 assert.equal(state.updated,null);
 const securityPage=(await load('app/login/security/page.tsx')).default;
 const tree=await securityPage({searchParams:Promise.resolve({next:'/login/reset-password'})});
 function findForm(node){
  if(!node||typeof node!=='object')return null;
  if(node.type?.name==='SecurityForm')return node;
  const children=node.props?.children;
  for(const child of Array.isArray(children)?children:[children]){const found=findForm(child);if(found)return found;}
  return null;
 }
 assert.equal(findForm(tree)?.props.returnTo,'/login/reset-password','the rendered MFA form must retain the reset return intent');
 await assert.rejects(security.securityAction({},verification('/login/reset-password')),{message:'redirect:/login/reset-password'});
 assert.equal(state.updated,null,'verification must not retain or save a plaintext password');
 assert(await page({searchParams:Promise.resolve({})}));
 await assert.rejects(actions.updatePasswordAction(passwordForm('new-fixture-password')),{message:'redirect:/'});
 assert.deepEqual(state.updated,{password:'new-fixture-password'});
 await assert.rejects(actions.logoutAction(),{message:'redirect:/login'});
 const login=new FormData();login.set('email','owner@example.invalid');login.set('password','old-fixture-password');
 await assert.rejects(actions.loginAction(login),/Sign-in%20failed/);
 login.set('password','new-fixture-password');
 await assert.rejects(actions.loginAction(login),{message:'redirect:/'});
 assert.equal(state.aal,'aal1','a new password login still requires its authenticator');
});

test('MFA returns only to the allowlisted password form',async()=>{
 reset();const security=await load('app/login/security/actions.ts');
 for(const next of ['https://untrusted.invalid','//untrusted.invalid','/admin','/login/reset-password?unsafe=1','/\\untrusted.invalid']){
  await assert.rejects(security.securityAction({},verification(next)),{message:'redirect:/'});
 }
 await assert.rejects(security.securityAction({},verification('/login/reset-password')),{message:'redirect:/login/reset-password'});
});

test('confirmation failures log only safe provider metadata and never the code, token or address',async()=>{
 reset();const confirm=await load('app/auth/confirm/route.ts');
 state.confirmError={name:'AuthApiError',status:400,code:'bad_code_verifier',message:'private-token owner@example.invalid'};
 const logs=[];const original=console.error;console.error=(...args)=>logs.push(args);
 try {
  const response=await confirm.GET(req('/auth/confirm?code=private-pkce-code&next=%2Flogin%2Freset-password'));
  assert.match(response.headers.get('location'),/forgot-password/);
  await confirm.GET(req('/auth/confirm?token_hash=private-token-hash&type=recovery'));
 } finally {console.error=original;}
 const printed=JSON.stringify(logs);
 assert.match(printed,/bad_code_verifier/);assert.match(printed,/pkce/);assert.match(printed,/otp/);
 assert.doesNotMatch(printed,/private-|@/);
 state.confirmError=null;
 const response=await confirm.GET(req('/auth/confirm?token_hash=not-a-real-token&type=recovery&next=%2Flogin%2Freset-password'));
 assert.equal(response.headers.get('location'),'https://web.housemysite.com/login/reset-password');
});
