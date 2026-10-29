import {z} from 'zod';

// Flat, versioned, finite integers. Zero disables a resource; it never means unlimited.
export const RESOURCE_FIELDS = [
 ['website_limit','Websites / apps',100],['disk_mb','Website files (MiB)',1048576],
 ['traffic_mb','Outgoing transfer / month (MiB)',10485760],['memory_mb','Total app memory (MiB)',65536],
 ['cpu_percent','Shared CPU ceiling (% of one core)',400],['inode_limit','Files / inodes',10000000],
 ['database_limit','Databases',100],['database_mb','Total database storage (MiB)',1048576],
 ['database_connections','Concurrent database connections',1000],['email_limit','Email accounts',1000],
 ['mail_mb','Total mailbox storage (MiB)',1048576],['mail_recipients_day','Outgoing recipients / day',10000],
 ['release_limit','Saved deployment versions',100],['backup_limit','Backup copies / website',100],
 ['upload_mb','ZIP upload size (MiB)',1024],['extract_mb','Extracted ZIP size (MiB)',10240],
 ['build_seconds','Build timeout (seconds)',3600],['build_memory_mb','Build memory (MiB)',4096],
 ['process_limit','Running processes',512],['cron_limit','Scheduled tasks',50],
 ['env_limit','Environment variables',200],['env_value_bytes','Bytes / environment value',16384],
 ['log_mb','Retained logs (MiB)',1024],
] as const;
export type ResourceKey=typeof RESOURCE_FIELDS[number][0];
const shape=Object.fromEntries(RESOURCE_FIELDS.map(([key,,max])=>[key,z.number().int().min(0).max(max)])) as Record<ResourceKey,z.ZodNumber>;
export const resourceLimits=z.object({schema:z.literal(1),...shape}).strict().superRefine((v,c)=>{
 for(const key of ['website_limit','disk_mb','memory_mb','cpu_percent','inode_limit','release_limit','backup_limit','upload_mb','extract_mb','build_seconds','build_memory_mb','process_limit','env_value_bytes'] as ResourceKey[])if(v[key]<1)c.addIssue({code:'custom',path:[key],message:'Must be positive'});
 if(v.backup_limit<3)c.addIssue({code:'custom',path:['backup_limit'],message:'At least three backup copies are required'});
 if(v.extract_mb<v.upload_mb)c.addIssue({code:'custom',path:['extract_mb'],message:'Must cover the upload size'});
 if(v.database_limit>0&&(v.database_mb===0||v.database_connections===0))c.addIssue({code:'custom',message:'Databases need storage and connection limits'});
 if(v.email_limit>0&&(v.mail_mb===0||v.mail_recipients_day===0))c.addIssue({code:'custom',message:'Email needs storage and sending limits'});
});
export type ResourceLimits=z.infer<typeof resourceLimits>;
export const packageSnapshot=z.object({schema:z.literal(1),package_id:z.string().uuid(),name:z.string().min(1).max(120),version:z.number().int().positive(),limits:resourceLimits,limits_digest:z.string().regex(/^[a-f0-9]{64}$/),pricing_ready:z.boolean()}).strict();
export type PackageSnapshot=z.infer<typeof packageSnapshot>;
export function limitsFromForm(form:FormData):ResourceLimits{return resourceLimits.parse({schema:1,...Object.fromEntries(RESOURCE_FIELDS.map(([key])=>{const raw=form.get('limit_'+key);return [key,raw===null||String(raw).trim()===''?NaN:Number(raw)];}))});}
export function canonicalLimits(value:unknown){const parsed=resourceLimits.parse(value);return JSON.stringify(Object.fromEntries(Object.entries(parsed).sort(([a],[b])=>a<b?-1:a>b?1:0)));}

const base={schema:1 as const,website_limit:1,disk_mb:2048,traffic_mb:20480,memory_mb:512,cpu_percent:50,inode_limit:100000,database_limit:1,database_mb:250,database_connections:5,email_limit:2,mail_mb:1024,mail_recipients_day:100,release_limit:3,backup_limit:3,upload_mb:50,extract_mb:1024,build_seconds:600,build_memory_mb:1536,process_limit:64,cron_limit:2,env_limit:30,env_value_bytes:8192,log_mb:50};
export const APP_PLAN_PRESETS=[
 {catalog_key:'app-starter-v1',name:'App Starter',limits:base},
 {catalog_key:'app-business-v1',name:'App Business',limits:{...base,website_limit:3,disk_mb:5120,traffic_mb:51200,memory_mb:1024,cpu_percent:100,inode_limit:250000,database_limit:3,database_mb:1024,database_connections:10,email_limit:5,mail_mb:2048,mail_recipients_day:250,release_limit:5,upload_mb:100,extract_mb:2048,build_seconds:900,build_memory_mb:2048,process_limit:128,cron_limit:5,env_limit:60,log_mb:100}},
 {catalog_key:'app-pro-v1',name:'App Pro',limits:{...base,website_limit:5,disk_mb:10240,traffic_mb:102400,memory_mb:2048,cpu_percent:200,inode_limit:500000,database_limit:5,database_mb:2048,database_connections:20,email_limit:10,mail_mb:5120,mail_recipients_day:500,release_limit:10,upload_mb:100,extract_mb:4096,build_seconds:1200,build_memory_mb:3072,process_limit:192,cron_limit:10,env_limit:100,log_mb:200}},
] as const;
