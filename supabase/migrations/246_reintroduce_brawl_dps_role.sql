-- 246: Reintroduce Brawl DPS as a selectable current role group.
-- Legacy Dps remains normalized to EngageDps in application code; BrawlerDps
-- is current again and must have independent regear settings.

insert into public.role_rewards (guild_id, role_name, silver, payout_rate_percent, updated_at)
select
  tenants.id,
  'BrawlerDps',
  coalesce(engage_reward.silver, 0),
  engage_reward.payout_rate_percent,
  now()
from public.tenants
left join public.role_rewards engage_reward
  on engage_reward.guild_id = tenants.id
 and engage_reward.role_name = 'EngageDps'
on conflict (guild_id, role_name) do nothing;

alter table public.event_regear_participants
  drop constraint if exists event_regear_participants_role_name_check;

alter table public.event_regear_participants
  add constraint event_regear_participants_role_name_check
  check (
    role_name in (
      'Caller',
      'OffTanker',
      'DefTanker',
      'Sup',
      'Healer',
      'EngageDps',
      'BrawlerDps',
      'BM',
      '기타'
    )
  );

alter table public.event_build_role_demands
  drop constraint if exists event_build_role_demands_role_type_check;

alter table public.event_build_role_demands
  add constraint event_build_role_demands_role_type_check
  check (
    role_type in (
      'OffTanker',
      'DefTanker',
      'Sup',
      'Healer',
      'EngageDps',
      'BrawlerDps'
    )
  );

alter table public.event_build_applications
  drop constraint if exists event_build_applications_role_type_check;

alter table public.event_build_applications
  add constraint event_build_applications_role_type_check
  check (
    role_type in (
      'OffTanker',
      'DefTanker',
      'Sup',
      'Healer',
      'EngageDps',
      'BrawlerDps'
    )
  );
