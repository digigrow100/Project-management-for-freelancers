import {type DomainInfo,type Intent,recordBody} from './schema';
import {RegistrarError} from './api';
function records(d:DomainInfo,r:Extract<Intent,{kind:'dns_add'|'dns_remove'}>['record']){
 const key=r.host==='@'?'dns_main_list':'dns_sub_list';
 return (d.glue[key]??[]) as Record<string,unknown>[];
}
function recordMatches(v:Record<string,unknown>,r:Extract<Intent,{kind:'dns_add'|'dns_remove'}>['record']){
 return (r.host==='@'||v.sub_host===r.host)&&v.record_type===r.type&&v.record_value1===r.value&&String(v.record_value2??'')===(r.type==='mx'?String(r.priority):'');
}
export function validateChange(before:DomainInfo,change:Intent){
 if(change.kind==='dns_add'||change.kind==='dns_remove'){
  if(before.glue.glue_type.toLowerCase()!=='dns')throw new RegistrarError('external_dns');
  const present=records(before,change.record).some(r=>recordMatches(r,change.record));
  if(change.kind==='dns_add'&&records(before,change.record).some(r=>String(r.sub_host??'@')===change.record.host&&['cname','aname','forward','stealth','ns'].some(t=>r.record_type===t||change.record.type===t)))throw new RegistrarError('record_conflict');
  if((change.kind==='dns_add'&&present)||(change.kind==='dns_remove'&&!present))throw new RegistrarError('record_changed');
  // Fully specified selection only; never send an empty DNS delete body.
  if(!Object.keys(recordBody(change.record)).length)throw new RegistrarError('invalid_request');
 }
}
export function observed(before:DomainInfo,after:DomainInfo,change:Intent):boolean{
 switch(change.kind){
  case 'lock':return after.locked===change.locked;
  case 'renew_option':return after.renewOption===(change.enabled?'auto':'donot');
  case 'nameservers':return after.glue.glue_type.toLowerCase()==='name_servers'&&JSON.stringify(after.glue.nameserver_list?.map(n=>n.server_name).sort())===JSON.stringify([...change.nameservers].sort());
  case 'renew':return after.expires>before.expires;
  case 'dns_add':case 'dns_remove':{
   if(after.glue.glue_type.toLowerCase()!=='dns')return false;
   const present=records(after,change.record).some(r=>recordMatches(r,change.record));return change.kind==='dns_add'?present:!present;
  }
 }
}

// PostgreSQL jsonb does not preserve object-key order. Reviews compare values, not encoding order.
export function same(a:unknown,b:unknown):boolean {
 if(a===b)return true;
 if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>same(v,b[i]));
 if(a&&b&&typeof a==='object'&&typeof b==='object'){
  const left=a as Record<string,unknown>,right=b as Record<string,unknown>,keys=Object.keys(left).sort();
  return keys.join('\n')===Object.keys(right).sort().join('\n')&&keys.every(k=>same(left[k],right[k]));
 }
 return false;
}
