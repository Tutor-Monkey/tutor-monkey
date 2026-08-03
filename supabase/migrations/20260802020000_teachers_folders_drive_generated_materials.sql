-- ===========================================================================
-- TutorMonkey Teachers — folder tree, Drive metadata, generated materials
-- ===========================================================================
-- Scope of this slice (additive; apply after 20260802010000):
--   workspace_folders    – per-workspace folder tree for the Google
--                          Classroom-style file browser (Documents and
--                          Materials tabs share it). Self-referencing
--                          parent_id; a composite FK (workspace_id,
--                          parent_id) → (workspace_id, id) makes it
--                          impossible to attach a folder to a parent in a
--                          different workspace.
--   materials            – gains a nullable folder_id (our own tree) plus
--                          typed Google Drive metadata columns. Existing
--                          local uploads, storage_path and provenance JSONB
--                          are untouched; drive_sync_status defaults to
--                          'not_applicable' so every existing row stays
--                          valid. A guarded backfill denormalizes the
--                          Drive file id legacy google_drive rows already
--                          carry in provenance.
--   generated_materials  – generated classroom content (worksheets, quizzes,
--                          reviews, exit tickets, …) as first-class rows
--                          instead of materials.provenance.worksheet. The
--                          table starts empty; legacy provenance.worksheet
--                          blocks remain the durable copy for existing rows
--                          and can be migrated by the app in a later data
--                          step.
--
-- Google Drive scope note (least privilege) — READ FIRST
-- ------------------------------------------------------
-- Every drive_* column in this migration is populated ONLY for files the
-- user explicitly picked in the Google Picker or that the app itself
-- created (export / backup). The Picker is configured with the
-- least-privilege scope https://www.googleapis.com/auth/drive.file, which
-- covers files the user selects and files the app creates — it grants NO
-- broad Drive search or listing. Server code must never scan a user's whole
-- Drive: any import or backup flow starts from an explicit Picker selection
-- and stores the returned file metadata in these columns.
--
-- Security model
-- --------------
-- Same rules as 20260802000000: the browser only holds the public anon key,
-- so RLS is the only gate. Members can view/create/update folders and
-- generated materials; workspace owners can delete (mirrors materials).
-- No policy or grant on an existing table is modified — this file only adds
-- tables, columns, indexes, and policies.
--
-- Applying this migration
-- -----------------------
-- Not applied anywhere yet. Apply with the Supabase CLI (`supabase db
-- push`) after 20260802000000 and 20260802010000; it depends on
-- public.is_workspace_member(), public.is_workspace_owner() and
-- public.set_updated_at() defined in the first migration.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. workspace_folders — per-workspace folder tree
-- ---------------------------------------------------------------------------
-- Root folders have parent_id NULL; children reference their parent, which
-- must live in the SAME workspace (enforced by the composite FK below).
create table if not exists public.workspace_folders (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.course_workspaces (id) on delete cascade,
  parent_id    uuid,
  name         text not null,
  kind         text not null default 'folder' check (kind in ('folder')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- Cross-workspace parents are impossible: the FK matches BOTH workspace_id
  -- and id, so the parent row must exist AND belong to the same workspace.
  -- The redundant unique (workspace_id, id) exists only to back this FK
  -- (id is already the primary key).
  constraint workspace_folders_workspace_id_id_key unique (workspace_id, id),
  constraint workspace_folders_parent_workspace_fk
    foreign key (workspace_id, parent_id)
    references public.workspace_folders (workspace_id, id)
    on delete cascade,
  -- A folder cannot be its own parent. Deep cycles (A → B → A) are an
  -- app-layer invariant: the UI only ever moves a folder into a folder it
  -- can see in the same workspace, and refuses to move a folder into its
  -- own subtree.
  constraint workspace_folders_no_self_parent
    check (parent_id is null or parent_id <> id),
  constraint workspace_folders_name_not_blank check (btrim(name) <> '')
);

-- Sibling names are unique within the same parent. Two partial unique
-- indexes because Postgres treats NULLs as distinct: root folders share
-- parent_id NULL, children share a real parent_id.
create unique index if not exists workspace_folders_root_name_uniq
  on public.workspace_folders (workspace_id, name)
  where parent_id is null;

create unique index if not exists workspace_folders_sibling_name_uniq
  on public.workspace_folders (workspace_id, parent_id, name)
  where parent_id is not null;

-- Indexes for the browser's access patterns (list children of a folder,
-- list all folders of a workspace) and for the FK from materials /
-- generated_materials.
create index if not exists workspace_folders_workspace_id_idx
  on public.workspace_folders (workspace_id);

