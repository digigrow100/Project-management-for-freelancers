'use client';
import {useRef,useState,type FormEvent,type ReactNode} from 'react';
import {useRouter} from 'next/navigation';
export function DomainActionForm({action,children,label,primary=false,className}:{action:(form:FormData)=>Promise<{ok:boolean;error?:string}>;children:ReactNode;label:string;primary?:boolean;className?:string}){
 const lock=useRef(false),[pending,setPending]=useState(false),[error,setError]=useState(''),router=useRouter();
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(lock.current)return;lock.current=true;setPending(true);setError('');
  const form=event.currentTarget;
  try{const result=await action(new FormData(form));if(!result.ok)setError(result.error??'The domain change could not be confirmed.');else router.refresh();}
  catch{setError('Connection interrupted. Reload domain status before trying again.');}
  finally{lock.current=false;setPending(false);}
 }
 return <form onSubmit={submit} className={className} aria-busy={pending}>{children}<button disabled={pending} className={primary?'hms-dash-primary':'hms-dash-secondary'}>{pending?'Checking…':label}</button>{error?<p className="website-error" role="alert">{error}</p>:null}</form>;
}
