import {base64url,keyFingerprint} from './operatorSigning';
export async function sealManagedPassword(hostKey:string,pin:string,service:string,requestKey:string,password:string){
 if(pin.trim().toLowerCase()!==await keyFingerprint(hostKey))throw Error('Verify the independent host fingerprint');
 if(!/^[!-~]{16,128}$/.test(password))throw Error('Use 16–128 printable characters without spaces');
 const utf8=new TextEncoder(),plain=utf8.encode(JSON.stringify({password}));
 function concat(...parts:Uint8Array[]){const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let at=0;for(const part of parts){out.set(part,at);at+=part.length;}return out;}
 try{
  const recipient=Uint8Array.from(atob(hostKey.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
  const pair=await crypto.subtle.generateKey({name:'X25519'},false,['deriveBits']) as CryptoKeyPair;
  const target=await crypto.subtle.importKey('raw',recipient,{name:'X25519'},false,[]);
  const shared=await crypto.subtle.deriveBits({name:'X25519',public:target},pair.privateKey,256),ephemeral=new Uint8Array(await crypto.subtle.exportKey('raw',pair.publicKey));
  const hk=await crypto.subtle.importKey('raw',shared,'HKDF',false,['deriveKey']);
  const aes=await crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:concat(ephemeral,recipient),info:utf8.encode('housemysite-sealed-v1')},hk,{name:'AES-GCM',length:256},false,['encrypt']);
  const nonce=crypto.getRandomValues(new Uint8Array(12));
  const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce,additionalData:utf8.encode('hms-managed-v1|'+service+'|'+requestKey)},aes,plain));
  return base64url(concat(ephemeral,nonce,encrypted));
 }finally{plain.fill(0);}
}
