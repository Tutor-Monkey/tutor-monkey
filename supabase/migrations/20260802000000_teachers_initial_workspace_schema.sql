-- ===========================================================================
-- TutorMonkey Teachers — initial workspace data model (reviewable migration)
-- ===========================================================================
-- Scope of this slice:
--   teacher_profiles   – 1:1 link to auth.users (auto-created on sign-up)
--   course_workspaces  – a teacher's course workspace (owner = auth.users)
--   workspace_members  – future-ready membership (owner/editor/viewer)
--   materials          – workspace-owned intake records: local uploads or
--                        Google Drive files, plus intake metadata
--   processing_jobs    – per-material pipeline progress (extract → generate)
--
-- Security model
-- --------------
-- Every table has strict RLS. The browser only ever holds the public anon key
-- (lib/supabase/client.ts) — there is no service-role key in the client
-- bundle — so RLS is the only gate between a signed-in teacher and another
-- teacher's data. Policies are scoped to auth.uid() and to workspace
-- ownership/membership via the is_workspace_member() helper; anonymous
-- visitors are revoked entirely. Nothing here requires the service-role key.
--
-- Applying this migration
-- -----------------------
-- Not applied anywhere yet. Apply for review/testing with the Supabase CLI
-- (`supabase db push`) or the project dashboard's SQL editor.
--
-- Storage: the uploads bucket (e.g. `teachers-materials`) and the
-- storage→materials wiring land with the upload pipeline slice; this file
-- only models the database side. materials.storage_path will reference the
-- object key inside that bucket.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. teacher_profiles
-- ---------------------------------------------------------------------------
create table if not exists public.teacher_profiles (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Auto-create a profile the moment a new user signs up (first Google login).
-- `security definer` runs as the migration owner so this works for
-- anon/authenticated sessions without any service-role key.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.teacher_profiles (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 2. course_workspaces
-- ---------------------------------------------------------------------------
create table if not exists public.course_workspaces (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users (id) on delete cascade,
  title       text not null,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3. workspace_members — future-ready membership (owner/editor/viewer).
-- The workspace owner is recorded on course_workspaces.owner_id; this table
-- extends access to invited teachers later without schema changes.
-- ---------------------------------------------------------------------------
create table if not exists public.workspace_members (
  workspace_id uuid not null references public.course_workspaces (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  role         text not null default 'viewer'
               check (role in ('owner', 'editor', 'viewer')),
  created_at   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

-- ---------------------------------------------------------------------------
-- 4. materials — workspace-owned intake records.
-- provenance: JSONB carrying source-specific details, e.g.
--   { "drive_file_id": "...", "drive_link": "..." } for google_drive, or
--   { "uploaded_by": "<uuid>", "upload_batch": "..." } for local_upload.
-- ---------------------------------------------------------------------------
create table if not exists public.materials (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.course_workspaces (id) on delete cascade,
  source_type       text not null check (source_type in ('local_upload', 'google_drive')),
  original_filename text not null,
  storage_path      text,          -- object key in the uploads bucket (local_upload)
  mime_type         text,
  byte_size         bigint check (byte_size is null or byte_size >= 0),
  status            text not null default 'uploaded'
                    check (status in ('uploaded', 'processing', 'ready', 'failed')),
  provenance        jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 5. processing_jobs — per-material pipeline progress.
-- stage mirrors the product pipeline: extract → organize → generate.
-- ---------------------------------------------------------------------------
create table if not exists public.processing_jobs (
  id          uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.materials (id) on delete cascade,
  stage       text not null check (stage in ('extract', 'organize', 'generate')),
  status      text not null default 'pending'
              check (status in ('pending', 'running', 'succeeded', 'failed')),
  attempts    integer not null default 0 check (attempts >= 0),
  error       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ===========================================================================
-- Row Level Security
-- ===========================================================================
alter table public.teacher_profiles   enable row level security;
alter table public.course_workspaces  enable row level security;
alter table public.workspace_members  enable row level security;
alter table public.materials          enable row level security;
alter table public.processing_jobs    enable row level security;

-- Helper used by policies: is the current user the owner of, or a member of,
-- the given workspace? `security definer` + fixed search_path is the standard
-- Supabase pattern that avoids recursive policy evaluation; it only ever
-- answers about auth.uid()'s own membership, never another user's.
create or replace function public.is_workspace_member(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.course_workspaces cw
    where cw.id = ws and cw.owner_id = auth.uid()
  ) or exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = ws and wm.user_id = auth.uid()
  );
$$;

revoke all on function public.is_workspace_member(uuid) from public;
grant execute on function public.is_workspace_member(uuid) to authenticated;

-- Owner-only helper for membership administration. Keep this separate from
-- is_workspace_member(): being a member must never grant membership-management
-- privileges.
create or replace function public.is_workspace_owner(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.course_workspaces cw
    where cw.id = ws and cw.owner_id = auth.uid()
  );
$$;

revoke all on function public.is_workspace_owner(uuid) from public;
grant execute on function public.is_workspace_owner(uuid) to authenticated;

-- Explicit grants: only authenticated (signed-in) sessions touch these
-- tables. Anonymous visitors get nothing, and nothing here ever relies on the
-- service-role key, which must stay server-side only.
revoke all on public.teacher_profiles, public.course_workspaces,
  public.workspace_members, public.materials, public.processing_jobs
  from anon;

grant select, insert, update, delete on public.teacher_profiles,
  public.course_workspaces, public.workspace_members, public.materials,
  public.processing_jobs
  to authenticated;

-- teacher_profiles: every user manages exactly their own row.
drop policy if exists "Users can view their own profile" on public.teacher_profiles;
create policy "Users can view their own profile"
  on public.teacher_profiles for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can create their own profile" on public.teacher_profiles;
create policy "Users can create their own profile"
  on public.teacher_profiles for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users can update their own profile" on public.teacher_profiles;
create policy "Users can update their own profile"
  on public.teacher_profiles for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- No delete policy: profiles are removed via the auth.users cascade.

-- course_workspaces: owners fully control their workspaces; members (future)
-- get read access.
drop policy if exists "Owners and members can view workspaces" on public.course_workspaces;
create policy "Owners and members can view workspaces"
  on public.course_workspaces for select
  to authenticated
  using (owner_id = auth.uid() or public.is_workspace_member(id));

drop policy if exists "Owners can create workspaces" on public.course_workspaces;
create policy "Owners can create workspaces"
  on public.course_workspaces for insert
  to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "Owners can update workspaces" on public.course_workspaces;
create policy "Owners can update workspaces"
  on public.course_workspaces for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "Owners can delete workspaces" on public.course_workspaces;
create policy "Owners can delete workspaces"
  on public.course_workspaces for delete
  to authenticated
  using (owner_id = auth.uid());

-- workspace_members: members see memberships they belong to; owners manage
-- their workspace's membership list.
drop policy if exists "Members can view memberships" on public.workspace_members;
create policy "Members can view memberships"
  on public.workspace_members for select
  to authenticated
  using (user_id = auth.uid() or public.is_workspace_member(workspace_id));

drop policy if exists "Owners can add members" on public.workspace_members;
create policy "Owners can add members"
  on public.workspace_members for insert
  to authenticated
  with check (public.is_workspace_owner(workspace_id));

drop policy if exists "Owners can update memberships" on public.workspace_members;
create policy "Owners can update memberships"
  on public.workspace_members for update
  to authenticated
  using (public.is_workspace_owner(workspace_id))
  with check (public.is_workspace_owner(workspace_id));

drop policy if exists "Owners can remove members" on public.workspace_members;
create policy "Owners can remove members"
  on public.workspace_members for delete
  to authenticated
  using (public.is_workspace_owner(workspace_id));

-- materials: any member can view/add/update; only the owner can delete.
drop policy if exists "Workspace members can view materials" on public.materials;
create policy "Workspace members can view materials"
  on public.materials for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists "Workspace members can add materials" on public.materials;
create policy "Workspace members can add materials"
  on public.materials for insert
  to authenticated
  with check (public.is_workspace_member(workspace_id));

drop policy if exists "Workspace members can update materials" on public.materials;
create policy "Workspace members can update materials"
  on public.materials for update
  to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

drop policy if exists "Owners can delete materials" on public.materials;
create policy "Owners can delete materials"
  on public.materials for delete
  to authenticated
  using (
    exists (
      select 1 from public.course_workspaces cw
      where cw.id = materials.workspace_id and cw.owner_id = auth.uid()
    )
  );

-- processing_jobs: scoped through the material's workspace.
drop policy if exists "Workspace members can view processing jobs" on public.processing_jobs;
create policy "Workspace members can view processing jobs"
  on public.processing_jobs for select
  to authenticated
  using (
    exists (
      select 1 from public.materials m
      where m.id = processing_jobs.material_id
        and public.is_workspace_member(m.workspace_id)
    )
  );

drop policy if exists "Workspace members can create processing jobs" on public.processing_jobs;
create policy "Workspace members can create processing jobs"
  on public.processing_jobs for insert
  to authenticated
  with check (
    exists (
      select 1 from public.materials m
      where m.id = processing_jobs.material_id
        and public.is_workspace_member(m.workspace_id)
    )
  );

drop policy if exists "Workspace members can update processing jobs" on public.processing_jobs;
create policy "Workspace members can update processing jobs"
  on public.processing_jobs for update
  to authenticated
  using (
    exists (
      select 1 from public.materials m
      where m.id = processing_jobs.material_id
        and public.is_workspace_member(m.workspace_id)
    )
  )
  with check (
    exists (
      select 1 from public.materials m
      where m.id = processing_jobs.material_id
        and public.is_workspace_member(m.workspace_id)
    )
  );

drop policy if exists "Owners can delete processing jobs" on public.processing_jobs;
create policy "Owners can delete processing jobs"
  on public.processing_jobs for delete
  to authenticated
  using (
    exists (
      select 1 from public.materials m
      join public.course_workspaces cw on cw.id = m.workspace_id
      where m.id = processing_jobs.material_id
        and cw.owner_id = auth.uid()
    )
  );

-- ===========================================================================
-- updated_at triggers
-- ===========================================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists teacher_profiles_set_updated_at on public.teacher_profiles;
create trigger teacher_profiles_set_updated_at
  before update on public.teacher_profiles
  for each row execute function public.set_updated_at();

drop trigger if exists course_workspaces_set_updated_at on public.course_workspaces;
create trigger course_workspaces_set_updated_at
  before update on public.course_workspaces
  for each row execute function public.set_updated_at();

drop trigger if exists materials_set_updated_at on public.materials;
create trigger materials_set_updated_at
  before update on public.materials
  for each row execute function public.set_updated_at();

drop trigger if exists processing_jobs_set_updated_at on public.processing_jobs;
create trigger processing_jobs_set_updated_at
  before update on public.processing_jobs
  for each row execute function public.set_updated_at();

-- ===========================================================================
-- Indexes for the access patterns above
-- ===========================================================================
create index if not exists course_workspaces_owner_id_idx
  on public.course_workspaces (owner_id);

create index if not exists workspace_members_user_id_idx
  on public.workspace_members (user_id);

create index if not exists workspace_members_workspace_id_idx
  on public.workspace_members (workspace_id);

create index if not exists materials_workspace_id_idx
  on public.materials (workspace_id);

create index if not exists materials_workspace_status_idx
  on public.materials (workspace_id, status);

create index if not exists processing_jobs_material_id_idx
  on public.processing_jobs (material_id);

create index if not exists processing_jobs_status_idx
  on public.processing_jobs (status);
