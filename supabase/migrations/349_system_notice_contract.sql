-- Release C: make global service notices a single, expiring, typed safety
-- channel. Existing rows are preserved; only currently-open legacy notices are
-- normalized so the newest one remains visible.

alter table public.super_admin_notices
  add column if not exists purpose text not null default 'maintenance',
  add column if not exists severity text not null default 'critical';

update public.super_admin_notices
   set expires_at = greatest(
         coalesce(expires_at, created_at + interval '7 days'),
         now() + interval '1 day'
       )
 where expires_at is null;

-- An expired legacy row with archived_at = null would still occupy the partial
-- unique index below. Close every expired row first, then keep only the newest
-- genuinely-visible row. This preserves history without inventing a new notice.
update public.super_admin_notices
   set archived_at = now()
 where archived_at is null
   and expires_at <= now();

with ranked_open as (
  select id,
         row_number() over (order by created_at desc, id desc) as position
    from public.super_admin_notices
   where archived_at is null
)
update public.super_admin_notices notice
   set archived_at = now()
  from ranked_open ranked
 where notice.id = ranked.id
   and ranked.position > 1;

alter table public.super_admin_notices
  alter column expires_at set not null;

alter table public.super_admin_notices
  add constraint super_admin_notices_purpose_check
  check (purpose in ('incident', 'maintenance', 'security'));

alter table public.super_admin_notices
  add constraint super_admin_notices_severity_check
  check (severity in ('important', 'critical'));

alter table public.super_admin_notices
  add constraint super_admin_notices_content_check
  check (
    char_length(btrim(message)) > 0
    or image_url is not null
  );

create unique index if not exists super_admin_notices_single_open_idx
  on public.super_admin_notices ((true))
  where archived_at is null;

create or replace function public.replace_super_admin_notice(
  p_message text,
  p_image_url text,
  p_expires_at timestamptz,
  p_purpose text,
  p_severity text,
  p_actor_discord_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_message text := btrim(coalesce(p_message, ''));
  v_image_url text := nullif(btrim(coalesce(p_image_url, '')), '');
  v_actor text := btrim(coalesce(p_actor_discord_id, ''));
  v_notice_id uuid;
  v_replaced_count integer := 0;
begin
  if v_message = '' and v_image_url is null then
    raise exception 'NOTICE_CONTENT_REQUIRED';
  end if;
  if char_length(v_message) > 4000 then
    raise exception 'NOTICE_MESSAGE_TOO_LONG';
  end if;
  if v_image_url is not null and char_length(v_image_url) > 2048 then
    raise exception 'NOTICE_IMAGE_URL_TOO_LONG';
  end if;
  if p_expires_at is null or p_expires_at <= now() then
    raise exception 'NOTICE_FUTURE_EXPIRY_REQUIRED';
  end if;
  if p_purpose not in ('incident', 'maintenance', 'security') then
    raise exception 'INVALID_NOTICE_PURPOSE';
  end if;
  if p_severity not in ('important', 'critical') then
    raise exception 'INVALID_NOTICE_SEVERITY';
  end if;
  if v_actor = '' or char_length(v_actor) > 128 then
    raise exception 'NOTICE_ACTOR_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('super-admin-notice-active', 0));

  update public.super_admin_notices
     set archived_at = now()
   where archived_at is null;
  get diagnostics v_replaced_count = row_count;

  insert into public.super_admin_notices (
    message,
    image_url,
    expires_at,
    purpose,
    severity,
    created_by_discord_id
  ) values (
    v_message,
    v_image_url,
    p_expires_at,
    p_purpose,
    p_severity,
    v_actor
  )
  returning id into v_notice_id;

  insert into public.super_admin_audit_log (
    super_admin_discord_id,
    action,
    details
  ) values (
    v_actor,
    'notice.replace',
    jsonb_build_object(
      'noticeId', v_notice_id,
      'purpose', p_purpose,
      'severity', p_severity,
      'expiresAt', p_expires_at,
      'replacedCount', v_replaced_count
    )
  );

  return jsonb_build_object(
    'noticeId', v_notice_id,
    'replacedCount', v_replaced_count
  );
end;
$$;

create or replace function public.archive_super_admin_notice(
  p_notice_id uuid,
  p_actor_discord_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text := btrim(coalesce(p_actor_discord_id, ''));
  v_changed boolean := false;
begin
  if p_notice_id is null then
    raise exception 'NOTICE_ID_REQUIRED';
  end if;
  if v_actor = '' or char_length(v_actor) > 128 then
    raise exception 'NOTICE_ACTOR_REQUIRED';
  end if;

  update public.super_admin_notices
     set archived_at = now()
   where id = p_notice_id
     and archived_at is null;
  v_changed := found;

  if v_changed then
    insert into public.super_admin_audit_log (
      super_admin_discord_id,
      action,
      details
    ) values (
      v_actor,
      'notice.archive',
      jsonb_build_object('noticeId', p_notice_id)
    );
  end if;

  return jsonb_build_object('changed', v_changed);
end;
$$;

revoke insert, update, delete, truncate
  on public.super_admin_notices from service_role;
grant select on public.super_admin_notices to service_role;

revoke all on function public.replace_super_admin_notice(
  text, text, timestamptz, text, text, text
) from public, anon, authenticated;
grant execute on function public.replace_super_admin_notice(
  text, text, timestamptz, text, text, text
) to service_role;

revoke all on function public.archive_super_admin_notice(uuid, text)
  from public, anon, authenticated;
grant execute on function public.archive_super_admin_notice(uuid, text)
  to service_role;

comment on function public.replace_super_admin_notice(
  text, text, timestamptz, text, text, text
) is
  'Service-role command that atomically replaces the one open global safety notice and records bounded audit metadata.';

comment on function public.archive_super_admin_notice(uuid, text) is
  'Service-role idempotent command that closes a global safety notice and records the change in the same transaction.';
