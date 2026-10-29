import {NextResponse} from 'next/server';
import {getSiteOrigin} from '@/lib/site';
import {serviceScope,ServiceDenied} from '@/lib/hosting/managed';
import {finishGithub,parseCookie,stateCookieName,verifyState} from '@/lib/hosting/githubLink';
import {rateLimit} from '@/lib/security/rateLimit';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const url=new URL(request.url);let target='/hosting/sources',result='denied';
 try{
  const state=verifyState(url.searchParams.get('state')??'',process.env.HOSTING_GITHUB_STATE_KEY??'');
  target=state.c==='owner'?'/hosting/sources':'/client/sources';
  const scope=await serviceScope(state.c==='owner');await rateLimit('github-callback',scope.actor,10,60);
  const outcome=await finishGithub({scope,query:url.searchParams,cookie:parseCookie(request.headers.get('cookie'),stateCookieName)});
  result=outcome.outcome;
 }catch(error){result=error instanceof ServiceDenied?'denied':'unavailable';}
 const response=NextResponse.redirect(new URL(`${target}?github=${result}`,getSiteOrigin()),303);
 response.headers.set('Set-Cookie',`${stateCookieName}=; Path=/api/hosting-github; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
 response.headers.set('Cache-Control','private, no-store');
 return response;
}
