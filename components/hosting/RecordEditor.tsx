"use client";

import {useEffect,useRef,useState,type ReactNode} from 'react';
import {Plus,X} from 'lucide-react';

export function RecordEditor({title,trigger,initiallyOpen=false,children}:{title:string;trigger:string;initiallyOpen?:boolean;children:ReactNode}){
 const dialog=useRef<HTMLDialogElement>(null);
 const [open,setOpen]=useState(false);
 const show=()=>{if(dialog.current&&!dialog.current.open){dialog.current.showModal();setOpen(true);}};
 useEffect(()=>{if(initiallyOpen&&dialog.current&&!dialog.current.open){dialog.current.showModal();setOpen(true);}},[initiallyOpen]);
 return <div className="hms-editor-launch"><button type="button" className="hms-primary" aria-haspopup="dialog" aria-expanded={open} onClick={show}><Plus size={17} aria-hidden="true"/>{trigger}</button><dialog ref={dialog} className="hms-drawer" aria-label={title} onClose={()=>setOpen(false)} onClick={e=>{if(e.target===e.currentTarget){const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.currentTarget.close();}}}><div className="hms-drawer-heading"><h2 className="text-xl font-semibold">{title}</h2><button type="button" className="hms-icon-button" aria-label="Close editor" onClick={()=>dialog.current?.close()}><X size={21}/></button></div><div className="hms-drawer-body">{children}</div></dialog></div>;
}