create index if not exists workspace_folders_workspace_parent_idx
  on public.workspace_folders (workspace_id, parent_id);

-- ---------------------------------------------------------------------------
-- 2. workspace_folders — RLS: members view/create/update, owners delete
-- ---------------------------------------------------------------------------
alter table public.workspace_folders enable row level security;

drop policy if exists "Workspace members can view folders" on public.workspace_folders;
create policy "Workspace members can view folders"
  on public.workspace_folders for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists "Workspace members can create folders" on public.workspace_folders;
create policy "Workspace members can create folders"
  on public.workspace_folders for insert
  to authenticated
  with check (public.is_workspace_member(workspace_id));

drop policy if exists "Workspace members can update folders" on public.workspace_folders;
create policy "Workspace members can update folders"
  on public.workspace_folders for update
  to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- Deleting a folder removes its subtree (parent FK cascades), but materials
-- and generated materials are only unfiled (folder_id set to null), never
-- deleted.
drop policy if exists "Owners can delete folders" on public.workspace_folders;
create policy "Owners can delete folders"
  on public.workspace_folders for delete
  to authenticated
  using (public.is_workspace_owner(workspace_id));

-- ---------------------------------------------------------------------------
-- 3. materials — folder + Google Drive metadata columns (all additive)
-- ---------------------------------------------------------------------------
-- Existing rows keep every current value: new columns are nullable except
-- drive_sync_status, which defaults to 'not_applicable' for local uploads
-- and any row without an explicit Drive file.
alter table public.materials
  add column if not exists folder_id        uuid references public.workspace_folders (id) on delete set null,
  add column if not exists drive_file_id    text,
  add column if not exists drive_mime_type  text,
  add column if not exists drive_web_url    text,
  add column if not exists drive_parent_id  text,
  add column if not exists drive_sync_status text not null default 'not_applicable'
                 check (drive_sync_status in ('not_applicable', 'pending', 'synced', 'failed')),
  add column if not exists drive_synced_at  timestamptz,
  add column if not exists drive_error      text;

-- A row can only report 'synced' when it actually has a Drive file id.
-- (Re-created idempotently; the migration is applied once.)
alter table public.materials drop constraint if exists materials_drive_synced_has_file;
alter table public.materials add constraint materials_drive_synced_has_file
  check (drive_sync_status <> 'synced' or drive_file_id is not null);

-- Additive backfill (safe to delete this block if a pure-schema migration
-- is preferred): legacy google_drive rows already carry their Drive file id
-- in provenance; denormalize it into the new typed columns so the Drive-
-- aware UI works on existing imports immediately. provenance is retained
-- untouched as the historical source of truth. Only rows with a NULL
-- drive_file_id and a drive_file_id in provenance are touched.
update public.materials
set drive_file_id     = nullif(provenance ->> 'drive_file_id', ''),
    drive_mime_type   = nullif(provenance ->> 'drive_mime_type', ''),
    drive_web_url     = nullif(provenance ->> 'drive_link', ''),
    drive_sync_status = 'synced'
where source_type = 'google_drive'
  and drive_file_id is null
  and nullif(provenance ->> 'drive_file_id', '') is not null;

