import {requireClientFeature} from '@/lib/hosting/clientReleaseServer';
import { backupContext } from "@/lib/hosting/backups";
import { BackupManager } from "@/components/hosting/BackupManager";
export const dynamic="force-dynamic";
export default async function ClientBackupsPage(){const context=await backupContext(false);requireClientFeature('backups');return <BackupManager owner={false} readOnly={context.readOnly}/>;}
