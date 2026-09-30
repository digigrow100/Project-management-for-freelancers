-- Restore the pre-privacy-change permission model while keeping client
-- identity hidden in project views for non-admin members.
update public.freelance_hq_profiles
set can_access_renewals = true,
    updated_at = now()
where email = 'saifyounas112@gmail.com';

update public.freelance_hq_profiles
set can_access_finance = false,
    updated_at = now()
where role = 'member';
