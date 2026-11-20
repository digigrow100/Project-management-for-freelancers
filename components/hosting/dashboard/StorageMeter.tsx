import {gbLabel} from '@/lib/hosting/websites/types';
export function StorageMeter({used,limit}:{used:number|null;limit:number}){
 const bytes=Number(used??0),percent=Math.min(100,Math.max(0,bytes/1e9*100));
 return <div className="website-storage"><div><span>{used===null?'Not measured':gbLabel(bytes)} / 1 GB included</span><span>{percent.toFixed(0)}%</span></div><progress aria-label="Included storage used" max={1000000000} value={Math.min(1000000000,bytes)}/>{limit>1e9?<small>{gbLabel(Math.max(0,bytes-1e9))} extra used · {gbLabel(limit)} total cap</small>:null}</div>;
}
