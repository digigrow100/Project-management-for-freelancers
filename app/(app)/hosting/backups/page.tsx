import { backupContext } from "@/lib/hosting/backups";
import { BackupManager } from "@/components/hosting/BackupManager";
import { RestoreControls } from "@/components/hosting/RestoreControls";
export const dynamic="force-dynamic";
export default async function BackupsPage(){
 const context=await backupContext(true);
 const clients=[...context.sites].map(([id,b])=>({id,name:b.name,client:b.clientId}));
 const pin=/^[a-f0-9]{64}$/.test(process.env.HOSTING_SIGNER_FINGERPRINT??"")?process.env.HOSTING_SIGNER_FINGERPRINT!:null;
 return <div className="space-y-8"><BackupManager owner readOnly={false}/><RestoreControls owner readOnly={false} signerFingerprint={pin} clients={clients}/></div>;
}
