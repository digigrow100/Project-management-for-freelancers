import 'server-only';
import {Resolver} from 'node:dns/promises';
import {mailHostname,type DnsObservation} from './schema';
type Lookup={resolveTxt:(name:string)=>Promise<string[][]>;resolveMx:(name:string)=>Promise<{exchange:string;priority:number}[]>};
function absent(error:unknown){return ['ENODATA','ENOTFOUND'].includes(String((error as {code?:unknown})?.code));}
// DNS queries only. Never connect to a user-supplied host or follow a URL.
export async function observeEmailDns(hostname:string,token:string,mxHost:string,lookup?:Lookup):Promise<DnsObservation>{
 mailHostname.parse(hostname);if(!/^[a-f0-9]{64}$/.test(token))throw Error('Invalid verification challenge');if(mxHost)mailHostname.parse(mxHost);
 const resolver=lookup??new Resolver({timeout:2500,tries:1});
 async function txt(name:string){try{return {records:(await resolver.resolveTxt(name)).map(parts=>parts.join('')),available:true};}catch(e){return {records:[] as string[],available:absent(e)};}}
 const [proof,spf,dmarc,mx]=await Promise.all([txt('_housemysite-verification.'+hostname),txt(hostname),txt('_dmarc.'+hostname),(async()=>{if(!mxHost)return {status:'not_configured' as const};try{const records=await resolver.resolveMx(hostname);return {status:!records.length?'missing' as const:records.every(r=>r.exchange.toLowerCase().replace(/\.$/,'')===mxHost)?'matched' as const:'different' as const};}catch(e){return {status:absent(e)?'missing' as const:'unavailable' as const};}})()]);
 const spfs=spf.records.filter(v=>/^v=spf1(?:\s|$)/i.test(v));
 return {ownership:!proof.available?'unavailable':proof.records.includes('housemysite-verification='+token)?'matched':'missing',mx:mx.status,spf:!spf.available?'unavailable':spfs.length>1?'multiple':spfs.length?'present':'missing',dmarc:!dmarc.available?'unavailable':dmarc.records.some(v=>/^v=DMARC1\s*;/i.test(v))?'present':'missing'};
}
