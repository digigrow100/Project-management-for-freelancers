-- Seed known website-page inventory for active SEO projects where the keyword workspace
-- does not yet contain the full navigational/site structure.

with p as (
  select id,name from public.freelance_hq_projects where type='seo' and archived=false
),
seed(project_name,page_name,page_type) as (
  values
  ('FSR Recovery Group','About Us','other'),('FSR Recovery Group','Services','service'),
  ('FSR Recovery Group','Vehicle Towing','service'),('FSR Recovery Group','Areas We Cover','location'),
  ('FSR Recovery Group','Contact Us','contact'),('FSR Recovery Group','Privacy Policy','legal'),
  ('FSR Recovery Group','Terms & Conditions','legal'),

  ('JK Damp Proofing','About','other'),('JK Damp Proofing','All Services','service'),
  ('JK Damp Proofing','Case Studies','other'),('JK Damp Proofing','Blog','blog'),
  ('JK Damp Proofing','Reviews','other'),('JK Damp Proofing','Contact','contact'),

  ('Mould Removal & Cleaning','Services','service'),('Mould Removal & Cleaning','About','other'),
  ('Mould Removal & Cleaning','Contact','contact'),

  ('Rapid Mobile Tyres','Services','service'),('Rapid Mobile Tyres','Blog','blog'),
  ('Rapid Mobile Tyres','About Us','other'),('Rapid Mobile Tyres','Contact','contact'),
  ('Rapid Mobile Tyres','Areas We Serve','location'),('Rapid Mobile Tyres','Refund Policy','legal'),
  ('Rapid Mobile Tyres','Mobile Car Tyre Fitting','service'),('Rapid Mobile Tyres','SUV Tyre Fitting','service'),
  ('Rapid Mobile Tyres','Mobile Van Tyre Fitting','service'),('Rapid Mobile Tyres','Emergency Mobile Tyre Fitting','service'),
  ('Rapid Mobile Tyres','Tyre Replacement at Home','service'),

  ('Linkedo LTD','Services','service'),('Linkedo LTD','Locations','location'),
  ('Linkedo LTD','Contact','contact'),('Linkedo LTD','Blog','blog'),('Linkedo LTD','Case Studies','other'),
  ('Linkedo LTD','Web Development','service'),('Linkedo LTD','SEO Services','service'),
  ('Linkedo LTD','Google Ads Management','service'),('Linkedo LTD','Meta Ads','service'),
  ('Linkedo LTD','Branding','service'),('Linkedo LTD','Digital Marketing Consulting','service'),
  ('Linkedo LTD','All Tools','other'),('Linkedo LTD','AI Meta Title Generator','landing'),
  ('Linkedo LTD','AI Meta Description Generator','landing'),('Linkedo LTD','AI Blog Outline Generator','landing'),

  ('Ai Ranko','All Tools','other'),('Ai Ranko','Blog','blog'),('Ai Ranko','Sitemap','other'),
  ('Ai Ranko','Privacy','legal'),('Ai Ranko','Terms','legal'),('Ai Ranko','Contact','contact'),
  ('Ai Ranko','Image Resizer & Converter','landing'),('Ai Ranko','Bulk Image Resizer','landing'),
  ('Ai Ranko','AI Image Upscaler','landing'),('Ai Ranko','Background Remover','landing'),
  ('Ai Ranko','SEO Strategy Maker','landing'),('Ai Ranko','Keyword Research Tool','landing'),
  ('Ai Ranko','Bulk Meta & OG Checker','landing'),('Ai Ranko','Link Extractor','landing'),
  ('Ai Ranko','Site Audit Tool','landing'),('Ai Ranko','HTML Sitemap Generator','landing'),
  ('Ai Ranko','AI Content Detector & Grammar Checker','landing'),('Ai Ranko','AI Content Writer','landing'),
  ('Ai Ranko','AI Content Optimizer','landing'),('Ai Ranko','Mobile Friendliness Checker','landing'),

  ('Make Invo','Invoice Generator','landing'),('Make Invo','Register','other'),
  ('Make Invo','Pricing','other'),('Make Invo','Security & Privacy','legal'),
  ('Make Invo','Login','other'),('Make Invo','Blog','blog'),

  ('Luxora Steam Cleaning','Carpet Cleaning','service'),('Luxora Steam Cleaning','Sofa Cleaning','service'),
  ('Luxora Steam Cleaning','Mattress Cleaning','service'),('Luxora Steam Cleaning','Curtain Cleaning','service'),
  ('Luxora Steam Cleaning','Chair & Dining Chair Cleaning','service'),
  ('Luxora Steam Cleaning','Carpet Cleaning Huddersfield','location')
)
insert into public.freelance_hq_project_pages(project_id,name,url,page_type,source)
select p.id,s.page_name,'',s.page_type,'known_site_structure'
from seed s join p on p.name=s.project_name
on conflict (project_id,name) do nothing;

insert into public.freelance_hq_page_audit_checks(page_id,period_month,check_key)
select pp.id,to_char(current_date,'YYYY-MM'),t.check_key
from public.freelance_hq_project_pages pp
join public.freelance_hq_projects p on p.id=pp.project_id
cross join public.freelance_hq_page_check_templates t
where p.type='seo' and p.archived=false and pp.is_active=true and t.is_active=true
on conflict (page_id,period_month,check_key) do nothing;
