-- 290: Add an optional self-reflection note to standalone gameplay-video registration.
--
-- Keep the four-argument function for already-open clients. The application uses
-- the new five-argument overload after deployment.

alter table public.member_gameplay_video_uploads
  add column if not exists reflection_note text;

alter table public.member_gameplay_video_uploads
  drop constraint if exists member_gameplay_video_upload_reflection_note_check;
alter table public.member_gameplay_video_uploads
  add constraint member_gameplay_video_upload_reflection_note_check
  check (reflection_note is null or char_length(reflection_note) <= 300);

create or replace function public.submit_member_gameplay_video(
  p_guild_id uuid,
  p_discord_id text,
  p_youtube_video_id text,
  p_video_url text,
  p_reflection_note text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_upload_id uuid;
  v_reflection_note text := nullif(btrim(p_reflection_note), '');
begin
  if not public.alliance_content_compliance_enabled(p_guild_id) then
    raise exception 'MEMBER_GAMEPLAY_VIDEO_FEATURE_UNAVAILABLE';
  end if;

  if p_discord_id is null
     or length(btrim(p_discord_id)) = 0
     or char_length(p_discord_id) > 128
     or p_discord_id like 'local:%' then
    raise exception 'MEMBER_GAMEPLAY_VIDEO_MEMBER_NOT_FOUND';
  end if;

  perform 1
    from public.guild_avatars
   where guild_id = p_guild_id
     and discord_id = p_discord_id
     and withdrawn_at is null;
  if not found then
    raise exception 'MEMBER_GAMEPLAY_VIDEO_MEMBER_NOT_FOUND';
  end if;

  if p_youtube_video_id !~ '^[A-Za-z0-9_-]{11}$'
     or p_video_url <> 'https://www.youtube.com/embed/' || p_youtube_video_id then
    raise exception 'MEMBER_GAMEPLAY_VIDEO_INVALID_URL';
  end if;

  if v_reflection_note is not null and char_length(v_reflection_note) > 300 then
    raise exception 'MEMBER_GAMEPLAY_VIDEO_REFLECTION_TOO_LONG';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_guild_id::text || ':' || p_discord_id, 0)
  );

  if exists (
    select 1
      from public.member_gameplay_video_uploads
     where guild_id = p_guild_id
       and discord_id = p_discord_id
       and created_at > now() - interval '1 minute'
  ) then
    raise exception 'MEMBER_GAMEPLAY_VIDEO_RATE_LIMITED';
  end if;

  insert into public.member_gameplay_video_uploads (
    guild_id,
    discord_id,
    youtube_video_id,
    video_url,
    reflection_note
  ) values (
    p_guild_id,
    p_discord_id,
    p_youtube_video_id,
    p_video_url,
    v_reflection_note
  )
  returning id into v_upload_id;

  return v_upload_id;
exception
  when unique_violation then
    raise exception 'MEMBER_GAMEPLAY_VIDEO_ALREADY_USED';
end;
$$;

revoke all on function public.submit_member_gameplay_video(uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.submit_member_gameplay_video(uuid, text, text, text, text)
  to service_role;

comment on column public.member_gameplay_video_uploads.reflection_note is
  'Optional member reflection about what to improve or where feedback is wanted.';
comment on function public.submit_member_gameplay_video(uuid, text, text, text, text) is
  'Registers a standalone gameplay video with an optional bounded self-reflection note.';
