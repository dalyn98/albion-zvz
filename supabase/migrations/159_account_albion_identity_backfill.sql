-- Backfill site-wide Albion profile tables from existing tenant-scoped
-- guild_avatars rows.
--
-- Existing verified rows become `trusted` so no current member suddenly loses
-- resource access. Unverified/manual rows are copied as `claimed` only.

with source_rows as (
  select
    ga.guild_id,
    ga.discord_id,
    ga.albion_server,
    ga.albion_player_id,
    coalesce(nullif(ga.albion_nickname, ''), ga.username) as albion_player_name,
    ga.albion_guild_id,
    ga.albion_verified_at,
    row_number() over (
      partition by ga.discord_id
      order by ga.albion_verified_at desc nulls last, ga.updated_at desc
    ) = 1 as is_primary
  from public.guild_avatars ga
  where ga.albion_server in ('west','east','europe')
    and coalesce(nullif(ga.albion_nickname, ''), ga.username) is not null
)
insert into public.account_albion_profiles (
  discord_id,
  albion_server,
  albion_player_id,
  albion_player_name,
  current_guild_id,
  current_guild_name,
  current_alliance_id,
  current_alliance_name,
  is_primary,
  claim_status,
  source,
  verified_at,
  last_synced_at,
  created_at,
  updated_at
)
select distinct on (discord_id, albion_server, albion_player_id, albion_player_name)
  discord_id,
  albion_server,
  albion_player_id,
  albion_player_name,
  albion_guild_id,
  null,
  null,
  null,
  is_primary,
  'claimed',
  'legacy_backfill',
  albion_verified_at,
  case when albion_player_id is not null then now() else null end,
  now(),
  now()
from source_rows
order by
  discord_id,
  albion_server,
  albion_player_id,
  albion_player_name,
  albion_verified_at desc nulls last
on conflict do nothing;

with source_rows as (
  select
    ga.guild_id,
    ga.discord_id,
    ga.albion_server,
    ga.albion_player_id,
    coalesce(nullif(ga.albion_nickname, ''), ga.username) as albion_player_name,
    ga.albion_guild_id,
    ga.albion_verified_at,
    aps.id as profile_id,
    app_home.value as home_guild_id
  from public.guild_avatars ga
  left join public.app_settings app_home
    on app_home.guild_id = ga.guild_id
   and app_home.key = 'albion_home_guild_id'
  left join public.account_albion_profiles aps
    on aps.discord_id = ga.discord_id
   and aps.albion_server = ga.albion_server
   and (
     (ga.albion_player_id is not null and aps.albion_player_id = ga.albion_player_id)
     or (
       ga.albion_player_id is null
       and aps.albion_player_id is null
       and aps.albion_player_name = coalesce(nullif(ga.albion_nickname, ''), ga.username)
     )
   )
  where ga.albion_server in ('west','east','europe')
    and coalesce(nullif(ga.albion_nickname, ''), ga.username) is not null
)
insert into public.account_albion_tenant_links (
  guild_id,
  discord_id,
  profile_id,
  albion_server,
  albion_player_id,
  albion_player_name,
  current_guild_id,
  current_guild_name,
  current_alliance_id,
  current_alliance_name,
  relation,
  trust_status,
  status_reason,
  verified_at,
  trusted_at,
  last_synced_at,
  created_at,
  updated_at
)
select
  guild_id,
  discord_id,
  profile_id,
  albion_server,
  albion_player_id,
  albion_player_name,
  albion_guild_id,
  null,
  null,
  null,
  case
    when albion_player_id is null then 'unknown'
    when coalesce(home_guild_id, '') <> '' and albion_guild_id = home_guild_id then 'home_guild'
    when albion_guild_id is null then 'unknown'
    else 'external'
  end,
  case
    when albion_verified_at is not null then 'trusted'
    when albion_player_id is not null then 'claimed'
    else 'claimed'
  end,
  case
    when albion_verified_at is not null then 'legacy_trusted'
    when albion_player_id is null then 'manual_entry'
    else 'legacy_unverified'
  end,
  albion_verified_at,
  albion_verified_at,
  case when albion_player_id is not null then now() else null end,
  now(),
  now()
from source_rows
where profile_id is not null
on conflict (guild_id, discord_id) do update set
  profile_id = excluded.profile_id,
  albion_server = excluded.albion_server,
  albion_player_id = excluded.albion_player_id,
  albion_player_name = excluded.albion_player_name,
  current_guild_id = excluded.current_guild_id,
  relation = excluded.relation,
  trust_status = excluded.trust_status,
  status_reason = excluded.status_reason,
  verified_at = excluded.verified_at,
  trusted_at = excluded.trusted_at,
  last_synced_at = excluded.last_synced_at,
  updated_at = now();

insert into public.account_albion_identity_audit (
  guild_id,
  discord_id,
  profile_id,
  actor_discord_id,
  action,
  trust_status,
  relation,
  reason,
  created_at
)
select
  l.guild_id,
  l.discord_id,
  l.profile_id,
  null,
  'legacy_backfill',
  l.trust_status,
  l.relation,
  l.status_reason,
  now()
from public.account_albion_tenant_links l
where l.profile_id is not null
on conflict do nothing;
