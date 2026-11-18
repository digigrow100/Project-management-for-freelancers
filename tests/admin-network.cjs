const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {build}=require('esbuild');
const {NextRequest}=require('next/server');
const s={role:'admin',ip:'192.0.2.10',signedIn:true,dbError:false,inspect:false,calls:[],writes:0,signedOut:0,aal:'aal2',updated:null,reset:null,resetError:false,updateError:false,resetLimit:null};
global.__adminNetworkFixture=s;
const fixture=`const s=globalThis.__adminNetworkFixture;
export const headers=()=>new Headers({'x-forwarded-for':s.ip,'x-real-ip':'192.0.2.10','host':'web.housemysite.com'});
export const cookies=()=>({get:()=>s.inspect?{value:'fixture-inspection'}:undefined});
export const redirect=(path)=>{throw new Error('redirect:'+path)};
export const unstable_rethrow=(error)=>{if(error instanceof Error && error.message.startsWith('redirect:'))throw error;};
export const createAuthClient=()=>({auth:{
 getUser:async()=>({data:{user:s.signedIn?{id:'fixture-actor',email:'owner@fixture.invalid',email_confirmed_at:'fixture',factors:[{status:'verified'}]}:null},error:null}),
 getSession:async()=>({data:{session:{user:{id:'fixture-actor'},access_token:'x.'+Buffer.from(JSON.stringify({session_id:'11111111-1111-4111-8111-111111111111'})).toString('base64url')+'.x'}},error:null}),
 signInWithPassword:async()=>{s.signedIn=true;return {data:{user:{id:'fixture-actor'}},error:null}},
 signOut:async()=>{s.signedOut++;s.signedIn=false;return {error:null}},
 resetPasswordForEmail:async(email,options)=>{s.reset={email,redirectTo:options&&options.redirectTo};const failure=s.resetError===true?{name:'AuthApiError',message:'rejected'}:s.resetError;return {error:failure||null}},
 updateUser:async(body)=>{s.updated=body;return {error:s.updateError?{message:'rejected'}:null}},
 mfa:{getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:s.aal||'aal2'},error:null})}
}});
export const createServerClient=createAuthClient;
export const getSupabase=()=>({from:(table)=>({select:(fields)=>({eq:(key,value)=>({maybeSingle:async()=>{s.calls.push({table,fields,key,value});return {data:s.role?{role:s.role}:null,error:s.dbError?{}:null}}})})}),rpc:async()=>({data:true,error:null})});
export const getProfile=async()=>({id:'fixture-actor',role:s.profileRole??s.role});
export const createProfile=async p=>p;
export const isProjectAssignedToUser=async()=>true;
export const hostingIdentity=async()=>null;
export const MEMBER_VIEW_COOKIE='fixture-member-view';
export const resolveMemberView=(actor)=>s.inspect?{id:'fixture-member',role:'member'}:actor;
export const rateLimit=async()=>{};
export const limitSignIn=async()=>{
 if(s.resetLimit==='limited'){const error=new Error('Too many attempts. Please wait and try again.');error.name='RateLimitExceeded';error.code='rate_limited';error.retryAfterSeconds=900;throw error;}
 if(s.resetLimit==='down'){const error=new Error('Security checks are unavailable. Try again later.');error.name='SecurityCheckUnavailable';error.code='security_check_unavailable';throw error;}
 if(s.resetLimit==='boom')throw new Error('database timeout');
};
export class SecurityCheckUnavailable extends Error{};
export const getSiteOrigin=()=> 'https://web.housemysite.com';
export const getActivitySettings=async()=>{s.writes++;return {}};
export const updateActivityRetention=async()=>{s.writes++;return 60};`;
async function load(file){
 const result=await build({entryPoints:[path.join(__dirname,'..',file)],bundle:true,platform:'node',format:'cjs',write:false,packages:'external',tsconfig:path.join(__dirname,'../tsconfig.json'),plugins:[{name:'network-fixture',setup(b){
 b.onResolve({filter:/^server-only$/},()=>({path:'empty',namespace:'empty'}));b.onLoad({filter:/.*/,namespace:'empty'},()=>({contents:'',loader:'js'}));
 b.onResolve({filter:/^(next\/headers|next\/navigation|@supabase\/ssr|@\/lib\/supabaseClient|@\/lib\/supabase\/server|\.\/supabase\/server|\.\/store|\.\/hosting\/identity|\.\/memberView|@\/lib\/memberView|@\/lib\/security\/rateLimit|@\/lib\/site|@\/lib\/employeeActivity)$/},()=>({path:'fixture',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:fixture,loader:'ts'}));
 }}]});const mod={exports:{}};new Function('require','module','exports',result.outputFiles[0].text)(require,mod,mod.exports);return mod.exports;
}
function configure(){process.env.VERCEL='1';process.env.ADMIN_ALLOWED_IPS='192.0.2.10,198.51.100.20,203.0.113.30';s.role='admin';s.ip='192.0.2.10';s.signedIn=true;s.dbError=false;s.inspect=false;s.calls=[];s.writes=0;s.aal='aal2';s.updated=null;s.reset=null;s.resetError=false;s.updateError=false;s.resetLimit=null;}
test('exact allowlist rejects spoofed, ambiguous, absent, malformed and untrusted addresses',async()=>{
 const {adminNetworkAllowed:allowed}=await load('lib/security/adminNetworkPolicy.ts');
 const env={VERCEL:'1',ADMIN_ALLOWED_IPS:'192.0.2.10,198.51.100.20,203.0.113.30'};
 for(const ip of ['192.0.2.10','198.51.100.20','203.0.113.30','::ffff:192.0.2.10'])assert(allowed(new Headers({'x-forwarded-for':ip}),env));
 for(const ip of ['192.0.2.11','192.0.2.10, 198.51.100.40','192.000.2.10','192.0.2.10:443','::1','attacker'])assert(!allowed(new Headers({'x-forwarded-for':ip,'x-real-ip':'192.0.2.10','x-vercel-forwarded-for':'192.0.2.10'}),env));
 assert(!allowed(new Headers({'x-real-ip':'192.0.2.10'}),env));
 for(const invalid of [{},{...env,VERCEL:undefined},{...env,ADMIN_ALLOWED_IPS:''},{...env,ADMIN_ALLOWED_IPS:'192.0.2.10,garbage'},{...env,ADMIN_ALLOWED_IPS:'0.0.0.0/0'}])assert(!allowed(new Headers({'x-forwarded-for':'192.0.2.10'}),invalid));
});
test('actual actor authorization, MFA/session guards and APIs deny existing admins after network changes',async()=>{
 configure();const auth=await load('lib/auth.ts');const mfa=await load('lib/security/mfa.ts');const api=await load('app/api/admin/activity-settings/route.ts');
 assert.equal((await auth.requireAdmin()).role,'admin');assert.equal((await api.GET()).status,200);
 s.ip='192.0.2.99';s.writes=0;
 for(const operation of [()=>auth.getCurrentProfile(),()=>auth.requireAuthenticatedAdmin(),()=>mfa.requireEnrolledMfa(),()=>mfa.requireHostingSession(false,true)])await assert.rejects(operation(),/redirect:\/login\/network-restricted/);
 assert.equal((await api.GET()).status,403);assert.equal(s.writes,0);
 const security=await load('app/login/security/actions.ts');
 for(const action of ['enroll','verify','remove']){const f=new FormData();f.set('action',action);await assert.rejects(security.securityAction({},f),/network-restricted/);}
 const passwords=await load('app/login/actions.ts');const pf=new FormData();pf.set('password','long-fixture-password');pf.set('confirmPassword','long-fixture-password');s.updated=null;await assert.rejects(passwords.updatePasswordAction(pf),/network-restricted/);assert.equal(s.updated,null);
 s.inspect=true;await assert.rejects(auth.getCurrentProfile(),/network-restricted/);s.inspect=false;
 s.role='member';assert.equal(await auth.getCurrentProfile(),null);await mfa.requireHostingSession(false,true);await assert.rejects(auth.requireAdmin(),/Admin access/);
 s.role=null;await mfa.requireEnrolledMfa(); // hosting customer has no staff profile
 s.dbError=true;await assert.rejects(mfa.requireEnrolledMfa(),/Could not verify/);s.dbError=false;
 s.role='member';s.profileRole='admin';await assert.rejects(auth.getCurrentProfile(),/network-restricted/);delete s.profileRole;
 assert(s.calls.every(c=>c.table==='freelance_hq_profiles'&&c.fields==='role'&&c.value==='fixture-actor'));
});
test('password login keeps the existing Supabase session and network checks',async()=>{
 configure();const {loginAction}=await load('app/login/actions.ts');const f=new FormData();f.set('email','fixture@example.invalid');f.set('password','fixture-password');
 await assert.rejects(loginAction(f),{message:'redirect:/'});
 s.ip='192.0.2.99';s.signedOut=0;await assert.rejects(loginAction(f),{message:'redirect:/login/network-restricted'});assert.equal(s.signedOut,1);
 s.role='member';await assert.rejects(loginAction(f),{message:'redirect:/'});assert.equal(s.signedOut,1);
});
test('middleware blocks admin paths before Auth while keeping team, customer and machine routes reachable',async()=>{
 configure();process.env.SUPABASE_URL='https://fixture.invalid';process.env.SUPABASE_ANON_KEY='fixture';s.signedIn=false;
 const {middleware}=await load('middleware.ts');
 const req=(p,ip='192.0.2.99')=>new NextRequest('https://web.housemysite.com'+p,{headers:{host:'web.housemysite.com','x-forwarded-for':ip,'x-real-ip':'192.0.2.10'}});
 for(const p of ['/admin','/admin/settings','/hosting','/team','/api/admin/activity-settings','/api/hosting-operator/context','/api/hosting-operator/dispatch']){const r=await middleware(req(p));assert.equal(r.status,403,p);assert.match(r.headers.get('cache-control'),/no-store/);}
 for(const p of ['/login','/login/forgot-password','/login/network-restricted','/api/hosting-operator','/api/cron/hosting-renewals','/api/extension/devices','/api/whatsapp-bridge/poll','/sw.js','/manifest.json','/icon-192.png']){const response=await middleware(req(p));assert.equal(response.status,200,p);assert.equal(response.headers.get('location'),null,p);}
 assert.equal((await middleware(req('/hosting','192.0.2.10'))).status,307); // IP is not authentication
 s.signedIn=true;for(const p of ['/','/today','/settings','/client'])assert.equal((await middleware(req(p))).status,200,p);
});
test('password reset emails the confirm link and saves a new password before the authenticator step',async()=>{
 configure();
 const fs=require('node:fs');
 const form=fs.readFileSync(path.join(__dirname,'../app/login/auth-forms.tsx'),'utf8');
 assert.match(form,/Sending reset link/);
 assert.match(form,/useFormStatus/);
 assert.match(form,/held\.current/);
 assert.doesNotMatch(fs.readFileSync(path.join(__dirname,'../app/login/actions.ts'),'utf8'),/Please wait before requesting another reset link/);
 assert.match(form,/Enter a valid email address/);
 assert.match(form,/Updating password/);
 const worker=fs.readFileSync(path.join(__dirname,'../public/sw.js'),'utf8');
 assert.match(worker,/method !== "GET"/);
 const passwords=await load('app/login/actions.ts');
 const request=new FormData();request.set('email',' Owner@Example.com ');
 s.resetLimit='limited';
 await assert.rejects(passwords.requestPasswordResetAction(request),/You%20can%20try%20again%20in%2015%20minutes/);
 assert.equal(s.reset,null);
 s.resetLimit='down';
 await assert.rejects(passwords.requestPasswordResetAction(request),/Password%20reset%20is%20temporarily%20unavailable/);
 assert.equal(s.reset,null);
 s.resetLimit='boom';
 await assert.rejects(passwords.requestPasswordResetAction(request),/Password%20reset%20is%20temporarily%20unavailable/);
 assert.doesNotMatch(String((await passwords.requestPasswordResetAction(request).catch(error=>error)).message),/Please%20wait%20before%20requesting/);
 assert.equal(s.reset,null);
 s.resetLimit=null;
 await assert.rejects(passwords.requestPasswordResetAction(request),{message:'redirect:/login/forgot-password?sent=1'});
 assert.equal(s.reset.email,'Owner@Example.com');
 assert.equal(s.reset.redirectTo,'https://web.housemysite.com/auth/confirm?next=%2Flogin%2Freset-password');
 s.resetError=true;
 await assert.rejects(passwords.requestPasswordResetAction(request),/Could%20not%20complete%20this%20request/);
 const logged=[];const originalError=console.error;console.error=(...args)=>{logged.push(args);};
 try {
  s.reset=null;s.resetError={name:'AuthApiError',status:429,code:'over_email_send_rate_limit',message:'For security purposes, you can only request this after 60 seconds. owner@gmail.com'};
  await assert.rejects(passwords.requestPasswordResetAction(request),/You%20can%20try%20again%20in%2060%20seconds/);
  s.resetError={name:'AuthRetryableFetchError',status:500,message:'Error sending recovery email to owner@gmail.com'};
  await assert.rejects(passwords.requestPasswordResetAction(request),/send%20the%20reset%20email/);
  s.resetError={name:'AuthRetryableFetchError',status:504,code:'request_timeout',message:'Processing this request timed out, please retry after a moment.'};
  await assert.rejects(passwords.requestPasswordResetAction(request),/send%20the%20reset%20email/);
 } finally {console.error=originalError;}
 const printed=JSON.stringify(logged);
 assert.match(printed,/password_reset_auth_failed/);
 assert.match(printed,/over_email_send_rate_limit/);
 assert.match(printed,/request_timeout/);
 assert.equal(printed.includes('gmail'),false);
 assert.equal(printed.includes('Error sending'),false);
 s.resetError=false;
 const blank=new FormData();
 await assert.rejects(passwords.requestPasswordResetAction(blank),/Email%20is%20required/);
 const update=new FormData();update.set('password','long-fixture-password');update.set('confirmPassword','long-fixture-password');
 s.aal='aal1';s.updated=null;
 await assert.rejects(passwords.updatePasswordAction(update),{message:'redirect:/login/security'});
 assert.deepEqual(s.updated,{password:'long-fixture-password'});
 s.aal='aal2';s.updated=null;
 await assert.rejects(passwords.updatePasswordAction(update),{message:'redirect:/'});
 assert.deepEqual(s.updated,{password:'long-fixture-password'});
 s.signedIn=false;
 await assert.rejects(passwords.updatePasswordAction(update),/Open%20the%20reset%20link/);
});
