-- 289: Require a recent gameplay-video upload for new exchange requests.
--
-- A member may upload a YouTube gameplay video at any time. Existing alliance
-- content submissions are mirrored into the same tenant-scoped ledger, so
-- participation-duty and regear-linked videos also satisfy the rule.
--
-- New exchange requests require one non-invalidated upload from the preceding
-- five days. Existing pending requests remain editable and processable.

create table if not exists public.member_gameplay_video_uploads (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  discord_id text not null,
  youtube_video_id text not null
    check (youtube_video_id ~ '^[A-Za-z0-9_-]{11}$'),
  video_url text not null
    check (video_url ~ '^https://www[.]youtube[.]com/embed/[A-Za-z0-9_-]{11}$'),
  source text not null default 'standalone'
    check (source in ('standalone', 'participation')),
  source_submission_id uuid,
  status text not null default 'submitted'
    check (status in ('submitted', 'invalidated')),
  uploaded_at timestamptz not null default now(),
  invalidated_at timestamptz,
  created_at timestamptz not null default now(),
  unique (guild_id, id),
  unique (guild_id, youtube_video_id),
  foreign key (guild_id, discord_id)
    references public.guild_avatars(guild_id, discord_id)
    on delete cascade,
  constraint member_gameplay_video_upload_status_check check (
    (status = 'submitted' and invalidated_at is null)
    or (status = 'invalidated' and invalidated_at is not null)
  )
);

create index if not exists member_gameplay_video_uploads_recent_idx
  on public.member_gameplay_video_uploads (guild_id, discord_id, uploaded_at desc)
  where status = 'submitted';

alter table public.member_gameplay_video_uploads enable row level security;
revoke all on public.member_gameplay_video_uploads from anon, authenticated;
grant select, insert, update, delete on public.member_gameplay_video_uploads to service_role;

insert into public.member_gameplay_video_uploads (
  guild_id,
  discord_id,
  youtube_video_id,
  video_url,
  source,
  source_submission_id,
  status,
  uploaded_at,
  invalidated_at
)
select
  submission.guild_id,
  submission.discord_id,
  submission.youtube_video_id,
  submission.video_url,
  'participation',
  submission.id,
  case when submission.status = 'rejected' then 'invalidated' else 'submitted' end,
  submission.submitted_at,
  case when submission.status = 'rejected'
    then coalesce(submission.reviewed_at, submission.submitted_at)
    else null
  end
from public.alliance_content_video_submissions submission
on conflict (guild_id, youtube_video_id) do nothing;

create or replace function public.sync_member_gameplay_video_from_participation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    update public.member_gameplay_video_uploads
       set status = 'invalidated',
           invalidated_at = coalesce(invalidated_at, now())
     where guild_id = old.guild_id
       and source_submission_id = old.id;
    return old;
  end if;

  if exists (
    select 1
      from public.member_gameplay_video_uploads upload
     where upload.guild_id = new.guild_id
       and upload.youtube_video_id = new.youtube_video_id
       and upload.discord_id <> new.discord_id
  ) then
    raise exception 'MEMBER_GAMEPLAY_VIDEO_ALREADY_USED';
  end if;

  insert into public.member_gameplay_video_uploads (
    guild_id,
    discord_id,
    youtube_video_id,
    video_url,
    source,
    source_submission_id,
    status,
    uploaded_at,
    invalidated_at
  ) values (
    new.guild_id,
    new.discord_id,
    new.youtube_video_id,
    new.video_url,
    'participation',
    new.id,
    case when new.status = 'rejected' then 'invalidated' else 'submitted' end,
    new.submitted_at,
    case when new.status = 'rejected'
      then coalesce(new.reviewed_at, now())
      else null
    end
  )
  on conflict (guild_id, youtube_video_id) do update set
    discord_id = excluded.discord_id,
    video_url = excluded.video_url,
    source = 'participation',
    source_submission_id = excluded.source_submission_id,
    status = excluded.status,
    uploaded_at = excluded.uploaded_at,
    invalidated_at = excluded.invalidated_at;

  return new;
end;
$$;

drop trigger if exists alliance_content_video_submissions_gameplay_ledger
  on public.alliance_content_video_submissions;
create trigger alliance_content_video_submissions_gameplay_ledger
after insert or update of status, video_url, youtube_video_id or delete
on public.alliance_content_video_submissions
for each row execute function public.sync_member_gameplay_video_from_participation();

