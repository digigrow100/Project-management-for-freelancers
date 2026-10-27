import { readOperatorBody } from '@/lib/hosting/operatorBody';
import { operatorExchange } from '@/lib/hosting/operator';
export const dynamic='force-dynamic';
export async function POST(request:Request){
 try{
  if(Number(request.headers.get('content-length')||0)>8192)throw new Error('budget');
  const raw=await readOperatorBody(request);
  const data=await operatorExchange(JSON.parse(raw),request.headers.get('authorization'));
  return Response.json(data,{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Operator request unavailable.'},{status:403,headers:{'Cache-Control':'no-store'}});}
}
