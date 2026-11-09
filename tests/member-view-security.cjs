const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const admin={id:'11111111-1111-4111-8111-111111111111',role:'admin'},member={id:'22222222-2222-4222-8222-222222222222',role:'member'};let signedIn=admin,cookie,selected=member;
const box={exports:{},require:n=>n==='./security/adminNetwork'?{requireAdminNetworkForRole:()=>{}}:n==='./security/mfa'?{requireEnrolledMfa:async()=>{},requireHostingSession:async()=>{}}:n==='./hosting/identity'?{hostingIdentity:async()=>null}:n==='next/navigation'?{redirect:()=>{throw new Error('UNEXPECTED_REDIRECT')}}:n==='next/headers'?{cookies:()=>({get:()=>cookie?{value:cookie}:undefined})}:n==='./supabase/server'?{createAuthClient:()=>({auth:{getUser:async()=>({data:{user:signedIn&&{...signedIn,email_confirmed_at:'fixture'}}})}})}:n==='./store'?{getProfile:async id=>id===admin.id?admin:selected?.id===id?selected:null,isProjectAssignedToUser:async(p,id)=>p==='allowed'&&id===member.id,isMissingTableError:()=>false}:n==='./memberView'?memberModule:undefined};
const pure={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/memberView.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,pure);const memberModule=pure.exports;
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/auth.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,box);
(async()=>{
 cookie=`${admin.id}:${member.id}:${Date.now()+60000}`;
 assert.equal((await box.exports.getCurrentProfile()).id,admin.id);
 assert.equal((await box.exports.requireAdmin()).id,admin.id);
 assert.equal((await box.exports.requireProjectAccess('allowed')).id,admin.id);
 signedIn=member;
 assert.equal(await box.exports.getCurrentProfile(),null);
 await assert.rejects(box.exports.requireProjectAccess('allowed'),/Not signed in/);
 await assert.rejects(box.exports.requireAuthenticatedAdmin(),/Admin access/);
 signedIn=null;
 assert.equal(await box.exports.getCurrentProfile(),null);
 console.log('PASS: retired member and stale impersonation cookie cannot grant workspace access.');
})().catch(e=>{console.error(e);process.exitCode=1});
