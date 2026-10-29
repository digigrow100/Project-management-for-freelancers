import {requireClientFeature} from '@/lib/hosting/clientReleaseServer';
import { backupContext } from "@/lib/hosting/backups";
import { BackupManager } from "@/components/hosting/BackupManager";
import { RestoreControls } from "@/components/hosting/RestoreControls";
export const dynamic="force-dynamic";
export default async function ClientBackupsPage(){const context=await backupContext(false);requireClientFeature('backups');const clients=[...context.sites].map(([id,b])=>({id,name:b.name,client:b.clientId}));return <div className="space-y-8"><BackupManager owner={false} readOnly={context.readOnly}/><RestoreControls owner={false} readOnly={context.readOnly} signerFingerprint={null} clients={clients}/></div>;}
