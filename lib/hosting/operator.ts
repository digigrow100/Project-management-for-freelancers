import 'server-only';
import { z } from 'zod';
import { getSupabase } from '@/lib/supabaseClient';
import { typedRequest,digest,credentialDigest,receipt } from './operatorProtocol';
export async function operatorExchange(input:unknown,authorization:string|null){
 if(process.env.HOSTING_OPERATOR_TRANSPORT!=='approved')throw new Error('disabled');
 const token=authorization?.match(/^Bearer ([A-Za-z0-9_-]{43,128})$/)?.[1];if(!token)throw new Error('denied');
 const claim=z.object({server_id:z.string().uuid(),claim_id:z.string().uuid()}).strict();
 const report=z.object({server_id:z.string().uuid(),receipt}).strict();
 const db=getSupabase();const result=report.safeParse(input);
 if(result.success){const {error}=await db.rpc('freelance_hq_hosting_operator_receipt',{p_server:result.data.server_id,p_token:credentialDigest(token),p_receipt:result.data.receipt});if(error)throw new Error('denied');return {accepted:true};}
 const c=claim.parse(input);const {data,error}=await db.rpc('freelance_hq_hosting_operator_claim',{p_server:c.server_id,p_token:credentialDigest(token),p_claim:c.claim_id});
 if(error)throw new Error('denied');return {delivery:data};
}
export async function prepareOperatorDelivery(actor:string,input:unknown){
 const value=z.object({job_id:z.string().uuid(),request:typedRequest}).strict().parse(input);
 const db=getSupabase();
 const {data:job,error:je}=await db.from('freelance_hq_hosting_jobs').select('*').eq('id',value.job_id).single();
 if(je||!job||job.requested_by!==actor||job.status!=='awaiting_connection')throw new Error('denied');
 const {data:m,error:me}=await db.from('freelance_hq_hosting_operator_mappings').select('*').eq('service_id',job.service_id).single();
 const {data:s,error:se}=await db.from('freelance_hq_hosting_services').select('server_id,client_id').eq('id',job.service_id).single();
 if(me||se||!m||!s||m.actor_id!==actor||m.server_id!==s.server_id||m.client_id!==s.client_id)throw new Error('denied');
 const kinds:Record<string,string>={provision:'project.create',suspend:'project.suspend',resume:'project.resume',deploy:'deploy.request'};
 if(kinds[job.kind]!==value.request.operation||value.request.idempotency_key!==job.idempotency_key)throw new Error('invalid request');
 const payload=value.request.payload as {project?:string};
 if(value.request.operation==='project.create'?m.project!==null:payload.project!==m.project)throw new Error('mapping mismatch');
 const now=Math.floor(Date.now()/1000);if(Math.abs(now-value.request.auth.issued)>300)throw new Error('expired signature');
 const expires=now+300;
 const body=JSON.stringify({schema:1,server_id:m.server_id,service_id:m.service_id,client_id:m.client_id,tenant:m.tenant,subject:m.subject,expires,request:value.request});
 const row={job_id:job.id,server_id:m.server_id,body,body_sha256:digest(body),expires_at:new Date(expires*1000).toISOString()};
 const {data:existing}=await db.from('freelance_hq_hosting_operator_deliveries').select('id,body').eq('job_id',job.id).maybeSingle();
 if(existing){const old=JSON.parse(existing.body);if(JSON.stringify(old.request)!==JSON.stringify(value.request))throw new Error('request conflict');return {id:existing.id};}
 const {data,error}=await db.from('freelance_hq_hosting_operator_deliveries').insert(row).select('id').single();if(error)throw new Error('delivery could not be prepared');return data;
}
