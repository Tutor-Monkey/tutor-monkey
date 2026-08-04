-- Beta access gate for TutorMonkey Teachers.
-- New Google sign-ins can apply, but workspace access requires admin approval.
alter table public.teacher_profiles
  add column if not exists approval_status text not null default 'pending'
    check (approval_status in ('pending', 'approved', 'rejected')),
  add column if not exists application_message text,
  add column if not exists applied_at timestamptz,
  add column if not exists reviewed_at timestamptz;

update public.teacher_profiles
set approval_status = 'pending'
where approval_status is null;

create index if not exists teacher_profiles_approval_status_idx
  on public.teacher_profiles (approval_status);
