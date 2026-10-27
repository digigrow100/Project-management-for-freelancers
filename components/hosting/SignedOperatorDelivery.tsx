"use client";
import {useRef,useState} from "react";
import {operatorRequestSchema,MAX_OPERATOR_BYTES} from "@/lib/hosting/operatorSchema";
export function SignedOperatorDelivery(){
 const [body,setBody]=useState<string|null>(null),[operation,setOperation]=useState(""),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const lock=useRef(false),upload=useRef(0);
 return <section className="space-y-4 rounded-xl border border-blue-200 bg-blue-50 p-5 text-slate-900"><h2 className="font-semibold">Send a prepared server request</h2><p className="text-sm text-slate-600">Choose a signed request prepared on your trusted device. Upload the request file only. Keep signing keys and passwords on your device.</p>
 <label className="block text-sm">Signed request file<input className="mt-2 block w-full rounded-lg border bg-white p-2" type="file" accept="application/json,.json" disabled={busy} onChange={async event=>{const current=++upload.current;setBody(null);setOperation("");setMessage("");const file=event.target.files?.[0];if(!file)return;try{if(file.size>MAX_OPERATOR_BYTES)throw Error();const parsed=operatorRequestSchema.parse(JSON.parse(await file.text()));if(current!==upload.current)return;setBody(JSON.stringify(parsed));setOperation(parsed.request.operation);}catch{if(current!==upload.current)return;setMessage("Choose a valid signed request file. No request was sent.");}}}/></label>
 {operation?<p className="text-sm">Operation: <strong>{operation}</strong></p>:null}
 <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={busy||!body} onClick={async()=>{if(lock.current||!body)return;lock.current=true;setBusy(true);setMessage("");const prepared=body;setBody(null);try{const response=await fetch('/api/hosting-operator/dispatch',{method:'POST',headers:{'Content-Type':'application/json'},body:prepared,redirect:'error',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error();const result=await response.json();if(typeof result?.id!=="string"||!/^[a-f0-9-]{36}$/.test(result.id))throw Error();setMessage("Request prepared for the operator. Review its delivery status in Operations. This does not confirm a live deployment.");}catch{setMessage("Delivery could not be confirmed. Check Operations before submitting again.");}finally{lock.current=false;setBusy(false);}}}>{busy?'Preparing…':'Prepare delivery'}</button>
 {message?<p role="status" className="text-sm text-slate-700">{message}</p>:null}
 </section>;
}