create or replace function public.submit_member_gameplay_video(
  p_guild_id uuid,
  p_discord_id text,
  p_youtube_video_id text,
  p_video_url text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_upload_id uuid;
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
    video_url
  ) values (
    p_guild_id,
    p_discord_id,
    p_youtube_video_id,
    p_video_url
  )
  returning id into v_upload_id;

  return v_upload_id;
exception
  when unique_violation then
    raise exception 'MEMBER_GAMEPLAY_VIDEO_ALREADY_USED';
end;
$$;

revoke all on function public.submit_member_gameplay_video(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.submit_member_gameplay_video(uuid, text, text, text)
  to service_role;

create or replace function public.guard_member_exchange_restriction()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_blocked_until timestamptz;
begin
  select blocked_until
    into v_blocked_until
    from public.member_exchange_restrictions
   where guild_id = new.guild_id
     and discord_id = new.discord_id
     and blocked_until > now();

  if v_blocked_until is not null then
    raise exception 'EXCHANGE_TEMPORARILY_RESTRICTED:%', v_blocked_until;
  end if;

  if public.alliance_content_compliance_enabled(new.guild_id)
     and not exists (
       select 1
         from public.member_gameplay_video_uploads upload
        where upload.guild_id = new.guild_id
          and upload.discord_id = new.discord_id
          and upload.status = 'submitted'
          and upload.uploaded_at >= now() - interval '5 days'
     ) then
    raise exception 'EXCHANGE_RECENT_GAMEPLAY_VIDEO_REQUIRED';
  end if;

  return new;
end;
$$;

drop trigger if exists exchange_requests_member_restriction_guard
  on public.exchange_requests;
create trigger exchange_requests_member_restriction_guard
before insert on public.exchange_requests
for each row execute function public.guard_member_exchange_restriction();

-- Preserve gameplay-video eligibility when two Discord identities are merged.
alter function public.preview_member_account_merge(uuid, text, text)
  rename to preview_member_account_merge_before_gameplay_videos;
alter function public.merge_member_accounts(uuid, text, text, text, text)
  rename to merge_member_accounts_before_gameplay_videos;

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
  v_source_count integer;
begin
  v_base := public.preview_member_account_merge_before_gameplay_videos(
    p_guild_id,
    p_from_discord_id,
    p_to_discord_id
  );
  v_counts := coalesce(v_base->'counts', '{}'::jsonb);

  select count(*)::integer
    into v_source_count
    from public.member_gameplay_video_uploads
   where guild_id = p_guild_id
     and discord_id = p_from_discord_id;

  v_counts := v_counts || jsonb_build_object(
    'member_gameplay_video_uploads',
    v_source_count
  );

  return v_base || jsonb_build_object('counts', v_counts);
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

  v_base_result := public.merge_member_accounts_before_gameplay_videos(
    p_guild_id,
    p_from_discord_id,
    p_to_discord_id,
    p_actor_discord_id,
    p_reason
  );
  v_moved := coalesce(v_base_result->'moved', '{}'::jsonb);

  update public.alliance_content_video_submissions
     set discord_id = p_to_discord_id
   where guild_id = p_guild_id
     and discord_id = p_from_discord_id;
  get diagnostics v_count = row_count;
  v_moved := v_moved || jsonb_build_object(
    'alliance_content_video_submissions',
    v_count
  );

  update public.member_gameplay_video_uploads
     set discord_id = p_to_discord_id
   where guild_id = p_guild_id
     and discord_id = p_from_discord_id;
  get diagnostics v_count = row_count;
  v_moved := v_moved || jsonb_build_object(
    'member_gameplay_video_uploads',
    v_count
  );

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
revoke all on function public.preview_member_account_merge_before_gameplay_videos(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.merge_member_accounts_before_gameplay_videos(uuid, text, text, text, text)
  from public, anon, authenticated;

comment on table public.member_gameplay_video_uploads is
  'Tenant-scoped gameplay-video ledger used by the five-day exchange eligibility rule.';
comment on function public.submit_member_gameplay_video(uuid, text, text, text) is
  'Registers a member-owned YouTube gameplay video without requiring a participation duty.';
comment on function public.guard_member_exchange_restriction() is
  'Blocks new exchange requests for active manual restrictions or no valid gameplay-video upload in the preceding five days.';
