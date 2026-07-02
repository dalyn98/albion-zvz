-- 237: 역할군별 리기어 지급 요율 override.
--
-- NULL = 기존 길드 전역 regear_payout_rate_percent 를 그대로 사용.
-- 값이 있으면 해당 role_rewards row 의 일반 리기어 지급 요율로 우선 적용한다.

alter table public.role_rewards
  add column if not exists payout_rate_percent integer;

alter table public.role_rewards
  drop constraint if exists role_rewards_payout_rate_percent_check;

alter table public.role_rewards
  add constraint role_rewards_payout_rate_percent_check
  check (payout_rate_percent is null or (payout_rate_percent >= 1 and payout_rate_percent <= 100));

do $$
begin
  if not exists (
    select 1
      from pg_constraint c
     where c.conrelid = 'public.role_rewards'::regclass
       and c.contype = 'p'
       and pg_get_constraintdef(c.oid) ilike '%primary key (guild_id, role_name)%'
  ) then
    raise exception 'role_rewards primary key (guild_id, role_name) is required';
  end if;
end $$;

comment on column public.role_rewards.payout_rate_percent is
  'Nullable per-role regear payout rate override. NULL falls back to app_settings.regear_payout_rate_percent.';
