"use client";

import {useEffect,useRef,useState} from "react";
import {usePathname} from "next/navigation";
import {Maximize2,Minimize2,X,MonitorUp} from "lucide-react";
import type {ScreenShareSession} from "@/lib/types";
import {ScreenShareViewer} from "./ScreenShareViewer";

export function AdminScreenSharePopup() {
  const pathname=usePathname();
  const [sessions,setSessions]=useState<ScreenShareSession[]>([]);
  const [dismissed,setDismissed]=useState<string[]>([]);
  const [selected,setSelected]=useState<ScreenShareSession|null>(null);
  const [expanded,setExpanded]=useState(false);
  const [ended,setEnded]=useState(false);
  const selectedId=useRef<string|null>(null);
  useEffect(()=>{selectedId.current=selected?.id??null;},[selected]);
  useEffect(()=>{
    let cancelled=false;
    let busy=false;
    async function poll(){
      if(busy)return;busy=true;
      try{
        const response=await fetch("/api/admin/screen-share",{cache:"no-store"});
        if(!response.ok)return;
        const data=await response.json() as {sessions?:ScreenShareSession[]};
        if(!cancelled&&Array.isArray(data.sessions)){
          setSessions(data.sessions);
          if(selectedId.current)setEnded(!data.sessions.some(s=>s.id===selectedId.current));
        }
      }catch{/* Keep the current viewer during temporary connection loss. */}
      finally{busy=false;}
    }
    void poll();const timer=window.setInterval(()=>void poll(),3000);
    return()=>{cancelled=true;window.clearInterval(timer);};
  },[]);
  const request=sessions.find(s=>!dismissed.includes(s.id)&&s.id!==selected?.id);
  // The dedicated viewer owns its own peer connection; never mount a second one here.
  if(pathname.includes("/employee-activity/screen/"))return null;
  function close(){if(selected)setDismissed(ids=>[...ids,selected.id]);setSelected(null);setExpanded(false);setEnded(false);}
  return <>
    {request&&!selected&&<section role="dialog" aria-label="Screen share invitation" aria-live="polite" className="fixed bottom-24 right-4 z-[80] w-[min(360px,calc(100vw-2rem))] rounded-xl border border-accent-500/40 bg-base-900 p-4 shadow-2xl">
      <div className="flex items-center gap-2 text-accent-300"><MonitorUp size={18}/><h2 className="font-semibold">Screen share invitation</h2></div>
      <p className="mt-3 text-sm text-neutral-200">{request.employeeName} is sharing a screen. Would you like to view it?</p>
      <p className="mt-1 text-xs text-neutral-500">{request.deviceLabel}{request.microphoneEnabled?" · Audio available":" · No microphone"}</p>
      <div className="mt-4 flex gap-2"><button type="button" onClick={()=>{setSelected(request);setEnded(false);}} className="rounded-lg bg-accent-500 px-4 py-2 text-sm font-semibold text-base-950">Approve and view</button><button type="button" onClick={()=>setDismissed(ids=>[...ids,request.id])} className="rounded-lg border border-base-600 px-4 py-2 text-sm text-neutral-200">Dismiss</button></div>
    </section>}
    {selected&&<section role="dialog" aria-label={`${selected.employeeName} screen share`} className={expanded?"fixed inset-3 z-[90] overflow-auto rounded-xl border border-base-600 bg-base-900 p-4 shadow-2xl":"fixed bottom-24 right-4 z-[80] max-h-[75vh] w-[min(440px,calc(100vw-2rem))] overflow-auto rounded-xl border border-base-600 bg-base-900 p-3 shadow-2xl"}>
      <div className="mb-3 flex items-center justify-between gap-2"><h2 className="text-sm font-semibold text-neutral-100">{selected.employeeName} · Screen share</h2><div className="flex gap-2"><button type="button" aria-label={expanded?"Small view":"Full-size view"} onClick={()=>setExpanded(v=>!v)} className="rounded p-2 text-neutral-300">{expanded?<Minimize2 size={17}/>:<Maximize2 size={17}/>}</button><button type="button" aria-label="Close screen viewer" onClick={close} className="rounded p-2 text-neutral-300"><X size={18}/></button></div></div>
      {ended?<p className="p-5 text-sm text-neutral-300">This screen share has ended.</p>:<ScreenShareViewer sessionId={selected.id} compact/>}
    </section>}
  </>;
}
