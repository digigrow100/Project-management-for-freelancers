import {createHash} from 'node:crypto';
import {z} from 'zod';
import {RESOURCE_FIELDS,canonicalLimits,packageSnapshot,type PackageSnapshot} from './packageLimits';
// Pure (no database, no network): the shapes exchanged with the private service for App Hosting accounts, and the checks that bind every answer
// to the stored contract. The private service checks the same identities again; neither side trusts the other's word.
const uuid=z.string().uuid(),digest=z.string().regex(/^[a-f0-9]{64}$/);
export const LIMIT_KEYS=RESOURCE_FIELDS.map(f=>f[0]) as readonly string[];
export const ACCOUNT_STATES=['requested','provisioning','uncertain','provider_confirmed','enforced','suspended'] as const;
export const appJob=z.object({id:z.string().regex(/^[a-f0-9]{32}$/),digest,state:z.enum(['queued','applying','uncertain','provider_confirmed','verified','failed']),live_verified:z.literal(false)}).strict();
export const appStatus=z.object({account:uuid,client:uuid,state:z.enum(ACCOUNT_STATES),enforced:z.boolean(),limits_digest:digest,assignment:uuid,package:uuid,package_version:z.number().int().positive(),
 plan_digest:digest,capabilities:z.record(z.boolean()),blocked_features:z.array(z.string().max(40)).max(20),
 sites:z.array(z.object({site:uuid,domain:z.string().max(253),state:z.enum(['reserved','provider_confirmed','verified']),primary:z.boolean()}).strict()).max(100),
 jobs:z.array(z.object({id:z.string().regex(/^[a-f0-9]{32}$/),kind:z.enum(['provision','add-site']),state:z.enum(['queued','applying','uncertain','provider_confirmed','verified','failed']),site:uuid}).strict()).max(200),
 receipt_digest:digest.nullable(),live_verified:z.literal(false)}).strict();
export const usageEntry=z.object({limit:z.number().int().nonnegative(),effective:z.number().int().nonnegative(),used:z.number().int().nonnegative().nullable(),percent:z.number().nonnegative().nullable(),
 level:z.enum(['unknown','disabled','ok','warn80','warn90','exceeded']),basis:z.string().max(60),measured:z.number().int().positive().optional(),allocated:z.number().int().nonnegative().optional()}).strict();
export const appUsage=z.object({account:uuid,usage:z.record(usageEntry).refine(u=>Object.keys(u).every(k=>LIMIT_KEYS.includes(k))&&Object.keys(u).length===LIMIT_KEYS.length,'usage'),live_verified:z.literal(false)}).strict();
export type AppStatus=z.infer<typeof appStatus>;
export type Rows={service:{id:string;client_id:string;server_id:string|null;package_id:string;status:string;assignment_key:string|null;package_snapshot:unknown};
 account:{id:string;service_id:string;client_id:string;server_id:string;package_id:string;package_version:number;assignment_key:string;limits_digest:string;status:string};
 site:{id:string;account_id:string;client_id:string;hostname:string;is_primary:boolean}};
export function limitsDigest(limits:unknown){return createHash('sha256').update(canonicalLimits(limits)).digest('hex');}
// Every identity of the contract must agree across the service row, the account row, the frozen snapshot and the recomputed digest.
export function contract(rows:Rows):PackageSnapshot{
 const snap=packageSnapshot.safeParse(rows.service.package_snapshot);if(!snap.success)throw new Error('Contract unavailable');const s=snap.data;
 const ok=rows.account.service_id===rows.service.id&&rows.account.client_id===rows.service.client_id&&rows.account.server_id===rows.service.server_id&&rows.account.package_id===rows.service.package_id
  &&rows.account.assignment_key===rows.service.assignment_key&&rows.account.limits_digest===s.limits_digest&&rows.account.package_version===s.version&&s.package_id===rows.service.package_id
  &&limitsDigest(s.limits)===s.limits_digest&&rows.site.account_id===rows.account.id&&rows.site.client_id===rows.account.client_id;
 if(!ok)throw new Error('Contract mismatch');return s;
}
export function provisionWire(rows:Rows,requestKey:string){
 const s=contract(rows);
 if(!rows.service.server_id||!rows.service.assignment_key)throw new Error('Contract incomplete');
 const kind=rows.site.is_primary?'provision':'add-site';
 if(kind==='provision'&&!(rows.account.status==='requested'||rows.account.status==='provisioning'))throw new Error('Account is already provisioned');
 if(kind==='add-site'&&rows.account.status!=='enforced')throw new Error('Additional websites need an enforced account');
 return {action:'hosting.app.provision' as const,kind,account:rows.account.id,service:rows.service.id,assignment:rows.service.assignment_key,client:rows.service.client_id,server:rows.service.server_id,
  package:rows.service.package_id,version:s.version,limits_digest:s.limits_digest,limits:s.limits,site:rows.site.id,domain:rows.site.hostname,request_key:requestKey};
}
// The answer must be about THIS account and repeat the contract it was built from.
export function checkStatus(value:unknown,rows:Rows):AppStatus{
 const s=contract(rows);const status=appStatus.parse(value);
 if(status.account!==rows.account.id||status.client!==rows.account.client_id||status.assignment!==rows.account.assignment_key||status.limits_digest!==s.limits_digest||status.package!==rows.account.package_id||status.package_version!==s.version)throw new Error('Status does not match the contract');
 if(status.enforced&&(status.state!=='enforced'||!status.receipt_digest))throw new Error('Unverified enforcement');
 if(status.state==='enforced'&&!status.enforced)throw new Error('Unverified enforcement');
 const known=new Set<string>();for(const site of status.sites){if(known.has(site.site))throw new Error('Duplicate site');known.add(site.site);}
 return status;
}
export function checkUsage(value:unknown,account:string){const usage=appUsage.parse(value);if(usage.account!==account)throw new Error('Usage does not match the account');return usage;}
