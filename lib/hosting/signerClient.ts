// Browser-side client for the owner's local signing companion (scripts/signer/hms_signer.py on the OWNER'S computer).
// The portal never holds a signing key; this only carries a request to 127.0.0.1 and checks that what comes back is exactly what was asked for.
import {z} from 'zod';
import {signedApproval,signedPolicy,signature,managedApproval} from './managedSchema';
export const SIGNER_ORIGIN='http://127.0.0.1:47419';
const hello=z.object({signer:z.literal('hms-signer'),version:z.literal(1),fingerprint:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
const approvalReply=z.object({approval:signedApproval}).strict();
const managedReply=z.object({approval:managedApproval}).strict();
const policyReply=z.object({policy:signedPolicy,signature}).strict();
export class SignerError extends Error{}
type Fetcher=(url:string,init?:RequestInit)=>Promise<Response>;
async function read(response:Response){
 // The signer answers 422 with a short reason when the owner declines or a rule refuses; nothing else is trusted.
 const body=await response.json().catch(()=>null);
 if(!response.ok)throw new SignerError(response.status===422&&body&&typeof body.error==='string'?body.error.slice(0,120):'The signer did not sign this request.');
 return body;
}
export async function signerHello(pinned:string|null,fetcher:Fetcher=fetch){
 let body;
 try{body=hello.parse(await read(await fetcher(SIGNER_ORIGIN+'/v1/hello',{method:'GET',mode:'cors',credentials:'omit',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(4000)})));}
 catch(error){throw error instanceof SignerError?error:new SignerError('The signing program was not found on this computer.');}
 // Optional pin of the owner's public key fingerprint (shown by the signer at start-up); a different key means a different program or owner.
 if(pinned&&pinned!==body.fingerprint)throw new SignerError('The signer is using a different key than the one this portal expects.');
 return body;
}
async function post(kind:string,payload:unknown,token:string,fetcher:Fetcher){
 if(!/^[A-Za-z0-9_-]{8,64}$/.test(token))throw new SignerError('Enter the pairing code printed by the signer.');
 try{
  return await read(await fetcher(SIGNER_ORIGIN+'/v1/sign',{method:'POST',mode:'cors',credentials:'omit',redirect:'error',cache:'no-store',headers:{'Content-Type':'application/json','X-HMS-Signer-Token':token},body:JSON.stringify({kind,payload}),signal:AbortSignal.timeout(330000)}));
 }catch(error){throw error instanceof SignerError?error:new SignerError('The signer could not be reached.');}
}
export async function signApproval(request:{job:string;digest:string;intent:Record<string,unknown>;plan:string|null;seconds:number},token:string,fetcher:Fetcher=fetch){
 const reply=approvalReply.parse(await post('source-approval',request,token,fetcher));
 // What was signed must be the request we showed: same job, digest and plan, and a short life.
 const a=reply.approval;
 if(a.job!==request.job||a.digest!==request.digest||a.plan!==request.plan||a.expires<=a.issued||a.expires-a.issued>request.seconds+60)throw new SignerError('The signer returned something other than what was requested.');
 return a;
}
// A mailbox, mail-domain or database change: the signer recomputes the digest from the whole request, so the intent shown is what is signed.
export async function signManaged(request:{job:string;digest:string;intent:Record<string,unknown>;target:string|null;seconds:number},token:string,fetcher:Fetcher=fetch){
 const reply=managedReply.parse(await post('managed-approval',request,token,fetcher));
 const a=reply.approval;
 if(a.job!==request.job||a.digest!==request.digest||a.expires<=a.issued||a.expires-a.issued>request.seconds+60)throw new SignerError('The signer returned something other than what was requested.');
 return a;
}
export async function signPolicy(proposal:z.input<typeof policyProposal>,token:string,fetcher:Fetcher=fetch){
 const wanted=policyProposal.parse(proposal);
 const reply=policyReply.parse(await post('autodeploy-policy',wanted,token,fetcher));
 const p=reply.policy;
 if(p.service!==wanted.service||p.client!==wanted.client||p.actor!==wanted.actor||p.repository_id!==wanted.repository_id||p.branch!==wanted.branch||p.allow_activation!==wanted.allow_activation
    ||p.max_per_day!==wanted.max_per_day||JSON.stringify(p.runtimes)!==JSON.stringify([...wanted.runtimes].sort())||p.expires-p.issued>wanted.days*86400+60)throw new SignerError('The signer returned something other than what was requested.');
 return reply;
}
export const policyProposal=z.object({service:z.string().uuid(),client:z.string().uuid(),actor:z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/),repository_id:z.number().int().positive(),branch:z.string().min(1).max(200),
 allow_activation:z.boolean(),runtimes:z.array(z.enum(['static','php','nextjs'])).min(1).max(3),max_per_day:z.number().int().min(1).max(10),days:z.number().int().min(1).max(30)}).strict();
