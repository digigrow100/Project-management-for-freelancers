alter table public.freelance_hq_profiles
  add column if not exists theme_preference text not null default 'dark';

alter table public.freelance_hq_profiles
  drop constraint if exists freelance_hq_profiles_theme_preference_check;

alter table public.freelance_hq_profiles
  add constraint freelance_hq_profiles_theme_preference_check
  check (theme_preference in ('dark','emerald','sky','coral'));
