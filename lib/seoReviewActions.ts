"use server";
import {requireProjectAccess} from "./auth";
import {getSupabase} from "./supabaseClient";
import {getProject} from "./store";
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
