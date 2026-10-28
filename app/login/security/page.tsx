import {requireAdminNetworkForUser} from "@/lib/security/adminNetwork";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createAuthClient } from "@/lib/supabase/server";
import { requireEnrolledMfa } from "@/lib/security/mfa";
import { logoutAction } from "../actions";
import { SecurityForm } from "./SecurityForm";
import './security.css';
export const dynamic='force-dynamic';
export default async function SecurityPage({searchParams}:{searchParams:{expired?:string;manage?:string;removed?:string;saved?:string}}){
 const auth=createAuthClient();const {data:{user},error}=await auth.auth.getUser();if(error||!user)redirect('/login');
 await requireAdminNetworkForUser(user.id);
 const manage=searchParams.manage==='1';
 if(manage)await requireEnrolledMfa();
 const factors=await auth.auth.mfa.listFactors();
 const verified=factors.data?.totp.filter(f=>f.status==='verified')??[];
 const title=manage?'Account security':verified.length?'Verify your sign-in':'Secure your account';
 return <main className="security-page"><div className="security-shell"><div className="security-brand"><span className="security-brand-mark" aria-hidden="true">H</span>HouseMySite</div><section className="security-card"><div className="security-icon"><svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M12 3 4 6v6c0 4 8 9 8 9s8-5 8-9V6l-8-3Z"/><path d="m8.5 12 2.5 2.5 4.5-5"/></svg></div><h1>{title}</h1><p className="security-subtitle">{manage?'Manage your authenticator and keep your account protected.':'An extra step to keep your account safe.'}</p>{searchParams.expired?<p role="alert" className="security-alert">Your hosting session has expired or was revoked. Sign out, then sign in again.</p>:factors.error?<p role="alert" className="security-alert security-error">Security settings are unavailable. Try again later.</p>:<>{manage&&searchParams.removed==='1'&&!verified.length&&<p role="status" className="security-alert security-success">Authenticator removed. You can set up a new one below.</p>}{manage&&searchParams.saved==='1'&&verified.length>0&&<p role="status" className="security-alert security-success">Authenticator verified and enabled.</p>}<SecurityForm factors={verified.map(f=>({id:f.id,name:f.friendly_name||'Authenticator'}))} manage={manage}/></>}<div className="security-footer"><Link href="/" className="security-link">← Back to app</Link><form action={logoutAction}><button>Sign out</button></form></div></section><p className="security-recovery">Lost access to your authenticator? Contact your account owner for identity-verified recovery. A password reset does not remove your authenticator.</p></div></main>;
}
