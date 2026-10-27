import {z} from 'zod';
import {getSiteOrigin} from '@/lib/site';
import {requireHostingAdmin} from '@/lib/hosting/auth';
import {rateLimit} from '@/lib/security/rateLimit';
import {readOperatorBody} from '@/lib/hosting/operatorBody';
import {operatorSigningContext} from '@/lib/hosting/operator';
export const dynamic='force-dynamic';
export async function POST(request:Request){
 const headers={'Cache-Control':'private, no-store'};
 try{
  if(request.headers.get('origin')!==getSiteOrigin())throw Error('origin');
  const actor=await requireHostingAdmin();await rateLimit('operator-context',actor.id,20,60);
  const value=z.object({job_id:z.string().uuid()}).strict().parse(JSON.parse(await readOperatorBody(request)));
  return Response.json(await operatorSigningContext(actor.id,value.job_id),{headers});
 }catch{return Response.json({error:'Signing context is unavailable. Check enrollment and request access.'},{status:403,headers});}
}
