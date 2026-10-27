import {getSiteOrigin} from '@/lib/site';
import {readBackupBody} from '@/lib/hosting/backupBody';
import {serviceScope,serviceRequest,ServiceDenied} from '@/lib/hosting/managed';
import {rateLimit} from '@/lib/security/rateLimit';
import {clientFeatureEnabled} from '@/lib/hosting/clientRelease';
import {serviceCommand} from '@/lib/hosting/managedSchema';
export const dynamic='force-dynamic';
export async function POST(request:Request){
 const headers={'Cache-Control':'private, no-store'};
 try{
  if(request.headers.get('origin')!==getSiteOrigin())throw new ServiceDenied();
  const scope=new URL(request.url).searchParams.get('scope');if(scope!=='owner'&&scope!=='client')throw new ServiceDenied();
  const context=await serviceScope(scope==='owner');await rateLimit('managed-services',context.actor,20,60);
  const command=serviceCommand.parse(JSON.parse(await readBackupBody(request)));
  const feature=command.action.startsWith('forms.')?'forms':('kind' in command&&command.kind==='email'?'email':'databases');
  if(scope==='client'&&!clientFeatureEnabled(feature,process.env))return Response.json({error:'Service unavailable.'},{status:404,headers});
  return Response.json(await serviceRequest(context,command),{headers});
 }catch(error){return Response.json({error:error instanceof ServiceDenied?'Service access denied.':'Service response unavailable. Review status before another submission.'},{status:error instanceof ServiceDenied?403:503,headers});}
}
