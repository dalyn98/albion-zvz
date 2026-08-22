-- 운영 요청에 따른 최초 영구 예외 데이터.
-- 스키마와 데이터 변경을 분리하고, 정확한 기존 연결이 있을 때만 1건을 만든다.

insert into public.albion_identity_resource_exceptions (
  guild_id,
  discord_id,
  albion_server,
  albion_player_id,
  albion_player_name,
  reason,
  granted_by_discord_id,
  granted_at,
  updated_at
)
select
  link.guild_id,
  link.discord_id,
  link.albion_server,
  link.albion_player_id,
  link.albion_player_name,
  '운영자 요청: 길드 소속과 무관하게 영구 인증 예외',
  'system:migration:418',
  now(),
  now()
from public.account_albion_tenant_links link
where link.guild_id = '59f2e6b5-ad67-43b2-b50e-7a56172b0b37'::uuid
  and link.discord_id = '839318087542636545'
  and link.albion_server = 'east'
  and link.albion_player_id = 'GfH-ficCT3y5rithtesRuA'
  and lower(link.albion_player_name) = lower('ZeroToHeroCaller')
  and link.revoked_at is null
on conflict (guild_id, discord_id) do update
set albion_server = excluded.albion_server,
    albion_player_id = excluded.albion_player_id,
    albion_player_name = excluded.albion_player_name,
    reason = excluded.reason,
    granted_by_discord_id = excluded.granted_by_discord_id,
    granted_at = excluded.granted_at,
    updated_at = excluded.updated_at;
