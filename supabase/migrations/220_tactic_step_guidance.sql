alter table public.tactic_steps
  add column if not exists phase text not null default 'setup',
  add column if not exists intent text not null default '',
  add column if not exists trigger text not null default '',
  add column if not exists caller_signal text not null default '',
  add column if not exists danger_signs jsonb not null default '[]'::jsonb,
  add column if not exists common_mistakes jsonb not null default '[]'::jsonb,
  add column if not exists decision_branches jsonb not null default '[]'::jsonb;

alter table public.tactic_steps
  add constraint tactic_steps_phase_check
  check (phase in ('setup', 'pressure', 'bait', 'engage', 'counter', 'reset', 'chase'))
  not valid;

alter table public.tactic_steps
  add constraint tactic_steps_guidance_text_length
  check (
    char_length(intent) <= 240
    and char_length(trigger) <= 240
    and char_length(caller_signal) <= 240
  )
  not valid;

alter table public.tactic_steps
  add constraint tactic_steps_danger_signs_array
  check (
    jsonb_typeof(danger_signs) = 'array'
    and jsonb_array_length(danger_signs) <= 8
    and octet_length(danger_signs::text) <= 4096
  )
  not valid;

alter table public.tactic_steps
  add constraint tactic_steps_common_mistakes_array
  check (
    jsonb_typeof(common_mistakes) = 'array'
    and jsonb_array_length(common_mistakes) <= 8
    and octet_length(common_mistakes::text) <= 4096
  )
  not valid;

alter table public.tactic_steps
  add constraint tactic_steps_decision_branches_array
  check (
    jsonb_typeof(decision_branches) = 'array'
    and jsonb_array_length(decision_branches) <= 6
    and octet_length(decision_branches::text) <= 8192
  )
  not valid;

comment on column public.tactic_steps.phase is
  'Step-level ZvZ phase for conditional position and call guidance, not a fixed skill timing.';
comment on column public.tactic_steps.intent is
  'What the guild should understand about the step objective.';
comment on column public.tactic_steps.trigger is
  'Enemy or allied condition that makes this step relevant.';
comment on column public.tactic_steps.caller_signal is
  'Short caller words or map signal that members should recognize.';
comment on column public.tactic_steps.danger_signs is
  'Bounded array of warning signs members should notice before committing.';
comment on column public.tactic_steps.common_mistakes is
  'Bounded array of repeated mistakes to avoid in this situation.';
comment on column public.tactic_steps.decision_branches is
  'Bounded array of condition/action/fallback branches for variable ZvZ decisions.';
