"use server";
import { redirect } from "next/navigation";
import { createAuthClient } from "@/lib/supabase/server";
import { requireHostingSession } from "@/lib/security/mfa";
import { rateLimit } from "@/lib/security/rateLimit";
export type SecurityState={qr?:string;factorId?:string;error?:string};
export async function securityAction(previous:SecurityState,form:FormData):Promise<SecurityState>{
 let removed=false;
 const auth=createAuthClient();const {data:{user},error}=await auth.auth.getUser();
 if(error||!user)redirect('/login');
 await requireHostingSession(false,true);
 try{
  await rateLimit('mfa',user.id,10,300);
  const action=String(form.get('action'));
  if(!['enroll','verify','remove'].includes(action))throw new Error('Choose a valid security action.');
  const factors=await auth.auth.mfa.listFactors();
  if(factors.error)throw new Error('Could not load authenticator settings.');
  if(action==='enroll'){
   if(factors.data.totp.some(f=>f.status==='verified'))throw new Error('An authenticator is already enabled. Enter its code to continue.');
   // Bound abandoned enrollments; only remove this user's unverified TOTP factors.
   for(const f of factors.data.all.filter(f=>f.factor_type==='totp'&&f.status==='unverified')){
    const removed=await auth.auth.mfa.unenroll({factorId:f.id});if(removed.error)throw new Error('Could not restart setup. Try again later.');
   }
   const enrolled=await auth.auth.mfa.enroll({factorType:'totp',friendlyName:'HouseMySite authenticator'});
   if(enrolled.error)throw new Error('Could not start authenticator setup. Try again later.');
   return {factorId:enrolled.data.id,qr:enrolled.data.totp.qr_code};
  }
  const factorId=String(form.get('factor_id')??'');const code=String(form.get('code')??'').trim();
  if(!/^\d{6}$/.test(code)||!factors.data.all.some(f=>f.id===factorId&&f.factor_type==='totp'))throw new Error('Enter the six-digit code from your authenticator app.');
  if(action==='remove'&&(!factors.data.totp.some(f=>f.id===factorId&&f.status==='verified')||form.get('confirm')!=='yes'))throw new Error('Confirm removal of your current authenticator.');
  const verified=await auth.auth.mfa.challengeAndVerify({factorId,code});
  if(verified.error)throw new Error('That code could not be verified. Try a fresh code.');
  if(action==='remove'){
   const result=await auth.auth.mfa.unenroll({factorId});
   if(result.error)throw new Error('Could not remove the authenticator. Try again later.');
   removed=true;
   const refreshed=await auth.auth.refreshSession();
   if(refreshed.error)await auth.auth.signOut();
  }
 }catch(e){return {factorId:previous.factorId,qr:previous.qr,error:e instanceof Error?e.message:'Security check failed.'};}
 redirect(removed?'/login/security?manage=1&removed=1':form.get('manage')==='yes'?'/login/security?manage=1&saved=1':'/');
}
