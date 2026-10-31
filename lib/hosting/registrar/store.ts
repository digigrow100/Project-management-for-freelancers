import 'server-only';
import {getSupabase} from '@/lib/supabaseClient';
import {encryptApiKey,decryptApiKey} from '@/lib/dynadotCrypto';
import {credentials,type Credentials,type DomainInfo,type Intent} from './schema';
import {RegistrarError} from './api';
export const table=(suffix:string)=>'freelance_hq_hosting_registrar_'+suffix;
export function checked<T>(r:{data:T;error:unknown}):T{if(r.error)throw new RegistrarError('storage_unavailable');return r.data;}
export async function connection(){const row=checked(await getSupabase().from(table('connection')).select('*').eq('id',true).maybeSingle());if(!row)throw new RegistrarError('not_connected');return {...row,credentials:credentials.parse(JSON.parse(decryptApiKey(row.credentials_encrypted)))} as {version:string;mode:string;credentials:Credentials;sync_at:string|null};}
export async function saveConnection(actor:string,c:Credentials){return checked(await getSupabase().rpc('freelance_hq_hosting_registrar_connect',{p_actor:actor,p_credentials:encryptApiKey(JSON.stringify(c)),p_mode:c.mode})) as string;}
export async function remember(version:string,domains:DomainInfo[]){if(domains.length)checked(await getSupabase().from(table('domains')).upsert(domains.map(d=>({connection_version:version,name:d.name,details:d,synced_at:new Date().toISOString()}))));}
export type Review={id:string;actor_id:string;connection_version:string;domain:string;kind:Intent['kind'];intent:Intent;before_state:DomainInfo;quote:{amount:string;currency:string;years:number}|null;state:string;created_at:string;updated_at:string;expires_at:string};
export async function prepare(actor:string,version:string,name:string,intent:Intent,before:DomainInfo,quote:Review['quote']){return checked(await getSupabase().from(table('operations')).insert({actor_id:actor,connection_version:version,domain:name,kind:intent.kind,intent,before_state:before,quote}).select('*').single()) as Review;}
export async function operation(id:string,actor:string){return checked(await getSupabase().from(table('operations')).select('*').eq('id',id).eq('actor_id',actor).single()) as Review;}
export async function claim(actor:string,id:string){const r=await getSupabase().rpc('freelance_hq_hosting_registrar_claim',{p_actor:actor,p_id:id});if(r.error)throw new RegistrarError(String(r.error.message).includes('reconciliation')?'reconcile_required':'review_expired');return r.data as Review;}
export async function finish(op:Review,state:'confirmed'|'uncertain'|'failed'){
 checked(await getSupabase().rpc('freelance_hq_hosting_registrar_finish',{p_actor:op.actor_id,p_id:op.id,p_state:state}));
}
