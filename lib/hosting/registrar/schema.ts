import {z} from 'zod';
import {isIP} from 'node:net';
export const hostname=z.string().trim().toLowerCase().max(253).regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/);
const yesNo=z.union([z.boolean(),z.enum(['yes','no','Yes','No'])]).transform(v=>v===true||v==='yes'||v==='Yes');
export const dnsRecord=z.object({host:z.string().trim().toLowerCase().max(253).regex(/^(?:@|\*|(?:\*\.)?[_a-z0-9-]+(?:\.[_a-z0-9-]+)*)$/),type:z.enum(['a','aaaa','cname','mx','txt','caa','srv','ns']),value:z.string().min(1).max(4096),priority:z.coerce.number().int().min(0).max(65535).default(0)}).superRefine((r,c)=>{
 if((r.type==='a'&&isIP(r.value)!==4)||(r.type==='aaaa'&&isIP(r.value)!==6))c.addIssue({code:'custom',message:'Enter a valid IP address.'});
 if(['cname','mx','ns'].includes(r.type)&&!hostname.safeParse(r.value.replace(/\.$/,'')).success)c.addIssue({code:'custom',message:'Enter a valid hostname.'});
 if(r.host==='@'&&['srv','ns'].includes(r.type))c.addIssue({code:'custom',message:'This record needs a subdomain.'});
});
export const intent=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('lock'),locked:z.boolean()}),
 z.object({kind:z.literal('renew_option'),enabled:z.boolean()}),
 z.object({kind:z.literal('nameservers'),nameservers:z.array(hostname).min(2).max(13).refine(v=>new Set(v).size===v.length,'Nameservers must be unique.')}),
 z.object({kind:z.literal('dns_add'),record:dnsRecord}),z.object({kind:z.literal('dns_remove'),record:dnsRecord}),
 z.object({kind:z.literal('renew'),currency:z.enum(['usd','gbp','eur']),years:z.number().int().min(1).max(10)})
]);
export type Intent=z.infer<typeof intent>;
export const credentials=z.object({key:z.string().trim().min(8).max(512).regex(/^[^\s]+$/),secret:z.string().trim().min(8).max(512).regex(/^[^\s]+$/),mode:z.enum(['sandbox','production'])});
export type Credentials=z.infer<typeof credentials>;
export const domainInfo=z.object({domain_name:hostname,expiration_date:z.coerce.number().int().min(0),locked:yesNo,renew_option:z.string().max(80),status:z.string().max(120),glue_info:z.object({glue_type:z.string().max(100),nameserver_list:z.array(z.object({server_name:hostname})).optional(),dns_main_list:z.array(z.record(z.unknown())).optional(),dns_sub_list:z.array(z.record(z.unknown())).optional(),ttl:z.union([z.string(),z.number()]).optional()})}).transform(d=>({name:d.domain_name,expires:d.expiration_date,locked:d.locked,renewOption:d.renew_option,status:d.status,glue:d.glue_info}));
export type DomainInfo=z.infer<typeof domainInfo>;
export function recordBody(r:z.infer<typeof dnsRecord>){
 const record={record_type:r.type,record_value1:r.value,record_value2:r.type==='mx'?String(r.priority):''};
 return r.host==='@'?{dns_main_list:[record]}:{dns_sub_list:[{sub_host:r.host,...record}]};
}
