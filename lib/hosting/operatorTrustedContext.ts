import 'server-only';
import {createPublicKey,verify} from 'node:crypto';
import {z} from 'zod';
import {operatorContextSchema,type OperatorSigningContext} from './operatorContextSchema';
import {signingMessage} from './operatorSigning';
import {typedRequest} from './operatorSchema';
const enrollment=z.object({server_id:z.string().uuid(),client_id:z.string().uuid(),actor_id:z.string().uuid(),tenant:z.string(),subject:z.string(),host_key:z.string(),member_key:z.string().nullable()}).strict();
export function trustedOperatorContext(actor:string,job:Record<string,any>,mapping:Record<string,any>):OperatorSigningContext{
 if(process.env.HOSTING_OPERATOR_BROWSER_SIGNING!=='approved')throw Error('disabled');
 const raw=process.env.HOSTING_OPERATOR_TRUSTED_KEYS;if(!raw||Buffer.byteLength(raw)>65536)throw Error('enrollment unavailable');
 const all=JSON.parse(raw);if(!all||typeof all!=='object'||Array.isArray(all)||Object.keys(all).length>100)throw Error('enrollment unavailable');
 const bound=enrollment.parse(all[mapping.service_id]);
 if(bound.actor_id!==actor||bound.server_id!==mapping.server_id||bound.client_id!==mapping.client_id||bound.tenant!==mapping.tenant||bound.subject!==mapping.subject)throw Error('enrollment mismatch');
 for(const key of [bound.host_key,bound.member_key].filter((x):x is string=>x!==null)){
  const bytes=Buffer.from(key,'base64url');if(bytes.length!==32||bytes.toString('base64url')+'='!==key)throw Error('invalid enrolled public key');
 }
 const now=Math.floor(Date.now()/1000);
 return operatorContextSchema.parse({schema:1,job_id:job.id,idempotency_key:job.idempotency_key,actor_id:actor,service_id:mapping.service_id,client_id:mapping.client_id,server_id:mapping.server_id,tenant:mapping.tenant,subject:mapping.subject,project:mapping.project,kind:job.kind,host_key:bound.host_key,member_key:bound.member_key,server_time:now,expires:now+300});
}
export function verifyOperatorRequest(context:OperatorSigningContext,request:z.infer<typeof typedRequest>){
 if(!context.member_key)throw Error('signing key is not enrolled');
 const publicKey=createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),Buffer.from(context.member_key,'base64url')]),type:'spki',format:'der'});
 const signature=Buffer.from(request.auth.signature,'base64url');
 if(signature.length!==64||signature.toString('base64url')+'=='!==request.auth.signature||!verify(null,signingMessage(context,request.operation,request.idempotency_key,request.payload,request.auth.issued),publicKey,signature))throw Error('signature denied');
}
