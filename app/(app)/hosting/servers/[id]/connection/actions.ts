"use server";
import { z } from 'zod';
import { requireHostingAdmin } from '@/lib/hosting/auth';
import { getSupabase } from '@/lib/supabaseClient';
import { rateLimit } from '@/lib/security/rateLimit';
import { readBridgeReports } from '@/lib/hosting/bridge';
import type { BridgeReport } from '@/lib/hosting/bridgeReports';
export type ConnectionState={reports?:BridgeReport[];error?:string;checked?:boolean};
export async function checkConnection(_previous:ConnectionState,form:FormData):Promise<ConnectionState>{
 const actor=await requireHostingAdmin();
 try{
  const id=z.string().uuid().parse(form.get('server_id'));
  const server=await getSupabase().from('freelance_hq_hosting_servers').select('hostname,ipv4').eq('id',id).single();
  if(server.error||server.data?.hostname!=='server1.housemysite.com'||server.data?.ipv4!=='62.171.130.156')return {error:'This bridge belongs to HouseMySite Server 1 only.'};
  await rateLimit('hosting-bridge-read',actor.id,3,60);
  const reports=await readBridgeReports();return {reports,checked:true};
 }catch(e){return {error:e instanceof Error&&(/^(GitHub connection|Add HOSTING_|Use a token|Management reports|The management response)/.test(e.message))?e.message:'Could not check the management connection. Please try again later.'};}
}
