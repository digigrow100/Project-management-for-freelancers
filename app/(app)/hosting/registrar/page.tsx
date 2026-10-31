import {requireHostingAdmin} from '@/lib/hosting/auth';
import {getSupabase} from '@/lib/supabaseClient';
import {RegistrarPanel} from '@/components/hosting/RegistrarPanel';
export const dynamic='force-dynamic';
export const maxDuration=60;
export default async function RegistrarPage(){
 await requireHostingAdmin();
 const {data,error}=await getSupabase().from('freelance_hq_hosting_registrar_connection').select('mode,verified_at,sync_at').eq('id',true).maybeSingle();
 if(error)throw new Error('Dynadot settings could not be loaded.');
 return <div className="space-y-6"><div><h1 className="text-3xl font-semibold">Dynadot domain management</h1><p className="mt-2 text-neutral-500">Connect your registrar, sync domains and review changes before applying them.</p></div><RegistrarPanel connected={Boolean(data?.verified_at)} initialMode={data?.mode??'production'} lastSync={data?.sync_at??null}/></div>;
}
