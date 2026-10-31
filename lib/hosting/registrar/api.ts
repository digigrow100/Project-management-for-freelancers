import 'server-only';
import {createHmac,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {type Credentials,domainInfo,hostname,recordBody,type Intent} from './schema';
export class RegistrarError extends Error { constructor(public code:string){super(code);} }
export function signature(c:Credentials,path:string,id:string,body:string){return createHmac('sha256',c.secret).update([c.key,path,id,body].join('\n')).digest('base64');}
// The relay receives only the already-signed provider request, never its signing secret.
export async function providerRequest(c:Credentials,method:string,path:string,data:string,id:string,transport:typeof fetch){
 const headers={Authorization:'Bearer '+c.key,Accept:'application/json','Content-Type':'application/json','X-Request-ID':id,'X-Signature':signature(c,path,id,data)};
 if(process.env.DYNADOT_RELAY_ENABLED!==undefined){
  if(process.env.DYNADOT_RELAY_ENABLED!=='approved')throw new RegistrarError('relay_configuration');
  const origin=process.env.HOSTING_SERVICES_ORIGIN,key=process.env.HOSTING_SERVICES_PORTAL_KEY;
  if(!origin||!key||key.length<32)throw new RegistrarError('relay_configuration');
  let url:URL;try{url=new URL(origin);}catch{throw new RegistrarError('relay_configuration');}
  if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new RegistrarError('relay_configuration');
  const packet=JSON.stringify({schema:1,nonce:randomUUID(),expires:Math.floor(Date.now()/1000)+60,mode:c.mode,method,path,key:c.key,signature:headers['X-Signature'],request_id:id,body:data});
  const response=await transport(new URL('/v1/dynadot-relay',url),{method:'POST',headers:{'Content-Type':'application/json','X-HMS-Dynadot-Signature':createHmac('sha256',key).update('hms:dynadot-relay:v1:'+packet).digest('hex')},body:packet,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(20000)});
  if(response.headers.get('X-HMS-Dynadot-Forwarded')!=='1')throw new RegistrarError('relay_unavailable');
  return response;
 }
 const origin=c.mode==='sandbox'?'https://api-sandbox.dynadot.com':'https://api.dynadot.com';
 return transport(origin+path,{method,headers,body:data||undefined,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});
}
export class Dynadot {
 private lastRequest=0;
 constructor(private c:Credentials,private transport:typeof fetch=fetch,private budget?:()=>Promise<void>){}
 async request(method:'GET'|'PUT'|'POST'|'DELETE',path:string,body?:unknown,id:string=randomUUID()):Promise<unknown>{
  const data=body===undefined?'':JSON.stringify(body);
  if(!/^\/restful\/v2\//.test(path)||path.includes('..')||path.includes('#'))throw new RegistrarError('invalid_request');
  const delay=1100-(Date.now()-this.lastRequest);if(delay>0)await new Promise(r=>setTimeout(r,delay));
  await this.budget?.();this.lastRequest=Date.now();
  let response:Response;
  try{response=await providerRequest(this.c,method,path,data,id,this.transport);}catch(e){if(e instanceof RegistrarError)throw e;throw new RegistrarError('answer_unknown');}
  if(Number(response.headers.get('content-length')??0)>2000000)throw new RegistrarError('invalid_response');
  let text:string;try{text=await response.text();}catch{throw new RegistrarError('answer_unknown');}
  if(text.length>2000000)throw new RegistrarError('invalid_response');
  let result:unknown;try{result=JSON.parse(text);}catch{throw new RegistrarError('answer_unknown');}
  const envelope=z.object({code:z.number(),data:z.unknown().optional()}).safeParse(result);
  if(!envelope.success)throw new RegistrarError('invalid_response');
  if(!response.ok||envelope.data.code!==200){
   const code=envelope.data.code;
   throw new RegistrarError(code===401?'credentials_rejected':code===429?'rate_limited':code>=500?'answer_unknown':'provider_rejected');
  }
  return envelope.data.data;
 }
 async list(page:number){
  const data=await this.request('GET','/restful/v2/domains?page='+page+'&page_size=100');
  const parsed=z.object({domain_info_list:z.array(domainInfo).max(100),pagination_result:z.object({page:z.number().int(),page_size:z.number().int(),total:z.number().int().min(0),has_next_page:z.union([z.boolean(),z.enum(['Yes','No','yes','no'])]).transform(v=>v===true||v==='Yes'||v==='yes')})}).safeParse(data);
  if(!parsed.success||parsed.data.pagination_result.page!==page)throw new RegistrarError('invalid_response');
  return parsed.data;
 }
 async info(name:string){
  const data=await this.request('GET','/restful/v2/domains/'+hostname.parse(name));
  const parsed=z.object({domain_info:domainInfo}).safeParse(data);
  if(!parsed.success||parsed.data.domain_info.name!==name)throw new RegistrarError('invalid_response');
  return parsed.data.domain_info;
 }
 async quote(name:string,currency:string,years=1){
  const data=await this.request('GET','/restful/v2/domains/'+hostname.parse(name)+'/search?show_price=true&currency='+currency);
  const parsed=z.object({domain_name:hostname,price_list:z.array(z.object({currency:z.string(),unit:z.string(),renewal_price:z.string().regex(/^\d+(?:\.\d{1,2})?$/)}))}).safeParse(data);
  if(!parsed.success||parsed.data.domain_name!==name)throw new RegistrarError('price_unavailable');
  const price=parsed.data.price_list.find(p=>p.currency.toLowerCase()===currency&&['price/'+years+'year',years+'year',years+'years'].includes(p.unit.toLowerCase().replace(/[()\s]/g,'')));
  if(!price||Number(price.renewal_price)<=0)throw new RegistrarError('price_unavailable');
  return {amount:price.renewal_price,currency,years};
 }
 async change(name:string,change:Intent,id:string){
  const base='/restful/v2/domains/'+hostname.parse(name);
  switch(change.kind){
   case 'lock':return this.request('PUT',base+'/domain_lock',{lock:change.locked},id);
   case 'renew_option':return this.request('PUT',base+'/renew_option',{renew_option:change.enabled?'auto':'donot'},id);
   case 'nameservers':return this.request('PUT',base+'/nameservers',{nameserver_list:change.nameservers},id);
   case 'dns_add':return this.request('POST',base+'/records',recordBody(change.record),id);
   case 'dns_remove':return this.request('DELETE',base+'/records',recordBody(change.record),id);
   case 'renew':return this.request('POST',base+'/renew',{duration:change.years,currency:change.currency,no_renew_if_late_renew_fee_needed:true},id);
  }
 }
}
