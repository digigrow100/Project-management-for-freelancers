import {z} from 'zod';
import {mailHostname} from './schema';
import {managedApproval} from '../managedSchema';
export const mailId=z.string().uuid(),resourceId=z.string().regex(/^[a-f0-9]{32}$/);
const amount=z.number().int().min(0).max(100000000000),quota=z.number().int().min(1).max(102400);
export const emailProduct=z.object({hostname:mailHostname,client_id:mailId.nullable(),mailboxes:z.number().int().min(1).max(1000),mailbox_mb:quota,total_mb:z.number().int().min(1).max(1048576),price_minor:amount.nullable(),currency:z.enum(['USD','GBP','PKR']),cycle:z.enum(['monthly','yearly']),discount_percent:z.number().int().min(0).max(100),due_on:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),grace_days:z.number().int().min(0).max(90)}).strict().refine(p=>p.mailboxes*p.mailbox_mb<=p.total_mb,'Mailbox allocations exceed the total storage budget.');
export const mailLimits=z.object({mailboxes:z.number().int().min(1).max(1000),mailbox_mb:quota,total_mb:z.number().int().min(1).max(1048576)}).strict().refine(p=>p.mailboxes*p.mailbox_mb<=p.total_mb);
const local=z.string().regex(/^[a-z][a-z0-9_.+-]{0,63}$/),sealed=z.string().min(80).max(6000).regex(/^[A-Za-z0-9_-]+={0,2}$/);
export const mailOperation=z.discriminatedUnion('operation',[
 z.object({operation:z.literal('enroll'),domain:mailHostname,limits:mailLimits}).strict(),
 z.object({operation:z.literal('limits'),limits:mailLimits}).strict(),
 z.object({operation:z.literal('create'),name:local,sealed,quota_mb:quota}).strict(),
 z.object({operation:z.literal('password'),resource:resourceId,sealed}).strict(),
 z.object({operation:z.literal('quota'),resource:resourceId,quota_mb:quota}).strict(),
 z.object({operation:z.literal('controls'),resource:resourceId,sending:z.boolean(),receiving:z.boolean(),login:z.boolean()}).strict(),
 z.object({operation:z.literal('delete'),resource:resourceId,confirm:resourceId}).strict(),
 z.object({operation:z.literal('alias_delete'),resource:resourceId,alias:resourceId,confirm:resourceId}).strict(),
 z.object({operation:z.literal('alias'),name:local,resource:resourceId}).strict(),
 z.object({operation:z.literal('forward'),resource:resourceId,destination:z.string().email().max(254),keep_copy:z.boolean()}).strict(),
 z.object({operation:z.literal('autoreply'),resource:resourceId,enabled:z.boolean(),subject:z.string().max(120).regex(/^[^\r\n\u0000]*$/),text:z.string().max(5000)}).strict(),
 z.object({operation:z.literal('backup'),resource:resourceId}).strict(),
 z.object({operation:z.literal('restore'),resource:resourceId,point:resourceId,confirm:resourceId}).strict(),
 z.object({operation:z.literal('migrate'),resource:resourceId,source_host:mailHostname,source_user:z.string().email().max(254),sealed}).strict()
]);
export const mailJob=z.object({id:resourceId,state:z.enum(['queued','applying','confirmed','uncertain','failed','cancelled']),digest:z.string().regex(/^[a-f0-9]{64}$/),intent:z.record(z.unknown()),created:z.number().int().nonnegative(),approval_received:z.boolean()}).strict();
export const mailDelivery=z.object({service:mailId,domain:mailHostname,checked_at:z.number().int().positive(),checks:z.object({mx:z.enum(['matched','missing','different','unavailable']),spf:z.enum(['matched','missing','different','unavailable']),dkim:z.enum(['matched','missing','different','unavailable']),dmarc:z.enum(['matched','missing','different','unavailable']),server_dns:z.enum(['matched','missing','different','unavailable']),tls:z.enum(['matched','missing','different','unavailable'])}).strict(),can_send:z.boolean(),can_receive:z.boolean(),delivery_verified:z.literal(false)}).strict();
export const mailSnapshot=z.object({service:mailId,domain:mailHostname,state:z.enum(['not_enrolled','active','attention']),delivery:mailDelivery.nullable(),webmail_url:z.union([z.literal(''),z.literal('https://server1.housemysite.com/housemysite-webmail/')]),host_key:z.string().regex(/^[A-Za-z0-9_-]{43}=$/),limits:mailLimits.nullable(),sending_ready:z.boolean(),
 mailboxes:z.array(z.object({id:resourceId,address:z.string().email().max(254),quota_mb:quota,used_bytes:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable(),sending:z.boolean(),receiving:z.boolean(),login:z.boolean(),aliases:z.array(z.object({id:resourceId,address:z.string().email().max(254)}).strict()).max(100),forward:z.string().email().nullable(),autoreply:z.boolean()}).strict()).max(1000),
 jobs:z.array(mailJob).max(50),backups:z.array(z.object({id:resourceId,resource:resourceId,created:z.number().int().nonnegative(),bytes:z.number().int().nonnegative(),offsite:z.boolean()}).strict()).max(100),
 capabilities:z.object({backups:z.boolean(),migration:z.boolean(),aliases:z.boolean(),forwarding:z.boolean(),autoreply:z.boolean(),usage:z.boolean()}).strict(),
 records:z.array(z.object({type:z.enum(['MX','TXT']),name:z.string().max(253),value:z.string().max(4096),priority:z.number().int().min(0).max(65535).optional()}).strict()).max(10)}).strict().superRefine((s,c)=>{if(s.mailboxes.some(m=>!m.address.endsWith('@'+s.domain)))c.addIssue({code:'custom',message:'Mailbox domain mismatch'});if(s.state==='active'&&!s.limits)c.addIssue({code:'custom',message:'Missing server limits'});});
export const mailServiceCommand=z.discriminatedUnion('action',[
 z.object({action:z.literal('delivery'),service:mailId}).strict(),
 z.object({action:z.literal('snapshot'),service:mailId}).strict(),
 z.object({action:z.literal('request'),service:mailId,request_key:mailId,operation:mailOperation}).strict(),
 z.object({action:z.literal('approve'),service:mailId,job:resourceId,approval:managedApproval}).strict(),
 z.object({action:z.literal('reconcile'),service:mailId,job:resourceId}).strict(),
 z.object({action:z.literal('cancel'),service:mailId,job:resourceId}).strict()
]);
export type EmailProduct=z.infer<typeof emailProduct>;
export type MailSnapshot=z.infer<typeof mailSnapshot>;
export type MailJob=z.infer<typeof mailJob>;
export type EmailService=EmailProduct&{id:string;version:number;runtime_client:string;snapshot:MailSnapshot|null;observed_at:string|null};
export type MailboxProfile={service_id:string;resource:string;client_id:string|null;inherit_client:boolean;price_minor:number|null;version:number};
export type EmailBill={id:string;invoice_id:string|null;service_id:string;period_start:string;period_end:string;amount_minor:number;currency:string;due_on:string;paid_on:string|null;reference:string};
export type EmailServicesWorkspace={services:EmailService[];clients:{id:string;name:string}[];profiles:MailboxProfile[];bills:EmailBill[];settings:{mx_host:string;imap_host:string;smtp_host:string;webmail_url:string;host_fingerprint:string}};
export function storageAlert(used:number|null,quotaMb:number){return used===null?'unknown':used>=quotaMb*1048576*.95?'critical':used>=quotaMb*1048576*.8?'warning':'normal';}
