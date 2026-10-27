// Isolated Supabase HTTP-protocol fixture. No real account, email, database or provider calls.
const http=require('node:http'),{randomUUID,createHmac,timingSafeEqual}=require('node:crypto');
const id=n=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0');
const IDS={owner:id(1),member:id(2),a:id(3),b:id(4),clientA:id(5),clientB:id(6),service:id(7),serviceB:id(8),server:id(9),job:id(10),request:id(11),factor:id(12),session:id(13),delivery:id(14)};
const API_KEY='isolated-service-role-key',ANON='isolated-anon-key',JWT_KEY='isolated-jwt-key-no-production-use';
const json=value=>JSON.stringify(value),b64=value=>Buffer.from(typeof value==='string'?value:json(value)).toString('base64url');
function totp(now=Date.now()){const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(now/30000)));const h=createHmac('sha1',Buffer.from('generated-totp-fixture')).update(counter).digest(),offset=h[19]&15;return String((h.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0');}
function fixture(){
 const state={requests:[],deliveries:[],dropNextInsert:false,sessionActive:true,rateAllowed:true,failedSessions:new Set(),accessEnabled:true,totpChallenges:new Map()};
 const cases={owner:{id:IDS.owner,role:'admin',aal:'aal2',factor:true},aal1:{id:IDS.owner,role:'admin',aal:'aal1',factor:true},noFactor:{id:IDS.owner,role:'admin',aal:'aal1',factor:false},member:{id:IDS.member,role:'member',aal:'aal2',factor:true},a:{id:IDS.a,client:IDS.clientA,aal:'aal1',factor:false},b:{id:IDS.b,client:IDS.clientB,aal:'aal1',factor:false},unverified:{id:IDS.a,client:IDS.clientA,aal:'aal1',factor:false,unverified:true}};
 function token(name){const c=cases[name],now=Math.floor(Date.now()/1000);const payload={sub:c.id,aud:'authenticated',role:'authenticated',iss:'http://127.0.0.1:39550/auth/v1',iat:now,exp:now+3600,session_id:IDS.session,aal:c.aal,amr:[{method:c.aal==='aal2'?'totp':'password',timestamp:now}],fixture_case:name};const body=b64({alg:'HS256',typ:'JWT'})+'.'+b64(payload);return body+'.'+createHmac('sha256',JWT_KEY).update(body).digest('base64url');}
 function decode(value){try{const parts=value.split('.'),signature=createHmac('sha256',JWT_KEY).update(parts[0]+'.'+parts[1]).digest();const actual=Buffer.from(parts[2],'base64url');if(actual.length!==signature.length||!timingSafeEqual(actual,signature))return null;const p=JSON.parse(Buffer.from(parts[1],'base64url'));return p.exp>Date.now()/1000&&cases[p.fixture_case]?p:null;}catch{return null;}}
 function user(name){const c=cases[name];return {id:c.id,aud:'authenticated',role:'authenticated',email:(c.role??name)+'@fixture.invalid',email_confirmed_at:c.unverified?null:new Date().toISOString(),created_at:new Date().toISOString(),app_metadata:{provider:'email',providers:['email']},user_metadata:{role:'admin'},factors:c.factor?[{id:IDS.factor,factor_type:'totp',status:'verified',friendly_name:'Fixture authenticator',created_at:new Date().toISOString()}]:[]};}
 function session(name){return {access_token:token(name),refresh_token:'fixture-refresh-'+name,expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user:user(name)};}
 function table(name){
  if(name==='freelance_hq_profiles')return [cases.owner,cases.member].map(c=>({id:c.id,name:c.role==='admin'?'Fixture Owner':'Fixture Member',email:c.role+'@fixture.invalid',role:c.role,created_at:new Date().toISOString()}));
  if(name==='freelance_hq_hosting_client_access')return [{id:id(20),client_id:IDS.clientA,auth_user_id:IDS.a,email:'a@fixture.invalid',enabled:state.accessEnabled},{id:id(21),client_id:IDS.clientB,auth_user_id:IDS.b,email:'b@fixture.invalid',enabled:true}];
  if(name==='freelance_hq_hosting_clients')return [{id:IDS.clientA,name:'Client A',email:'a@fixture.invalid',status:'active'},{id:IDS.clientB,name:'Client B',email:'b@fixture.invalid',status:'active'}];
  if(name==='freelance_hq_hosting_services')return [{id:IDS.service,server_id:IDS.server,client_id:IDS.clientA,name:'Website A',status:'active',next_due_date:'2026-11-27',price_minor:0,currency:'PKR',billing_cycle:'monthly',auto_invoice:false},{id:IDS.serviceB,server_id:IDS.server,client_id:IDS.clientB,name:'Website B',status:'active',next_due_date:'2026-11-27',price_minor:0,currency:'PKR',billing_cycle:'monthly',auto_invoice:false}];
  if(name==='freelance_hq_hosting_jobs')return [{id:IDS.job,service_id:IDS.service,kind:'configure',status:'awaiting_connection',idempotency_key:IDS.request,requested_by:IDS.owner,note:'Generated request',created_at:new Date().toISOString()}];
  if(name==='freelance_hq_hosting_operator_mappings')return [{service_id:IDS.service,server_id:IDS.server,client_id:IDS.clientA,actor_id:IDS.owner,tenant:'acme',subject:'olivia',project:'c12345678'}];
  if(name==='freelance_hq_hosting_operator_deliveries')return state.deliveries;
  if(name==='freelance_hq_hosting_settings')return [{id:true,business_name:'Fixture Hosting',default_currency:'PKR',invoice_prefix:'TEST',invoice_notes:'',billing_email:'fixture@example.invalid'}];
  return [];
 }
 function send(res,status,value,headers={}){res.writeHead(status,{'Content-Type':'application/json',...headers});res.end(json(value));}
 const server=http.createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,'http://127.0.0.1:39550');let text='';for await(const block of req){text+=block;if(text.length>150000)throw Error('budget');}const body=text?JSON.parse(text):{};
   state.requests.push({path:url.pathname,method:req.method});
   const bearer=(req.headers.authorization??'').replace(/^Bearer /,'');const claims=decode(bearer);
   if(url.pathname.startsWith('/auth/v1/')){
    if(!claims)return send(res,401,{msg:'Invalid token',code:'bad_jwt'});
    if(url.pathname==='/auth/v1/user')return send(res,200,user(claims.fixture_case));
    if(url.pathname==='/auth/v1/factors')return send(res,200,{all:user(claims.fixture_case).factors});
    if(url.pathname===`/auth/v1/factors/${IDS.factor}/challenge`){const challenge=randomUUID();state.totpChallenges.set(challenge,claims.sub);return send(res,200,{id:challenge,expires_at:Math.floor(Date.now()/1000)+120,type:'totp'});}
    if(url.pathname===`/auth/v1/factors/${IDS.factor}/verify`){if(state.totpChallenges.get(body.challenge_id)!==claims.sub||body.code!==totp())return send(res,422,{msg:'Invalid verification code',code:'mfa_verification_failed'});state.totpChallenges.delete(body.challenge_id);return send(res,200,session('owner'));}
    return send(res,404,{msg:'Unsupported fixture auth operation'});
   }
   if(!url.pathname.startsWith('/rest/v1/'))return send(res,404,{});
   if(req.headers.apikey!==API_KEY)return send(res,403,{message:'Service role required'});
   if(url.pathname.includes('/rpc/')){
    const rpc=url.pathname.split('/').at(-1);
    if(rpc==='freelance_hq_hosting_session_active')return send(res,200,state.sessionActive&&!state.failedSessions.has(body.p_user));
    if(rpc==='freelance_hq_hosting_rate_limit')return send(res,200,state.rateAllowed);
    return send(res,200,[]);
   }
   const name=url.pathname.split('/').at(-1);let rows=table(name);
   for(const [key,value]of url.searchParams){if(['select','order','limit','offset'].includes(key))continue;if(value.startsWith('eq.'))rows=rows.filter(r=>String(r[key])===value.slice(3));if(value.startsWith('in.('))rows=rows.filter(r=>value.slice(4,-1).split(',').includes(String(r[key])));}
   if(req.method==='POST'&&name==='freelance_hq_hosting_operator_deliveries'){
    if(state.deliveries.some(r=>r.job_id===body.job_id))return send(res,409,{message:'duplicate job'});
    const item={...body,id:IDS.delivery,state:'prepared',updated_at:new Date().toISOString()};state.deliveries.push(item);rows=[item];
    if(state.dropNextInsert){state.dropNextInsert=false;req.socket.destroy();return;}
   }else if(req.method!=='GET'&&req.method!=='HEAD'){return send(res,200,req.headers.prefer?.includes('return=representation')?[body]:null);}
   const one=(req.headers.accept??'').includes('vnd.pgrst.object+json');
   if(one&&rows.length!==1)return send(res,406,{code:'PGRST116',details:rows.length+' rows',message:'Object requested'});
   return send(res,200,one?rows[0]:rows,{'Content-Range':`0-${Math.max(0,rows.length-1)}/${rows.length}`});
  }catch{return send(res,500,{message:'Fixture request failed'});}
 });
 return {server,state,token,user,session,IDS,API_KEY,ANON,totp};
}
module.exports={fixture,IDS,API_KEY,ANON,totp};
