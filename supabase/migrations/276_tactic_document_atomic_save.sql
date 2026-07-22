-- 276: Save a tactic board and every step as one optimistic transaction.

create or replace function public.save_tactic_document_atomic(
  p_guild_id uuid,
  p_board_id uuid,
  p_expected_updated_at timestamptz,
  p_title text,
  p_summary text,
  p_updated_by text,
  p_steps jsonb
)
returns timestamptz
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_current_updated_at timestamptz;
  v_next_updated_at timestamptz := clock_timestamp();
  v_submitted_count integer;
  v_existing_count integer;
  v_matching_count integer;
begin
  select updated_at
    into v_current_updated_at
  from public.tactic_boards
  where guild_id = p_guild_id
    and id = p_board_id
  for update;

  if not found then
    raise exception 'tactic_not_found';
  end if;

  if v_current_updated_at is distinct from p_expected_updated_at then
    raise exception 'tactic_version_conflict';
  end if;

  if jsonb_typeof(p_steps) is distinct from 'array' then
    raise exception 'tactic_document_invalid';
  end if;

  v_submitted_count := jsonb_array_length(p_steps);
  if v_submitted_count < 1 or v_submitted_count > 30 then
    raise exception 'tactic_document_invalid';
  end if;

  select count(*)
    into v_existing_count
  from public.tactic_steps
  where guild_id = p_guild_id
    and board_id = p_board_id;

  select count(distinct submitted.id)
    into v_matching_count
  from jsonb_to_recordset(p_steps) as submitted(id uuid)
  join public.tactic_steps as existing
    on existing.guild_id = p_guild_id
   and existing.board_id = p_board_id
   and existing.id = submitted.id;

  if v_submitted_count <> v_existing_count or v_matching_count <> v_existing_count then
    raise exception 'tactic_document_mismatch';
  end if;

  update public.tactic_steps as step
  set title = submitted.title,
      callout = submitted.callout,
      role_callouts = submitted.role_callouts,
      intent = submitted.guidance ->> 'intent',
      next_step_links = submitted.next_step_links,
      board_state = submitted.board_state,
      duration_seconds = submitted.duration_seconds,
      updated_at = v_next_updated_at
  from jsonb_to_recordset(p_steps) as submitted(
    id uuid,
    title text,
    callout text,
    role_callouts jsonb,
    guidance jsonb,
    next_step_links jsonb,
    board_state jsonb,
    duration_seconds integer
  )
  where step.guild_id = p_guild_id
    and step.board_id = p_board_id
    and step.id = submitted.id;

  update public.tactic_boards
  set title = p_title,
      summary = p_summary,
      updated_by = p_updated_by,
      updated_at = v_next_updated_at
  where guild_id = p_guild_id
    and id = p_board_id;

  return v_next_updated_at;
end;
$$;

revoke all on function public.save_tactic_document_atomic(
  uuid, uuid, timestamptz, text, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.save_tactic_document_atomic(
  uuid, uuid, timestamptz, text, text, text, jsonb
) to service_role;

comment on function public.save_tactic_document_atomic(
  uuid, uuid, timestamptz, text, text, text, jsonb
) is 'Optimistically saves one guild-scoped tactic board and all of its existing steps atomically.';
