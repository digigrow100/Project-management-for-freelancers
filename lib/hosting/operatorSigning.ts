// Browser cryptography and non-extractable key custody. No network calls or private-key exports.
import {operatorContextSchema,type OperatorSigningContext} from './operatorContextSchema';
import {operatorJobKinds,operatorRequestSchema,typedRequest,MAX_OPERATOR_BYTES} from './operatorSchema';
const utf8=new TextEncoder(),DB='hms-portal-device-signing-v1';
export function canonicalASCII(value:unknown):string{
 if(value===null)return 'null';if(typeof value==='boolean')return String(value);
 if(typeof value==='number'){if(!Number.isSafeInteger(value))throw Error('Invalid integer');return String(value);}
 if(typeof value==='string')return JSON.stringify(value).replace(/[\u007f-\uffff]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));
 if(Array.isArray(value))return '['+value.map(canonicalASCII).join(',')+']';
 if(typeof value==='object')return '{'+Object.keys(value as object).sort().map(key=>canonicalASCII(key)+':'+canonicalASCII((value as Record<string,unknown>)[key])).join(',')+'}';
 throw Error('Invalid request');
}
export function signingMessage(context:Pick<OperatorSigningContext,'tenant'|'subject'>,operation:string,key:string,payload:unknown,issued:number){
 return utf8.encode('hms-request-v1\n'+canonicalASCII({v:1,tenant:context.tenant,subject:context.subject,operation,key,payload,issued}));
}
export function base64url(bytes:Uint8Array){let raw='';for(const byte of bytes)raw+=String.fromCharCode(byte);return btoa(raw).replace(/\+/g,'-').replace(/\//g,'_');}
function unbase64(value:string){return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));}
export async function keyFingerprint(value:string){const raw=unbase64(value);if(raw.length!==32||base64url(raw)!==value)throw Error('Invalid server key');return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',raw))).map(x=>x.toString(16).padStart(2,'0')).join('');}
function recordId(c:OperatorSigningContext){return [c.actor_id,c.server_id,c.tenant,c.subject].join('|');}
export type DeviceKey={id:string;privateKey:CryptoKey;publicKey:string;hostFingerprint:string;created:number};
async function database():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore('keys',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(Error('Device key storage unavailable'));});}
async function transaction(mode:IDBTransactionMode,action:(s:IDBObjectStore)=>IDBRequest):Promise<unknown>{const db=await database();return new Promise((resolve,reject)=>{const t=db.transaction('keys',mode),r=action(t.objectStore('keys'));t.oncomplete=()=>{db.close();resolve(r.result);};t.onerror=t.onabort=()=>{db.close();reject(Error('Device key storage unavailable'));};});}
export async function readDeviceKey(context:OperatorSigningContext):Promise<DeviceKey|null>{operatorContextSchema.parse(context);const r=await transaction('readonly',s=>s.get(recordId(context)));return r? r as DeviceKey:null;}
export async function createDeviceKey(context:OperatorSigningContext,expectedFingerprint:string){
 operatorContextSchema.parse(context);const pin=await keyFingerprint(context.host_key);
 if(expectedFingerprint.toLowerCase()!==pin)throw Error('Server fingerprint does not match');
 const pair=await crypto.subtle.generateKey({name:'Ed25519'},false,['sign','verify']) as CryptoKeyPair;
 const record:DeviceKey={id:recordId(context),privateKey:pair.privateKey,publicKey:base64url(new Uint8Array(await crypto.subtle.exportKey('raw',pair.publicKey))),hostFingerprint:pin,created:Date.now()};
 // add() refuses to overwrite an existing device key; rotation is a separate explicit removal.
 await transaction('readwrite',s=>s.add(record));return record;
}
export async function removeDeviceKey(context:OperatorSigningContext){await transaction('readwrite',s=>s.delete(recordId(context)));}
function concat(...parts:Uint8Array[]){const output=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let offset=0;for(const p of parts){output.set(p,offset);offset+=p.length;}return output;}
async function seal(context:OperatorSigningContext,project:string,scope:string,key:string,values:Record<string,string>){
 const plaintext=utf8.encode(JSON.stringify(values));if(plaintext.length>48000)throw Error('Environment is too large');
 try{
  const recipient=unbase64(context.host_key);if(recipient.length!==32)throw Error('Invalid server key');
  const pair=await crypto.subtle.generateKey({name:'X25519'},true,['deriveBits']) as CryptoKeyPair;
  const target=await crypto.subtle.importKey('raw',recipient,{name:'X25519'},false,[]);
  const shared=await crypto.subtle.deriveBits({name:'X25519',public:target},pair.privateKey,256),ephemeral=new Uint8Array(await crypto.subtle.exportKey('raw',pair.publicKey));
  const hk=await crypto.subtle.importKey('raw',shared,'HKDF',false,['deriveKey']);
  const aes=await crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:concat(ephemeral,recipient),info:utf8.encode('housemysite-sealed-v1')},hk,{name:'AES-GCM',length:256},false,['encrypt']);
  const nonce=crypto.getRandomValues(new Uint8Array(12)),aad=utf8.encode(['hms-env-v1',context.tenant,project,scope,key].join('|'));
  const box=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce,additionalData:aad},aes,plaintext));
  return base64url(concat(ephemeral,nonce,box));
 }finally{plaintext.fill(0);}
}
export function environmentValues(text:string){const values:Record<string,string>=Object.create(null);for(const line of text.split(/\r\n|\r|\n/)){if(!line.trim())continue;const at=line.indexOf('='),name=line.slice(0,at),value=line.slice(at+1);if(at<1||!/^[A-Z_][A-Z0-9_]{0,63}$/.test(name)||Object.hasOwn(values,name)||/[\u0000-\u001f]/.test(value))throw Error('Use unique NAME=value lines');values[name]=value;}if(!Object.keys(values).length||Object.keys(values).length>50)throw Error('Use between 1 and 50 environment values');return values;}
export async function prepareOnDevice(context:OperatorSigningContext,operation:string,fields:Record<string,unknown>,valuesText:string|undefined,issued:number){
 operatorContextSchema.parse(context);
 if(!operatorJobKinds[context.kind]?.includes(operation)||issued<context.server_time||issued>context.expires)throw Error('Reload the request context');
 const stored=await readDeviceKey(context);
 if(!stored||stored.id!==recordId(context)||stored.privateKey.extractable||stored.privateKey.type!=='private'||stored.privateKey.algorithm.name!=='Ed25519')throw Error('Create a device key first');
 if(stored.hostFingerprint!==await keyFingerprint(context.host_key))throw Error('Server key changed; verify it independently');
 if(!context.member_key||stored.publicKey!==context.member_key)throw Error('The device public key must be enrolled by the owner');
 if(Object.hasOwn(fields,'project'))throw Error('Project comes from the trusted mapping');
 let payload:Record<string,unknown>=operation==='project.create'?{...fields}:{...fields,project:context.project};
 if(operation==='env.set'){if(!context.project||typeof fields.scope!=='string'||valuesText===undefined)throw Error('Choose an environment');payload={project:context.project,scope:fields.scope,sealed:await seal(context,context.project,fields.scope,context.idempotency_key,environmentValues(valuesText))};}
 const request=typedRequest.parse({operation,idempotency_key:context.idempotency_key,payload,auth:{issued,signature:'a'.repeat(86)+'=='}});
 const signature=base64url(new Uint8Array(await crypto.subtle.sign('Ed25519',stored.privateKey,signingMessage(context,operation,request.idempotency_key,request.payload,issued))));
 const packet=operatorRequestSchema.parse({job_id:context.job_id,request:{...request,auth:{issued,signature}}});
 const body=JSON.stringify(packet);if(utf8.encode(body).length>MAX_OPERATOR_BYTES)throw Error('Request is too large');return body;
}
