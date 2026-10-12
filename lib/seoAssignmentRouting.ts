import {GSC_RECURRING_KEYS} from "./seoReviewConfig";
import {isTechnicalWorkflow} from "./seoTechnical";
import type {SeoAssignableModule} from "./types";
export function seoAssignmentGroup(item:{module:string;itemKey:string}):SeoAssignableModule {
  if(item.module === "full_website" && isTechnicalWorkflow(item)) return "technical_seo";
  if(item.module === "local_listing" && item.itemKey === "google_business_profile") return "gbp";
  if(item.module === "recurring") {
    if(GSC_RECURRING_KEYS.has(item.itemKey)) return "gsc";
    if(isTechnicalWorkflow(item)) return "technical_seo";
    return "recurring_general";
  }
  return item.module as SeoAssignableModule;
}
export function seoItemOwner(item:{module:string;itemKey:string},owners:Map<string,string>) {
  return owners.get(seoAssignmentGroup(item)) ?? owners.get(item.module);
}
