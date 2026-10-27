import { getSiteOrigin } from '@/lib/site';
import { requireHostingAdmin } from '@/lib/hosting/auth';
import { readOperatorBody } from '@/lib/hosting/operatorBody';
import { prepareOperatorDelivery } from '@/lib/hosting/operator';
import { rateLimit } from "@/lib/security/rateLimit";
export async function POST(request:Request){
 try{if(request.headers.get('origin')!==getSiteOrigin())throw new Error('origin');const actor=await requireHostingAdmin();await rateLimit("operator-dispatch",actor.id,10,60);const raw=await readOperatorBody(request);return Response.json(await prepareOperatorDelivery(actor.id,JSON.parse(raw)),{headers:{'Cache-Control':'no-store'}});}
 catch{return Response.json({error:'Delivery could not be prepared.'},{status:403,headers:{'Cache-Control':'no-store'}});}
}

