import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
export const HOSTING_CLIENT_VIEW_COOKIE="fhq_hosting_client_view";
export const HOSTING_CLIENT_VIEW_SECONDS=1800;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function signature(payload:string){
 const secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!secret)throw new Error("Client view signing is unavailable.");
 // Domain separation: this signature cannot be reused as another kind of token.
 return createHmac("sha256",secret).update("fhq:hosting:read-only-client-view:v1:"+payload).digest("hex");
}
export function signClientView(actorId:string,clientId:string,now=Date.now()){
 if(!uuid.test(actorId)||!uuid.test(clientId))throw new Error("Invalid client view identity.");
 const payload=`${actorId}:${clientId}:${now+HOSTING_CLIENT_VIEW_SECONDS*1000}`;
 return `${payload}:${signature(payload)}`;
}
export function readClientView(value:string|undefined,actorId:string,now=Date.now()):string|null{
 if(!value||value.length>300)return null;
 const [actor="",client="",expiry="",sig="",...extra]=value.split(":");
 if(extra.length||actor!==actorId||!uuid.test(actor)||!uuid.test(client)||!/^\d{13}$/.test(expiry)||!Number.isSafeInteger(Number(expiry))||Number(expiry)<=now||Number(expiry)>now+HOSTING_CLIENT_VIEW_SECONDS*1000||!/^[a-f0-9]{64}$/.test(sig))return null;
 try{return timingSafeEqual(Buffer.from(sig,"hex"),Buffer.from(signature(`${actor}:${client}:${expiry}`),"hex"))?client:null;}catch{return null;}
}
