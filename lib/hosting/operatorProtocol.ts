import { createHash } from 'crypto';
import { z } from 'zod';
const uuid=z.string().uuid(), project=z.string().regex(/^c[a-f0-9]{8}$/);
const signature=z.object({issued:z.number().int().positive(),signature:z.string().regex(/^[A-Za-z0-9_-]{86}==$/)}).strict();
export const typedRequest=z.discriminatedUnion('operation',[
 z.object({operation:z.literal('project.create'),idempotency_key:uuid,payload:z.object({name:z.string().regex(/^[A-Za-z0-9][A-Za-z0-9 ._-]{0,63}$/)}).strict(),auth:signature}).strict(),
 z.object({operation:z.literal('project.suspend'),idempotency_key:uuid,payload:z.object({project}).strict(),auth:signature}).strict(),
 z.object({operation:z.literal('project.resume'),idempotency_key:uuid,payload:z.object({project}).strict(),auth:signature}).strict(),

 z.object({operation:z.literal('deploy.request'),idempotency_key:uuid,payload:z.object({project,scope:z.enum(['production','preview','development']),commit:z.string().regex(/^[a-f0-9]{40}$/)}).strict(),auth:signature}).strict()
]);
export function digest(body:string){return createHash('sha256').update(body,'utf8').digest('hex');}
export function credentialDigest(token:string){return digest('hms-operator-v1:'+token);}
export const receipt=z.object({delivery_id:uuid,claim_id:uuid,body_sha256:z.string().regex(/^[a-f0-9]{64}$/),state:z.enum(['queued','applied','rejected','recovery_required']),local_id:z.number().int().positive().nullable(),project:project.nullable()}).strict();
