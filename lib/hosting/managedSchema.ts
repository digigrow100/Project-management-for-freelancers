import {z} from 'zod';
const id=z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/),uuid=z.string().uuid();
const sealed=z.string().min(80).max(3000).regex(/^[A-Za-z0-9_-]+={0,2}$/);
const treeId=z.string().regex(/^[a-f0-9]{32}$/),sourceNumber=z.number().int().positive().max(Number.MAX_SAFE_INTEGER),sourceVersion=z.number().int().min(0).max(1000000);
// Conservative git ref check; the private service applies the authoritative rules again.
const sourceBranch=z.string().min(1).max(200).regex(/^[A-Za-z0-9][A-Za-z0-9._\/-]*$/).refine(v=>!v.includes('..')&&!v.includes('//')&&!v.endsWith('/')&&!v.endsWith('.')&&!v.split('/').some(p=>p.startsWith('.')||p.endsWith('.lock')));
export const SOURCE_UPLOAD_MAX_BYTES=64*1024*1024;
export const managedOperation=z.discriminatedUnion('operation',[
 z.object({operation:z.literal('create'),name:z.string().regex(/^[a-z][a-z0-9_]{0,15}$/),sealed}).strict(),
 z.object({operation:z.literal('password'),resource:id,sealed}).strict(),
 z.object({operation:z.literal('quota'),resource:id,quota_mb:z.number().int().positive().max(2147483647)}).strict(),
 z.object({operation:z.literal('enable'),resource:id}).strict(),z.object({operation:z.literal('disable'),resource:id}).strict(),
 z.object({operation:z.literal('delete'),resource:id,confirm:id}).strict()
]);
export const serviceCommand=z.discriminatedUnion('action',[
 z.object({action:z.literal('hosting.domain.request'),service:uuid,domain:uuid,operation:z.enum(['attach','ssl']),request_key:uuid}).strict(),
 z.object({action:z.literal('hosting.domain.status'),service:uuid,domain:uuid}).strict(),
 z.object({action:z.literal('hosting.provision'),service:uuid,request_key:uuid}).strict(),
 z.object({action:z.literal('hosting.status'),service:uuid}).strict(),
 z.object({action:z.literal('source.status'),service:uuid}).strict(),
 z.object({action:z.literal('source.repositories'),service:uuid}).strict(),
 z.object({action:z.literal('source.connect'),service:uuid,installation_id:sourceNumber,repository_id:sourceNumber,branch:sourceBranch,expected_version:sourceVersion}).strict(),
 z.object({action:z.literal('source.switch'),service:uuid,installation_id:sourceNumber,repository_id:sourceNumber,branch:sourceBranch,expected_version:sourceVersion}).strict(),
 z.object({action:z.literal('source.disconnect'),service:uuid,expected_version:sourceVersion}).strict(),
 z.object({action:z.literal('source.request'),service:uuid,operation:z.enum(['deploy','export']),request_key:uuid,tree:treeId.nullable()}).strict(),
 z.object({action:z.literal('source.discard'),service:uuid,tree:treeId}).strict(),
 z.object({action:z.literal('source.upload_ticket'),service:uuid,size:z.number().int().min(22).max(SOURCE_UPLOAD_MAX_BYTES),sha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict(),
 z.object({action:z.literal('inventory'),service:uuid,kind:z.enum(['email','database'])}).strict(),
 z.object({action:z.literal('request'),service:uuid,kind:z.enum(['email','database']),request_key:uuid,operation:managedOperation}).strict(),
 z.object({action:z.literal('forms.list')}).strict(),
 z.object({action:z.literal('forms.rotate'),project:uuid}).strict(),
 z.object({action:z.literal('forms.revoke'),project:uuid}).strict(),
 z.object({action:z.literal('forms.status'),project:uuid,job:id}).strict()
]);
export const managedInventory=z.object({service:uuid,kind:z.enum(['email','database']),enabled:z.boolean(),resources:z.array(z.object({id,name:z.string().max(254)}).strict()).max(1000),jobs:z.array(z.object({id,state:z.enum(['queued','applying','uncertain','restore_review','provider_confirmed']),created:z.number().int().nonnegative()}).strict()).max(50),host_key:z.string().regex(/^[A-Za-z0-9_-]{43}=$/)}).strict();
export const formProject=z.object({id:uuid,client:uuid,name:z.string().max(64),active:z.number().int().min(0).max(1),paid_until:z.number().int().nonnegative(),monthly_limit:z.number().int().positive().max(100000),used:z.number().int().nonnegative()}).strict();
export type ManagedInventory=z.infer<typeof managedInventory>;


const sourceRepository=z.object({installation_id:z.number().int().positive(),repository_id:z.number().int().positive(),full_name:z.string().regex(/^[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/).max(140),branch:z.string().min(1).max(200),write:z.boolean()}).strict();
const sourceResult=z.record(z.union([z.string().max(200),z.number(),z.boolean(),z.null(),z.array(z.string().max(1024)).max(50)]));
export const sourceJob=z.object({id:z.string().regex(/^[a-f0-9]{32}$/),digest:z.string().regex(/^[a-f0-9]{64}$/),state:z.enum(['queued','applying','done','failed','uncertain','cancelled']),operation:z.enum(['deploy','export']),source:z.enum(['github','tree']),tree:treeId.nullable(),created:z.number().int().nonnegative(),result:sourceResult.nullable(),live_verified:z.literal(false)}).strict();
export const sourceTree=z.object({id:treeId,kind:z.enum(['zip','github']),state:z.enum(['staged','released']),files:z.number().int().nonnegative(),bytes:z.number().int().nonnegative(),created:z.number().int().nonnegative(),manifest_sha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export const sourceStatus=z.object({service:uuid,version:z.number().int().nonnegative(),repository:sourceRepository.nullable(),jobs:z.array(sourceJob).max(5),trees:z.array(sourceTree).max(5),
 current:z.object({tree:treeId,released:z.number().int().nonnegative()}).strict().nullable(),published_to_web_root:z.literal(false),live_verified:z.literal(false)}).strict();
export const sourceRepositories=z.object({service:uuid,version:z.number().int().nonnegative(),repository:sourceRepository.nullable(),available:z.array(z.object({installation_id:z.number().int().positive(),repository_id:z.number().int().positive(),full_name:sourceRepository.shape.full_name,write:z.boolean()}).strict()).max(200)}).strict();
export const sourceTreeSummary=z.object({id:treeId,kind:z.literal('zip'),files:z.number().int().nonnegative(),bytes:z.number().int().nonnegative(),manifest_sha256:z.string().regex(/^[a-f0-9]{64}$/),activated:z.literal(false)}).strict();
export const sourceUploadTicket=z.object({url:z.string().url(),ticket:z.string().regex(/^[A-Za-z0-9_-]{1,2048}$/),signature:z.string().regex(/^[a-f0-9]{64}$/),expires:z.number().int().positive(),max_bytes:z.number().int().positive()}).strict();
export type SourceStatus=z.infer<typeof sourceStatus>;
export type SourceRepositories=z.infer<typeof sourceRepositories>;
export type SourceJob=z.infer<typeof sourceJob>;
