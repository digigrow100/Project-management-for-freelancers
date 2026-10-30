// Seals one runtime variable in the browser to the server's secrets public key (ECDH P-256 + HKDF-SHA-256 + AES-256-GCM).
// The portal backend and database only ever see the sealed blob; only the root runtime broker on the VPS can open it
// (modules/hosting/runtime_secrets.py defines the same format; tests/hosting-secrets.cjs checks both directions).
import {secretName} from './managedSchema';
export const FORMAT='hms-secret-v1';
export const MAX_VALUE=8192;      // the packages promise values up to 8192 bytes; modules/hosting/runtime_secrets.py MAX_VALUE is the same number
const encoder=new TextEncoder();
const b64=(bytes:Uint8Array)=>{let text='';for(const b of bytes)text+=String.fromCharCode(b);return btoa(text);};
const fromB64=(text:string)=>Uint8Array.from(atob(text),c=>c.charCodeAt(0));
const hex=(bytes:ArrayBuffer)=>[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
export class SecretRefused extends Error{}
// The same value rules as the private service, so a value is refused here instead of being rejected after it was sent.
export function checkValue(value:string){
 if(typeof value!=='string'||value.length===0||encoder.encode(value).length>MAX_VALUE||/[\u0000-\u001f\u007f"'\\$`]/.test(value))throw new SecretRefused('Values cannot be empty, contain control characters or any of " \' \\ $ `, and are limited to 8192 bytes.');
}
export function spkiPoint(pem:string){
 const body=pem.replace(/-----(BEGIN|END) PUBLIC KEY-----/g,'').replace(/\s+/g,'');
 return fromB64(body);
}
export async function fingerprintOf(pem:string,subtle:SubtleCrypto){
 const key=await subtle.importKey('spki',spkiPoint(pem),{name:'ECDH',namedCurve:'P-256'},true,[]);
 return hex(await subtle.digest('SHA-256',await subtle.exportKey('raw',key)));
}
export async function sealSecret(input:{publicKeyPem:string;pinnedFingerprint:string|null;service:string;name:string;value:string},engine:Crypto=globalThis.crypto){
 const {subtle}=engine;
 if(!secretName.safeParse(input.name).success)throw new SecretRefused('That variable name is not allowed.');
 checkValue(input.value);
 // Without an out-of-band pin there is nothing to stop a swapped key, so sealing refuses to run.
 if(!input.pinnedFingerprint||!/^[a-f0-9]{64}$/.test(input.pinnedFingerprint))throw new SecretRefused('Runtime secrets are not available until the server key fingerprint is configured.');
 if(await fingerprintOf(input.publicKeyPem,subtle)!==input.pinnedFingerprint)throw new SecretRefused('The server key does not match the configured fingerprint. Nothing was sent.');
 const server=await subtle.importKey('spki',spkiPoint(input.publicKeyPem),{name:'ECDH',namedCurve:'P-256'},false,[]);
 const ephemeral=await subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
 const shared=await subtle.deriveBits({name:'ECDH',public:server},ephemeral.privateKey,256);
 const aad=encoder.encode(`${FORMAT}|${input.service}|${input.name}`);
 const hkdf=await subtle.importKey('raw',shared,'HKDF',false,['deriveKey']);
 const key=await subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:encoder.encode(FORMAT),info:new Uint8Array([...encoder.encode('aes-256-gcm|'),...aad])},hkdf,{name:'AES-GCM',length:256},false,['encrypt']);
 const iv=engine.getRandomValues(new Uint8Array(12));
 const ciphertext=new Uint8Array(await subtle.encrypt({name:'AES-GCM',iv,additionalData:aad},key,encoder.encode(input.value)));
 const point=new Uint8Array(await subtle.exportKey('raw',ephemeral.publicKey));
 return JSON.stringify({v:1,eph:b64(point),iv:b64(iv),ct:b64(ciphertext)});
}