-- Browser access patterns + import idempotency. The index is deliberately
-- NON-unique: the guarded backfill above may encounter a Drive file that was
-- imported twice into the same workspace before this migration, and a unique
-- index would abort the whole migration on that data. Import dedup is
-- enforced by the app (upsert on (workspace_id, drive_file_id)); once the
-- data is known clean, this can be promoted to a unique index in a later
-- migration. generated_materials gets the unique index (below) because that
-- table is always empty when this migration runs.
create index if not exists materials_folder_id_idx
  on public.materials (folder_id);

create index if not exists materials_workspace_folder_idx
  on public.materials (workspace_id, folder_id);

create index if not exists materials_workspace_drive_file_idx
  on public.materials (workspace_id, drive_file_id)
  where drive_file_id is not null;

-- ---------------------------------------------------------------------------
-- 4. generated_materials — first-class generated classroom content
-- ---------------------------------------------------------------------------
-- Replaces materials.provenance.worksheet going forward: the generate route
-- writes a row here and (optionally) keeps provenance for backwards
-- compatibility. content is the canonical, validated worksheet/quiz/etc.
-- payload; source_document_ids references public.materials ids (array FK is
-- impractical — enforced by the app, documented here).
create table if not exists public.generated_materials (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references public.course_workspaces (id) on delete cascade,
  folder_id           uuid references public.workspace_folders (id) on delete set null,
  title               text not null,
  material_type       text not null
                      check (material_type in ('worksheet', 'quiz', 'review', 'exit_ticket', 'other')),
  content             jsonb not null default '{}'::jsonb,
  source_document_ids uuid[] not null default '{}'::uuid[],
  provider            text,
  model               text,
  generation_job_id   uuid references public.processing_jobs (id) on delete set null,
  drive_file_id       text,
  drive_sync_status   text not null default 'not_applicable'
                      check (drive_sync_status in ('not_applicable', 'pending', 'synced', 'failed')),
  drive_synced_at     timestamptz,
  drive_error         text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint generated_materials_drive_synced_has_file
    check (drive_sync_status <> 'synced' or drive_file_id is not null)
);

-- Browser access patterns: list by workspace/folder, filter by type, find
-- everything derived from a document (GIN on the uuid[]), import dedup.
create index if not exists generated_materials_workspace_id_idx
  on public.generated_materials (workspace_id);

create index if not exists generated_materials_folder_id_idx
  on public.generated_materials (folder_id);

create index if not exists generated_materials_workspace_folder_idx
  on public.generated_materials (workspace_id, folder_id);

create index if not exists generated_materials_workspace_type_idx
  on public.generated_materials (workspace_id, material_type);

create index if not exists generated_materials_source_documents_gin
  on public.generated_materials using gin (source_document_ids);

create unique index if not exists generated_materials_workspace_drive_file_uniq
  on public.generated_materials (workspace_id, drive_file_id)
  where drive_file_id is not null;

-- ---------------------------------------------------------------------------
-- 5. generated_materials — RLS: members view/create/update, owners delete
-- ---------------------------------------------------------------------------
alter table public.generated_materials enable row level security;

drop policy if exists "Workspace members can view generated materials" on public.generated_materials;
create policy "Workspace members can view generated materials"
  on public.generated_materials for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists "Workspace members can create generated materials" on public.generated_materials;
create policy "Workspace members can create generated materials"
  on public.generated_materials for insert
  to authenticated
  with check (public.is_workspace_member(workspace_id));

drop policy if exists "Workspace members can update generated materials" on public.generated_materials;
create policy "Workspace members can update generated materials"
  on public.generated_materials for update
  to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

drop policy if exists "Owners can delete generated materials" on public.generated_materials;
create policy "Owners can delete generated materials"
  on public.generated_materials for delete
  to authenticated
  using (public.is_workspace_owner(workspace_id));

