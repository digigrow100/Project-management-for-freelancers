import 'server-only';
import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {serviceRequest,type ServiceScope,ServiceDenied} from './managed';
const COOKIE='hms_gh_state',LIFETIME=600;
type Env=Record<string,string|undefined>;
type Fetcher=(url:string,init:RequestInit)=>Promise<Response>;
const b64=(value:Buffer|string)=>Buffer.from(value).toString('base64url');
export const stateCookieName=COOKIE;
export function githubEnabled(env:Env=process.env){
 return env.HOSTING_GITHUB_ENABLED==='approved'&&env.HOSTING_SOURCES_ENABLED==='approved'&&/^[A-Za-z0-9][A-Za-z0-9-]{0,99}$/.test(env.HOSTING_GITHUB_APP_SLUG??'')&&Boolean(env.HOSTING_GITHUB_CLIENT_ID)&&Boolean(env.HOSTING_GITHUB_CLIENT_SECRET)&&(env.HOSTING_GITHUB_STATE_KEY??'').length>=32;
}
function mac(body:string,key:string){return createHmac('sha256',key).update('hms:github-state:v1:'+body).digest('base64url');}
type State={a:string;s:string;n:string;x:number;c:'owner'|'client'};
export function signState(payload:State,key:string){const body=b64(JSON.stringify(payload));return body+'.'+mac(body,key);}
export function verifyState(state:string,key:string,now=Math.floor(Date.now()/1000)):State{
 const [body,tag,extra]=state.split('.');if(!body||!tag||extra!==undefined)throw new ServiceDenied();
 const expected=Buffer.from(mac(body,key)),given=Buffer.from(tag);if(expected.length!==given.length||!timingSafeEqual(expected,given))throw new ServiceDenied();
 const value=JSON.parse(Buffer.from(body,'base64url').toString()) as State;
 if(typeof value.a!=='string'||typeof value.s!=='string'||!/^[a-f0-9]{32}$/.test(value.n)||typeof value.x!=='number'||value.x<now||(value.c!=='owner'&&value.c!=='client'))throw new ServiceDenied();
 return value;
}
/** Begin: the state binds actor, website, scope and a one-time nonce that is also set as an HttpOnly cookie in this browser. */
export function startGithub(actor:string,service:string,scope:'owner'|'client',env:Env=process.env,now=Math.floor(Date.now()/1000)){
 if(!githubEnabled(env))throw new ServiceDenied();
 const nonce=randomBytes(16).toString('hex');
 const state=signState({a:actor,s:service,n:nonce,x:now+LIFETIME,c:scope},env.HOSTING_GITHUB_STATE_KEY!);
 return {url:`https://github.com/apps/${env.HOSTING_GITHUB_APP_SLUG}/installations/new?state=${encodeURIComponent(state)}`,nonce,maxAge:LIFETIME};
}
export function parseCookie(header:string|null,name:string){for(const part of (header??'').split(';')){const [k,...v]=part.trim().split('=');if(k===name)return v.join('=');}return null;}
async function json(fetcher:Fetcher,url:string,init:RequestInit,limit=1024*1024){
 const parsed=new URL(url);if(parsed.protocol!=='https:'||!['github.com','api.github.com'].includes(parsed.hostname))throw new ServiceDenied();
 const response=await fetcher(url,{...init,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(10000)});
 if(!response.ok||!response.body)throw new ServiceDenied();
 const reader=response.body.getReader();let bytes=0,text='';const decoder=new TextDecoder();
 try{for(;;){const {value,done}=await reader.read();if(done)break;bytes+=value.length;if(bytes>limit)throw new ServiceDenied();text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}finally{await reader.cancel();reader.releaseLock();}
 return JSON.parse(text) as unknown;
}
const num=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0?v:(()=>{throw new ServiceDenied();})();
/**
 * Finish: GitHub's own answers, obtained with the user's temporary token, are the evidence. The token is used for three reads and dropped;
 * nothing from the query string except the code and the installation id is trusted, and both are checked against GitHub.
 */
export async function finishGithub(input:{scope:ServiceScope;query:URLSearchParams;cookie:string|null;env?:Env;fetcher?:Fetcher;now?:number}){
 const env=input.env??process.env,fetcher=input.fetcher??((u,i)=>fetch(u,i));
 if(!githubEnabled(env))throw new ServiceDenied();
 const state=verifyState(input.query.get('state')??'',env.HOSTING_GITHUB_STATE_KEY!,input.now);
 const sent=Buffer.from(input.cookie??''),want=Buffer.from(state.n);
 if(sent.length!==want.length||!timingSafeEqual(sent,want)||state.a!==input.scope.actor||!input.scope.sites.has(state.s)||(state.c==='owner')!==input.scope.owner)throw new ServiceDenied();
 const action=input.query.get('setup_action');
 if(action==='request')return {outcome:'requested' as const,service:state.s};   // an organisation owner still has to approve the installation
 const installation=Number(input.query.get('installation_id')),code=input.query.get('code');
 if(!Number.isSafeInteger(installation)||installation<=0||!code||code.length>200||!/^[A-Za-z0-9_-]+$/.test(code)||!['install','update'].includes(action??''))throw new ServiceDenied();
 const exchange=await json(fetcher,'https://github.com/login/oauth/access_token',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json','User-Agent':'HouseMySite'},
  body:JSON.stringify({client_id:env.HOSTING_GITHUB_CLIENT_ID,client_secret:env.HOSTING_GITHUB_CLIENT_SECRET,code})}) as {access_token?:unknown};
 const token=exchange.access_token;if(typeof token!=='string'||token.length<10||token.length>400)throw new ServiceDenied();
 const headers={Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2026-03-10','User-Agent':'HouseMySite'};
 const user=await json(fetcher,'https://api.github.com/user',{headers}) as {id?:unknown;login?:unknown};
 const list=await json(fetcher,'https://api.github.com/user/installations?per_page=100',{headers}) as {installations?:{id?:unknown}[]};
 if(!Array.isArray(list.installations)||!list.installations.some(i=>i.id===installation))throw new ServiceDenied();   // this GitHub user can really use this installation
 const repositories:{id:number;full_name:string}[]=[];
 for(let page=1;page<=3;page++){
  const batch=await json(fetcher,`https://api.github.com/user/installations/${installation}/repositories?per_page=100&page=${page}`,{headers},4*1024*1024) as {repositories?:{id?:unknown;full_name?:unknown}[]};
  if(!Array.isArray(batch.repositories))throw new ServiceDenied();
  for(const r of batch.repositories){if(typeof r.full_name!=='string'||!/^[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/.test(r.full_name))continue;repositories.push({id:num(r.id),full_name:r.full_name});}
  if(batch.repositories.length<100)break;
 }
 if(typeof user.login!=='string')throw new ServiceDenied();
 const status=await serviceRequest(input.scope,{action:'source.github_link',service:state.s,installation_id:installation,github_user_id:num(user.id),github_login:user.login,repositories:repositories.slice(0,300)},{internal:true});
 return {outcome:'linked' as const,service:state.s,status};
}
