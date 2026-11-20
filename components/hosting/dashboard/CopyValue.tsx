'use client';
import {useState} from 'react';
export function CopyValue({value,label}:{value:string;label:string}){
 const [state,setState]=useState('');
 async function copy(){try{await navigator.clipboard.writeText(value);setState('Copied');}catch{setState('Select and copy the text');}}
 return <span className="website-copy"><code>{value}</code><button type="button" aria-label={`Copy ${label}`} onClick={copy}>{state==='Copied'?'Copied':'Copy'}</button><span role="status" className="website-copy-status">{state}</span></span>;
}
