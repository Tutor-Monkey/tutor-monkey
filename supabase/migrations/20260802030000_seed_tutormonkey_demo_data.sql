-- Optional local/demo seed for the TutorMonkey teacher account.
-- Review and apply explicitly; this migration is intentionally idempotent.
-- It creates metadata-only demo Documents with extracted text in provenance so
-- the Materials composer can be tested without uploading files first.

do $$
declare
  demo_user uuid;
  demo_workspace uuid;
begin
  select id into demo_user
  from auth.users
  where lower(email) = 'tutormonkeyco@gmail.com'
  limit 1;

  if demo_user is null then
    raise notice 'TutorMonkey demo account does not exist; skipping seed data.';
    return;
  end if;

  select id into demo_workspace
  from public.course_workspaces
  where owner_id = demo_user and title = 'TutorMonkey Demo Classroom'
  order by created_at asc
  limit 1;

  if demo_workspace is null then
    insert into public.course_workspaces (owner_id, title, description)
    values (
      demo_user,
      'TutorMonkey Demo Classroom',
      'Seeded workspace for testing the Materials composer.'
    )
    returning id into demo_workspace;
  end if;

  insert into public.materials (
    workspace_id, source_type, original_filename, mime_type, byte_size, status, provenance
  )
  select
    demo_workspace,
    'local_upload',
    seed.filename,
    'text/markdown',
    octet_length(seed.text),
    'ready',
    jsonb_build_object(
      'seeded_demo', true,
      'uploaded_by', demo_user,
      'extraction', jsonb_build_object(
        'text', seed.text,
        'char_count', length(seed.text),
        'word_count', cardinality(regexp_split_to_array(trim(seed.text), E'\\s+'))
      )
    )
  from (
    values
      (
        'Photosynthesis Notes.md',
        'Photosynthesis converts light energy into chemical energy in chloroplasts. Chlorophyll absorbs light, primarily in the blue and red regions of the spectrum. The light-dependent reactions produce ATP and NADPH. The Calvin cycle uses ATP and NADPH to build sugars from carbon dioxide. Water is split during the light-dependent reactions, releasing oxygen as a byproduct.'
      ),
      (
        'Cellular Respiration Notes.md',
        'Cellular respiration releases usable energy from glucose. Glycolysis occurs in the cytoplasm and produces pyruvate, ATP, and NADH. The citric acid cycle occurs in the mitochondrial matrix. The electron transport chain uses electrons from NADH and FADH2 to create a proton gradient. ATP synthase uses that gradient to produce ATP, and oxygen is the final electron acceptor.'
      ),
      (
        'Enzyme Activity Lab.md',
        'Enzymes are biological catalysts that lower activation energy without being consumed. Their activity depends on temperature, pH, substrate concentration, and enzyme concentration. Extreme temperatures can denature an enzyme by changing its three-dimensional shape. A controlled experiment changes one independent variable while keeping other conditions constant.'
      )
  ) as seed(filename, text)
  where not exists (
    select 1 from public.materials m
    where m.workspace_id = demo_workspace
      and m.original_filename = seed.filename
  );
end $$;
