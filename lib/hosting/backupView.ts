import {z} from 'zod';
import type {BackupKind,BackupPolicy,BackupScopePlan} from './backupProtocol';
// The portal route has ALREADY validated the private service's wire format and turned it into the shapes below (camelCase, display names).
// The browser therefore validates these portal-shaped responses, never the wire format again.
// Type-only import above keeps this module loadable without the server-side protocol code; the list below must equal BackupKind.
const kindList=['website','database','email','configuration'] as const;
const _sameKinds:[BackupKind] extends [typeof kindList[number]]?([typeof kindList[number]] extends [BackupKind]?true:never):never=true;void _sameKinds;
export class BackupViewDenied extends Error {}
const kind=z.enum(kindList),id=z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/),count=z.number().int().nonnegative();
const shared=z.object({component:kind,resource:id,affects:z.array(z.object({site:z.string().max(128)}).strict()).max(100),acknowledgement:z.string().max(200).optional()}).strict();
const policy=z.object({id,name:z.string().max(200),copies:count,defaultPoint:id.nullable(),
 schedule:z.object({enabled:z.boolean(),intervalDays:z.number().int().min(1).max(30),nextDue:count}).strict().nullable(),
 baseline:z.object({due:count,taken:z.boolean()}).strict(),
 recommended:z.object({intervalDays:count,coversDays:count,rotatingSlots:count,raisedByLock:z.boolean()}).strict(),
 conflicts:z.array(z.object({code:z.string().regex(/^[a-z_]{1,40}$/),detail:z.string().max(400)}).strict()).max(10),explanation:z.string().max(1200),objectLockDays:count.nullable(),
 points:z.array(z.object({id,captured:count,default:z.boolean(),components:z.array(kind).min(1).max(4)}).strict()).max(1000)}).strict();
const plan=z.object({job:z.string().regex(/^[a-f0-9]{32}$/),digest:z.string().regex(/^[a-f0-9]{64}$/),plan:z.record(z.unknown()),
 sites:z.array(z.object({site:id,point:id,captured:count,components:z.array(kind).max(4),missing:z.array(kind).max(4),skipped:z.array(shared).max(50),accepted:z.array(shared).max(50),
  covered:z.array(z.object({component:kind,resource:id}).strict()).max(50)}).strict()).min(1).max(100)}).strict();
export function policiesView(raw:unknown):BackupPolicy[]{const p=z.array(policy).max(100).safeParse(raw);if(!p.success)throw new BackupViewDenied();return p.data as BackupPolicy[];}
export function scopePlanView(raw:unknown):BackupScopePlan{const p=plan.safeParse(raw);if(!p.success||new Set(p.data.sites.map(s=>s.site)).size!==p.data.sites.length)throw new BackupViewDenied();return p.data as BackupScopePlan;}
