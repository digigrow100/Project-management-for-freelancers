"use client";
import { useEffect,useState,useRef } from "react";
import Link from "next/link";
import { acceptHostingInvite } from "./actions";
export default function InviteBridge(){
 const [error,setError]=useState(false);
 const started=useRef(false);
 useEffect(()=>{
  if(started.current)return;started.current=true;
  const fragment=new URLSearchParams(window.location.hash.slice(1));
  const access=fragment.get('access_token'),refresh=fragment.get('refresh_token');
  window.history.replaceState(null,'',window.location.pathname);
  if(!access||!refresh){setError(true);return;}
  void acceptHostingInvite(access,refresh).then(ok=>{if(ok)window.location.replace('/login/reset-password');else setError(true);}).catch(()=>setError(true));
 },[]);
 return <main className="mx-auto max-w-md p-8"><h1 className="text-xl font-semibold">Hosting invitation</h1>{error?<p className="mt-4">This invitation is invalid or expired. Ask your hosting administrator for a fresh invitation. <Link href="/login" className="underline">Go to login</Link></p>:<p className="mt-4">Checking your invitation…</p>}</main>;
}
