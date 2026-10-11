"use client";
import {useState,useEffect} from "react";
import {useRouter} from "next/navigation";
import {REVIEW_SECTIONS,type ReviewKind,type ReviewData} from "@/lib/seoReviewConfig";
import type {ReviewSnapshot} from "@/lib/seoReviews";
import {saveSeoReviewAction} from "@/lib/seoReviewActions";

const inputClass="w-full min-w-[140px] rounded-lg border border-base-700 bg-base-950 px-2 py-2 text-xs text-neutral-200";
export function SeoReviewPanel({projectId,kind,snapshot}:{projectId:string;kind:ReviewKind;snapshot:ReviewSnapshot}) {
  const router=useRouter();const [data,setData]=useState<ReviewData>(snapshot.data);
  const [pending,setPending]=useState(false);const [message,setMessage]=useState("");const [dirty,setDirty]=useState(false);
  useEffect(()=>{setData(snapshot.data);setDirty(false);},[snapshot.revision,snapshot.data]);
  useEffect(()=>{if(!dirty)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue="";};window.addEventListener("beforeunload",warn);return()=>window.removeEventListener("beforeunload",warn);},[dirty]);
  function edit(change:(value:ReviewData)=>ReviewData){setData(change);setDirty(true);setMessage("");}
  async function save(){if(pending)return;setPending(true);try{const result=await saveSeoReviewAction(projectId,kind,snapshot.revision,data);setDirty(false);setMessage(result.complete?"Cycle saved. A new cycle has started with your previous data.":"Saved.");router.refresh();}catch(e){setMessage(e instanceof Error?e.message:"Could not save.");}finally{setPending(false);}}
  return <div className="space-y-4">
    <section className="rounded-xl border border-base-700 bg-base-850 p-4">
      <h2 className="font-semibold text-neutral-100">{kind==="gsc"?"Google Search Console":"Google Business Profile"} · Cycle {snapshot.cycle}</h2>
      <p className="mt-2 text-xs text-neutral-500">Save your findings after each review. When every review is checked and saved, the next cycle starts. Records and unresolved work carry forward; only cycle review checkboxes reset.</p>
      {!snapshot.available&&<p className="mt-2 text-xs text-amber-300">Saving becomes available after the review database update is released.</p>}
      <button type="button" disabled={pending||!snapshot.available} onClick={save} className="mt-3 rounded-lg bg-accent-400 px-4 py-2 text-xs font-semibold text-base-950 disabled:opacity-40">{pending?"Saving…":"Save review"}</button>
      {dirty&&<span className="ml-3 text-xs text-amber-300">Unsaved changes</span>}
      {message&&<p role="status" className="mt-2 text-xs text-neutral-300">{message}</p>}
    </section>
    {REVIEW_SECTIONS[kind].map((section,index)=><section key={section.key} className="rounded-xl border border-base-700 bg-base-850 p-4">
      <label className="flex items-center gap-3 text-sm font-semibold text-neutral-100">
        <input type="checkbox" disabled={pending} checked={data.checks[section.key]??false} onChange={e=>{const checked=e.target.checked;edit(d=>({...d,checks:{...d.checks,[section.key]:checked}}));}} />
        {index+1}. {section.title} — Reviewed this cycle
      </label>
      {section.hint&&<p className="mt-2 text-xs text-neutral-500">{section.hint}</p>}
      <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-xs">
        <thead><tr>{section.fields.map(field=><th key={field} className="p-2 font-medium text-neutral-400">{field}</th>)}<th className="p-2 font-medium text-neutral-400">Actions</th></tr></thead>
        <tbody>{(data.rows[section.key]??[]).map((row,i)=><tr key={i}>{section.fields.map(field=><td key={field} className="p-1 align-top">
          {field==="Status"&&section.key==="indexing"?<select className={inputClass} aria-label={`${section.title} row ${i+1} ${field}`} value={row[field]??"Pending"} disabled={pending} onChange={e=>{const value=e.target.value;edit(d=>({...d,rows:{...d.rows,[section.key]:(d.rows[section.key]??[]).map((r,j)=>j===i?{...r,[field]:value}:r)}}));}}>{["Pending","Request submitted","Indexed","Intentional noindex"].map(v=><option key={v}>{v}</option>)}</select>:
          ["Original confirmed", "Included in sitemap"].includes(field) ? <input type="checkbox" aria-label={`${section.title} row ${i+1} ${field}`} checked={row[field] === "Yes"} disabled={pending} onChange={e=>{const value=e.target.checked?"Yes":"No";edit(d=>({...d,rows:{...d.rows,[section.key]:(d.rows[section.key]??[]).map((r,j)=>j===i?{...r,[field]:value}:r)}}));}} /> :
          <input className={inputClass} aria-label={`${section.title} row ${i+1} ${field}`} value={row[field]??""} disabled={pending} onChange={e=>{const value=e.target.value;edit(d=>({...d,rows:{...d.rows,[section.key]:(d.rows[section.key]??[]).map((r,j)=>j===i?{...r,[field]:value}:r)}}));}} />}
        </td>)}<td className="p-1 align-top"><button type="button" disabled={pending} aria-label={`Remove ${section.title} row ${i+1}`} className="rounded-lg border border-base-600 px-3 py-2 text-xs text-rose-300" onClick={()=>edit(d=>({...d,rows:{...d.rows,[section.key]:(d.rows[section.key]??[]).filter((_,j)=>j!==i)}}))}>Remove</button></td></tr>)}</tbody>
      </table></div>
      <button type="button" disabled={pending} className="mt-2 rounded-lg border border-base-600 px-3 py-2 text-xs text-accent-300" onClick={()=>edit(d=>({...d,rows:{...d.rows,[section.key]:[...(d.rows[section.key]??[]),{}]}}))}>+ {section.key==="indexing"?"Add URL":"Add record"}</button>
      <textarea className={`${inputClass} mt-3`} aria-label={`${section.title} notes`} placeholder="Findings, evidence and next actions" value={data.notes[section.key]??""} disabled={pending} onChange={e=>{const value=e.target.value;edit(d=>({...d,notes:{...d.notes,[section.key]:value}}));}} />
    </section>)}
    <button type="button" disabled={pending||!snapshot.available} onClick={save} className="rounded-lg bg-accent-400 px-4 py-2 text-xs font-semibold text-base-950 disabled:opacity-40">Save review</button>
    <section className="rounded-xl border border-base-700 p-4"><h3 className="text-sm font-semibold text-neutral-200">Previous cycles</h3>
      {snapshot.history.length===0&&<p className="mt-2 text-xs text-neutral-500">No completed cycles yet.</p>}
      {snapshot.history.map(h=><details key={h.cycle} className="mt-3"><summary className="cursor-pointer text-xs text-neutral-300">Cycle {h.cycle} · {new Date(h.completed_at).toLocaleString()}</summary>
        {REVIEW_SECTIONS[kind].map(s=><div key={s.key} className="mt-3 text-xs text-neutral-400"><h4 className="font-semibold">{s.title}</h4><p className="whitespace-pre-wrap">{h.data.notes[s.key]}</p>{(h.data.rows[s.key]??[]).map((row,i)=><dl key={i} className="mt-2 rounded-lg bg-base-850 p-2">{s.fields.map(f=><div key={f}><dt className="inline font-medium">{f}: </dt><dd className="inline break-all">{row[f]||"—"}</dd></div>)}</dl>)}</div>)}
      </details>)}
    </section>
  </div>;
}
