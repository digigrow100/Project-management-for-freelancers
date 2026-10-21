import "server-only";
import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { getSupabase } from "@/lib/supabaseClient";
export async function rateLimit(scope:string,identity:string,limit:number,seconds:number) {
 const secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!secret)throw new Error('Security checks are unavailable. Try again later.');
 const key=createHmac('sha256',secret).update(`hosting-rate-v1:${scope}:${identity}`).digest('hex');
 const {data,error}=await getSupabase().rpc('freelance_hq_hosting_rate_limit',{p_key:key,p_limit:limit,p_seconds:seconds});
 if(error)throw new Error('Security checks are unavailable. Try again later.');
 if(data!==true)throw new Error('Too many attempts. Please wait and try again.');
}
export async function limitSignIn(scope:string,email:string) {
 // Do not trust arbitrary forwarded headers on self-hosted development servers.
 const ip=process.env.VERCEL==='1'?headers().get('x-vercel-forwarded-for')?.split(',')[0]?.trim():null;
 if(ip)await rateLimit(scope+'-ip',ip,40,900);
 await rateLimit(scope+'-account',email.toLowerCase(),scope==='reset'?3:10,900);
}
