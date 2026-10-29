import {PanelGuide,SetupRequired} from "@/components/hosting/PanelGuide";
import {panelFeatureState} from "@/lib/hosting/panelCatalog";
import {requireHostingAdmin} from "@/lib/hosting/auth";
import { backupContext } from "@/lib/hosting/backups";
import { BackupManager } from "@/components/hosting/BackupManager";
import { RestoreControls } from "@/components/hosting/RestoreControls";
export const dynamic="force-dynamic";
export default async function BackupsPage(){
 await requireHostingAdmin();
 if(!panelFeatureState('backups',process.env).enabled)return <div className="space-y-5"><h1 className="text-2xl font-semibold">Backups & restore</h1><PanelGuide section="backups"/><SetupRequired section="backups"/></div>;
 const context=await backupContext(true);
 const clients=[...context.sites].map(([id,b])=>({id,name:b.name,client:b.clientId}));
 const pin=/^[a-f0-9]{64}$/.test(process.env.HOSTING_SIGNER_FINGERPRINT??"")?process.env.HOSTING_SIGNER_FINGERPRINT!:null;
 return <div className="space-y-8"><PanelGuide section="backups"/><BackupManager owner readOnly={false}/><RestoreControls owner readOnly={false} signerFingerprint={pin} clients={clients}/></div>;
}

