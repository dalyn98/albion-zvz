-- Design Refresh v3 is an opt-in staged rollout. Missing settings remain OFF,
-- so this seed enables only the Menhera tenant without changing other guilds.
insert into public.app_settings (guild_id, key, value)
select t.id, 'visual_refresh_v3_enabled', 'true'
from public.tenants as t
where t.slug = 'menhera'
on conflict (guild_id, key)
do update set value = excluded.value;
