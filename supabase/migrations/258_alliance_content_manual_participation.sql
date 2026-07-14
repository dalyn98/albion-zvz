-- 258: Officer overrides for alliance-content participation.
--
-- Some members attend an alliance content run without appearing in every
-- Albion battle log. Officers can record that attendance against an already
-- confirmed session. New attendance may change an unfinished three-session
-- group, so only video requirements with no submission are rebuilt; submitted
-- or approved evidence remains an immutable audit record.

create or replace function public.rebuild_alliance_content_open_video_requirements(
  p_guild_id uuid,
  p_discord_id text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer := 0;
begin
  if not public.alliance_content_compliance_enabled(p_guild_id) then
    raise exception 'ALLIANCE_CONTENT_FEATURE_UNAVAILABLE';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_guild_id::text || ':' || p_discord_id, 0));

  delete from public.alliance_content_video_requirements requirement
  where requirement.guild_id = p_guild_id
    and requirement.discord_id = p_discord_id
    and requirement.status in ('open', 'overdue')
    and not exists (
      select 1
      from public.alliance_content_video_submissions submission
      where submission.guild_id = requirement.guild_id
        and submission.requirement_id = requirement.id
    );
  get diagnostics v_deleted = row_count;

  perform public.refresh_alliance_content_video_requirements(p_guild_id, p_discord_id);
  return v_deleted;
end;
$$;

create or replace function public.add_alliance_content_manual_participation(
  p_guild_id uuid,
  p_session_id uuid,
  p_discord_id text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_albion_player_id text;
  v_insert_count integer := 0;
  v_inserted boolean := false;
begin
  if not public.alliance_content_compliance_enabled(p_guild_id) then
    raise exception 'ALLIANCE_CONTENT_FEATURE_UNAVAILABLE';
  end if;

  if not exists (
    select 1
    from public.alliance_content_sessions session
    where session.guild_id = p_guild_id
      and session.id = p_session_id
      and session.is_counted
  ) then
    raise exception 'ALLIANCE_CONTENT_SESSION_NOT_FOUND';
  end if;

  select avatar.albion_player_id
    into v_albion_player_id
  from public.guild_avatars avatar
  where avatar.guild_id = p_guild_id
    and avatar.discord_id = p_discord_id
    and avatar.withdrawn_at is null
    and avatar.albion_player_id is not null;

  if not found then
    raise exception 'ALLIANCE_CONTENT_MEMBER_NOT_ELIGIBLE';
  end if;

  insert into public.alliance_content_participations (
    guild_id,
    session_id,
    discord_id,
    albion_player_id,
    source
  ) values (
    p_guild_id,
    p_session_id,
    p_discord_id,
    v_albion_player_id,
    'admin_override'
  )
  on conflict (guild_id, session_id, discord_id) do nothing;
  get diagnostics v_insert_count = row_count;
  v_inserted := v_insert_count = 1;

  if v_inserted then
    perform public.rebuild_alliance_content_open_video_requirements(p_guild_id, p_discord_id);
  end if;

  return v_inserted;
end;
$$;

revoke all on function public.rebuild_alliance_content_open_video_requirements(uuid, text) from public;
revoke all on function public.add_alliance_content_manual_participation(uuid, uuid, text) from public;
revoke all on function public.rebuild_alliance_content_open_video_requirements(uuid, text) from anon, authenticated;
revoke all on function public.add_alliance_content_manual_participation(uuid, uuid, text) from anon, authenticated;

grant execute on function public.rebuild_alliance_content_open_video_requirements(uuid, text) to service_role;
grant execute on function public.add_alliance_content_manual_participation(uuid, uuid, text) to service_role;

comment on function public.add_alliance_content_manual_participation(uuid, uuid, text) is
  'Records an active Menhera member as attending one confirmed session when battle logs missed them, then rebuilds unfinished three-session video duties.';
