import "server-only";
import { redirect } from "next/navigation";
import { createAuthClient } from "@/lib/supabase/server";
import { getSupabase } from "@/lib/supabaseClient";
// getUser validates the access token with Auth before these session claims are used.
export async function requireHostingSession(admin=false,verificationFlow=false) {
 const auth=createAuthClient();
 const {data:{user},error}=await auth.auth.getUser();
 if(error||!user)redirect('/login');
 const {data:{session},error:sessionError}=await auth.auth.getSession();
 if(sessionError||!session||session.user.id!==user.id)redirect('/login/security?expired=1');
 let sid:string;
 try {sid=JSON.parse(Buffer.from(session.access_token.split('.')[1]??'','base64url').toString()).session_id;}catch{redirect('/login/security?expired=1');}
 if(!sid||!/^[0-9a-f-]{36}$/i.test(sid))redirect('/login/security?expired=1');
 const valid=await getSupabase().rpc('freelance_hq_hosting_session_active',{p_user:user.id,p_session:sid});
 if(valid.error||valid.data!==true)redirect('/login/security?expired=1');
 const enrolled=user.factors?.some(f=>f.status==='verified')??false;
 if(!verificationFlow&&admin&&!enrolled)redirect('/login/security');
 if(!verificationFlow&&(admin||enrolled)){
  const level=await auth.auth.mfa.getAuthenticatorAssuranceLevel();
  if(level.error||level.data?.currentLevel!=='aal2')redirect('/login/security');
 }
 return user;
}
export async function requireEnrolledMfa() {
 const auth=createAuthClient();
 const {data:{user},error}=await auth.auth.getUser();
 if(error||!user)redirect('/login');
 if(user.factors?.some(f=>f.status==='verified')){
  const level=await auth.auth.mfa.getAuthenticatorAssuranceLevel();
  if(level.error||level.data?.currentLevel!=='aal2')redirect('/login/security');
 }
}
