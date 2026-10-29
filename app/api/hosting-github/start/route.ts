import {getSiteOrigin} from '@/lib/site';
import {serviceScope,ServiceDenied} from '@/lib/hosting/managed';
import {startGithub,stateCookieName} from '@/lib/hosting/githubLink';
import {rateLimit} from '@/lib/security/rateLimit';
import {clientFeatureEnabled} from '@/lib/hosting/clientRelease';
import {z} from 'zod';
export const dynamic='force-dynamic';
export async function POST(request:Request){
 const headers:Record<string,string>={'Cache-Control':'private, no-store'};
 try{
  if(request.headers.get('origin')!==getSiteOrigin())throw new ServiceDenied();
  const scopeName=new URL(request.url).searchParams.get('scope');if(scopeName!=='owner'&&scopeName!=='client')throw new ServiceDenied();
  if(scopeName==='client'&&!clientFeatureEnabled('sources',process.env))throw new ServiceDenied();
  const context=await serviceScope(scopeName==='owner');await rateLimit('github-start',context.actor,10,60);
  if(context.readOnly)throw new ServiceDenied();
  const {service}=z.object({service:z.string().uuid()}).strict().parse(await request.json());
  if(!context.sites.has(service))throw new ServiceDenied();
  const started=startGithub(context.actor,service,scopeName);
  headers['Set-Cookie']=`${stateCookieName}=${started.nonce}; Path=/api/hosting-github; HttpOnly; Secure; SameSite=Lax; Max-Age=${started.maxAge}`;
  return Response.json({url:started.url},{headers});
 }catch(error){return Response.json({error:error instanceof ServiceDenied?'Service access denied.':'GitHub connection unavailable.'},{status:error instanceof ServiceDenied?403:503,headers});}
}
