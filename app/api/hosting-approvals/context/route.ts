import {getSiteOrigin} from '@/lib/site';
import {readBackupBody} from '@/lib/hosting/backupBody';
import {serviceScope,signerContext,ServiceDenied} from '@/lib/hosting/managed';
import {rateLimit} from '@/lib/security/rateLimit';
export const dynamic='force-dynamic';
// Owner sessions only. Returns the exact identifiers the local signer is asked to display for an automatic-deployment policy.
export async function POST(request:Request){
 const headers={'Cache-Control':'private, no-store'};
 try{
  if(request.headers.get('origin')!==getSiteOrigin())throw new ServiceDenied();
  const context=await serviceScope(true);await rateLimit('managed-signer-context',context.actor,20,60);
  const body=JSON.parse(await readBackupBody(request));
  return Response.json({...await signerContext(context,body?.service),origin:getSiteOrigin()},{headers});
 }catch(error){return Response.json({error:'Service access denied.'},{status:error instanceof ServiceDenied?403:503,headers});}
}
