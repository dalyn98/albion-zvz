-- Split the selectable DPS slot role into EngageDps and BrawlerDps.
-- Keep legacy Dps allowed in DB constraints so historical events, reports,
-- and regear requests remain readable and eligible.

insert into public.role_rewards (guild_id, role_name, silver, updated_at)
select
  t.id,
  split_role.role_name,
  coalesce(dps_reward.silver, 0),
  now()
from public.tenants t
cross join (
  values ('EngageDps'), ('BrawlerDps')
) as split_role(role_name)
left join public.role_rewards dps_reward
  on dps_reward.guild_id = t.id
 and dps_reward.role_name = 'Dps'
on conflict (guild_id, role_name) do nothing;

update public.app_settings
   set value = replace(value, '"Dps"', '"EngageDps","BrawlerDps"'),
       updated_at = now()
 where key = 'cd_badge_roles'
   and value like '%"Dps"%';

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
      'Dps',
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
      'Dps',
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
      'Dps',
      'EngageDps',
      'BrawlerDps'
    )
  );
