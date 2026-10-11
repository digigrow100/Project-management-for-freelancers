import "server-only";
import { getSupabase } from "./supabaseClient";
import { emptyReview, type ReviewKind, type ReviewData } from "./seoReviewConfig";
export interface ReviewSnapshot {cycle:number;revision:number;data:ReviewData;history:Array<{cycle:number;data:ReviewData;completed_at:string}>;available:boolean;}
export async function getSeoReview(projectId:string,kind:ReviewKind):Promise<ReviewSnapshot> {
  const db=getSupabase();
  const [current,history]=await Promise.all([
    db.from("freelance_hq_seo_review_cycles").select("cycle,revision,data").eq("project_id",projectId).eq("kind",kind).maybeSingle(),
    db.from("freelance_hq_seo_review_history").select("cycle,data,completed_at").eq("project_id",projectId).eq("kind",kind).order("cycle",{ascending:false}).limit(30),
  ]);
  const missing=[current.error,history.error].some(e=>e&&(e.code==="42P01"||e.code==="PGRST205"));
  if(missing)return {cycle:1,revision:0,data:emptyReview(),history:[],available:false};
  if(current.error)throw current.error;if(history.error)throw history.error;
  return {cycle:current.data?.cycle??1,revision:current.data?.revision??0,data:current.data?.data??emptyReview(),history:history.data??[],available:true};
}
