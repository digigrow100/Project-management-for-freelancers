-- Members work only with assigned project/task data. Client-bearing finance
-- and renewals areas are admin-only at the application boundary.
update public.freelance_hq_profiles
set can_access_finance=false,
    can_access_renewals=false,
    updated_at=now()
where role='member';
