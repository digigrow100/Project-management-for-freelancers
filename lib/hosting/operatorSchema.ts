import { z } from "zod";
const uuid=z.string().uuid(), project=z.string().regex(/^c[a-f0-9]{8}$/);
const signature=z.object({issued:z.number().int().positive(),signature:z.string().regex(/^[A-Za-z0-9_-]{86}==$/)}).strict();
const sealedEnvelope=z.string().min(80).max(90000).regex(/^(?:[A-Za-z0-9_-]{4})*(?:[A-Za-z0-9_-]{2}==|[A-Za-z0-9_-]{3}=)?$/).refine(value=>{
 try{const raw=atob(value.replace(/-/g,'+').replace(/_/g,'/'));return raw.length>=60&&btoa(raw).replace(/\+/g,'-').replace(/\//g,'_')===value;}catch{return false;}
});
export const typedRequest=z.discriminatedUnion('operation',[
 z.object({operation:z.literal('project.create'),idempotency_key:uuid,payload:z.object({name:z.string().regex(/^[A-Za-z0-9][A-Za-z0-9 ._-]{0,63}$/)}).strict(),auth:signature}).strict(),
 z.object({operation:z.literal('project.suspend'),idempotency_key:uuid,payload:z.object({project}).strict(),auth:signature}).strict(),
 z.object({operation:z.literal('project.resume'),idempotency_key:uuid,payload:z.object({project}).strict(),auth:signature}).strict(),

 z.object({operation:z.literal('repo.bind'),idempotency_key:uuid,payload:z.object({project,repository:z.string().regex(/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/),repository_id:z.number().int().positive().safe(),workflow_id:z.number().int().positive().safe(),workflow_path:z.string().regex(/^\.github\/workflows\/[A-Za-z0-9._-]{1,80}\.ya?ml$/),branch:z.string().regex(/^[A-Za-z0-9._/-]{1,100}$/),artifact_name:z.string().regex(/^[A-Za-z0-9._-]{1,80}$/)}).strict(),auth:signature}).strict(),
 z.object({operation:z.literal('env.set'),idempotency_key:uuid,payload:z.object({project,scope:z.enum(['production','preview','development']),sealed:sealedEnvelope}).strict(),auth:signature}).strict(),
 z.object({operation:z.literal('domain.assign'),idempotency_key:uuid,payload:z.object({project,domain:z.string().regex(/^(?:\*\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/)}).strict(),auth:signature}).strict(),
 z.object({operation:z.literal('domain.release'),idempotency_key:uuid,payload:z.object({project}).strict(),auth:signature}).strict(),
 z.object({operation:z.literal('limits.set'),idempotency_key:uuid,payload:z.object({project,scope:z.enum(['production','preview','development']),memory_mb:z.number().int().positive().safe(),tasks:z.number().int().positive().safe(),cpu_percent:z.number().int().positive().safe(),disk_mb:z.number().int().positive().safe()}).strict(),auth:signature}).strict(),
 z.object({operation:z.literal('deploy.cancel'),idempotency_key:uuid,payload:z.object({project,request_id:z.number().int().positive().safe()}).strict(),auth:signature}).strict(),

 z.object({operation:z.literal('deploy.request'),idempotency_key:uuid,payload:z.object({project,scope:z.enum(['production','preview','development']),commit:z.string().regex(/^[a-f0-9]{40}$/)}).strict(),auth:signature}).strict()
]);

export const operatorRequestSchema=z.object({job_id:uuid,request:typedRequest}).strict();
export const operatorJobKinds:Readonly<Record<string,readonly string[]>>={
 provision:['project.create'],suspend:['project.suspend'],resume:['project.resume'],
 deploy:['deploy.request'],cancel:['deploy.cancel'],configure:['repo.bind','env.set','domain.assign','domain.release','limits.set']
};
export const MAX_OPERATOR_BYTES=131072;
