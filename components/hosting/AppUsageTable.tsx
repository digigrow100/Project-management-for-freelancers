import type {AppAccountView} from '@/lib/hosting/store';
const levelLabel:Record<string,string>={unknown:'Unknown',disabled:'Not provided',ok:'OK',warn80:'80% or more used',warn90:'90% or more used',exceeded:'Limit reached'};
// Presentational only (no hooks, no server imports): usable from server and client components.
export function UsageTable({usage,at}:{usage:NonNullable<AppAccountView['usage']>;at:string|null}){
 const rows=Object.entries(usage).filter(([,v])=>v.level!=='disabled'||v.limit>0);
 return <details><summary className="cursor-pointer text-sm">Usage as last reported{at?' ('+new Date(at).toISOString().slice(0,16).replace('T',' ')+' UTC)':''}</summary>
  <table className="mt-3 w-full text-left text-xs"><thead><tr><th>Limit</th><th>Used</th><th>Of</th><th>Status</th><th>Source</th></tr></thead><tbody>{rows.map(([key,v])=><tr key={key}><td>{key}</td><td>{v.used??'—'}</td><td>{v.effective}</td><td>{levelLabel[v.level]??v.level}</td><td>{v.basis}</td></tr>)}</tbody></table>
  <p className="mt-2 text-xs text-neutral-500">Unknown means nothing measured this value; it is never shown as zero.</p></details>;
}
