-- ===========================================================================
-- TutorMonkey Teachers — materials storage bucket + strict object RLS
-- ===========================================================================
-- Scope of this slice:
--   teachers-materials bucket – PRIVATE storage bucket for local uploads.
--       25 MB per-file limit and document MIME types that mirror the file
--       picker in MaterialsIntakePanel (.pdf .doc .docx .ppt .pptx .txt .md).
--   storage.objects RLS – authenticated users only, scoped per workspace
--       through the existing public.is_workspace_member() /
--       public.is_workspace_owner() helpers. Object paths must live under
--       the uploader's own workspace namespace:
--           {workspace_id}/{material_id}/{filename}
--       Cross-workspace reads/writes/deletes are denied by policy.
--
-- Security model
-- --------------
-- Same rules as the workspace schema migration: the browser only holds the
-- public anon key, so storage RLS is the only gate. Policies apply to
-- authenticated sessions only (anon is excluded by `to authenticated`), and
-- path ownership is derived from the FIRST path segment, which must be a
-- workspace the current user belongs to (is_workspace_member) or owns
-- (is_workspace_owner, for deletes — mirroring the owner-only delete policy
-- on public.materials).
--
-- Applying this migration
-- -----------------------
-- Not applied anywhere yet. Apply for review/testing with the Supabase CLI
-- (`supabase db push`) or the project dashboard's SQL editor. Order after
-- 20260802000000_teachers_initial_workspace_schema.sql — the policies call
-- public.is_workspace_member()/public.is_workspace_owner() defined there.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. teachers-materials bucket (private; 25 MB; document MIME types)
-- ---------------------------------------------------------------------------
-- file_size_limit is in bytes: 25 * 1024 * 1024 = 26,214,400.
-- allowed_mime_types must match the extensions accepted by the UI picker.
-- `on conflict ... do update` keeps the migration idempotent for re-runs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'teachers-materials',
  'teachers-materials',
  false,
  26214400,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/markdown'
  ]::text[]
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- 2. Path helpers used by the storage.objects policies
-- ---------------------------------------------------------------------------
-- material_object_workspace_id(path): the first path segment, parsed as a
-- uuid, or NULL when the path doesn't start with a valid workspace id.
-- Wrapping the cast in an exception handler keeps a malformed path from
-- erroring out the whole policy expression — it simply fails the check.
create or replace function public.material_object_workspace_id(object_path text)
returns uuid
language plpgsql
stable
set search_path = public, storage
as $$
declare
  ws_id uuid;
begin
  begin
    ws_id := nullif((storage.foldername(object_path))[1], '')::uuid;
  exception when others then
    return null;
  end;
  return ws_id;
end;
$$;

revoke all on function public.material_object_workspace_id(text) from public;
grant execute on function public.material_object_workspace_id(text) to authenticated;

-- is_material_object_path(path): shape check for the materials namespace.
-- The path must be {workspace_id}/{material_id}/{filename...} — at least two
-- folders, a valid uuid in the first slot, and no empty / "." / ".." /
-- backslash segments that could be used for traversal tricks.
create or replace function public.is_material_object_path(object_path text)
returns boolean
language plpgsql
stable
set search_path = public, storage
as $$
declare
  folders text[];
begin
  if object_path is null or object_path = '' then
    return false;
  end if;

  folders := storage.foldername(object_path);

  if folders is null or array_length(folders, 1) < 2 then
    return false;
  end if;

  begin
    if (folders[1])::uuid is null then
      return false;
    end if;
  exception when others then
    return false;
  end;

  if exists (
    select 1
    from unnest(folders) as f(segment)
    where segment is null
       or segment = ''
       or segment = '.'
       or segment = '..'
       or position('\' in segment) > 0
  ) then
    return false;
  end if;

  return true;
end;
$$;

revoke all on function public.is_material_object_path(text) from public;
grant execute on function public.is_material_object_path(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. storage.objects RLS
-- ---------------------------------------------------------------------------
-- storage.objects ships with RLS enabled and no default policies (deny all),
-- so these policies are the only access path. Do not ALTER this managed table's
-- RLS state here: Supabase owns it and rejects that statement for project
-- migrations even though RLS is already enabled.

-- Select: any workspace member can read objects under their workspace's
-- namespace. Cross-workspace namespaces resolve to a workspace id the user
-- doesn't belong to, so the policy rejects them.
drop policy if exists "Teachers: members can view workspace material objects" on storage.objects;
create policy "Teachers: members can view workspace material objects"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'teachers-materials'
    and public.is_material_object_path(name)
    and public.is_workspace_member(public.material_object_workspace_id(name))
  );

-- Insert: members can upload into their own workspace namespace only.
-- The first path segment must be a workspace they belong to, so a user can
-- never write under another workspace's folder.
drop policy if exists "Teachers: members can upload workspace material objects" on storage.objects;
create policy "Teachers: members can upload workspace material objects"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'teachers-materials'
    and public.is_material_object_path(name)
    and public.is_workspace_member(public.material_object_workspace_id(name))
  );

-- Update: members may overwrite/replace objects within their own workspace
-- namespace (e.g. upserts, future re-uploads). Cross-workspace updates are
-- rejected on both the old row and the proposed new row.
drop policy if exists "Teachers: members can update workspace material objects" on storage.objects;
create policy "Teachers: members can update workspace material objects"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'teachers-materials'
    and public.is_material_object_path(name)
    and public.is_workspace_member(public.material_object_workspace_id(name))
  )
  with check (
    bucket_id = 'teachers-materials'
    and public.is_material_object_path(name)
    and public.is_workspace_member(public.material_object_workspace_id(name))
  );

-- Delete: workspace owners only — mirrors the owner-only delete policy on
-- public.materials. Members can add and read, but not remove objects.
drop policy if exists "Teachers: owners can delete workspace material objects" on storage.objects;
create policy "Teachers: owners can delete workspace material objects"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'teachers-materials'
    and public.is_material_object_path(name)
    and public.is_workspace_owner(public.material_object_workspace_id(name))
  );

-- ---------------------------------------------------------------------------
-- 4. storage.buckets visibility
-- ---------------------------------------------------------------------------
-- Lets the browser client (public anon key) call storage.getBucket(...) so
-- the dashboard can tell "migration applied" from "not applied yet" and
-- degrade gracefully. Bucket names are not sensitive — the anon key and the
-- bucket constant ship in the client bundle anyway — and this policy grants
-- read-only visibility, never modification.
-- The buckets table is managed by Supabase; do not alter its RLS state here.

drop policy if exists "Authenticated users can view storage buckets" on storage.buckets;
create policy "Authenticated users can view storage buckets"
  on storage.buckets for select
  to authenticated
  using (true);
