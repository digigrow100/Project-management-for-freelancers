import { backupContext } from "@/lib/hosting/backups";
import { BackupManager } from "@/components/hosting/BackupManager";
export const dynamic="force-dynamic";
export default async function BackupsPage(){await backupContext(true);return <BackupManager owner readOnly={false}/>;}
