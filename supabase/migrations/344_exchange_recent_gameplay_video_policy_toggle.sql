-- 344: Let each compliance-enabled guild turn the recent-gameplay-video
-- exchange gate on or off without disabling the rest of content compliance.
-- A missing setting remains ON for backward compatibility; the admin action
-- creates the tenant-scoped row when an operator changes the toggle.

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
     and coalesce((
       select setting.value <> 'false'
         from public.app_settings setting
        where setting.guild_id = new.guild_id
          and setting.key = 'exchange_recent_gameplay_video_required'
     ), true)
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

comment on function public.guard_member_exchange_restriction() is
  'Blocks new exchanges for active manual restrictions and, when explicitly enabled, missing recent gameplay video uploads.';
