import {z} from 'zod';
const id=z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/),uuid=z.string().uuid();
const sealed=z.string().min(80).max(3000).regex(/^[A-Za-z0-9_-]+={0,2}$/);
export const managedOperation=z.discriminatedUnion('operation',[
 z.object({operation:z.literal('create'),name:z.string().regex(/^[a-z][a-z0-9_]{0,15}$/),sealed}).strict(),
 z.object({operation:z.literal('password'),resource:id,sealed}).strict(),
 z.object({operation:z.literal('quota'),resource:id,quota_mb:z.number().int().positive().max(2147483647)}).strict(),
 z.object({operation:z.literal('enable'),resource:id}).strict(),z.object({operation:z.literal('disable'),resource:id}).strict(),
 z.object({operation:z.literal('delete'),resource:id,confirm:id}).strict()
]);
export const serviceCommand=z.discriminatedUnion('action',[
 z.object({action:z.literal('hosting.provision'),service:uuid,request_key:uuid}).strict(),
 z.object({action:z.literal('hosting.status'),service:uuid}).strict(),
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

