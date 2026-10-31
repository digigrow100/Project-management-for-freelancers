import {registrarSummary} from '@/lib/hosting/registrar/settings';
import {RegistrarPanel} from '@/components/hosting/RegistrarPanel';
export const dynamic='force-dynamic';
export const maxDuration=60;
export default async function RegistrarPage(){
 const data=await registrarSummary();
 return <div className="space-y-6"><div><h1 className="text-3xl font-semibold">Domains</h1><p className="mt-2 text-neutral-500">Manage renewals, DNS and domain security.</p></div><RegistrarPanel connected={data.connected} initialMode={data.mode} lastSync={data.lastSync}/></div>;
}
