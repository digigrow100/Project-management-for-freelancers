import Link from "next/link";
import { redirect } from "next/navigation";
import { createAuthClient } from "@/lib/supabase/server";
import { logoutAction } from "../actions";
import { SecurityForm } from "./SecurityForm";
export const dynamic='force-dynamic';
export default async function SecurityPage({searchParams}:{searchParams:{expired?:string}}){
 const auth=createAuthClient();const {data:{user},error}=await auth.auth.getUser();if(error||!user)redirect('/login');
 const factors=await auth.auth.mfa.listFactors();
 return <main className="flex min-h-screen items-center justify-center bg-white px-5 text-slate-900"><section className="w-full max-w-md space-y-6 py-12"><h1 className="text-2xl font-semibold">Account security</h1>{searchParams.expired?<p className="text-sm text-amber-800">Your hosting session has expired or was revoked. Sign out, then sign in again.</p>:factors.error?<p role="alert">Security settings are unavailable. Try again later.</p>:<SecurityForm factors={factors.data.totp.filter(f=>f.status==='verified').map(f=>({id:f.id,name:f.friendly_name||'Authenticator'}))}/>}<p className="text-xs text-slate-500">Lost your authenticator? Your account owner must verify your identity before resetting MFA through Supabase. A password reset does not remove MFA.</p><div className="flex justify-between gap-4 text-sm"><Link href="/">Back to app</Link><form action={logoutAction}><button>Sign out</button></form></div></section></main>;
}
