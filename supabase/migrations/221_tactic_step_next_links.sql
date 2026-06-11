alter table public.tactic_steps
  add column if not exists next_step_links jsonb not null default '[]'::jsonb;

alter table public.tactic_steps
  add constraint tactic_steps_next_step_links_array
  check (
    jsonb_typeof(next_step_links) = 'array'
    and jsonb_array_length(next_step_links) <= 6
    and octet_length(next_step_links::text) <= 4096
  )
  not valid;

comment on column public.tactic_steps.next_step_links is
  'Bounded array of condition labels and target step ids for branching to the next step.';
