-- Consolidate all DPS role variants into EngageDps.
-- BrawlerDps and legacy Dps are no longer selectable current roles.

create or replace function public.agm_consolidate_dps_role_jsonb(p_value jsonb)
returns jsonb
language sql
immutable
as $$
  select case jsonb_typeof(p_value)
    when 'string' then
      case
        when p_value #>> '{}' in ('Dps', 'BrawlerDps') then to_jsonb('EngageDps'::text)
        else p_value
      end
    when 'array' then (
      select coalesce(jsonb_agg(public.agm_consolidate_dps_role_jsonb(item.value) order by item.ordinality), '[]'::jsonb)
        from jsonb_array_elements(p_value) with ordinality as item(value, ordinality)
    )
    when 'object' then (
      select coalesce(jsonb_object_agg(item.key, public.agm_consolidate_dps_role_jsonb(item.value)), '{}'::jsonb)
        from jsonb_each(p_value) as item(key, value)
    )
    else p_value
  end
$$;

with merged_rewards as (
  select
    guild_id,
    coalesce(max(silver), 0) as silver,
    max(payout_rate_percent) as payout_rate_percent
  from public.role_rewards
  where role_name in ('EngageDps', 'Dps', 'BrawlerDps')
  group by guild_id
)
insert into public.role_rewards (guild_id, role_name, silver, payout_rate_percent, updated_at)
select guild_id, 'EngageDps', silver, payout_rate_percent, now()
from merged_rewards
on conflict (guild_id, role_name) do update
   set silver = greatest(public.role_rewards.silver, excluded.silver),
       payout_rate_percent = coalesce(public.role_rewards.payout_rate_percent, excluded.payout_rate_percent),
       updated_at = now();

delete from public.role_rewards
 where role_name in ('Dps', 'BrawlerDps');

update public.app_settings
   set value = '["EngageDps"]',
       updated_at = now()
 where key = 'cd_badge_roles'
   and (value like '%"Dps"%' or value like '%"BrawlerDps"%');

update public.slots
   set role_name = 'EngageDps'
 where role_name in ('Dps', 'BrawlerDps');

update public.regear_requests
   set role_name = 'EngageDps'
 where role_name in ('Dps', 'BrawlerDps');

update public.event_regear_participants
   set role_name = 'EngageDps',
       updated_at = now()
 where role_name in ('Dps', 'BrawlerDps');

update public.event_tentative_signups as signup
   set possible_roles = normalized.roles,
       updated_at = now()
  from (
    select
      deduped.id,
      array_agg(deduped.role order by deduped.first_ordinality) as roles
    from (
      select
        source.id,
        case
          when raw.role_name in ('Dps', 'BrawlerDps') then 'EngageDps'
          else raw.role_name
        end as role,
        min(raw.ordinality) as first_ordinality
      from public.event_tentative_signups source
      cross join lateral unnest(source.possible_roles) with ordinality as raw(role_name, ordinality)
      group by source.id, role
    ) deduped
    group by deduped.id
  ) normalized
 where signup.id = normalized.id
   and signup.possible_roles && array['Dps', 'BrawlerDps'];

update public.event_templates
   set data = public.agm_consolidate_dps_role_jsonb(data)
 where data::text like '%"Dps"%'
    or data::text like '%"BrawlerDps"%';

update public.slot_templates
   set data = public.agm_consolidate_dps_role_jsonb(data)
 where data::text like '%"Dps"%'
    or data::text like '%"BrawlerDps"%';

update public.regear_requests
   set build_snapshot = public.agm_consolidate_dps_role_jsonb(build_snapshot)
 where build_snapshot is not null
   and (build_snapshot::text like '%"Dps"%' or build_snapshot::text like '%"BrawlerDps"%');

create temporary table agm_merged_build_role_demands on commit drop as
select
  guild_id,
  event_id,
  party_number,
  least(sum(required_count), 20) as required_count,
  min(created_at) as created_at,
  max(updated_at) as updated_at
from public.event_build_role_demands
where role_type in ('EngageDps', 'Dps', 'BrawlerDps')
group by guild_id, event_id, party_number;

delete from public.event_build_role_demands
 where role_type in ('EngageDps', 'Dps', 'BrawlerDps');

insert into public.event_build_role_demands (
  guild_id,
  event_id,
  party_number,
  role_type,
  required_count,
  created_at,
  updated_at
)
select
  guild_id,
  event_id,
  party_number,
  'EngageDps',
  required_count,
  created_at,
  now()
from agm_merged_build_role_demands
where required_count > 0;

update public.event_build_applications
   set role_type = 'EngageDps',
       updated_at = now()
 where role_type in ('Dps', 'BrawlerDps');

update public.event_build_applications
   set preferences = public.agm_consolidate_dps_role_jsonb(preferences)
 where preferences::text like '%"Dps"%'
    or preferences::text like '%"BrawlerDps"%';

update public.event_build_applications
   set selected_snapshot = public.agm_consolidate_dps_role_jsonb(selected_snapshot)
 where selected_snapshot is not null
   and (selected_snapshot::text like '%"Dps"%' or selected_snapshot::text like '%"BrawlerDps"%');

drop function public.agm_consolidate_dps_role_jsonb(jsonb);

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
      'EngageDps'
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
      'EngageDps'
    )
  );
