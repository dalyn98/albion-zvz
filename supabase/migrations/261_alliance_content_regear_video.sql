-- 261: Reuse a Menhera regear video proof for one alliance-content duty.
--
-- Regear approval and alliance-content video approval remain independent. The
-- bridge only creates a pending alliance submission from the already-normalized
-- regear YouTube URL. A source row is tenant-scoped and member-owned. Migration
-- 260 adds the source columns and tenant-safe foreign key first.

create or replace function public.submit_alliance_content_video_from_regear(
  p_guild_id uuid,
  p_regear_request_id uuid,
  p_requirement_id uuid,
  p_session_id uuid,
  p_discord_id text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_regear public.regear_requests%rowtype;
  v_youtube_video_id text;
  v_existing public.alliance_content_video_submissions%rowtype;
  v_submission_id uuid;
begin
  if not public.alliance_content_compliance_enabled(p_guild_id) then
    raise exception 'ALLIANCE_CONTENT_FEATURE_UNAVAILABLE';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_guild_id::text || ':' || p_regear_request_id::text, 0)
  );

  select regear.*
    into v_regear
    from public.regear_requests regear
   where regear.id = p_regear_request_id
     and regear.guild_id = p_guild_id
     and regear.discord_id = p_discord_id
     and regear.status = 'pending'
     and regear.auto_generated = false
   for share;

  if not found then
    raise exception 'ALLIANCE_CONTENT_REGEAR_NOT_FOUND';
  end if;

  v_youtube_video_id := substring(
    coalesce(v_regear.video_proof_url, '')
    from '^https://www[.]youtube[.]com/embed/([A-Za-z0-9_-]{11})$'
  );
  if v_youtube_video_id is null then
    raise exception 'ALLIANCE_CONTENT_REGEAR_VIDEO_MISSING';
  end if;

  select submission.*
    into v_existing
    from public.alliance_content_video_submissions submission
   where submission.guild_id = p_guild_id
     and submission.source_regear_request_id = p_regear_request_id
     and submission.status in ('pending', 'approved')
   limit 1;

  if found then
    if v_existing.requirement_id = p_requirement_id
       and v_existing.session_id = p_session_id
       and v_existing.discord_id = p_discord_id
       and v_existing.youtube_video_id = v_youtube_video_id then
      return v_existing.id;
    end if;
    raise exception 'ALLIANCE_CONTENT_REGEAR_ALREADY_LINKED';
  end if;

  if exists (
    select 1
      from public.alliance_content_video_submissions submission
     where submission.guild_id = p_guild_id
       and submission.youtube_video_id = v_youtube_video_id
  ) then
    raise exception 'ALLIANCE_CONTENT_VIDEO_ALREADY_USED';
  end if;

  v_submission_id := public.submit_alliance_content_video(
    p_guild_id,
    p_requirement_id,
    p_session_id,
    p_discord_id,
    v_youtube_video_id,
    v_regear.video_proof_url
  );

  update public.alliance_content_video_submissions
     set submission_source = 'regear',
         source_regear_request_id = p_regear_request_id
   where guild_id = p_guild_id
     and id = v_submission_id;

  return v_submission_id;
end;
$$;

revoke all on function public.submit_alliance_content_video_from_regear(uuid, uuid, uuid, uuid, text) from public;
revoke all on function public.submit_alliance_content_video_from_regear(uuid, uuid, uuid, uuid, text) from anon, authenticated;
grant execute on function public.submit_alliance_content_video_from_regear(uuid, uuid, uuid, uuid, text) to service_role;

comment on function public.submit_alliance_content_video_from_regear(uuid, uuid, uuid, uuid, text) is
  'Creates one pending Menhera alliance-content submission from a member-owned pending manual regear proof.';
