alter table public.freelance_hq_seo_module_assignments drop constraint freelance_hq_seo_module_assignments_module_check;
alter table public.freelance_hq_seo_module_assignments add constraint freelance_hq_seo_module_assignments_module_check check(module in (
  'website_pages','full_website','social_media','local_listing','blog_onsite','web_2_0','guest_blogging','recurring','reporting',
  'gsc','gbp','recurring_general','technical_seo'
));
