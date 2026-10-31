import 'server-only';
import {requireHostingAdmin} from '@/lib/hosting/auth';
import {getSupabase} from '@/lib/supabaseClient';

// Both pages receive metadata only. Saved credentials never enter their props.
export async function registrarSummary(){
 await requireHostingAdmin();
 const {data,error}=await getSupabase().from('freelance_hq_hosting_registrar_connection').select('mode,verified_at,sync_at').eq('id',true).maybeSingle();
 if(error)throw new Error('Domain connection settings could not be loaded.');
 return {connected:Boolean(data?.verified_at),mode:data?.mode??'production',lastSync:data?.sync_at??null,verifiedAt:data?.verified_at??null};
}
