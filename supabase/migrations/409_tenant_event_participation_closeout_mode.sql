-- 409: Snapshot the tenant's participant-roster closeout mode on new events.
--
-- Existing events keep their current per-event value. New events inherit the
-- tenant setting when it is explicitly configured; tenants without the key
-- retain the legacy/default behavior from the inserted event row.

create or replace function public.prepare_event_participation_auto_closeout()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_auto_closeout_enabled text;
  v_delay_hours integer;
begin
  if tg_op = 'INSERT' then
    select setting.value
      into v_auto_closeout_enabled
    from public.app_settings as setting
    where setting.guild_id = new.guild_id
      and setting.key = 'event_participation_auto_closeout_enabled';

    if v_auto_closeout_enabled = 'true' then
      new.participation_auto_closeout_enabled := true;
    elsif v_auto_closeout_enabled = 'false' then
      new.participation_auto_closeout_enabled := false;
    end if;
  end if;

  if not new.participation_auto_closeout_enabled then
    new.participation_auto_closeout_review_started_at := null;
    new.participation_auto_closeout_paused_at := null;
    new.participation_auto_closeout_notice_sent_at := null;
    return new;
  end if;

  if new.battle_started_at is not null
     and new.participation_auto_closeout_review_started_at is null then
    select case
      when setting.value ~ '^[0-9]+$'
       and setting.value::numeric between 1 and 72
        then setting.value::integer
      else 6
    end
      into v_delay_hours
    from public.app_settings as setting
    where setting.guild_id = new.guild_id
      and setting.key = 'event_participation_auto_closeout_hours';

    new.participation_auto_closeout_delay_hours := coalesce(v_delay_hours, 6);
    new.participation_auto_closeout_review_started_at :=
      new.battle_started_at + interval '1 hour';
  end if;

  return new;
end;
$$;

revoke all on function public.prepare_event_participation_auto_closeout()
  from public, anon, authenticated, service_role;

comment on function public.prepare_event_participation_auto_closeout() is
  'Snapshots the tenant participant-roster closeout mode on insert and prepares enabled review windows.';
