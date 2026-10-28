import 'server-only';
import {headers} from 'next/headers';
import {redirect} from 'next/navigation';
import {getSupabase} from '@/lib/supabaseClient';
import {adminNetworkAllowed} from './adminNetworkPolicy';
export class AdminNetworkDenied extends Error {
  constructor(){super('Admin access is restricted to approved networks.');}
}
export function requireAdminNetworkForRole(role:string):void{
  if(role==='admin' && !adminNetworkAllowed(headers(),process.env))redirect('/login/network-restricted');
}
/** Caller must first validate this user's identity with Supabase Auth. */
export async function assertAdminNetworkForUser(userId:string):Promise<void>{
  const profile=await getSupabase().from('freelance_hq_profiles').select('role').eq('id',userId).maybeSingle();
  if(profile.error)throw new Error('Could not verify account access.');
  // Roles come from the private profile table, never user-editable metadata.
  if(profile.data?.role==='admin' && !adminNetworkAllowed(headers(),process.env))throw new AdminNetworkDenied();
}
export async function requireAdminNetworkForUser(userId:string):Promise<void>{
  try{await assertAdminNetworkForUser(userId);}
  catch(error){if(error instanceof AdminNetworkDenied)redirect('/login/network-restricted');throw error;}
}
