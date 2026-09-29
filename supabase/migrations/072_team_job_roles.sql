alter table public.freelance_hq_profiles
  add column if not exists job_role text not null default 'general'
  check (job_role in ('general','seo_expert','web_developer'));

update public.freelance_hq_profiles
set job_role='seo_expert', updated_at=now()
where email in ('hamza.farooq.mirza@gmail.com','hjunaid541@gmail.com');

update public.freelance_hq_profiles
set job_role='web_developer', updated_at=now()
where email='saifyounas112@gmail.com';
