-- TutorMonkey Teachers — visible generation lifecycle for generated materials
-- Existing generated rows are completed; newly queued rows are visible immediately.

alter table public.generated_materials
  add column if not exists generation_status text not null default 'completed'
    check (generation_status in ('generating', 'completed', 'failed')),
  add column if not exists generation_error text;

create index if not exists generated_materials_workspace_status_idx
  on public.generated_materials (workspace_id, generation_status, created_at desc);

comment on column public.generated_materials.generation_status is
  'Visible generation lifecycle: generating placeholder, completed validated content, or failed.';

comment on column public.generated_materials.generation_error is
  'Safe teacher-facing failure message for a failed generation; never raw provider output.';
