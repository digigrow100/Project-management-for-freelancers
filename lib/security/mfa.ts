import {requireAdminNetworkForUser} from "./adminNetwork";
import "server-only";
import { redirect } from "next/navigation";
import { createAuthClient } from "@/lib/supabase/server";
import { getSupabase } from "@/lib/supabaseClient";
type AuthClient = Awaited<ReturnType<typeof createAuthClient>>;

// The caller must first validate the user with getUser(). A refreshed access
// token can still belong to a revoked or app-expired (24 hour) session.
export async function hostingSessionStatus(auth:AuthClient,userId:string):Promise<'active'|'expired'|'unavailable'> {
 const {data:{session},error}=await auth.auth.getSession();
 if(error)return 'unavailable';
 if(!session||session.user.id!==userId)return 'expired';
 let sid:unknown;
 try {sid=JSON.parse(Buffer.from(session.access_token.split('.')[1]??'','base64url').toString()).session_id;}catch{return 'expired';}
 if(typeof sid!=='string'||!/^[0-9a-f-]{36}$/i.test(sid))return 'expired';
 const valid=await getSupabase().rpc('freelance_hq_hosting_session_active',{p_user:userId,p_session:sid});
 if(valid.error||typeof valid.data!=='boolean')return 'unavailable';
 return valid.data?'active':'expired';
}
// getUser validates the access token with Auth before these session claims are used.
export async function requireHostingSession(admin=false,verificationFlow=false) {
 const auth=await createAuthClient();
 const {data:{user},error}=await auth.auth.getUser();
 if(error||!user)redirect('/login');
 await requireAdminNetworkForUser(user.id);
 const status=await hostingSessionStatus(auth,user.id);
 if(status==='unavailable')throw new Error('Session verification is temporarily unavailable. Try again later.');
 // Server Components cannot delete cookies. This route checks the session
 // again, then clears only this browser before showing the login form.
 if(status==='expired')redirect('/auth/session-expired');
 const enrolled=user.factors?.some(f=>f.status==='verified')??false;
 if(!verificationFlow&&admin&&!enrolled)redirect('/login/security');
 if(!verificationFlow&&(admin||enrolled)){
  const level=await auth.auth.mfa.getAuthenticatorAssuranceLevel();
  if(level.error||level.data?.currentLevel!=='aal2')redirect('/login/security');
 }
 return user;
}
export async function requireEnrolledMfa() {
 const auth=await createAuthClient();
 const {data:{user},error}=await auth.auth.getUser();
 if(error||!user)redirect('/login');
 await requireAdminNetworkForUser(user.id);
 if(user.factors?.some(f=>f.status==='verified')){
  const level=await auth.auth.mfa.getAuthenticatorAssuranceLevel();
  if(level.error||level.data?.currentLevel!=='aal2')redirect('/login/security');
 }
}
