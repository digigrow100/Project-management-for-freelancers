"use server";
import {requireProjectAccess} from "./auth";
import {getSupabase} from "./supabaseClient";
import {getProject} from "./store";
import {getSeoReview} from "./seoReviews";
import {REVIEW_SECTIONS,reviewComplete,type ReviewKind,type ReviewData} from "./seoReviewConfig";
import {revalidatePath} from "next/cache";
export async function saveSeoReviewAction(projectId:string,kind:ReviewKind,revision:number,data:ReviewData) {
  const profile=await requireProjectAccess(projectId);
  if(kind!=="gsc"&&kind!=="gbp")throw new Error("Invalid review type.");
  if((await getProject(projectId))?.type!=="seo")throw new Error("SEO project required.");
  if(!Number.isInteger(revision)||revision<0||!data||typeof data!=="object"||!data.checks||!data.rows||!data.notes)throw new Error("Invalid review.");
  if(JSON.stringify(data).length>500000)throw new Error("Review is too large.");
  for(const section of REVIEW_SECTIONS[kind]) {
    if(data.checks[section.key]!==undefined&&typeof data.checks[section.key]!=="boolean")throw new Error("Invalid checkbox.");
    const rows=data.rows[section.key]??[];
    if(!Array.isArray(rows)||rows.length>1000)throw new Error("Invalid rows.");
    for(const row of rows)if(!row||typeof row!=="object"||Object.values(row).some(v=>typeof v!=="string"))throw new Error("Invalid field.");
    if(data.notes[section.key]!==undefined&&typeof data.notes[section.key]!=="string")throw new Error("Invalid notes.");
  }
  const complete=reviewComplete(kind,data);
  const {error}=await getSupabase().rpc("freelance_hq_save_seo_review",{p_project:projectId,p_kind:kind,p_revision:revision,p_data:data,p_actor:profile.id,p_complete:complete});
  if(error)throw new Error(error.message);
  revalidatePath(`/projects/${projectId}`);
  return {complete};
}

export async function toggleSeoReviewTaskCheckAction(taskId:string,projectId:string,itemId:string) {
  const profile=await requireProjectAccess(projectId);
  const {data:task,error}=await getSupabase().from("freelance_hq_tasks")
    .select("project_id,assigned_to,status,fallback_template_key,checklist").eq("id",taskId).maybeSingle();
  if(error)throw error;
  if(!task||task.project_id!==projectId)throw new Error("Task not found.");
  if(profile.role!=="admin"&&task.assigned_to!==profile.id)throw new Error("This task is not assigned to you.");
  if(task.status==="done")throw new Error("This review is already complete. Reload your tasks.");
  const [prefix,kind,cycle,...extra]=String(task.fallback_template_key??"").split(":");
  if(prefix!=="review"||(kind!=="gsc"&&kind!=="gbp")||extra.length)throw new Error("Invalid review task.");
  const section=REVIEW_SECTIONS[kind].find(s=>itemId===`review:${kind}:${s.key}`);
  if(!section||!task.checklist.some((item:{id:string})=>item.id===itemId))throw new Error("Invalid review check.");
  const review=await getSeoReview(projectId,kind);
  if(!review.available||String(review.cycle)!==cycle)throw new Error("This review cycle changed. Reload your tasks.");
  const data={...review.data,checks:{...review.data.checks,[section.key]:!review.data.checks[section.key]}};
  const result=await saveSeoReviewAction(projectId,kind,review.revision,data);
  revalidatePath("/");revalidatePath("/my-tasks");revalidatePath("/today");
  return result;
}
