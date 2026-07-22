-- 281: Keep trial and absence ownership intact when Discord accounts are merged.
--
-- The original account-merge functions predate member operations. Preserve them
-- as implementation bases, then wrap preview/execution with the two new tables.

alter function public.preview_member_account_merge(uuid, text, text)
  rename to preview_member_account_merge_before_member_operations;
alter function public.merge_member_accounts(uuid, text, text, text, text)
  rename to merge_member_accounts_before_member_operations;

create or replace function public.preview_member_account_merge(
  p_guild_id uuid,
  p_from_discord_id text,
  p_to_discord_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base jsonb;
  v_counts jsonb;
  v_blockers jsonb;
  v_warnings jsonb;
  v_source_trial_count integer;
  v_source_absence_count integer;
begin
  v_base := public.preview_member_account_merge_before_member_operations(
    p_guild_id,
    p_from_discord_id,
    p_to_discord_id
  );
  v_counts := coalesce(v_base->'counts', '{}'::jsonb);
  v_blockers := coalesce(v_base->'blockers', '[]'::jsonb);
  v_warnings := coalesce(v_base->'warnings', '[]'::jsonb);

  select count(*)::integer
    into v_source_trial_count
    from public.member_trial_profiles
   where guild_id = p_guild_id
     and discord_id = p_from_discord_id;

  select count(*)::integer
    into v_source_absence_count
    from public.member_absences
   where guild_id = p_guild_id
     and discord_id = p_from_discord_id;

  v_counts := v_counts || jsonb_build_object(
    'member_trial_profiles', v_source_trial_count,
    'member_absences', v_source_absence_count
  );

  if exists (
    select 1
      from public.member_trial_profiles source
      join public.member_trial_profiles target
        on target.guild_id = source.guild_id
       and target.discord_id = p_to_discord_id
     where source.guild_id = p_guild_id
       and source.discord_id = p_from_discord_id
  ) then
    v_blockers := v_blockers || jsonb_build_array('member_trial_profile_conflict');
  end if;

  -- The self-service writer disallows overlapping windows. Preserve that
  -- invariant during a merge, including exact-range unique collisions.
  if exists (
    select 1
      from public.member_absences source
      join public.member_absences target
        on target.guild_id = source.guild_id
       and target.discord_id = p_to_discord_id
       and target.starts_on <= source.ends_on
       and target.ends_on >= source.starts_on
     where source.guild_id = p_guild_id
       and source.discord_id = p_from_discord_id
  ) then
    v_blockers := v_blockers || jsonb_build_array('member_absence_conflict');
  end if;

  if exists (
    select 1
      from public.member_trial_profiles
     where guild_id = p_guild_id
       and discord_id = p_to_discord_id
    union all
    select 1
      from public.member_absences
     where guild_id = p_guild_id
       and discord_id = p_to_discord_id
  ) and not (v_warnings @> '["target_has_existing_data"]'::jsonb) then
    v_warnings := v_warnings || jsonb_build_array('target_has_existing_data');
  end if;

  return v_base || jsonb_build_object(
    'canMerge', jsonb_array_length(v_blockers) = 0,
    'blockers', v_blockers,
    'warnings', v_warnings,
    'counts', v_counts
  );
end;
$$;

create or replace function public.merge_member_accounts(
  p_guild_id uuid,
  p_from_discord_id text,
  p_to_discord_id text,
  p_actor_discord_id text,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_preview jsonb;
  v_base_result jsonb;
  v_moved jsonb;
  v_count integer;
begin
  -- Lock both identities before previewing so trial/absence writers, which lock
  -- the same avatar rows, cannot introduce a conflict between preview and move.
  perform discord_id
    from public.guild_avatars
   where guild_id = p_guild_id
     and discord_id in (p_from_discord_id, p_to_discord_id)
   order by discord_id
   for update;

  v_preview := public.preview_member_account_merge(
    p_guild_id,
    p_from_discord_id,
    p_to_discord_id
  );
  if coalesce((v_preview->>'canMerge')::boolean, false) is not true then
    raise exception 'ACCOUNT_MERGE_BLOCKED: %', v_preview->'blockers';
  end if;

  v_base_result := public.merge_member_accounts_before_member_operations(
    p_guild_id,
    p_from_discord_id,
    p_to_discord_id,
    p_actor_discord_id,
    p_reason
  );
  v_moved := coalesce(v_base_result->'moved', '{}'::jsonb);

  update public.member_trial_profiles
     set discord_id = p_to_discord_id
   where guild_id = p_guild_id
     and discord_id = p_from_discord_id;
  get diagnostics v_count = row_count;
  v_moved := v_moved || jsonb_build_object('member_trial_profiles', v_count);

  update public.member_absences
     set discord_id = p_to_discord_id,
         created_by = p_to_discord_id
   where guild_id = p_guild_id
     and discord_id = p_from_discord_id;
  get diagnostics v_count = row_count;
  v_moved := v_moved || jsonb_build_object('member_absences', v_count);

  v_preview := public.preview_member_account_merge(
    p_guild_id,
    p_from_discord_id,
    p_to_discord_id
  );
  return v_preview || jsonb_build_object('moved', v_moved);
end;
$$;

revoke all on function public.preview_member_account_merge(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.merge_member_accounts(uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.preview_member_account_merge(uuid, text, text)
  to service_role;
grant execute on function public.merge_member_accounts(uuid, text, text, text, text)
  to service_role;

revoke all on function public.preview_member_account_merge_before_member_operations(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.merge_member_accounts_before_member_operations(uuid, text, text, text, text)
  from public, anon, authenticated;

comment on function public.preview_member_account_merge(uuid, text, text) is
  'Previews a tenant-scoped account merge, including trial and absence ownership conflicts.';
comment on function public.merge_member_accounts(uuid, text, text, text, text) is
  'Merges tenant-scoped member data, including trial profiles and self-authored absence windows.';
