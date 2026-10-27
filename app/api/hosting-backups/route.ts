import { getSiteOrigin } from "@/lib/site";
import { readBackupBody } from "@/lib/hosting/backupBody";
import { backupContext,backupRequest } from "@/lib/hosting/backups";
import { BackupDenied } from "@/lib/hosting/backupProtocol";
import { rateLimit } from "@/lib/security/rateLimit";
import { clientFeatureEnabled } from '@/lib/hosting/clientRelease';
export const dynamic="force-dynamic";
export async function POST(request:Request){
 const headers={"Cache-Control":"no-store"};
 try{
  if(request.headers.get("origin")!==getSiteOrigin())throw new BackupDenied();
  const scope=new URL(request.url).searchParams.get("scope");if(scope!=="owner"&&scope!=="client")throw new BackupDenied();
  const context=await backupContext(scope==="owner");
  if(scope==='client'&&!clientFeatureEnabled('backups',process.env))return Response.json({error:'Service unavailable.'},{status:404,headers});
  await rateLimit("backup-portal",context.actor,30,60);
  const raw=await readBackupBody(request);
  return Response.json(await backupRequest(context,JSON.parse(raw)),{headers});
 }catch(error){return Response.json({error:error instanceof BackupDenied?"Backup access denied.":"Backup service is not available. No restore was activated."},{status:error instanceof BackupDenied?403:503,headers});}
}
