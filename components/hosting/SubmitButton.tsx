"use client";
import { useFormStatus } from "react-dom";
export function SubmitButton({children="Save",danger=false}:{children?:React.ReactNode;danger?:boolean}) {
 const {pending}=useFormStatus();
 return <button type="submit" disabled={pending} className={`rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 ${danger?'border border-rose-500/30 text-rose-400':'bg-accent-500 text-base-950 hover:bg-accent-400'}`}>{pending?'Saving…':children}</button>;
}
export function PrintInvoiceButton() {return <button type="button" onClick={()=>window.print()} className="rounded-lg border border-base-600 px-3 py-2 text-sm print:hidden">Print / Save PDF</button>;}