-- ---------------------------------------------------------------------------
-- 6. Grants — authenticated only; anonymous sessions get nothing
-- ---------------------------------------------------------------------------
revoke all on public.workspace_folders, public.generated_materials from anon;

grant select, insert, update, delete on public.workspace_folders,
  public.generated_materials
  to authenticated;

-- ---------------------------------------------------------------------------
-- 7. updated_at triggers — reuse public.set_updated_at() from the first
--    migration (materials already has one).
-- ---------------------------------------------------------------------------
drop trigger if exists workspace_folders_set_updated_at on public.workspace_folders;
create trigger workspace_folders_set_updated_at
  before update on public.workspace_folders
  for each row execute function public.set_updated_at();

drop trigger if exists generated_materials_set_updated_at on public.generated_materials;
create trigger generated_materials_set_updated_at
  before update on public.generated_materials
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 8. Comments — schema documentation surfaced in the SQL editor / API docs
-- ---------------------------------------------------------------------------
comment on table public.workspace_folders is
  'Per-workspace folder tree for the Documents/Materials file browser. '
  'parent_id is a self-reference; the composite FK (workspace_id, parent_id) '
  'guarantees a folder can never be attached to a parent in another workspace.';

comment on column public.workspace_folders.parent_id is
  'Parent folder in the same workspace, or NULL for a root folder. '
  'Deleting a folder cascades to its subtree.';

comment on column public.workspace_folders.kind is
  'Folder kind. Only ''folder'' exists today; the column is reserved for '
  'future kinds (e.g. virtual/Drive-backed folders).';

comment on column public.materials.folder_id is
  'Folder in the workspace folder tree this document lives in; NULL means '
  'the workspace root. Deleting the folder unfiles the document (set null); '
  'it never deletes the document. Workspace consistency of folder_id is '
  'enforced by the app (folders are fetched within the workspace).';

comment on column public.materials.drive_file_id is
  'Google Drive file id. ONLY set for files the user explicitly picked via '
  'the Google Picker or that the app created (export/backup) — the '
  'drive.file scope grants no broad Drive search or listing. NULL for local '
  'uploads. Indexed per workspace; import dedup is enforced by the app '
  '(the index is deliberately non-unique for backfill safety).';

comment on column public.materials.drive_parent_id is
  'Google Drive folder id of the file''s parent on Drive (the Drive-side '
  'location), distinct from folder_id (our own workspace folder tree). '
  'Set only from explicit Picker metadata.';

comment on column public.materials.drive_sync_status is
  'Drive sync lifecycle: not_applicable (no Drive involvement, e.g. local '
  'uploads), pending (export queued/running), synced (Drive copy '
  'confirmed), failed (see drive_error). ''synced'' requires drive_file_id.';

comment on column public.materials.drive_error is
  'Human-readable failure reason from the last Drive export/backup attempt.';

comment on column public.generated_materials.folder_id is
  'Folder in the workspace folder tree this generated material lives in; '
  'NULL means the workspace root. Deleting the folder unfiles the material '
  '(set null), never deletes it.';

comment on column public.generated_materials.source_document_ids is
  'public.materials ids this generation was derived from. Not an FK (array '
  'FKs are impractical) — enforced by the app when the generate route '
  'writes the row.';

comment on column public.generated_materials.generation_job_id is
  'processing_jobs row that produced this material (set null when the job '
  'is deleted). NULL when generation did not go through a job row.';

comment on column public.generated_materials.drive_file_id is
  'Google Drive file id of the exported copy. ONLY set for files the user '
  'explicitly picked via the Google Picker or that the app created '
  '(export/backup) — the drive.file scope grants no broad Drive search or '
  'listing. NULL until the user exports to Drive. Unique per workspace.';

comment on column public.generated_materials.drive_sync_status is
  'Drive sync lifecycle: not_applicable (not exported), pending (export '
  'queued/running), synced (Drive copy confirmed), failed (see '
  'drive_error). ''synced'' requires drive_file_id.';
