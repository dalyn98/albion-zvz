-- 284: Give each free-form regear intake window its own payout rate.
--
-- Existing windows keep the rate they would have inherited from their guild
-- setting at migration time. New windows always persist an explicit rate so
-- later guild/role policy changes cannot alter requests submitted through it.

alter table public.regear_windows
  add column if not exists payout_rate_percent integer;

update public.regear_windows as rw
set payout_rate_percent = coalesce(
  (
    select case
      when setting.value ~ '^(100|[1-9][0-9]?)$' then setting.value::integer
      else null
    end
    from public.app_settings as setting
    where setting.guild_id = rw.guild_id
      and setting.key = 'regear_payout_rate_percent'
  ),
  100
)
where rw.payout_rate_percent is null;

alter table public.regear_windows
  alter column payout_rate_percent set default 100,
  alter column payout_rate_percent set not null;

alter table public.regear_windows
  drop constraint if exists regear_windows_payout_rate_percent_chk;

alter table public.regear_windows
  add constraint regear_windows_payout_rate_percent_chk
  check (payout_rate_percent >= 1 and payout_rate_percent <= 1000);

comment on column public.regear_windows.payout_rate_percent is
  'Window-local payout rate (1..1000) snapshotted into each submitted regear request.';
