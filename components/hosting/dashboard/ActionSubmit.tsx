'use client';
import {useFormStatus} from 'react-dom';
import type {ReactNode} from 'react';
export function ActionSubmit({children,className='hms-dash-secondary',disabled=false,name,value,pendingLabel='Checking…'}:{children:ReactNode;className?:string;disabled?:boolean;name?:string;value?:string;pendingLabel?:string}){
 const {pending}=useFormStatus();
 return <button className={className} disabled={disabled||pending} aria-busy={pending} name={name} value={value}>{pending?pendingLabel:children}</button>;
}
