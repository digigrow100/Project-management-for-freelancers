export type ReviewKind = "gsc" | "gbp";
export type ReviewRow = Record<string, string>;
export interface ReviewData { checks: Record<string, boolean>; rows: Record<string, ReviewRow[]>; notes: Record<string, string>; }
export interface ReviewSection { key: string; title: string; fields: string[]; hint?: string; }
export const REVIEW_SECTIONS: Record<ReviewKind, ReviewSection[]> = {
  gsc: [
    {key:"keywords",title:"Page keywords and positions",fields:["Page URL","Keyword","Clicks","Impressions","CTR","Average position","From date","To date"]},
    {key:"sitemap",title:"XML sitemap and new pages",fields:["Sitemap URL","Page URL","Included in sitemap","Last checked"]},
    {key:"indexing",title:"Unindexed pages and indexing follow-up",fields:["Page URL","Status","Reason","Last checked","Request date","Evidence URL"],hint:"Use Status: Pending, Request submitted, Indexed, or Intentional noindex. Fix blockers before requesting indexing. Request submitted does not mean indexed."},
    {key:"backlinks",title:"Suspicious backlink review",fields:["Backlink URL","Domain","Concern","Evidence","Admin review","Action"],hint:"Record findings for admin review. Do not automatically disavow unfamiliar links."},
    {key:"clusters",title:"Keyword clusters and content updates",fields:["Page URL","Cluster","Keywords","Impressions","Intent","Proposed update","Linked task URL","Status"]},
    {key:"comparison",title:"Previous-period comparison",fields:["Metric","Current from","Current to","Previous from","Previous to","Current value","Previous value"]},
    {key:"ctr",title:"High impressions, low CTR",fields:["Page URL","Query","Impressions","CTR","Proposed change","Status"]},
    {key:"cannibalization",title:"Query cannibalization — priority",fields:["Query","Competing URLs","Intent","Preferred URL","Action","Verification"]},
    {key:"health",title:"Core Web Vitals and HTTPS",fields:["Check","Status","Affected URLs","Evidence","Fix task URL"]},
    {key:"security",title:"Manual actions and security issues",fields:["Issue","Status","Evidence","Admin discussion","Admin task URL"],hint:"Discuss any issue with Hamza and record the admin task link."},
  ],
  gbp: [
    {key:"access",title:"Ownership, verification and access",fields:["Profile URL","Owner","Verification status","Access status","Last checked"]},
    {key:"categories",title:"Business categories",fields:["Primary category","Secondary categories","Last checked"]},
    {key:"details",title:"Consistent business details",fields:["Business name","Phone","Website","Address or service area","Consistency status"]},
    {key:"services",title:"Services and description",fields:["Services","Business description","Status"]},
    {key:"landing",title:"Landing page and UTM tracking",fields:["Landing page URL","UTM URL","Test status"]},
    {key:"photos",title:"Original logo, cover and work photos",fields:["Photo URL","Type","Original source","Original confirmed","Published date"],hint:"Use original client/business photos only. Do not use AI-generated photos."},
    {key:"reviews",title:"Reply to each new review",fields:["Review URL","Review date","Reply status","Reply date"]},
    {key:"posts",title:"Publish posts and original photos",fields:["Post text","Original photo URL","Original confirmed","Published URL","Publish date","Status"]},
    {key:"performance",title:"Weekly calls and directions",fields:["From date","To date","Call button clicks","Direction requests","Actual calls if tracked","Source"],hint:"Call-button clicks are different from received calls. Leave unavailable metrics blank."},
    {key:"rankings",title:"Area and keyword rankings",fields:["Keyword","Area or grid point","Position","Tool","Checked date","Evidence URL"]},
    {key:"competitors",title:"Local competitor comparison",fields:["Profile URL","Categories","Review count","Rating","Profile gaps","Next action","Checked date"]},
  ],
};
export function emptyReview(): ReviewData { return {checks:{},rows:{},notes:{}}; }
export function reviewComplete(kind: ReviewKind, data: ReviewData) { return REVIEW_SECTIONS[kind].every(s => data.checks[s.key] === true); }
export function nextReview(data: ReviewData): ReviewData { return {checks:{}, rows:structuredClone(data.rows), notes:structuredClone(data.notes)}; }
export const GSC_RECURRING_KEYS = new Set(["gsc_performance_review","indexing_review","ranking_review","pagespeed_cwv_review","schema_validation","sitemap_robots_review","technical_seo_audit","tool_indexation_review"]);
