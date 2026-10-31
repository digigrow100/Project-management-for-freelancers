import {registrarSummary} from '@/lib/hosting/registrar/settings';
import {HostingSettingsTabs} from '@/components/hosting/HostingSettingsTabs';
import {RegistrarConnectionPanel} from '@/components/hosting/RegistrarConnectionPanel';
export const dynamic='force-dynamic';
export const maxDuration=60;
export default async function DomainSettingsPage(){
 const summary=await registrarSummary();
 return <div className="space-y-6"><div><h1 className="text-3xl font-semibold">Hosting settings</h1><p className="mt-2 text-neutral-500">Manage your domain provider and account connection.</p></div><HostingSettingsTabs active="domains"/><RegistrarConnectionPanel connected={summary.connected} initialMode={summary.mode} verifiedAt={summary.verifiedAt}/></div>;
}
